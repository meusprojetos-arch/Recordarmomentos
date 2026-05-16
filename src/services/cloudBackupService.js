/**
 * cloudBackupService.js — Backup robusto estilo Google Fotos
 *
 * Arquitetura:
 *  - Firestore = fonte da verdade dos contadores (via getCountFromServer).
 *  - Lock global previne execuções simultâneas.
 *  - TODA operação async tem timeout — nunca trava.
 *  - Logs com prefixo [backup] facilitam debug pelo console do Safari.
 *  - Falhas marcam o doc com backedUp=true (skipped) pra não tentar para sempre.
 */
import { auth, firestore, storage } from '../firebase.js'
import {
  collection, doc, updateDoc, serverTimestamp,
  query, where, getDocs, getCountFromServer,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { v4 as uuid } from 'uuid'
import { db as localDb } from '../db/database.js'
import { smartCompress } from '../utils/imageCompressor.js'

const ENABLED_KEY      = uid => `recordar_backup_enabled_${uid}`
const PROGRESS_KEY_OLD = uid => `recordar_backup_progress_${uid}`
const CONCURRENCY      = 6
const UPLOAD_TIMEOUT_MS = 90_000     // 90s por upload — generoso pra 3G
const DOWNLOAD_URL_TIMEOUT_MS = 15_000
const DB_OP_TIMEOUT_MS = 10_000

// ─── Logs in-memory pra visualização dentro do app ─────────────────────────
const MAX_LOGS = 300
const _logs = []
const _logListeners = new Set()

function _pushLog(level, args) {
  const ts = new Date().toISOString().substring(11, 23) // HH:MM:SS.mmm
  const msg = args.map(a => {
    if (typeof a === 'string') return a
    try { return JSON.stringify(a) } catch { return String(a) }
  }).join(' ')
  const entry = { ts, level, msg }
  _logs.push(entry)
  if (_logs.length > MAX_LOGS) _logs.shift()
  _logListeners.forEach(fn => { try { fn(entry) } catch {} })
}

export function getBackupLogs() {
  return [..._logs]
}

export function subscribeToBackupLogs(fn) {
  _logListeners.add(fn)
  return () => _logListeners.delete(fn)
}

export function clearBackupLogs() {
  _logs.length = 0
  _logListeners.forEach(fn => { try { fn(null) } catch {} })
}

const log = (...args) => { console.log('[backup]', ...args); _pushLog('info', args) }
const warn = (...args) => { console.warn('[backup]', ...args); _pushLog('warn', args) }

const _state = {
  running: false,
  cancelled: false,
  total: 0,
  synced: 0,
  failed: 0,
  listeners: new Set(),
  pendingAutoStart: null,
}

let _currentRun = null

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    ),
  ])
}

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
  log('cancelBackup() chamado')
  _state.cancelled = true
  notify()
}

/**
 * Conta total e sincronizadas direto do Firestore (1 read agregado por query).
 */
async function refreshCountersFromFirestore(uid) {
  try {
    const colRef = collection(firestore, 'users', uid, 'memories')
    const [totalSnap, syncedSnap] = await Promise.all([
      withTimeout(
        getCountFromServer(query(colRef, where('type', 'in', ['photo', 'video', 'audio']))),
        DB_OP_TIMEOUT_MS, 'count total'
      ),
      withTimeout(
        getCountFromServer(query(colRef, where('backedUp', '==', true))),
        DB_OP_TIMEOUT_MS, 'count synced'
      ),
    ])
    const total  = totalSnap.data().count
    const synced = Math.min(syncedSnap.data().count, total)
    _state.total  = total
    _state.synced = synced
    log(`contadores: ${synced}/${total}`)
    return { total, synced }
  } catch (e) {
    warn('refreshCounters falhou:', e.message)
    return null
  }
}

export async function loadSavedProgress(uid) {
  if (!uid) return
  try { localStorage.removeItem(PROGRESS_KEY_OLD(uid)) } catch {}
  if (_state.running) { notify(); return }
  await refreshCountersFromFirestore(uid)
  notify()
}

// ─── Upload com TIMEOUT em tudo ─────────────────────────────────────────────

async function uploadOne(blob, uid) {
  // 1) Comprime (já tem timeout interno — nunca trava)
  log(`compress: ${(blob.size/1024).toFixed(0)}KB tipo=${blob.type}`)
  const compressed = await smartCompress(blob).catch(() => blob)
  log(`upload start: ${(compressed.size/1024).toFixed(0)}KB`)

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ext  = (compressed.type?.split('/')[1] || 'bin').split(';')[0]
      const path = `${uid}/memories/${uuid()}.${ext}`
      const sRef = ref(storage, path)

      // Sempre usa uploadBytes simples — mais previsível no WKWebView
      const snap = await withTimeout(
        uploadBytes(sRef, compressed),
        UPLOAD_TIMEOUT_MS,
        `uploadBytes (tentativa ${attempt + 1})`
      )

      const url = await withTimeout(
        getDownloadURL(snap.ref),
        DOWNLOAD_URL_TIMEOUT_MS,
        'getDownloadURL'
      )

      log(`upload ok: ${path}`)
      return { url, path, size: compressed.size }
    } catch (e) {
      warn(`upload tentativa ${attempt + 1} falhou:`, e.message)
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
      const match = await withTimeout(
        localDb.fileBlobs.where('localBlobId').equals(m.localBlobId).first(),
        DB_OP_TIMEOUT_MS, 'IndexedDB localBlobId'
      )
      if (match?.blob && (!match.uid || match.uid === uid)) return match.blob
    }
    const match = await withTimeout(
      localDb.fileBlobs.where('firestoreId').equals(m.id).first(),
      DB_OP_TIMEOUT_MS, 'IndexedDB firestoreId'
    )
    if (match?.blob && (!match.uid || match.uid === uid)) return match.blob
  } catch (e) {
    warn('getLocalBlob falhou:', e.message)
  }
  return null
}

async function syncOne(m, uid) {
  const blob = (m.fileBlob instanceof Blob) ? m.fileBlob : await getLocalBlob(m, uid)

  if (!blob) {
    // Sem blob local — marca como backedUp (skipped) pra não ficar tentando pra sempre
    log(`sem blob local, marca skipped: ${m.id}`)
    await withTimeout(
      updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
        backedUp: true,
        skippedReason: 'no_local_blob',
        updatedAt: serverTimestamp(),
      }),
      DB_OP_TIMEOUT_MS, 'updateDoc skipped'
    ).catch(e => warn('updateDoc skipped falhou:', e.message))
    return
  }

  const uploaded = await uploadOne(blob, uid)

  await withTimeout(
    updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
      fileUrl: uploaded.url,
      filePath: uploaded.path,
      fileSize: uploaded.size,
      localOnly: false,
      backedUp: true,
      updatedAt: serverTimestamp(),
    }),
    DB_OP_TIMEOUT_MS, 'updateDoc backedUp'
  ).catch(e => warn('updateDoc backedUp falhou:', e.message))
}

// ─── Auto-start ao adicionar nova memória (debounced) ───────────────────────

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

// ─── Fetch pendentes (com fallback para docs antigos) ───────────────────────

async function fetchPendingMemories(uid) {
  const colRef = collection(firestore, 'users', uid, 'memories')
  const pending = new Map()

  try {
    const s1 = await withTimeout(
      getDocs(query(colRef, where('backedUp', '==', false))),
      DB_OP_TIMEOUT_MS, 'query backedUp==false'
    )
    s1.docs.forEach(d => pending.set(d.id, { id: d.id, ...d.data() }))
  } catch (e) { warn('Query backedUp==false falhou:', e.message) }

  try {
    const s2 = await withTimeout(
      getDocs(query(colRef, where('localOnly', '==', true))),
      DB_OP_TIMEOUT_MS, 'query localOnly==true'
    )
    s2.docs.forEach(d => {
      if (!pending.has(d.id)) pending.set(d.id, { id: d.id, ...d.data() })
    })
  } catch (e) { warn('Query localOnly==true falhou:', e.message) }

  // Fallback: scan completo pra docs antigos sem campo backedUp/localOnly
  if (pending.size === 0) {
    try {
      const allSnap = await withTimeout(
        getDocs(colRef),
        DB_OP_TIMEOUT_MS, 'query all (fallback)'
      )
      allSnap.docs.forEach(d => {
        const m = { id: d.id, ...d.data() }
        if (m.type !== 'text' && !isBackedUp(m)) pending.set(d.id, m)
      })
    } catch (e) { warn('Query fallback falhou:', e.message) }
  }

  const filtered = Array.from(pending.values()).filter(m =>
    m.type !== 'text' && !isBackedUp(m)
  )
  log(`pendentes: ${filtered.length}`)
  return filtered
}

// ─── Execução com lock + cleanup garantido ──────────────────────────────────

export function startBackup() {
  if (_currentRun) {
    log('startBackup: já tem execução em andamento, retornando ela')
    return _currentRun
  }
  log('startBackup: iniciando nova execução')
  _currentRun = _runBackupOnce()
    .catch(e => warn('execução falhou:', e?.message || e))
    .finally(() => { _currentRun = null; log('execução finalizada') })
  return _currentRun
}

async function _runBackupOnce() {
  const uid = auth.currentUser?.uid
  if (!uid) { warn('sem uid, abortando'); return }

  _state.running = true
  _state.cancelled = false
  _state.failed = 0
  await refreshCountersFromFirestore(uid)
  notify()

  try { localStorage.removeItem(PROGRESS_KEY_OLD(uid)) } catch {}

  try {
    const toSync = await fetchPendingMemories(uid)
    if (_state.cancelled) { log('cancelado após fetch'); return }
    if (toSync.length === 0) { log('nada a sincronizar'); return }

    const queue = [...toSync]
    let processed = 0

    const worker = async (workerIdx) => {
      while (queue.length > 0) {
        if (_state.cancelled) { log(`worker ${workerIdx}: cancelado`); return }
        const m = queue.shift()
        if (!m) return

        const itemIdx = ++processed
        log(`worker ${workerIdx}: processando #${itemIdx} (${m.id}, ${m.type})`)

        let ok = false
        try {
          await syncOne(m, uid)
          ok = true
        } catch (e) {
          warn(`worker ${workerIdx}: item #${itemIdx} falhou:`, e.message)
        }

        if (_state.cancelled) return

        if (ok) {
          _state.synced = Math.min(_state.synced + 1, _state.total)
        } else {
          _state.failed++
        }
        notify()
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, toSync.length) },
      (_, i) => worker(i + 1)
    )
    await Promise.all(workers)
    log('todos workers terminaram')

  } catch (e) {
    warn('erro no _runBackupOnce:', e.message)
  } finally {
    await refreshCountersFromFirestore(uid).catch(() => {})
    _state.running = false
    notify()
    log(`finally: running=false, synced=${_state.synced}/${_state.total}, failed=${_state.failed}`)
  }
}
