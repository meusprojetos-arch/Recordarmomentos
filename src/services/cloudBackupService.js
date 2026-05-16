/**
 * cloudBackupService.js — Backup robusto estilo Google Fotos
 * - Marca cada foto como sincronizada no Firestore após upload
 * - Nunca re-sincroniza o que já foi feito
 * - Retoma exatamente de onde parou
 * - 6 uploads em paralelo
 * - Comprime imagens antes do upload (smartCompress)
 * - Vídeos via uploadBytesResumable (retomada automática)
 * - Query Firestore filtrada (não baixa o que já foi feito)
 */
import { auth, firestore, storage } from '../firebase.js'
import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, orderBy, getDocs, limit as fbLimit,
} from 'firebase/firestore'
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { v4 as uuid } from 'uuid'
import { db as localDb } from '../db/database.js'
import { smartCompress } from '../utils/imageCompressor.js'

const ENABLED_KEY  = uid => `recordar_backup_enabled_${uid}`
const PROGRESS_KEY = uid => `recordar_backup_progress_${uid}`
const CONCURRENCY  = 6
const TIMEOUT_IMG_MS   = 60_000
const TIMEOUT_VIDEO_MS = 5 * 60_000

const _state = {
  running: false, cancelled: false,
  total: 0, synced: 0, failed: 0,
  listeners: new Set(),
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

function persist(uid) {
  try {
    localStorage.setItem(PROGRESS_KEY(uid), JSON.stringify({
      total: _state.total, synced: _state.synced, failed: _state.failed
    }))
  } catch {}
}

export function loadSavedProgress(uid) {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY(uid))
    if (raw) {
      const p = JSON.parse(raw)
      _state.total = p.total || 0
      _state.synced = p.synced || 0
      _state.failed = p.failed || 0
      notify()
    }
  } catch {}
}

export function isBackupEnabled(uid) {
  return localStorage.getItem(ENABLED_KEY(uid)) === 'true'
}

export function setBackupEnabled(uid, val) {
  localStorage.setItem(ENABLED_KEY(uid), val ? 'true' : 'false')
}

export function cancelBackup() {
  _state.cancelled = true
  _state.running = false
  notify()
}

// Upload com retry exponencial + escolha de método por tipo
async function uploadOne(blob, uid) {
  // 1) Comprime imagens (vídeo passa direto)
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
        // Resumable para arquivos grandes (melhor em redes instáveis)
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
      // Backoff exponencial: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
}

// Verifica se memória já tem backup no Firestore (campo backedUp: true)
function isBackedUp(m) {
  return m.backedUp === true || (m.fileUrl && m.fileUrl.includes('firebasestorage'))
}

// Recupera blob local pelo localBlobId ou firestoreId (igual ao memoriesService)
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

// Sincroniza um item e marca como backedUp no Firestore
async function syncOne(m, uid) {
  // Carrega blob do IndexedDB se ainda não veio anexado
  const blob = (m.fileBlob instanceof Blob) ? m.fileBlob : await getLocalBlob(m, uid)

  if (!blob) {
    // Sem blob local — marca como backedUp para não tentar de novo
    await updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
      backedUp: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {})
    return
  }

  const uploaded = await uploadOne(blob, uid)

  // Marca como backedUp=true — nunca mais será processada
  await updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
    fileUrl: uploaded.url,
    filePath: uploaded.path,
    fileSize: uploaded.size,
    localOnly: false,
    backedUp: true,
    updatedAt: serverTimestamp(),
  }).catch(() => {})
}

// Detectar novas fotos automaticamente
if (typeof window !== 'undefined') {
  window.addEventListener('memory-added', () => {
    const uid = auth.currentUser?.uid
    if (!uid || !isBackupEnabled(uid)) return
    setTimeout(() => { if (!_state.running) startBackup() }, 1000)
  })
}

/**
 * Busca apenas memórias pendentes de backup direto no Firestore (sem baixar tudo).
 * Faz 2 queries: media com backedUp=false E media sem o campo backedUp (legado).
 */
async function fetchPendingMemories(uid) {
  const colRef = collection(firestore, 'users', uid, 'memories')
  const pending = new Map() // id -> data

  // 1) Itens explicitamente não-backedUp
  try {
    const q1 = query(colRef, where('backedUp', '==', false))
    const s1 = await getDocs(q1)
    s1.docs.forEach(d => pending.set(d.id, { id: d.id, ...d.data() }))
  } catch (e) { console.warn('Query backedUp==false falhou:', e.message) }

  // 2) Itens marcados como localOnly (compatibilidade com docs antigos sem backedUp)
  try {
    const q2 = query(colRef, where('localOnly', '==', true))
    const s2 = await getDocs(q2)
    s2.docs.forEach(d => {
      if (!pending.has(d.id)) pending.set(d.id, { id: d.id, ...d.data() })
    })
  } catch (e) { console.warn('Query localOnly==true falhou:', e.message) }

  // Filtra texto fora (não tem arquivo) e itens já com fileUrl válida
  return Array.from(pending.values()).filter(m =>
    m.type !== 'text' && !isBackedUp(m)
  )
}

export async function startBackup() {
  if (_state.running) return
  const uid = auth.currentUser?.uid
  if (!uid) return

  _state.running = true
  _state.cancelled = false
  _state.failed = 0
  notify()

  try {
    const toSync = await fetchPendingMemories(uid)

    _state.total  = (_state.synced || 0) + toSync.length
    persist(uid)
    notify()

    if (toSync.length === 0) {
      _state.running = false
      persist(uid)
      notify()
      return
    }

    const queue = [...toSync]

    const worker = async () => {
      while (queue.length > 0 && !_state.cancelled) {
        const m = queue.shift()
        if (!m) break
        try {
          await syncOne(m, uid)
        } catch (e) {
          _state.failed++
          console.warn('Falhou:', m.title, e.message)
        }
        _state.synced++
        persist(uid)
        notify()
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toSync.length) }, worker))

  } catch (e) {
    console.error('Backup error:', e.message)
    _state.failed++
  }

  _state.running = false
  persist(uid)
  notify()
}
