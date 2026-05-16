/**
 * autoSyncService.js — Upload automático da galeria (estilo Google Fotos)
 * - Pede permissão via input[type=file] (única forma no browser/PWA)
 * - Paraleliza 6 uploads simultâneos (era sequencial — gargalo enorme)
 * - Usa addMemoryAndWait para garantir que markSynced só roda APÓS upload real
 * - Fila com workers (em vez de for sequencial)
 * - Cache de premium-check (não consulta Firestore por arquivo)
 */

import { addMemoryAndWait } from './memoriesService.js'
import { isPremium } from './planService.js'
import { auth } from '../firebase.js'

const SYNC_KEY = 'recordar_autosync_enabled'
const SYNCED_KEY = 'recordar_synced_hashes'
const CONCURRENCY = 6

export function isAutoSyncEnabled() {
  return localStorage.getItem(SYNC_KEY) === 'true'
}

export function setAutoSyncEnabled(val) {
  localStorage.setItem(SYNC_KEY, val ? 'true' : 'false')
}

/** Gera hash simples de identificação de arquivo */
function fileHash(file) {
  return `${file.name}_${file.size}_${file.lastModified}`
}

/** Retorna Set de hashes já sincronizados */
function getSyncedHashes() {
  try {
    const uid = auth.currentUser?.uid || '_'
    const raw = localStorage.getItem(`${SYNCED_KEY}_${uid}`)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

/** Marca arquivo como sincronizado (thread-safe via re-read) */
function markSynced(hash) {
  try {
    const uid = auth.currentUser?.uid || '_'
    const key = `${SYNCED_KEY}_${uid}`
    // Re-lê do storage para não perder marcações concorrentes de outros workers
    const raw = localStorage.getItem(key)
    const set = new Set(raw ? JSON.parse(raw) : [])
    set.add(hash)
    const arr = Array.from(set).slice(-10000)
    localStorage.setItem(key, JSON.stringify(arr))
  } catch {}
}

/**
 * Espera reconexão por até `maxMs` ms. Retorna true se voltou online.
 */
async function waitForOnline(maxMs, signal) {
  let waited = 0
  while (!navigator.onLine && waited < maxMs && !signal.cancelled) {
    await new Promise(r => setTimeout(r, 1000))
    waited += 1000
  }
  return navigator.onLine
}

/**
 * Inicia sync de uma lista de arquivos com 6 uploads em paralelo.
 * @param {File[]} files — arquivos selecionados pelo usuário
 * @param {Function} onProgress — callback({ done, total, current, status, failed })
 * @param {Object} signal — { cancelled: false } para cancelar
 */
export async function runAutoSync(files, onProgress, signal = { cancelled: false }) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Não autenticado')

  // Cache do status premium (1 chamada em vez de N)
  const premium = await isPremium().catch(() => false)
  // Se não é premium, addMemoryAndWait ainda salva localmente — só não sobe pra nuvem.
  // Mantemos a sincronização local funcionando.

  const synced = getSyncedHashes()

  // Filtrar só fotos e vídeos não sincronizados ainda
  const toSync = Array.from(files).filter(f => {
    const isMedia = f.type.startsWith('image/') || f.type.startsWith('video/')
    return isMedia && !synced.has(fileHash(f))
  })

  const total = toSync.length
  let done = 0
  let failed = 0
  let currentFile = null

  onProgress?.({ done: 0, total, current: null, status: 'starting', failed: 0, premium })

  if (total === 0) {
    onProgress?.({ done: 0, total: 0, current: null, status: 'done', failed: 0 })
    return { done: 0, total: 0, failed: 0, cancelled: false }
  }

  const queue = [...toSync]

  // Worker: pega um item da fila e processa até esvaziar
  const worker = async () => {
    while (queue.length > 0) {
      if (signal.cancelled) return

      // Aguarda reconexão se offline
      if (!navigator.onLine) {
        onProgress?.({ done, total, current: currentFile, status: 'offline', failed })
        const back = await waitForOnline(30_000, signal)
        if (!back || signal.cancelled) return
      }

      const file = queue.shift()
      if (!file) break

      currentFile = file.name
      onProgress?.({ done, total, current: file.name, status: 'uploading', failed })

      try {
        const type = file.type.startsWith('video/') ? 'video' : 'photo'
        const date = new Date(file.lastModified || Date.now()).toISOString().substring(0, 10)
        const cleanName = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/^(IMG|VID|WA\d*)[_-]?/i, '')
          .replace(/[_-]/g, ' ')
          .trim() || 'Memória'

        // CRÍTICO: usa addMemoryAndWait — espera upload terminar de verdade
        await addMemoryAndWait({
          type,
          title: cleanName,
          description: '',
          date,
          tags: [],
          privacyLevel: 'private',
          fromAutoSync: true,
        }, file)

        // Só marca como sincronizado APÓS o upload completar
        markSynced(fileHash(file))
        done++
      } catch (err) {
        console.warn('Falha ao sincronizar:', file.name, err.message)
        failed++
      }

      onProgress?.({ done, total, current: file.name, status: 'uploading', failed })
    }
  }

  // Spawn N workers paralelos
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, toSync.length) },
    () => worker()
  )
  await Promise.all(workers)

  if (signal.cancelled) {
    onProgress?.({ done, total, current: null, status: 'cancelled', failed })
    return { done, total, failed, cancelled: true }
  }

  onProgress?.({ done, total, current: null, status: 'done', failed })
  return { done, total, failed, cancelled: false }
}

/** Conta quantos arquivos já foram sincronizados */
export function countSynced() {
  try {
    const uid = auth.currentUser?.uid || '_'
    const raw = localStorage.getItem(`${SYNCED_KEY}_${uid}`)
    return raw ? JSON.parse(raw).length : 0
  } catch { return 0 }
}
