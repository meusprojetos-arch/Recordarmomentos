/**
 * autoSyncService.js — Upload automático da galeria (estilo Google Photos)
 *
 * Dois modos:
 *  - NATIVO (iOS): usa o PhotoLibraryPlugin pra acessar TODA a galeria sem
 *    o usuário precisar selecionar nada. Pede permissão padrão do iOS.
 *  - WEB (fallback): usa input[type=file] (usuário seleciona arquivos).
 */

import { Capacitor } from '@capacitor/core'
import { addMemoryAndWait } from './memoriesService.js'
import { isPremium } from './planService.js'
import { auth } from '../firebase.js'

const SYNC_KEY = 'recordar_autosync_enabled'
const SYNCED_KEY = 'recordar_synced_hashes'
const CONCURRENCY = 4
const PAGE_SIZE = 50

// ─── Detecção de plugin nativo + logs visíveis ──────────────────────────────

const _autoSyncLogs = []
const _autoSyncLogListeners = new Set()

function _log(msg, level = 'info') {
  const entry = { ts: new Date().toISOString().substring(11, 23), level, msg: String(msg) }
  _autoSyncLogs.push(entry)
  if (_autoSyncLogs.length > 200) _autoSyncLogs.shift()
  if (level === 'warn') console.warn('[autosync]', msg)
  else console.log('[autosync]', msg)
  _autoSyncLogListeners.forEach(fn => { try { fn(entry) } catch {} })
}

export function getAutoSyncLogs() { return [..._autoSyncLogs] }
export function subscribeToAutoSyncLogs(fn) {
  _autoSyncLogListeners.add(fn)
  return () => _autoSyncLogListeners.delete(fn)
}

function getPlugin() {
  return window?.Capacitor?.Plugins?.PhotoLibraryPlugin || null
}

/**
 * Aguarda o plugin nativo aparecer (até `timeoutMs`).
 * Útil porque às vezes o Capacitor demora 1-2s pra registrar plugins
 * após o WebView carregar.
 */
export async function waitForNativePlugin(timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (getPlugin()) return true
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

export function getPlatform() {
  return Capacitor?.getPlatform?.() || 'web'
}

export function isNativePhotoLibrary() {
  const platform = getPlatform()
  const hasPlugin = !!getPlugin()
  return hasPlugin && platform === 'ios'
}

/**
 * Versão diagnóstica — retorna um objeto com tudo que importa pra debug.
 * Use isso pra entender por que isNativePhotoLibrary() retornou false.
 */
export function getPluginDiagnostics() {
  const cap = window?.Capacitor
  return {
    platform: cap?.getPlatform?.() || 'unknown',
    isNativePlatform: cap?.isNativePlatform?.() || false,
    capacitorAvailable: !!cap,
    pluginsObject: !!cap?.Plugins,
    pluginsAvailable: cap?.Plugins ? Object.keys(cap.Plugins).sort() : [],
    photoLibraryPlugin: !!cap?.Plugins?.PhotoLibraryPlugin,
    iapPlugin: !!cap?.Plugins?.IAPPlugin,
  }
}

// ─── Estado e flags ─────────────────────────────────────────────────────────

export function isAutoSyncEnabled() {
  return localStorage.getItem(SYNC_KEY) === 'true'
}

export function setAutoSyncEnabled(val) {
  localStorage.setItem(SYNC_KEY, val ? 'true' : 'false')
}

function getSyncedHashes() {
  try {
    const uid = auth.currentUser?.uid || '_'
    const raw = localStorage.getItem(`${SYNCED_KEY}_${uid}`)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function markSynced(hash) {
  try {
    const uid = auth.currentUser?.uid || '_'
    const key = `${SYNCED_KEY}_${uid}`
    const raw = localStorage.getItem(key)
    const set = new Set(raw ? JSON.parse(raw) : [])
    set.add(hash)
    const arr = Array.from(set).slice(-20000)
    localStorage.setItem(key, JSON.stringify(arr))
  } catch {}
}

export function countSynced() {
  try {
    const uid = auth.currentUser?.uid || '_'
    const raw = localStorage.getItem(`${SYNCED_KEY}_${uid}`)
    return raw ? JSON.parse(raw).length : 0
  } catch { return 0 }
}

// ─── Permissão & contagem (modo nativo) ─────────────────────────────────────

export async function checkPhotoPermission() {
  const plugin = getPlugin()
  if (!plugin) return 'web'
  const r = await plugin.checkPhotoPermissions()
  return r.status
}

export async function requestPhotoPermission() {
  const plugin = getPlugin()
  if (!plugin) return 'web'
  const r = await plugin.requestPhotoPermissions()
  return r.status
}

export async function getGalleryStats() {
  const plugin = getPlugin()
  if (!plugin) return null
  return await plugin.getMediaCount() // { photos, videos, total }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64)
  const len = byteChars.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

function cleanTitle(filename) {
  if (!filename) return 'Memória'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/^(IMG|VID|WA\d*|PHOTO)[_-]?/i, '')
    .replace(/[_-]/g, ' ')
    .trim() || 'Memória'
}

async function waitForOnline(maxMs, signal) {
  let waited = 0
  while (!navigator.onLine && waited < maxMs && !signal.cancelled) {
    await new Promise(r => setTimeout(r, 1000))
    waited += 1000
  }
  return navigator.onLine
}

// ─── Sync principal (NATIVO) — enumera TODA a galeria automaticamente ───────

export async function runAutoSyncNative(onProgress, signal = { cancelled: false }) {
  _log('runAutoSyncNative iniciado')
  const plugin = getPlugin()
  if (!plugin) {
    _log('Plugin não disponível ao iniciar', 'warn')
    throw new Error('Plugin nativo não disponível')
  }

  // 1) Permissão
  _log('Verificando permissão atual...')
  const perm = await plugin.checkPhotoPermissions()
  _log(`Status atual: ${perm.status}`)
  if (perm.status !== 'authorized' && perm.status !== 'limited') {
    _log('Solicitando permissão ao usuário...')
    const r = await plugin.requestPhotoPermissions()
    _log(`Resposta do usuário: ${r.status}`)
    if (r.status !== 'authorized' && r.status !== 'limited') {
      _log('Permissão negada', 'warn')
      onProgress?.({ status: 'denied', done: 0, total: 0, current: null, failed: 0 })
      return { done: 0, total: 0, failed: 0, cancelled: false, denied: true }
    }
  }

  // 2) Carregar plano premium uma vez (cache)
  await isPremium().catch(() => false)

  // 3) Contagem total
  _log('Contando arquivos na galeria...')
  const count = await plugin.getMediaCount()
  const total = count.total || 0
  _log(`Encontrados: ${count.photos} fotos + ${count.videos} vídeos = ${total} total`)
  if (total === 0) {
    onProgress?.({ status: 'done', done: 0, total: 0, current: null, failed: 0 })
    return { done: 0, total: 0, failed: 0, cancelled: false }
  }

  const synced = getSyncedHashes()
  let done = 0
  let failed = 0
  let processed = 0
  let currentLabel = null

  onProgress?.({
    status: 'starting',
    done: 0, total, current: null, failed: 0,
    photos: count.photos, videos: count.videos,
  })

  // 4) Paginação: carrega metadados em batches, processa cada batch em paralelo
  let offset = 0

  while (offset < total && !signal.cancelled) {
    if (!navigator.onLine) {
      onProgress?.({ status: 'offline', done, total, current: currentLabel, failed })
      const back = await waitForOnline(30_000, signal)
      if (!back || signal.cancelled) break
    }

    const page = await plugin.getMediaPage({ offset, limit: PAGE_SIZE })
    const assets = page.assets || []

    // Filtra os que já foram sincronizados nesta conta
    const todo = assets.filter(a => !synced.has(a.id))

    // Processa em paralelo (CONCURRENCY uploads simultâneos)
    const queue = [...todo]
    const worker = async () => {
      while (queue.length > 0 && !signal.cancelled) {
        const asset = queue.shift()
        if (!asset) return

        currentLabel = asset.filename
        onProgress?.({ status: 'uploading', done, total, current: asset.filename, failed })

        try {
          const data = await plugin.getAssetData({ id: asset.id })
          const blob = base64ToBlob(data.data, data.mimeType)
          const file = new File([blob], asset.filename, { type: data.mimeType })

          const date = asset.createdAt
            ? new Date(asset.createdAt).toISOString().substring(0, 10)
            : new Date().toISOString().substring(0, 10)

          await addMemoryAndWait({
            type: asset.type, // 'photo' | 'video'
            title: cleanTitle(asset.filename),
            description: '',
            date,
            tags: [],
            privacyLevel: 'private',
            fromAutoSync: true,
          }, file)

          markSynced(asset.id)
          done++
        } catch (err) {
          console.warn('[autosync] falha:', asset.filename, err.message)
          failed++
        }
        processed++
        onProgress?.({ status: 'uploading', done, total, current: asset.filename, failed })
      }
    }

    // Contabiliza os já-sincronizados do batch como progresso
    const skipped = assets.length - todo.length
    done += skipped
    processed += skipped
    onProgress?.({ status: 'uploading', done, total, current: currentLabel, failed })

    const workers = Array.from({ length: Math.min(CONCURRENCY, todo.length) }, () => worker())
    await Promise.all(workers)

    if (!page.hasMore) break
    offset += PAGE_SIZE
  }

  onProgress?.({
    status: signal.cancelled ? 'cancelled' : 'done',
    done, total, current: null, failed,
  })
  return { done, total, failed, cancelled: signal.cancelled }
}

// ─── Sync legado (WEB) — input[type=file] manual ────────────────────────────

export async function runAutoSync(files, onProgress, signal = { cancelled: false }) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Não autenticado')

  await isPremium().catch(() => false)
  const synced = getSyncedHashes()

  const toSync = Array.from(files).filter(f => {
    const isMedia = f.type.startsWith('image/') || f.type.startsWith('video/')
    const hash = `${f.name}_${f.size}_${f.lastModified}`
    return isMedia && !synced.has(hash)
  })

  const total = toSync.length
  let done = 0
  let failed = 0

  onProgress?.({ done: 0, total, current: null, status: 'starting', failed: 0 })

  if (total === 0) {
    onProgress?.({ status: 'done', done: 0, total: 0, current: null, failed: 0 })
    return { done: 0, total: 0, failed: 0, cancelled: false }
  }

  const queue = [...toSync]
  const worker = async () => {
    while (queue.length > 0 && !signal.cancelled) {
      const file = queue.shift()
      if (!file) return

      onProgress?.({ status: 'uploading', done, total, current: file.name, failed })

      try {
        const type = file.type.startsWith('video/') ? 'video' : 'photo'
        const date = new Date(file.lastModified || Date.now()).toISOString().substring(0, 10)

        await addMemoryAndWait({
          type,
          title: cleanTitle(file.name),
          description: '',
          date,
          tags: [],
          privacyLevel: 'private',
          fromAutoSync: true,
        }, file)

        markSynced(`${file.name}_${file.size}_${file.lastModified}`)
        done++
      } catch (err) {
        console.warn('[autosync web] falha:', file.name, err.message)
        failed++
      }
      onProgress?.({ status: 'uploading', done, total, current: file.name, failed })
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker())
  await Promise.all(workers)

  onProgress?.({
    status: signal.cancelled ? 'cancelled' : 'done',
    done, total, current: null, failed,
  })
  return { done, total, failed, cancelled: signal.cancelled }
}
