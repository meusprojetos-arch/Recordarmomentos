/**
 * cloudBackupService.js — Backup em segundo plano, independente de navegação
 * Singleton: roda fora dos componentes React, persiste entre trocas de tela
 */

import { uploadFile } from './memoriesService.js'
import { getMemories } from './memoriesService.js'
import { auth, firestore } from '../firebase.js'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'

const CONCURRENCY = 5
const PROGRESS_KEY = uid => `recordar_backup_progress_${uid}`
const ENABLED_KEY  = uid => `recordar_backup_enabled_${uid}`

// Estado global do backup
const state = {
  running: false,
  cancelled: false,
  total: 0,
  synced: 0,
  failed: 0,
  listeners: new Set(),
}

/** Notifica todos os listeners registrados */
function notify() {
  state.listeners.forEach(fn => fn({ ...state }))
}

/** Registra listener de progresso — retorna função para remover */
export function onBackupProgress(fn) {
  state.listeners.add(fn)
  fn({ ...state }) // dispara imediatamente com estado atual
  return () => state.listeners.delete(fn)
}

/** Retorna estado atual */
export function getBackupState() {
  return { ...state }
}

/** Persiste progresso no localStorage para sobreviver reloads */
function saveProgress(uid) {
  try {
    localStorage.setItem(PROGRESS_KEY(uid), JSON.stringify({
      total: state.total,
      synced: state.synced,
      failed: state.failed,
      running: state.running,
    }))
  } catch {}
}

/** Carrega progresso salvo */
export function loadSavedProgress(uid) {
  try {
    const saved = localStorage.getItem(PROGRESS_KEY(uid))
    if (saved) {
      const p = JSON.parse(saved)
      state.total  = p.total  || 0
      state.synced = p.synced || 0
      state.failed = p.failed || 0
      state.running = false // nunca reinicia automaticamente
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

/** Cancela o backup em andamento */
export function cancelBackup() {
  state.cancelled = true
  state.running = false
  notify()
}

/** Inicia o backup em background */
export async function startBackup() {
  if (state.running) return // já rodando
  const uid = auth.currentUser?.uid
  if (!uid) return

  state.running = true
  state.cancelled = false
  state.failed = 0
  notify()

  try {
    const mems = await getMemories()
    const mediaItems = mems.filter(m => m.type !== 'text')
    const toSync = mediaItems.filter(m => !m.fileUrl && m.fileBlob instanceof Blob)

    state.total  = mediaItems.length
    state.synced = mediaItems.length - toSync.length
    saveProgress(uid)
    notify()

    if (toSync.length === 0) {
      state.running = false
      saveProgress(uid)
      notify()
      return
    }

    const queue = [...toSync]

    const worker = async () => {
      while (queue.length > 0 && !state.cancelled) {
        const m = queue.shift()
        if (!m) break
        try {
          const uploaded = await Promise.race([
            uploadFile(m.fileBlob),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000))
          ])
          await updateDoc(doc(firestore, 'users', uid, 'memories', m.id), {
            fileUrl: uploaded.url,
            filePath: uploaded.path,
            localOnly: false,
            updatedAt: serverTimestamp(),
          }).catch(() => {})
          state.synced++
        } catch (e) {
          state.failed++
          state.synced++ // avança mesmo com falha para não travar
          console.warn('Backup falhou:', m.title, e.message)
        }
        saveProgress(uid)
        notify()
      }
    }

    // N workers em paralelo
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  } catch (e) {
    console.error('Erro geral no backup:', e.message)
    state.failed++
  }

  state.running = false
  saveProgress(uid)
  notify()
}