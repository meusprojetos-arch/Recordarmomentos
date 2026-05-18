/**
 * autoSyncService.js — Importação automática da galeria (estilo Google Photos)
 *
 * Três modos:
 *  - iOS (nativo):     PhotoLibraryPlugin via PHPhotoLibrary
 *  - Android (nativo): PhotoLibraryPlugin via MediaStore
 *  - WEB (fallback):   input[type=file] (seleção manual)
 *
 * Retomada robusta:
 *  - Cada asset importado é registrado no IndexedDB (gallerySynced)
 *  - Se o app fechar, a importação retoma exatamente de onde parou
 *  - Dedup por assetId garante que nada é enviado duas vezes
 *
 * Concorrência:
 *  - CONCURRENCY workers processam assets em paralelo
 *  - Paginação para não carregar toda a galeria na memória
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import { addMemoryAndWait } from './memoriesService.js'
import { isPremium } from './planService.js'
import { auth } from '../firebase.js'
import { db as localDb } from '../db/database.js'

// Bridge JS↔nativo (iOS e Android)
const PhotoLibrary = registerPlugin('PhotoLibraryPlugin')

// CONCURRENCY=1 no iOS porque getAssetData retorna base64 (RAM proporcional ao
// tamanho do arquivo). Com 4 workers + compressão + upload paralelo, o WKWebView
// estourava o limite de memória e o iOS matava o app (OOM).
// Sequencial é mais lento mas ESTÁVEL — usuário pode deixar rodando em background.
const CONCURRENCY = 1
const PAGE_SIZE = 20    // batches menores pra ler menos metadados de uma vez
const RETRY_MAX = 2
const OFFLINE_WAIT_MS = 60_000

// ─── Sistema de Logs (visíveis na UI para debug) ────────────────────────────

const _autoSyncLogs = []
const _autoSyncLogListeners = new Set()

function _log(msg, level = 'info') {
  const entry = { ts: new Date().toISOString().substring(11, 23), level, msg: String(msg) }
  _autoSyncLogs.push(entry)
  if (_autoSyncLogs.length > 500) _autoSyncLogs.shift()
  if (level === 'warn' || level === 'error') console.warn('[gallery-import]', msg)
  else console.log('[gallery-import]', msg)
  _autoSyncLogListeners.forEach(fn => { try { fn(entry) } catch {} })
}

export function getAutoSyncLogs() { return [..._autoSyncLogs] }
export function subscribeToAutoSyncLogs(fn) {
  _autoSyncLogListeners.add(fn)
  return () => _autoSyncLogListeners.delete(fn)
}
export function clearAutoSyncLogs() { _autoSyncLogs.length = 0 }

// ─── Detecção de plataforma e plugin nativo ─────────────────────────────────

function getPlugin() {
  return window?.Capacitor?.Plugins?.PhotoLibraryPlugin || PhotoLibrary || null
}

export function getPlatform() {
  return Capacitor?.getPlatform?.() || 'web'
}

export function isNativePhotoLibrary() {
  const platform = getPlatform()
  if (platform !== 'ios' && platform !== 'android') return false
  return !!window?.Capacitor?.Plugins?.PhotoLibraryPlugin
}

export async function isNativePhotoLibraryReady() {
  const platform = getPlatform()
  if (platform !== 'ios' && platform !== 'android') return false
  if (!window?.Capacitor?.Plugins?.PhotoLibraryPlugin) return false
  try {
    // Testa uma chamada real leve para verificar se o nativo responde
    await window.Capacitor.Plugins.PhotoLibraryPlugin.checkPhotoPermissions()
    return true
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase()
    // "not implemented" = stub JS sem nativo real
    // "not available" = plugin não registrado
    if (msg.includes('not implemented') || msg.includes('not available')) return false
    // Qualquer outro erro = plugin existe mas teve outro problema
    return true
  }
}

export async function waitForNativePlugin(timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (window?.Capacitor?.Plugins?.PhotoLibraryPlugin) return true
    await new Promise(r => setTimeout(r, 100))
  }
  return !!window?.Capacitor?.Plugins?.PhotoLibraryPlugin
}

export function getPluginDiagnostics() {
  const cap = window?.Capacitor
  return {
    platform: cap?.getPlatform?.() || 'unknown',
    isNativePlatform: cap?.isNativePlatform?.() || false,
    capacitorAvailable: !!cap,
    pluginsAvailable: cap?.Plugins ? Object.keys(cap.Plugins).sort() : [],
    photoLibraryNativeReal: cap?.isPluginAvailable?.('PhotoLibraryPlugin') || false,
    photoLibraryInPlugins: !!cap?.Plugins?.PhotoLibraryPlugin,
    userAgent: navigator.userAgent?.substring(0, 100) || 'unknown',
  }
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
  return await plugin.getMediaCount()
}

// ─── Persistência de progresso no IndexedDB ─────────────────────────────────

async function ensureDb() {
  if (!localDb.isOpen()) await localDb.open()
}

/**
 * Verifica se um asset já foi importado (IndexedDB — sobrevive ao fechamento do app)
 */
async function isAssetSynced(assetId) {
  try {
    await ensureDb()
    const record = await localDb.gallerySynced.get(assetId)
    return !!record
  } catch {
    return false
  }
}

/**
 * Marca um asset como importado no IndexedDB
 */
async function markAssetSynced(assetId, uid) {
  try {
    await ensureDb()
    await localDb.gallerySynced.put({
      assetId,
      uid: uid || auth.currentUser?.uid || '_',
      syncedAt: new Date().toISOString(),
    })
  } catch (e) {
    _log(`Erro ao marcar asset ${assetId} como sincronizado: ${e.message}`, 'warn')
  }
}

/**
 * Conta quantos assets já foram importados para este usuário
 */
export async function countSyncedAssets() {
  try {
    await ensureDb()
    const uid = auth.currentUser?.uid || '_'
    return await localDb.gallerySynced.where('uid').equals(uid).count()
  } catch {
    return 0
  }
}

/**
 * Fallback: conta via localStorage (compatibilidade)
 */
export function countSynced() {
  try {
    const uid = auth.currentUser?.uid || '_'
    const raw = localStorage.getItem(`recordar_synced_hashes_${uid}`)
    return raw ? JSON.parse(raw).length : 0
  } catch { return 0 }
}

// ─── Estado persistente da importação ───────────────────────────────────────

const IMPORT_STATE_KEY = 'recordar_gallery_import_state'

function saveImportState(state) {
  try {
    const uid = auth.currentUser?.uid || '_'
    localStorage.setItem(`${IMPORT_STATE_KEY}_${uid}`, JSON.stringify({
      ...state,
      updatedAt: Date.now(),
    }))
  } catch {}
}

export function getImportState() {
  try {
    const uid = auth.currentUser?.uid || '_'
    const raw = localStorage.getItem(`${IMPORT_STATE_KEY}_${uid}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function clearImportState() {
  try {
    const uid = auth.currentUser?.uid || '_'
    localStorage.removeItem(`${IMPORT_STATE_KEY}_${uid}`)
  } catch {}
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
    .replace(/^(IMG|VID|WA\d*|PHOTO|DCIM|DSC|PXL|Screenshot)[_-]?/i, '')
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

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

// Timeout wrapper — evita worker pendurado se plugin/Firebase travar
const ASSET_DATA_TIMEOUT_MS = 30_000      // 30s pra ler bytes da galeria
const UPLOAD_PHOTO_TIMEOUT_MS = 90_000    // 90s por foto (com compressão + upload)
const UPLOAD_VIDEO_TIMEOUT_MS = 5 * 60_000 // 5min por vídeo

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    ),
  ])
}

// ─── Importação NATIVA (iOS + Android) ──────────────────────────────────────

/**
 * Importação automática completa da galeria do dispositivo.
 * Enumera TODOS os assets, pula os já importados, processa o resto.
 *
 * Recursos:
 *  - Retomada: usa IndexedDB para saber onde parou
 *  - Concorrência: CONCURRENCY uploads simultâneos
 *  - Resiliência: retry automático, espera rede, pausa/cancela
 *  - Background: salva estado a cada batch para retomar após crash
 */
export async function runAutoSyncNative(onProgress, signal = { cancelled: false }) {
  const startTime = Date.now()
  _log('=== IMPORTAÇÃO AUTOMÁTICA INICIADA ===')
  _log(`Plataforma: ${getPlatform()}`)

  const plugin = getPlugin()
  if (!plugin) {
    _log('Plugin nativo não disponível', 'error')
    throw new Error('Plugin nativo não disponível')
  }

  // 1) Permissão
  _log('Verificando permissão de acesso à galeria...')
  const perm = await plugin.checkPhotoPermissions()
  _log(`Permissão atual: ${perm.status}`)

  if (perm.status !== 'authorized' && perm.status !== 'limited') {
    _log('Solicitando permissão ao usuário...')
    const r = await plugin.requestPhotoPermissions()
    _log(`Resposta: ${r.status}`)
    if (r.status !== 'authorized' && r.status !== 'limited') {
      _log('Permissão NEGADA pelo usuário', 'warn')
      onProgress?.({ status: 'denied', done: 0, total: 0, current: null, failed: 0 })
      return { done: 0, total: 0, failed: 0, skipped: 0, cancelled: false, denied: true }
    }
  }
  _log('Permissão concedida ✓')

  // 2) Cache do plano premium
  const premium = await isPremium().catch(() => false)
  _log(`Plano premium: ${premium ? 'sim' : 'não'}`)

  // 3) Contagem total da galeria
  _log('Contando arquivos na galeria...')
  const count = await plugin.getMediaCount()
  const totalGallery = count.total || 0
  _log(`Galeria: ${count.photos} fotos + ${count.videos} vídeos = ${totalGallery} total`)

  if (totalGallery === 0) {
    _log('Galeria vazia — nada a importar')
    onProgress?.({ status: 'done', done: 0, total: 0, current: null, failed: 0, skipped: 0 })
    clearImportState()
    return { done: 0, total: 0, failed: 0, skipped: 0, cancelled: false }
  }

  // 4) Preparar contadores
  const uid = auth.currentUser?.uid || '_'
  let failed = 0
  let skipped = 0
  let totalToProcess = 0

  // RETOMADA: começamos `done` com a quantidade REAL de assets já importados
  // (lendo do IndexedDB). Assim o UI mostra o progresso correto imediatamente,
  // sem aparentar começar do 0%.
  let done = 0
  try {
    await ensureDb()
    const syncedCount = await localDb.gallerySynced.count()
    done = Math.min(syncedCount, totalGallery)
    if (done > 0) _log(`Retomando: ${done}/${totalGallery} já estavam no banco local`)
  } catch (e) {
    _log(`Falha ao contar IndexedDB: ${e.message}`, 'warn')
  }

  // Salvar estado inicial
  saveImportState({
    status: 'running',
    totalGallery,
    done,
    failed: 0,
    skipped: 0,
    startedAt: Date.now(),
  })

  onProgress?.({
    status: 'starting',
    done, total: totalGallery, current: null, failed: 0, skipped: 0,
    photos: count.photos, videos: count.videos,
  })

  // 5) Paginação + processamento
  let offset = 0
  let batchNum = 0

  while (offset < totalGallery && !signal.cancelled) {
    batchNum++

    // Verificar rede
    if (!navigator.onLine) {
      _log('Sem conexão — aguardando rede...', 'warn')
      onProgress?.({ status: 'offline', done, total: totalGallery, current: 'Aguardando conexão...', failed, skipped })
      const back = await waitForOnline(OFFLINE_WAIT_MS, signal)
      if (!back || signal.cancelled) {
        _log('Rede não voltou / cancelado — pausando importação', 'warn')
        break
      }
      _log('Conexão restaurada ✓')
    }

    // Carregar página de assets
    _log(`Batch #${batchNum}: carregando offset=${offset} limit=${PAGE_SIZE}`)
    let page
    try {
      page = await plugin.getMediaPage({ offset, limit: PAGE_SIZE })
    } catch (e) {
      _log(`Erro ao carregar batch: ${e.message}`, 'error')
      offset += PAGE_SIZE
      continue
    }

    const assets = page.assets || []
    _log(`Batch #${batchNum}: ${assets.length} assets carregados`)

    // Filtrar assets já importados (verificação no IndexedDB)
    // OBS: NÃO incrementamos `done` aqui porque `done` já começa com a contagem
    // real do IndexedDB (countSyncedAssets). Só somamos `skipped` pra estatística.
    const todo = []
    for (const asset of assets) {
      const alreadySynced = await isAssetSynced(asset.id)
      if (alreadySynced) {
        skipped++
      } else {
        todo.push(asset)
      }
    }

    totalToProcess += todo.length
    _log(`Batch #${batchNum}: ${todo.length} novos, ${assets.length - todo.length} já importados`)

    // Atualizar progresso com os pulados
    onProgress?.({
      status: 'uploading',
      done, total: totalGallery, current: null, failed, skipped,
    })

    // Processar com workers paralelos
    if (todo.length > 0) {
      const queue = [...todo]

      // Permite esvaziar a fila de fora (pausa imediata)
      signal._drainQueue = () => { queue.length = 0 }

      const worker = async () => {
        while (queue.length > 0 && !signal.cancelled) {
          const asset = queue.shift()
          if (!asset || signal.cancelled) return

          onProgress?.({
            status: 'uploading',
            done, total: totalGallery,
            current: asset.filename || 'Importando...',
            failed, skipped,
          })

          let success = false
          let tempPathToCleanup = null

          for (let attempt = 0; attempt <= RETRY_MAX && !success && !signal.cancelled; attempt++) {
            // Refs declaradas fora do try pra liberar no finally
            let assetInfo = null
            let blob = null
            let file = null
            let fetchResponse = null

            try {
              if (attempt > 0) {
                _log(`Retry ${attempt}/${RETRY_MAX} para: ${asset.filename}`)
                await new Promise(r => setTimeout(r, 1000 * attempt))
              }

              if (signal.cancelled) break

              // 1) Pede pro plugin escrever a foto em arquivo temp e devolve URI.
              //    Nada de base64 string — economiza ~3x memória JS.
              assetInfo = await withTimeout(
                plugin.getAssetData({ id: asset.id }),
                ASSET_DATA_TIMEOUT_MS,
                `getAssetData ${asset.filename}`
              )

              if (signal.cancelled) break

              tempPathToCleanup = assetInfo.path || null
              const fileUri = assetInfo.uri  // file:///private/var/.../xxx.jpg
              if (!fileUri) throw new Error('plugin não retornou URI')

              // 2) Lê o arquivo direto como Blob (binário, sem string intermediária)
              fetchResponse = await fetch(fileUri)
              blob = await fetchResponse.blob()
              fetchResponse = null

              file = new File([blob], asset.filename || 'media', { type: assetInfo.mimeType })

              const mimeType = assetInfo.mimeType
              const fileSize = assetInfo.size || blob.size
              assetInfo = null // libera ref do objeto

              const date = asset.createdAt
                ? new Date(asset.createdAt).toISOString().substring(0, 10)
                : new Date().toISOString().substring(0, 10)

              if (signal.cancelled) break

              const isVideo = (mimeType || '').startsWith('video/') || asset.type === 'video'
              const uploadTimeout = isVideo ? UPLOAD_VIDEO_TIMEOUT_MS : UPLOAD_PHOTO_TIMEOUT_MS

              // Pular arquivos > 200MB (estoura memória mesmo com tudo)
              if (fileSize > 200 * 1024 * 1024) {
                _log(`PULAR ${asset.filename}: muito grande (${(fileSize/1024/1024).toFixed(1)}MB)`, 'warn')
                await markAssetSynced(asset.id, uid)
                skipped++
                success = true
                break
              }

              await withTimeout(
                addMemoryAndWait({
                  type: isVideo ? 'video' : 'photo',
                  title: cleanTitle(asset.filename),
                  description: '',
                  date,
                  tags: [],
                  privacyLevel: 'private',
                  fromAutoSync: true,
                  galleryAssetId: asset.id,
                }, file),
                uploadTimeout,
                `upload ${asset.filename}`
              )

              await markAssetSynced(asset.id, uid)
              done++
              success = true

            } catch (err) {
              if (signal.cancelled) break
              if (attempt >= RETRY_MAX) {
                _log(`FALHA: ${asset.filename} — ${err.message}`, 'error')
                failed++
              }
            } finally {
              // Libera refs JS
              assetInfo = null
              blob = null
              file = null
              fetchResponse = null
            }
          }

          // Apaga o arquivo temp no nativo (sucesso ou falha definitiva)
          if (tempPathToCleanup) {
            try {
              await plugin.cleanupTempFile({ path: tempPathToCleanup })
            } catch { /* não-crítico */ }
            tempPathToCleanup = null
          }

          // Pausa entre uploads pra GC respirar
          await new Promise(r => setTimeout(r, 50))

          // Atualizar progresso e estado persistente
          onProgress?.({
            status: 'uploading',
            done, total: totalGallery,
            current: asset.filename,
            failed, skipped,
          })
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, todo.length) },
        () => worker()
      )
      await Promise.all(workers)
    }

    // Salvar checkpoint após cada batch
    saveImportState({
      status: 'running',
      totalGallery,
      done,
      failed,
      skipped,
      lastOffset: offset + PAGE_SIZE,
      startedAt: getImportState()?.startedAt || Date.now(),
    })

    if (!page.hasMore) break
    offset += PAGE_SIZE
  }

  // 6) Finalização
  const elapsed = Date.now() - startTime
  const finalStatus = signal.cancelled ? 'paused' : 'done'
  _log(`=== IMPORTAÇÃO ${signal.cancelled ? 'PAUSADA' : 'CONCLUÍDA'} ===`)
  _log(`Resultado: ${done} importados, ${failed} falhas, ${skipped} já existiam`)
  _log(`Tempo total: ${formatDuration(elapsed)}`)

  if (!signal.cancelled) {
    clearImportState()
  } else {
    saveImportState({
      status: 'paused',
      totalGallery,
      done, failed, skipped,
      startedAt: getImportState()?.startedAt || Date.now(),
    })
  }

  onProgress?.({
    status: finalStatus,
    done, total: totalGallery, current: null, failed, skipped,
  })

  window.dispatchEvent(new Event('memories-updated'))

  return { done, total: totalGallery, failed, skipped, cancelled: signal.cancelled }
}

// ─── Importação WEB (fallback — seleção manual) ────────────────────────────

export async function runAutoSync(files, onProgress, signal = { cancelled: false }) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Não autenticado')

  _log(`=== IMPORTAÇÃO WEB INICIADA (${files.length} arquivo(s)) ===`)

  await isPremium().catch(() => false)

  const toSync = []
  for (const file of Array.from(files)) {
    const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/')
    if (!isMedia) continue
    const hash = `web_${file.name}_${file.size}_${file.lastModified}`
    const alreadySynced = await isAssetSynced(hash)
    if (!alreadySynced) {
      toSync.push({ file, hash })
    }
  }

  const total = toSync.length
  let done = 0
  let failed = 0
  const skipped = files.length - total

  _log(`${total} novos, ${skipped} já importados`)

  onProgress?.({ done: 0, total, current: null, status: 'starting', failed: 0, skipped })

  if (total === 0) {
    _log('Nada novo a importar')
    onProgress?.({ status: 'done', done: 0, total: 0, current: null, failed: 0, skipped })
    return { done: 0, total: 0, failed: 0, skipped, cancelled: false }
  }

  const queue = [...toSync]
  const worker = async () => {
    while (queue.length > 0 && !signal.cancelled) {
      const item = queue.shift()
      if (!item) return

      onProgress?.({ status: 'uploading', done, total, current: item.file.name, failed, skipped })

      try {
        const type = item.file.type.startsWith('video/') ? 'video' : 'photo'
        const date = new Date(item.file.lastModified || Date.now()).toISOString().substring(0, 10)

        await addMemoryAndWait({
          type,
          title: cleanTitle(item.file.name),
          description: '',
          date,
          tags: [],
          privacyLevel: 'private',
          fromAutoSync: true,
        }, item.file)

        await markAssetSynced(item.hash, uid)
        done++
        _log(`✓ ${item.file.name}`)
      } catch (err) {
        _log(`✗ ${item.file.name}: ${err.message}`, 'error')
        failed++
      }
      onProgress?.({ status: 'uploading', done, total, current: item.file.name, failed, skipped })
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker())
  await Promise.all(workers)

  _log(`=== IMPORTAÇÃO WEB ${signal.cancelled ? 'PAUSADA' : 'CONCLUÍDA'}: ${done} ok, ${failed} falha(s) ===`)

  onProgress?.({
    status: signal.cancelled ? 'paused' : 'done',
    done, total, current: null, failed, skipped,
  })

  window.dispatchEvent(new Event('memories-updated'))

  return { done, total, failed, skipped, cancelled: signal.cancelled }
}

// ─── Verificar se há importação pendente para retomar ───────────────────────

export function hasPendingImport() {
  const state = getImportState()
  return state && (state.status === 'running' || state.status === 'paused')
}

export function getPendingImportSummary() {
  const state = getImportState()
  if (!state) return null
  return {
    totalGallery: state.totalGallery || 0,
    done: state.done || 0,
    failed: state.failed || 0,
    skipped: state.skipped || 0,
    remaining: Math.max(0, (state.totalGallery || 0) - (state.done || 0) - (state.failed || 0)),
    status: state.status,
    startedAt: state.startedAt,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GALLERY SYNC MANAGER — Singleton que roda independente de componentes React.
// O sync continua mesmo quando o usuário navega para outra aba.
// Componentes se inscrevem para receber atualizações de estado.
// ═══════════════════════════════════════════════════════════════════════════════

const _mgr = {
  // Estado público
  phase: 'idle',       // idle | checking | syncing | paused | done | denied | error
  done: 0,
  total: 0,
  failed: 0,
  nativeReady: false,
  errorMsg: null,

  // Internals
  _signal: { cancelled: false },
  _listeners: new Set(),
  _running: false,
}

function _notify() {
  const snap = { phase: _mgr.phase, done: _mgr.done, total: _mgr.total, failed: _mgr.failed, nativeReady: _mgr.nativeReady, errorMsg: _mgr.errorMsg }
  _mgr._listeners.forEach(fn => { try { fn(snap) } catch {} })
}

/** Inscreve um listener. Retorna unsubscribe. Dispara imediatamente com estado atual. */
export function subscribeGallerySync(fn) {
  _mgr._listeners.add(fn)
  fn({ phase: _mgr.phase, done: _mgr.done, total: _mgr.total, failed: _mgr.failed, nativeReady: _mgr.nativeReady, errorMsg: _mgr.errorMsg })
  return () => _mgr._listeners.delete(fn)
}

/** Retorna snapshot do estado atual */
export function getGallerySyncState() {
  return { phase: _mgr.phase, done: _mgr.done, total: _mgr.total, failed: _mgr.failed, nativeReady: _mgr.nativeReady, errorMsg: _mgr.errorMsg }
}

/** Inicia ou retoma a importação da galeria. */
export async function startGallerySync() {
  if (_mgr._running) return // já está rodando

  _mgr._signal = { cancelled: false }
  _mgr._running = true
  _mgr.errorMsg = null

  // SEMPRE re-checa o plugin (até quando nativeReady já era true).
  // Necessário porque ao reabrir o app o plugin pode ainda não ter inicializado.
  _mgr.phase = 'checking'
  _notify()

  try {
    const plat = getPlatform()
    if (plat === 'ios' || plat === 'android') {
      // Espera o plugin aparecer (mais generoso: 5s)
      if (!isNativePhotoLibrary()) {
        await waitForNativePlugin(5000)
      }
      let native = isNativePhotoLibrary()
      if (native) {
        try { native = await isNativePhotoLibraryReady() }
        catch { native = false }
      }
      _mgr.nativeReady = native

      if (!native) {
        _mgr.phase = 'error'
        _mgr.errorMsg = 'Plugin indisponível'
        _mgr._running = false
        _notify()
        return
      }

      const st = await checkPhotoPermission()
      if (st === 'denied' || st === 'restricted') {
        _mgr.phase = 'denied'
        _mgr._running = false
        _notify()
        return
      }
    }
  } catch (e) {
    _mgr.phase = 'error'
    _mgr.errorMsg = e.message
    _mgr._running = false
    _notify()
    return
  }

  // Inicia o sync
  _mgr.phase = 'syncing'
  _notify()

  try {
    const res = await runAutoSyncNative((p) => {
      if (p.status === 'denied') {
        _mgr.phase = 'denied'
        _notify()
        return
      }
      _mgr.done = p.done || 0
      _mgr.total = p.total || 0
      _mgr.failed = p.failed || 0
      // Não sobrescreve 'pausing' enquanto o usuário tá esperando pausar
      if (_mgr.phase !== 'pausing') _mgr.phase = 'syncing'
      _notify()
    }, _mgr._signal)

    _mgr.done = res.done || 0
    _mgr.total = res.total || 0
    _mgr.failed = res.failed || 0

    if (res.denied) {
      _mgr.phase = 'denied'
    } else if (res.cancelled) {
      _mgr.phase = 'paused'
    } else {
      _mgr.phase = 'done'
    }
  } catch (e) {
    // CRÍTICO: se o usuário pediu pausa, mostrar como 'paused' (não 'error').
    // Erros durante o cancelamento são esperados (uploads abortados).
    if (_mgr._signal.cancelled) {
      _mgr.phase = 'paused'
      _log('Erro durante pausa (esperado): ' + (e?.message || e), 'warn')
    } else {
      _mgr.phase = 'error'
      _mgr.errorMsg = e.message
    }
  }

  _mgr._running = false
  _notify()
}

/** Pausa a importação. Mostra "Pausando..." imediatamente no UI. */
export function pauseGallerySync() {
  _mgr._signal.cancelled = true
  _mgr._signal._drainQueue?.()
  // Feedback instantâneo enquanto os 6 uploads em andamento terminam
  if (_mgr.phase === 'syncing') {
    _mgr.phase = 'pausing'
    _notify()
  }
}

/** Reseta para idle (após done/error/denied). */
export function resetGallerySync() {
  if (_mgr._running) return
  _mgr.phase = 'idle'
  _mgr.done = 0
  _mgr.total = 0
  _mgr.failed = 0
  _mgr.errorMsg = null
  _notify()
}

// Rastreia o uid da última hidratação pra detectar troca de login
let _lastHydratedUid = null

/**
 * Reseta o _mgr e re-hidrata baseado no uid atual.
 * Chamado: 1) boot  2) toda vez que onAuthStateChanged disparar
 *
 * CRÍTICO pra ISOLAMENTO entre logins: ao trocar de conta, o estado em memória
 * do user anterior é zerado e o novo é carregado do localStorage (chave por uid).
 */
function hydrateMgrFromStorage() {
  try {
    if (_mgr._running) return // não atrapalha execução em andamento

    const currentUid = auth.currentUser?.uid || null

    // Se o uid mudou (logout/troca de conta), RESETA o estado em memória
    if (currentUid !== _lastHydratedUid) {
      _mgr.phase = 'idle'
      _mgr.done = 0
      _mgr.total = 0
      _mgr.failed = 0
      _mgr.errorMsg = null
      _lastHydratedUid = currentUid
    }

    // Carrega estado salvo PRO UID ATUAL (chave de localStorage isolada por uid)
    if (hasPendingImport()) {
      const s = getPendingImportSummary()
      _mgr.phase = 'paused'
      _mgr.done = s?.done || 0
      _mgr.total = s?.totalGallery || 0
      _mgr.failed = s?.failed || 0
    }
    _notify() // avisa quem estiver inscrito (modal, perfil, etc)
  } catch {}
}

// 1) Boot — tenta logo
;(function _initManager() {
  hydrateMgrFromStorage()
  // Em background, espera plugin pra evitar "Plugin indisponível" ao retomar
  setTimeout(async () => {
    try {
      await waitForNativePlugin(8000)
      let native = isNativePhotoLibrary()
      if (native) {
        try { native = await isNativePhotoLibraryReady() } catch { native = false }
      }
      _mgr.nativeReady = native
    } catch {}
  }, 100)
})()

// 2) Auth restaurar — re-hidrata (cobre o caso onde uid só fica disponível depois)
if (typeof window !== 'undefined') {
  try {
    import('firebase/auth').then(({ onAuthStateChanged }) => {
      onAuthStateChanged(auth, () => hydrateMgrFromStorage())
    }).catch(() => {})
  } catch {}
}
