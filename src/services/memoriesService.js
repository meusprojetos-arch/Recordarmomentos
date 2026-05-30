/**
 * memoriesService.js — CRUD de memorias no Firestore + Storage
 */
import { firestore, storage, auth } from '../firebase.js'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, getDocs, getDoc, limit, startAfter,
  serverTimestamp, Timestamp, writeBatch, setDoc
} from 'firebase/firestore'
import {
  ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject
} from 'firebase/storage'
import { v4 as uuid } from 'uuid'
import { isPremium, canUpload, addStorageUsage } from './planService.js'
import { db as localDb } from '../db/database.js'
import { smartCompress } from '../utils/imageCompressor.js'
import { classifyImageBlob } from '../plugins/ImageLabelingPlugin.js'

const memoriesCol = (uid) => collection(firestore, 'users', uid, 'memories')

/**
 * Upload de arquivo para Firebase Storage.
 * - Imagens: comprime antes de subir (smartCompress)
 * - Vídeos: usa uploadBytesResumable (retoma queda de rede automaticamente)
 * - Outros: uploadBytes simples
 */
export async function uploadFile(file, folder = 'memories', onProgress = null) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  // Comprimir se for imagem (no-op para vídeo/áudio)
  const compressed = await smartCompress(file).catch(() => file)

  const ext = (compressed.type?.split('/')[1] || file.name?.split('.').pop() || 'bin').split(';')[0]
  const fileName = `${uuid()}.${ext}`
  const storageRef = ref(storage, `${uid}/${folder}/${fileName}`)

  // Vídeos: upload resumable (melhor para arquivos grandes / redes instáveis)
  if (compressed.type?.startsWith('video/') || compressed.size > 5 * 1024 * 1024) {
    const task = uploadBytesResumable(storageRef, compressed, {
      cacheControl: 'public, max-age=31536000',
    })
    if (onProgress) {
      task.on('state_changed', (snap) => {
        const pct = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) : 0
        onProgress(pct)
      })
    }
    const snap = await task
    const url = await getDownloadURL(snap.ref)
    return { url, path: snap.ref.fullPath, size: compressed.size }
  }

  // Imagens pequenas / outros: upload simples
  const snap = await uploadBytes(storageRef, compressed, {
    cacheControl: 'public, max-age=31536000',
  })
  const url = await getDownloadURL(snap.ref)
  return { url, path: snap.ref.fullPath, size: compressed.size }
}

/**
 * Adiciona uma nova memoria
 * - Usuario premium: envia arquivo para nuvem
 * - Usuario gratuito: salva apenas metadados (arquivo fica local)
 */
export function addMemory(memoryData, file = null) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  const localBlobId = uuid()
  const blob = file instanceof Blob ? file : (file ? new Blob([file]) : null)

  // ObjectUrl SÍNCRONO — zero espera
  const localObjectUrl = blob ? URL.createObjectURL(blob) : null

  // Tudo o resto roda em background — IndexedDB, Firestore, Storage
  ;(async () => {
    try {
      // 1. Salvar no IndexedDB (background)
      let localId = null
      if (blob) {
        try {
          if (!localDb.isOpen()) await localDb.open()
          localId = await localDb.fileBlobs.add({
            localBlobId, uid,
            type: memoryData.type || 'photo',
            title: memoryData.title || '',
            date: memoryData.date || '',
            blob,
            createdAt: new Date().toISOString(),
          })
        } catch {}
      }

      // 2. Upload para nuvem se premium (background)
      let fileUrl = '', filePath = '', fileSize = 0
      const premium = await isPremium().catch(() => false)
      if (blob && premium) {
        const hasSpace = await canUpload(blob.size).catch(() => false)
        if (hasSpace) {
          // Timeout maior para vídeos (5 min); imagens 60s
          const isVideo = blob.type?.startsWith('video/')
          const timeoutMs = isVideo ? 5 * 60_000 : 60_000
          const uploaded = await Promise.race([
            uploadFile(blob),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
          ]).catch(() => null)
          if (uploaded) {
            fileUrl = uploaded.url
            filePath = uploaded.path
            fileSize = uploaded.size ?? blob.size
            addStorageUsage(fileSize).catch(() => {})
          }
        }
      }

      // 3. Salvar metadados no Firestore (background)
      const docData = {
        ...memoryData,
        fileUrl, filePath, fileSize,
        localBlobId: blob ? localBlobId : '',
        localOnly: !fileUrl,
        backedUp: !!fileUrl, // marca explicitamente para query filtrada no backup
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isFavorite: false, isHighlight: false,
        // isShared: false,
        privacyLevel: 'private',
        // sharedWith: [],
      }
      const docRef = await addDoc(memoriesCol(uid), docData)
      if (localId) localDb.fileBlobs.update(localId, { firestoreId: docRef.id }).catch(() => {})

      // 4. Classificar a imagem e atualizar tags no Firestore (background, non-blocking)
      //    Apenas fotos — vídeos e áudios não são classificados.
      //    Nenhum arquivo é duplicado: só o campo `tags` é atualizado no doc já existente.
      if (blob && memoryData.type === 'photo') {
        classifyImageBlob(blob).then(tags => {
          if (tags.length > 0) {
            updateDoc(doc(firestore, 'users', uid, 'memories', docRef.id), { tags })
              .catch(() => {})
          }
        }).catch(() => {})
      }

    } catch (e) { console.warn('addMemory background error:', e.message) }
  })()

  // Retorna SINCRONAMENTE — zero espera, zero await
  return { id: localBlobId, ...memoryData, fileBlob: blob, _objectUrl: localObjectUrl }
}

/**
 * Versão Promise-based de addMemory — espera o upload terminar de verdade.
 * Usada pelo autoSyncService para garantir que markSynced só roda APÓS o upload.
 *
 * @param {Object} memoryData
 * @param {File|Blob} file
 * @returns {Promise<{id, fileUrl, filePath, fileSize, backedUp}>}
 */
export async function addMemoryAndWait(memoryData, file = null) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  const localBlobId = uuid()
  const blob = file instanceof Blob ? file : (file ? new Blob([file]) : null)

  // 1. Salvar no IndexedDB
  let localId = null
  if (blob) {
    try {
      if (!localDb.isOpen()) await localDb.open()
      localId = await localDb.fileBlobs.add({
        localBlobId, uid,
        type: memoryData.type || 'photo',
        title: memoryData.title || '',
        date: memoryData.date || '',
        blob,
        createdAt: new Date().toISOString(),
      })
    } catch (e) { console.warn('IndexedDB add falhou:', e.message) }
  }

  // 2. Upload para nuvem se premium
  let fileUrl = '', filePath = '', fileSize = 0
  const premium = await isPremium().catch(() => false)
  if (blob && premium) {
    const hasSpace = await canUpload(blob.size).catch(() => false)
    if (hasSpace) {
      const isVideo = blob.type?.startsWith('video/')
      const timeoutMs = isVideo ? 5 * 60_000 : 60_000
      const uploaded = await Promise.race([
        uploadFile(blob),
        new Promise((_, rej) => setTimeout(() => rej(new Error('upload timeout')), timeoutMs))
      ])
      if (uploaded) {
        fileUrl = uploaded.url
        filePath = uploaded.path
        fileSize = uploaded.size ?? blob.size
        addStorageUsage(fileSize).catch(() => {})
      }
    } else {
      throw new Error('Sem espaço no plano')
    }
  }

  // 3. Firestore
  const docData = {
    ...memoryData,
    fileUrl, filePath, fileSize,
    localBlobId: blob ? localBlobId : '',
    localOnly: !fileUrl,
    backedUp: !!fileUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isFavorite: false, isHighlight: false,
    // isShared: false,
    privacyLevel: 'private',
    // sharedWith: [],
  }
  const docRef = await addDoc(memoriesCol(uid), docData)
  if (localId) localDb.fileBlobs.update(localId, { firestoreId: docRef.id }).catch(() => {})

  // Classificar a imagem e atualizar tags no Firestore (background, non-blocking)
  // Não duplica nenhum arquivo — só atualiza o campo `tags` no doc já criado.
  if (blob && memoryData.type === 'photo') {
    classifyImageBlob(blob).then(tags => {
      if (tags.length > 0) {
        updateDoc(doc(firestore, 'users', uid, 'memories', docRef.id), { tags })
          .catch(() => {})
      }
    }).catch(() => {})
  }

  return { id: docRef.id, fileUrl, filePath, fileSize, backedUp: !!fileUrl }
}

/**
 * Busca memorias do usuario
 * @param {Object} options
 *   - type: 'photo'|'video'|'audio'|'text' (filtro)
 *   - limit: número máximo
 *   - includeLocked: incluir memórias trancadas (default: false)
 *   - onlyLocked: retornar SOMENTE as trancadas (default: false)
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
  let memories = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Filtro de trancadas (sincronizado via Firestore — funciona entre dispositivos)
  if (options.onlyLocked) {
    memories = memories.filter(m => m.isLocked === true)
  } else if (!options.includeLocked) {
    memories = memories.filter(m => m.isLocked !== true)
  }

  // Enriquecer com blobs locais do IndexedDB
  try {
    if (!localDb.isOpen()) await localDb.open()
    for (const mem of memories) {
      if (mem.fileBlob || mem.fileUrl) continue
      
      let blob = null
      
      // 1. Busca por localBlobId (mais confiável) — filtra por uid
      if (!blob && mem.localBlobId) {
        const match = await localDb.fileBlobs.where('localBlobId').equals(mem.localBlobId).first()
        if (match?.blob && (!match.uid || match.uid === uid)) blob = match.blob
      }
      
      // 2. Busca por firestoreId — filtra por uid
      if (!blob) {
        const match = await localDb.fileBlobs.where('firestoreId').equals(mem.id).first()
        if (match?.blob && (!match.uid || match.uid === uid)) blob = match.blob
      }
      
      // 3. Último recurso: busca por título (se único) — filtra por uid
      if (!blob && mem.title && mem.title !== 'Sem titulo') {
        const match = await localDb.fileBlobs.where('title').equals(mem.title).and(item => !item.uid || item.uid === uid).first()
        if (match?.blob) blob = match.blob
      }
      
      if (blob) mem.fileBlob = blob
    }
  } catch (e) { console.error('IndexedDB blob retrieval failed:', e) }

  return memories
}

/**
 * Busca memorias recentes (ultimas N)
 */
export async function getRecentMemories(count = 10) {
  return getMemories({ limit: count })
}

/**
 * Versão PAGINADA - busca um pedaço por vez (estilo Google Photos).
 * Retorna { memories, lastDoc, hasMore }. Use lastDoc na próxima chamada como cursor.
 *
 * NÃO baixa blobs locais nem cria objectURLs — isso é responsabilidade do componente.
 *
 * @param {Object} options
 *   - pageSize: 30 (default)
 *   - cursor: lastDoc da chamada anterior (null = primeira página)
 *   - type: 'photo'|'video'|'audio'|'text'
 *   - includeLocked: false
 *   - onlyLocked: false
 */
export async function getMemoriesPaginated(options = {}) {
  const uid = auth.currentUser?.uid
  if (!uid) return { memories: [], lastDoc: null, hasMore: false }

  const pageSize = options.pageSize || 30
  const constraints = []
  if (options.type) constraints.push(where('type', '==', options.type))
  constraints.push(orderBy('createdAt', 'desc'))
  if (options.cursor) constraints.push(startAfter(options.cursor))
  constraints.push(limit(pageSize + 1)) // pega 1 a mais pra saber se tem próxima página

  const q = query(memoriesCol(uid), ...constraints)
  const snap = await getDocs(q)

  let docs = snap.docs
  const hasMore = docs.length > pageSize
  if (hasMore) docs = docs.slice(0, pageSize)

  let memories = docs.map(d => ({ id: d.id, ...d.data(), _doc: d }))

  // Filtro de trancadas (mesma lógica do getMemories)
  if (options.onlyLocked) {
    memories = memories.filter(m => m.isLocked === true)
  } else if (!options.includeLocked) {
    memories = memories.filter(m => m.isLocked !== true)
  }

  return {
    memories,
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  }
}

/**
 * Marca uma memória como trancada/destrancada.
 * Sincroniza entre dispositivos (campo isLocked direto no Firestore).
 */
export async function setMemoryLocked(memoryId, locked = true) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  await updateDoc(doc(firestore, 'users', uid, 'memories', memoryId), {
    isLocked: !!locked,
    privacyLevel: locked ? 'private' : 'private',
    updatedAt: serverTimestamp(),
  })
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
 * Deleta uma memória
 * - Textos: exclui permanentemente
 * - Fotos/vídeos/áudios: move para lixeira (90 dias)
 * @param {string} memoryId
 * @param {Object} [knownData] — dados já conhecidos pelo caller (evita getDoc extra)
 */
export async function deleteMemory(memoryId, knownData = null) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  const docRef = doc(firestore, 'users', uid, 'memories', memoryId)

  let data = knownData
  if (!data) {
    const snap = await getDoc(docRef)
    if (!snap.exists()) return
    data = snap.data()
  }

  // Texto: exclusão permanente simples
  if (data.type === 'text') {
    await deleteDoc(docRef)
    return
  }

  // Mídia: move para lixeira em batch atômico (1 round-trip ao invés de 3)
  const batch = writeBatch(firestore)
  const trashRef = doc(collection(firestore, 'users', uid, 'trash'))

  // Remove campos locais não-serializáveis pelo Firestore:
  // fileBlob / thumbnail → Blobs; _objectUrl → ObjectURL string temporária; id → doc ID local
  // eslint-disable-next-line no-unused-vars
  const { fileBlob, _objectUrl, thumbnail, id: _id, ...safeData } = data

  // Garante que nenhum campo é undefined (Firestore rejeita undefined)
  const cleanData = Object.fromEntries(
    Object.entries(safeData).filter(([, v]) => v !== undefined && !(v instanceof Blob))
  )

  batch.set(trashRef, {
    ...cleanData,
    originalId: memoryId,
    deletedAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
  })
  batch.delete(docRef)
  await batch.commit()
}

/**
 * Exclui permanentemente múltiplos itens da lixeira de uma vez.
 * Usa Promise.all para Storage + writeBatch para Firestore.
 * @param {Array<{id: string, filePath?: string}>} items
 */
export async function bulkPermanentDeleteFromTrash(items) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  if (!items.length) return

  // Deleta arquivos do Storage em paralelo (fire-and-forget individual errors)
  await Promise.all(
    items
      .filter(item => item.filePath)
      .map(item => deleteObject(ref(storage, item.filePath)).catch(() => {}))
  )

  // Deleta documentos do Firestore em lotes de 500 (limite do writeBatch)
  const BATCH_SIZE = 500
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestore)
    items.slice(i, i + BATCH_SIZE).forEach(item => {
      batch.delete(doc(firestore, 'users', uid, 'trash', item.id))
    })
    await batch.commit()
  }
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
  // IMPORTANTE: id: d.id vem por ÚLTIMO para sobrescrever qualquer campo 'id'
  // que possa ter ficado gravado nos dados (bug histórico de spread com knownData).
  const items = snap.docs.map(d => ({ ...d.data(), id: d.id }))

  // Enriquecer com blobs locais (igual ao getMemories)
  try {
    if (!localDb.isOpen()) await localDb.open()
    for (const item of items) {
      if (item.fileBlob || item.fileUrl) continue
      let blob = null
      if (!blob && item.localBlobId) {
        const match = await localDb.fileBlobs.where('localBlobId').equals(item.localBlobId).first()
        if (match?.blob && (!match.uid || match.uid === uid)) blob = match.blob
      }
      if (!blob && item.originalId) {
        const match = await localDb.fileBlobs.where('firestoreId').equals(item.originalId).first()
        if (match?.blob && (!match.uid || match.uid === uid)) blob = match.blob
      }
      if (blob) item.fileBlob = blob
    }
  } catch { /* sem blob local */ }

  return items
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
  // Remove campos da lixeira + campos locais não-serializáveis
  // eslint-disable-next-line no-unused-vars
  const { originalId, deletedAt, expiresAt, fileBlob, _objectUrl, thumbnail, id: _id, ...memoryData } = data

  // Garante que nenhum campo é undefined ou Blob
  const cleanMemory = Object.fromEntries(
    Object.entries(memoryData).filter(([, v]) => v !== undefined && !(v instanceof Blob))
  )

  // Batch: cria nova memória + remove do trash atomicamente
  const batch = writeBatch(firestore)
  const newMemRef = doc(collection(firestore, 'users', uid, 'memories'))
  batch.set(newMemRef, { ...cleanMemory, updatedAt: serverTimestamp() })
  batch.delete(trashRef)
  await batch.commit()
}

/**
 * Exclui permanentemente um item da lixeira
 * @param {string} trashItemId
 * @param {Object} [knownData] — dados já conhecidos (evita getDoc)
 */
export async function permanentDeleteFromTrash(trashItemId, knownData = null) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')

  const trashRef = doc(firestore, 'users', uid, 'trash', trashItemId)

  let data = knownData
  if (!data) {
    const snap = await getDoc(trashRef)
    if (!snap.exists()) return
    data = snap.data()
  }

  // Storage e Firestore em paralelo
  await Promise.all([
    data.filePath ? deleteObject(ref(storage, data.filePath)).catch(() => {}) : Promise.resolve(),
    deleteDoc(trashRef),
  ])
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
  if (!snap.empty) {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    await bulkPermanentDeleteFromTrash(items)
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