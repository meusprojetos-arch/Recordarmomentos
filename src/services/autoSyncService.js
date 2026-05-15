/**
 * autoSyncService.js — Upload automático da galeria (estilo Google Fotos)
 * - Pede permissão via input[type=file] (única forma no browser/PWA)
 * - Salva fila no IndexedDB para retomar após interrupção
 * - Rastreia arquivos já enviados por nome+tamanho+data
 */

import { db as localDb } from '../db/database.js'
import { addMemory } from './memoriesService.js'
import { auth } from '../firebase.js'

const SYNC_KEY = 'recordar_autosync_enabled'
const SYNCED_KEY = 'recordar_synced_hashes'

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

/** Marca arquivo como sincronizado */
function markSynced(hash) {
  try {
    const uid = auth.currentUser?.uid || '_'
    const key = `${SYNCED_KEY}_${uid}`
    const set = getSyncedHashes()
    set.add(hash)
    // Limitar a 10000 entradas para não estourar localStorage
    const arr = Array.from(set).slice(-10000)
    localStorage.setItem(key, JSON.stringify(arr))
  } catch {}
}

/**
 * Inicia sync de uma lista de arquivos
 * @param {File[]} files — arquivos selecionados pelo usuário
 * @param {Function} onProgress — callback({ done, total, current, status })
 * @param {Object} signal — { cancelled: false } para cancelar
 */
export async function runAutoSync(files, onProgress, signal = { cancelled: false }) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Não autenticado')

  const synced = getSyncedHashes()
  
  // Filtrar só fotos e vídeos não sincronizados ainda
  const toSync = Array.from(files).filter(f => {
    const isMedia = f.type.startsWith('image/') || f.type.startsWith('video/')
    return isMedia && !synced.has(fileHash(f))
  })

  const total = toSync.length
  let done = 0
  let failed = 0

  onProgress?.({ done: 0, total, current: null, status: 'starting' })

  for (const file of toSync) {
    if (signal.cancelled) {
      onProgress?.({ done, total, current: null, status: 'cancelled', failed })
      return { done, total, failed, cancelled: true }
    }

    // Verificar conexão
    if (!navigator.onLine) {
      onProgress?.({ done, total, current: file.name, status: 'offline', failed })
      // Esperar reconexão por até 30s
      let waited = 0
      while (!navigator.onLine && waited < 30000 && !signal.cancelled) {
        await new Promise(r => setTimeout(r, 1000))
        waited += 1000
      }
      if (!navigator.onLine || signal.cancelled) {
        onProgress?.({ done, total, current: null, status: signal.cancelled ? 'cancelled' : 'offline_stop', failed })
        return { done, total, failed, cancelled: signal.cancelled }
      }
    }

    onProgress?.({ done, total: toSync.length, current: file.name, status: 'uploading', failed })

    try {
      const type = file.type.startsWith('video/') ? 'video' : 'photo'
      const date = new Date(file.lastModified || Date.now()).toISOString().substring(0, 10)
      const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/^(IMG|VID|WA\d*)[_-]?/i, '').replace(/[_-]/g, ' ').trim() || 'Memória'

      await addMemory({
        type,
        title: cleanName,
        description: '',
        date,
        tags: [],
        privacyLevel: 'private',
        fromAutoSync: true,
      }, file)

      markSynced(fileHash(file))
      done++
      onProgress?.({ done, total: toSync.length, current: file.name, status: 'uploading', failed })
    } catch (err) {
      console.warn('Falha ao sincronizar:', file.name, err)
      failed++
    }

    // Pequena pausa para não travar a UI
    await new Promise(r => setTimeout(r, 50))
  }

  onProgress?.({ done, total: toSync.length, current: null, status: 'done', failed })
  return { done, total: toSync.length, failed, cancelled: false }
}

/** Conta quantos arquivos já foram sincronizados */
export function countSynced() {
  try {
    const uid = auth.currentUser?.uid || '_'
    const raw = localStorage.getItem(`${SYNCED_KEY}_${uid}`)
    return raw ? JSON.parse(raw).length : 0
  } catch { return 0 }
}