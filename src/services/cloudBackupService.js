/**
 * cloudBackupService.js — Backup robusto estilo Google Fotos
 *
 * Arquitetura:
 *  - Firestore é a FONTE ÚNICA DA VERDADE dos contadores.
 *  - total e synced são contados via getCountFromServer (1 read cada, barato).
 *  - localStorage só guarda flag de "habilitado".
 *  - Lock global previne execuções simultâneas (não importa quantas vezes
 *    startBackup() seja chamado em paralelo, só roda 1).
 *  - cancelBackup() apenas sinaliza; workers respeitam o flag e saem limpo.
 *  - Ao terminar (sucesso, falha ou cancel), recarrega os contadores reais
 *    do Firestore. Isso garante que a UI sempre mostra o estado correto.
 */
import { auth, firestore, storage } from '../firebase.js'
import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, getDocs, getCountFromServer,
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
  running: false,
  cancelled: false,
  total: 0,      // total de mídias do usuário (no Firestore)
  synced: 0,     // quantas já têm backedUp=true (no Firestore)
  failed: 0,     // falhas só na sessão atual (reseta a cada startBackup)
  listeners: new Set(),
  pendingAutoStart: null,
}

let _currentRun = null // Promise da execução atual (lock)

function notify() {
  const s = {
    running: _state.running,
    total: _state.total,
    synced: _state.synced,
    failed: _state.failed,
  }
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

export function isBackupEnabled(uid) {
  return localStorage.getItem(ENABLED_KEY(uid)) === 'true'
}

export function setBackupEnabled(uid, val) {
  localStorage.setItem(ENABLED_KEY(uid), val ? 'true' : 'false')
}

export function cancelBackup() {
  _state.cancelled = true
  notify()
}

/**
 * Conta total e sincronizadas direto do Firestore (servidor).
 * Usa getCountFromServer — 1 read agregado por query, barato.
 */
async function refreshCountersFromFirestore(uid) {
  try {
    const colRef = collection(firestore, 'users', uid, 'memories')
    const [totalSnap, syncedSnap] = await Promise.all([
      getCountFromServer(query(colRef, where('type', 'in', ['photo', 'video', 'audio']))),
      getCountFromServer(query(colRef, where('backedUp', '==', true))),
    ])
    const total  = totalSnap.data().count
    const synced = Math.min(syncedSnap.data().count, total)
    _state.total  = total
    _state.synced = synced
    return { total, synced }
  } catch (e) {
    console.warn('refreshCounters falhou:', e.message)
    return null
  }
}

/**
 * loadSavedProgress — chamado pelo PerfilScreen ao montar.
 * Atualiza contadores com a realidade do Firestore.
 * NUNCA zera nada se já tem backup rodando (evita race com workers).
 */
export async function loadSavedProgress(uid) {
  if (!uid) return
  // Limpa storage antigo (não usamos mais)
  try { localStorage.removeItem(PROGRESS_KEY_OLD(uid)) } catch {}
  // Se está rodando, mantém o estado vivo — não atrapalha workers
  if (_state.running) { notify(); return }
  await refreshCountersFromFirestore(uid)
  notify()
}

// ─── Upload ──────────────────────────────────────────────────────────────────

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
    // Sem blob local — marca como backedUp para não tentar de novo
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

// ─── Detectar novas fotos automaticamente (com debounce) ─────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('memory-added', () => {
    const uid = auth.currentUser?.uid
    if (!uid || !isBackupEnabled(uid)) return
    if (_state.pendingAutoStart) return
    _state.pendingAutoStart = setTimeout(() => {
      _state.pendingAutoStart = null
      if (!_currentRun) startBackup()
    }, 1000)
  })
}

// ─── Fetch pendentes ─────────────────────────────────────────────────────────

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

  // Fallback: se nada veio, busca tudo e filtra (docs antigos sem backedUp/localOnly)
  if (pending.size === 0) {
    try {
      const allSnap = await getDocs(colRef)
      allSnap.docs.forEach(d => {
        const m = { id: d.id, ...d.data() }
        if (m.type !== 'text' && !isBackedUp(m)) pending.set(d.id, m)
      })
    } catch (e) { console.warn('Query fallback (all) falhou:', e.message) }
  }

  return Array.from(pending.values()).filter(m =>
    m.type !== 'text' && !isBackedUp(m)
  )
}

// ─── Execução principal (com lock) ───────────────────────────────────────────

/**
 * startBackup — entrypoint público.
 * Garante UMA execução por vez (lock via _currentRun Promise).
 * Múltiplas chamadas simultâneas recebem a mesma Promise.
 */
export function startBackup() {
  if (_currentRun) return _currentRun
  _currentRun = _runBackupOnce()
    .catch(e => { console.error('Backup falhou:', e?.message || e) })
    .finally(() => { _currentRun = null })
  return _currentRun
}

async function _runBackupOnce() {
  const uid = auth.currentUser?.uid
  if (!uid) return

  // Estado inicial: marca rodando e sincroniza contadores com Firestore
  _state.running = true
  _state.cancelled = false
  _state.failed = 0
  await refreshCountersFromFirestore(uid) // total/synced reais
  notify()

  // Limpa progresso antigo (legado)
  try { localStorage.removeItem(PROGRESS_KEY_OLD(uid)) } catch {}

  try {
    const toSync = await fetchPendingMemories(uid)
    if (_state.cancelled) return

    if (toSync.length === 0) {
      // Já está tudo backupado — atualiza display e sai
      return
    }

    const queue = [...toSync]

    const worker = async () => {
      while (queue.length > 0) {
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

        if (_state.cancelled) return

        if (ok) {
          // Re-conta do Firestore garante sincronia com a realidade
          // (caso outro dispositivo também esteja sincronizando)
          _state.synced = Math.min(_state.synced + 1, _state.total)
        } else {
          _state.failed++
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
  } finally {
    // Recarrega contadores reais do Firestore — fonte da verdade.
    // Isso corrige qualquer drift que tenha acontecido durante a execução.
    await refreshCountersFromFirestore(uid).catch(() => {})
    _state.running = false
    notify()
  }
}
