/**
 * cloudBackupService.js — Backup robusto estilo Google Fotos
 * - Marca cada foto como sincronizada no Firestore após upload
 * - Nunca re-sincroniza o que já foi feito
 * - Retoma exatamente de onde parou
 * - 6 uploads em paralelo
 */
import { getMemories } from './memoriesService.js'
import { auth, firestore, storage } from '../firebase.js'
import { doc, updateDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { v4 as uuid } from 'uuid'

const ENABLED_KEY  = uid => `recordar_backup_enabled_${uid}`
const PROGRESS_KEY = uid => `recordar_backup_progress_${uid}`
const CONCURRENCY  = 6
const TIMEOUT_MS   = 60000

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

// Upload com retry
async function uploadOne(blob, uid) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ext  = blob.type?.split('/')[1]?.split(';')[0] || 'bin'
      const path = `${uid}/memories/${uuid()}.${ext}`
      const sRef = ref(storage, path)
      const snap = await Promise.race([
        uploadBytes(sRef, blob),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))
      ])
      const url = await getDownloadURL(snap.ref)
      return { url, path }
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}

// Verifica se memória já tem backup no Firestore (campo backedUp: true)
function isBackedUp(m) {
  return m.backedUp === true || (m.fileUrl && m.fileUrl.includes('firebasestorage'))
}

// Sincroniza um item e marca como backedUp no Firestore
async function syncOne(m, uid) {
  const blob = m.fileBlob instanceof Blob ? m.fileBlob : null
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

export async function startBackup() {
  if (_state.running) return
  const uid = auth.currentUser?.uid
  if (!uid) return

  _state.running = true
  _state.cancelled = false
  _state.failed = 0
  notify()

  try {
    const mems  = await getMemories()
    const media = mems.filter(m => m.type !== 'text')

    // Filtrar apenas as que NÃO foram marcadas como backedUp no Firestore
    // Isso garante retomada correta mesmo após fechar o app ou trocar de dispositivo
    const toSync = media.filter(m => !isBackedUp(m))

    _state.total  = media.length
    _state.synced = media.length - toSync.length
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