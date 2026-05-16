/**
 * cloudBackupService.js — Backup singleton global
 * Roda completamente fora do React — não para ao trocar de tela
 */
import { getMemories } from './memoriesService.js'
import { auth, firestore, storage } from '../firebase.js'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { v4 as uuid } from 'uuid'

const ENABLED_KEY  = uid => `recordar_backup_enabled_${uid}`
const PROGRESS_KEY = uid => `recordar_backup_progress_${uid}`
const CONCURRENCY  = 3

// Estado singleton — vive enquanto o app estiver aberto
const _state = {
  running:   false,
  cancelled: false,
  total:     0,
  synced:    0,
  failed:    0,
  listeners: new Set(),
}

function notify() {
  const snap = { running: _state.running, total: _state.total, synced: _state.synced, failed: _state.failed }
  _state.listeners.forEach(fn => { try { fn(snap) } catch {} })
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
      _state.total  = p.total  || 0
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
  _state.running   = false
  notify()
}

/** Upload com progresso real usando uploadBytesResumable — suporta arquivos grandes */
async function uploadWithProgress(blob, uid) {
  const ext  = blob.type?.split('/')[1] || 'bin'
  const path = `${uid}/memories/${uuid()}.${ext}`
  const sRef = ref(storage, path)

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(sRef, blob)
    const timer = setTimeout(() => { task.cancel(); reject(new Error('timeout')) }, 120000)

    task.on('state_changed',
      () => {}, // progresso por arquivo (não usamos aqui)
      err => { clearTimeout(timer); reject(err) },
      async () => {
        clearTimeout(timer)
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, path })
        } catch (e) { reject(e) }
      }
    )
  })
}

/** Processa um único item */
async function syncOne(m, uid) {
  const blob = m.fileBlob instanceof Blob ? m.fileBlob : null
  if (!blob) return

  const uploaded = await uploadWithProgress(blob, uid)

  await updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
    fileUrl:   uploaded.url,
    filePath:  uploaded.path,
    localOnly: false,
    updatedAt: serverTimestamp(),
  }).catch(() => {})
}

// Ouvir novas memórias adicionadas e sincronizar automaticamente
if (typeof window !== 'undefined') {
  window.addEventListener('memory-added', (e) => {
    const mem = e.detail
    if (!mem || !mem.fileBlob) return
    const uid = auth.currentUser?.uid
    if (!uid || !isBackupEnabled(uid)) return
    // Adicionar à fila e sincronizar em background
    setTimeout(() => {
      if (!_state.running) startBackup()
    }, 2000) // pequeno delay para não conflitar com salvamento
  })
}

export async function startBackup() {
  if (_state.running) return
  const uid = auth.currentUser?.uid
  if (!uid) return

  _state.running   = true
  _state.cancelled = false
  _state.failed    = 0
  notify()

  try {
    const mems      = await getMemories()
    const media     = mems.filter(m => m.type !== 'text')
    const toSync    = media.filter(m => !m.fileUrl && m.fileBlob instanceof Blob)

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

    // Fila compartilhada entre workers
    const queue = [...toSync]

    const worker = async () => {
      while (queue.length > 0 && !_state.cancelled) {
        const m = queue.shift()
        if (!m) break

        try {
          await syncOne(m, uid)
        } catch (e) {
          _state.failed++
          console.warn('Backup falhou:', m.title, e.message)
        }

        // Atualiza contador IMEDIATAMENTE após cada arquivo
        _state.synced++
        persist(uid)
        notify() // ← dispara para todos os listeners agora
      }
    }

    // Workers sequenciais dentro do mesmo arquivo mas paralelos entre si
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toSync.length) }, worker))

  } catch (e) {
    console.error('Erro geral backup:', e.message)
    _state.failed++
  }

  _state.running = false
  persist(uid)
  notify()
}