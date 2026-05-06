/**
 * memoriesService.js — CRUD de memorias no Firestore + Storage
 */
import { firestore, storage, auth } from '../firebase.js'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, getDocs, getDoc, limit,
  serverTimestamp
} from 'firebase/firestore'
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from 'firebase/storage'
import { v4 as uuid } from 'uuid'
import { isPremium, canUpload, addStorageUsage } from './planService.js'
import { db as localDb } from '../db/database.js'

const memoriesCol = (uid) => collection(firestore, 'users', uid, 'memories')

/**
 * Upload de arquivo para Firebase Storage
 */
export async function uploadFile(file, folder = 'memories') {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  const fileName = `${uuid()}_${file.name || 'file'}`
  const storageRef = ref(storage, `${uid}/${folder}/${fileName}`)
  const snap = await uploadBytes(storageRef, file)
  const url = await getDownloadURL(snap.ref)
  return { url, path: snap.ref.fullPath }
}

/**
 * Adiciona uma nova memoria
 * - Usuario premium: envia arquivo para nuvem
 * - Usuario gratuito: salva apenas metadados (arquivo fica local)
 */
export async function addMemory(memoryData, file = null) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  // Salva blob LOCALMENTE primeiro (garante que a foto fica acessível)
  let localId = null
  if (file) {
    try {
      const blob = file instanceof Blob ? file : new Blob([file])
      localId = await localDb.fileBlobs.add({
        type: memoryData.type || 'photo',
        title: memoryData.title || '',
        date: memoryData.date || '',
        blob: blob,
        createdAt: new Date().toISOString(),
      })
    } catch (e) { console.warn('Erro ao salvar local:', e) }
  }

  let fileUrl = ''
  let filePath = ''
  let fileSize = 0
  const premium = await isPremium()

  if (file && premium) {
    const hasSpace = await canUpload(file.size)
    if (!hasSpace) {
      throw new Error('STORAGE_FULL')
    }
    const uploaded = await uploadFile(file)
    fileUrl = uploaded.url
    filePath = uploaded.path
    fileSize = file.size
    await addStorageUsage(file.size)
  }

  const docData = {
    ...memoryData,
    fileUrl,
    filePath,
    fileSize,
    localOnly: !premium || !file,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isFavorite: false,
    isHighlight: false,
    isShared: false,
    privacyLevel: 'private',
    sharedWith: [],
  }

  const docRef = await addDoc(memoriesCol(uid), docData)

  // Atualiza registro local com firestoreId
  if (localId) {
    try {
      await localDb.fileBlobs.update(localId, { firestoreId: docRef.id })
    } catch {}
  }

  return { id: docRef.id, ...docData }
}

/**
 * Busca todas as memorias do usuario
 */
export async function getMemories(options = {}) {
  const uid = auth.currentUser?.uid
  if (!uid) return []

  let q = query(memoriesCol(uid), orderBy('createdAt', 'desc'))

  if (options.type) {
    q = query(memoriesCol(uid), where('type', '==', options.type), orderBy('createdAt', 'desc'))
  }
  if (options.limit) {
    q = query(q, limit(options.limit))
  }

  const snap = await getDocs(q)
  const memories = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Enriquecer com blobs locais do IndexedDB
  try {
    const localBlobs = await localDb.fileBlobs.toArray()
    const blobMap = {}
    for (const lb of localBlobs) {
      if (lb.firestoreId) blobMap[lb.firestoreId] = lb.blob
      if (lb.title) blobMap[`title:${lb.title}`] = lb.blob
    }
    for (const mem of memories) {
      if (!mem.fileUrl) {
        const blob = blobMap[mem.id] || blobMap[`title:${mem.title}`]
        if (blob) mem.fileBlob = blob
      }
    }
  } catch (e) { /* ignore indexeddb errors */ }

  return memories
}

/**
 * Busca memorias recentes (ultimas N)
 */
export async function getRecentMemories(count = 10) {
  return getMemories({ limit: count })
}

/**
 * Atualiza uma memoria
 */
export async function updateMemory(memoryId, updates) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  const docRef = doc(firestore, 'users', uid, 'memories', memoryId)
  await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() })
}

/**
 * Deleta uma memoria
 */
export async function deleteMemory(memoryId) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  
  // Busca o doc para pegar o filePath
  const docRef = doc(firestore, 'users', uid, 'memories', memoryId)
  const snap = await getDoc(docRef)
  if (snap.exists() && snap.data().filePath) {
    const fileRef = ref(storage, snap.data().filePath)
    await deleteObject(fileRef).catch(() => {})
  }
  await deleteDoc(docRef)
}

/**
 * Busca memorias por texto (titulo + descricao)
 */
export async function searchMemories(queryText) {
  const all = await getMemories()
  const q = queryText.toLowerCase()
  return all.filter(m =>
    m.title?.toLowerCase().includes(q) ||
    m.description?.toLowerCase().includes(q) ||
    m.tags?.some(t => t.toLowerCase().includes(q))
  )
}
