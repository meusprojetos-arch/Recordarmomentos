/**
 * cloudBackupService.js — Backup robusto estilo Google Fotos
 *
 * Princípios:
 *  - Cada startBackup() começa do zero (não acumula contadores entre execuções)
 *  - A fonte da verdade é o Firestore (campo backedUp), não o localStorage
 *  - Workers respeitam cancelled antes de incrementar contadores
 *  - synced NUNCA ultrapassa total (clamp)
 *  - 6 uploads paralelos, compressão de imagem, resumable pra vídeo
 */
import { auth, firestore, storage } from '../firebase.js'
import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, getDocs,
} from 'firebase/firestore'
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { v4 as uuid } from 'uuid'
import { db as localDb } from '../db/database.js'
import { smartCompress } from '../utils/imageCompressor.js'

const ENABLED_KEY      = uid => `recordar_backup_enabled_${uid}`
const PROGRESS_KEY_OLD = uid => `recordar_backup_progress_${uid}` // legado — limpa
const CONCURRENCY      = 6
const TIMEOUT_IMG_MS   = 60_000
const TIMEOUT_VIDEO_MS = 5 * 60_000

const _state = {
  running: false, cancelled: false,
  total: 0, synced: 0, failed: 0,
  listeners: new Set(),
  pendingAutoStart: null, // debounce do memory-added
}

function notify() {
  const s = { running: _state.running, total: _state.total, synced: _state.synced, failed: _state.failed }
  _state.listeners.forEach(fn => { try { fn(s) } catch {} })
}

export function onBackupProgress(fn) {
  _state.listeners.add(fn)
  fn({ running: _state.running, total: _state.total, synced: _state.synced, failed: _state.failed })
  return () => _state.listeners.delete(fn)
}

export function getBackupState() {
  return { running: _state.running, total: _state.total, synced: _state.synced, failed: _state.failed }
}

/**
 * loadSavedProgress — mantido por compatibilidade com PerfilScreen.
 * Antes carregava contadores do localStorage (causa do bug de inflar).
 * Agora limpa o storage antigo e devolve contadores zerados.
 */
export function loadSavedProgress(uid) {
  try { localStorage.removeItem(PROGRESS_KEY_OLD(uid)) } catch {}
  _state.total = 0
  _state.synced = 0
  _state.failed = 0
  notify()
}

export function isBackupEnabled(uid) {
  return localStorage.getItem(ENABLED_KEY(uid)) === 'true'
}

export function setBackupEnabled(uid, val) {
  localStorage.setItem(ENABLED_KEY(uid), val ? 'true' : 'false')
}

export function cancelBackup() {
  _state.cancelled = true
  // Não setamos running=false aqui — deixamos os workers terminarem o item atual
  // e o startBackup() finaliza naturalmente. Senão dá race condition.
  notify()
}

// Upload com retry exponencial + escolha de método por tipo
async function uploadOne(blob, uid) {
  const compressed = await smartCompress(blob).catch(() => blob)
  const isVideo = compressed.type?.startsWith('video/')
  const timeoutMs = isVideo ? TIMEOUT_VIDEO_MS : TIMEOUT_IMG_MS

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ext  = (compressed.type?.split('/')[1] || 'bin').split(';')[0]
      const path = `${uid}/memories/${uuid()}.${ext}`
      const sRef = ref(storage, path)

      let snap
      if (isVideo || compressed.size > 5 * 1024 * 1024) {
        const task = uploadBytesResumable(sRef, compressed, {
          cacheControl: 'public, max-age=31536000',
        })
        snap = await Promise.race([
          task,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
        ])
      } else {
        snap = await Promise.race([
          uploadBytes(sRef, compressed, { cacheControl: 'public, max-age=31536000' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
        ])
      }

      const url = await getDownloadURL(snap.ref)
      return { url, path, size: compressed.size }
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
}

function isBackedUp(m) {
  return m.backedUp === true || (m.fileUrl && m.fileUrl.includes('firebasestorage'))
}

async function getLocalBlob(m, uid) {
  try {
    if (!localDb.isOpen()) await localDb.open()
    if (m.localBlobId) {
      const match = await localDb.fileBlobs.where('localBlobId').equals(m.localBlobId).first()
      if (match?.blob && (!match.uid || match.uid === uid)) return match.blob
    }
    const match = await localDb.fileBlobs.where('firestoreId').equals(m.id).first()
    if (match?.blob && (!match.uid || match.uid === uid)) return match.blob
  } catch {}
  return null
}

async function syncOne(m, uid) {
  const blob = (m.fileBlob instanceof Blob) ? m.fileBlob : await getLocalBlob(m, uid)

  if (!blob) {
    await updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
      backedUp: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {})
    return
  }

  const uploaded = await uploadOne(blob, uid)

  await updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
    fileUrl: uploaded.url,
    filePath: uploaded.path,
    fileSize: uploaded.size,
    localOnly: false,
    backedUp: true,
    updatedAt: serverTimestamp(),
  }).catch(() => {})
}

// Detectar novas fotos automaticamente — com debounce (uma única chamada por janela)
if (typeof window !== 'undefined') {
  window.addEventListener('memory-added', () => {
    const uid = auth.currentUser?.uid
    if (!uid || !isBackupEnabled(uid)) return
    if (_state.pendingAutoStart) return // já tem agendado
    _state.pendingAutoStart = setTimeout(() => {
      _state.pendingAutoStart = null
      if (!_state.running) startBackup()
    }, 1000)
  })
}

/**
 * Busca apenas memórias pendentes de backup direto no Firestore.
 * Sem duplicatas (usa Map com id como chave).
 */
async function fetchPendingMemories(uid) {
  const colRef = collection(firestore, 'users', uid, 'memories')
  const pending = new Map()

  try {
    const q1 = query(colRef, where('backedUp', '==', false))
    const s1 = await getDocs(q1)
    s1.docs.forEach(d => pending.set(d.id, { id: d.id, ...d.data() }))
  } catch (e) { console.warn('Query backedUp==false falhou:', e.message) }

  try {
    const q2 = query(colRef, where('localOnly', '==', true))
    const s2 = await getDocs(q2)
    s2.docs.forEach(d => {
      if (!pending.has(d.id)) pending.set(d.id, { id: d.id, ...d.data() })
    })
  } catch (e) { console.warn('Query localOnly==true falhou:', e.message) }

  return Array.from(pending.values()).filter(m =>
    m.type !== 'text' && !isBackedUp(m)
  )
}

export async function startBackup() {
  // Guard atômico — JS é single-threaded, então a checagem + atribuição é segura.
  if (_state.running) return
  const uid = auth.currentUser?.uid
  if (!uid) return

  // RESET COMPLETO — cada execução começa do zero.
  // Os contadores refletem APENAS esta execução, não acumulam com runs anteriores.
  _state.running = true
  _state.cancelled = false
  _state.total = 0
  _state.synced = 0
  _state.failed = 0
  notify()

  // Limpa progresso antigo persistido (causa do bug original)
  try { localStorage.removeItem(PROGRESS_KEY_OLD(uid)) } catch {}

  try {
    const toSync = await fetchPendingMemories(uid)

    // Se foi cancelado durante o fetch, sai limpo
    if (_state.cancelled) {
      _state.running = false
      notify()
      return
    }

    // total = APENAS o que vamos processar agora (sem somar com synced antigo)
    _state.total = toSync.length
    notify()

    if (toSync.length === 0) {
      _state.running = false
      notify()
      return
    }

    const queue = [...toSync]

    const worker = async () => {
      while (queue.length > 0) {
        // Checa cancel ANTES de pegar o próximo item
        if (_state.cancelled) return

        const m = queue.shift()
        if (!m) return

        let ok = false
        try {
          await syncOne(m, uid)
          ok = true
        } catch (e) {
          console.warn('Falhou:', m.title, e.message)
        }

        // Checa cancel DEPOIS do await — se cancelaram durante o upload,
        // não conta este item no progresso (evita synced > total)
        if (_state.cancelled) return

        if (ok) {
          _state.synced = Math.min(_state.synced + 1, _state.total)
        } else {
          _state.failed = Math.min(_state.failed + 1, _state.total)
        }
        notify()
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, toSync.length) },
      () => worker()
    )
    await Promise.all(workers)

  } catch (e) {
    console.error('Backup error:', e.message)
  }

  _state.running = false
  notify()
}
