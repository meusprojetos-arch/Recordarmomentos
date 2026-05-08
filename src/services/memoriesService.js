/**
 * memoriesService.js — CRUD de memorias no Firestore + Storage
 */
import { firestore, storage, auth } from '../firebase.js'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, getDocs, getDoc, limit,
  serverTimestamp, Timestamp
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
  const localBlobId = uuid() // ID único para associar blob
  let localObjectUrl = null
  if (file) {
    try {
      const blob = file instanceof Blob ? file : new Blob([file])
      // Gera URL de objeto como fallback imediato (válida na aba atual)
      localObjectUrl = URL.createObjectURL(blob)
      localId = await localDb.fileBlobs.add({
        localBlobId,
        type: memoryData.type || 'photo',
        title: memoryData.title || '',
        date: memoryData.date || '',
        blob: blob,
        createdAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error('Erro ao salvar blob local (fileBlobs pode nao existir - verifique versao do IndexedDB):', e)
      // Tenta abrir o banco na versao mais recente para forcar migracao
      try { await localDb.open() } catch (_) {}
    }
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
    localBlobId: file ? localBlobId : '',
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

  // Atualiza registro local com firestoreId para associação futura
  if (localId) {
    try {
      await localDb.fileBlobs.update(localId, { firestoreId: docRef.id })
    } catch (e) { console.warn('Erro ao associar firestoreId:', e) }
  }

  // Retorna com objectUrl para uso imediato na sessão atual
  return { id: docRef.id, ...docData, _objectUrl: localObjectUrl }
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
    const blobByFsId = {}
    const blobByLocalBlobId = {}
    const blobByTitle = {}
    for (const lb of localBlobs) {
      if (lb.firestoreId) blobByFsId[lb.firestoreId] = lb.blob
      if (lb.localBlobId) blobByLocalBlobId[lb.localBlobId] = lb.blob
      if (lb.title && lb.title !== 'Sem titulo') blobByTitle[lb.title] = lb.blob
    }
    for (const mem of memories) {
      // Tenta sempre enriquecer com blob local (para thumbnail e exibição offline)
      if (!mem.fileBlob) {
        const blob = blobByFsId[mem.id]
          || (mem.localBlobId && blobByLocalBlobId[mem.localBlobId])
          || (mem.title && mem.title !== 'Sem titulo' && blobByTitle[mem.title])
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
 * - Textos: exclui permanentemente
 * - Fotos/videos/audios: move para lixeira (90 dias)
 */
export async function deleteMemory(memoryId) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  
  const docRef = doc(firestore, 'users', uid, 'memories', memoryId)
  const snap = await getDoc(docRef)
  if (!snap.exists()) return

  const data = snap.data()

  // Texto: exclusão permanente
  if (data.type === 'text') {
    await deleteDoc(docRef)
    return
  }

  // Mídia: mover para lixeira
  const trashCol = collection(firestore, 'users', uid, 'trash')
  await addDoc(trashCol, {
    ...data,
    originalId: memoryId,
    deletedAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
  })
  await deleteDoc(docRef)
}

/**
 * Busca itens na lixeira
 */
export async function getTrashItems() {
  const uid = auth.currentUser?.uid
  if (!uid) return []

  const trashCol = collection(firestore, 'users', uid, 'trash')
  const q = query(trashCol, orderBy('deletedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Restaura um item da lixeira para memorias
 */
export async function restoreFromTrash(trashItemId) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  const trashRef = doc(firestore, 'users', uid, 'trash', trashItemId)
  const snap = await getDoc(trashRef)
  if (!snap.exists()) throw new Error('Item nao encontrado')

  const data = snap.data()
  const { originalId, deletedAt, expiresAt, ...memoryData } = data

  // Re-adiciona como memória
  await addDoc(collection(firestore, 'users', uid, 'memories'), {
    ...memoryData,
    updatedAt: serverTimestamp(),
  })
  await deleteDoc(trashRef)
}

/**
 * Exclui permanentemente um item da lixeira
 */
export async function permanentDeleteFromTrash(trashItemId) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  const trashRef = doc(firestore, 'users', uid, 'trash', trashItemId)
  const snap = await getDoc(trashRef)
  if (snap.exists() && snap.data().filePath) {
    const fileRef = ref(storage, snap.data().filePath)
    await deleteObject(fileRef).catch(() => {})
  }
  await deleteDoc(trashRef)
}

/**
 * Limpa itens expirados da lixeira (>90 dias)
 */
export async function cleanExpiredTrash() {
  const uid = auth.currentUser?.uid
  if (!uid) return

  const trashCol = collection(firestore, 'users', uid, 'trash')
  const now = Timestamp.now()
  const q = query(trashCol, where('expiresAt', '<=', now))
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    if (d.data().filePath) {
      const fileRef = ref(storage, d.data().filePath)
      await deleteObject(fileRef).catch(() => {})
    }
    await deleteDoc(d.ref)
  }
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
