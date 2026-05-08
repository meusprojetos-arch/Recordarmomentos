/**
 * usersService.js — Buscar e compartilhar com outros usuarios
 */
import { firestore, auth } from '../firebase.js'
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc,
  arrayUnion, arrayRemove
} from 'firebase/firestore'

const usersCol = collection(firestore, 'users')

/**
 * Busca usuarios pelo nome (busca parcial)
 */
export async function searchUsers(searchText) {
  if (!searchText || searchText.length < 2) return []
  
  const q = searchText.toLowerCase()
  // Firestore nao tem "contains", entao buscamos por prefixo
  const snap = await getDocs(
    query(usersCol,
      where('username', '>=', q),
      where('username', '<=', q + '\uf8ff')
    )
  )
  
  const currentUid = auth.currentUser?.uid
  return snap.docs
    .filter(d => d.id !== currentUid)
    .map(d => ({ uid: d.id, ...d.data() }))
}

/**
 * Busca um usuario pelo UID
 */
export async function getUserById(uid) {
  const snap = await getDoc(doc(firestore, 'users', uid))
  if (!snap.exists()) return null
  return { uid: snap.id, ...snap.data() }
}

/**
 * Compartilha uma memoria com outro usuario
 */
export async function shareMemory(memoryId, targetUid) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  
  const memRef = doc(firestore, 'users', uid, 'memories', memoryId)
  await updateDoc(memRef, {
    isShared: true,
    sharedWith: arrayUnion(targetUid)
  })

  // Cria referencia na colecao "shared" do usuario destino
  const { addDoc } = await import('firebase/firestore')
  const sharedCol = collection(firestore, 'users', targetUid, 'sharedWithMe')
  await addDoc(sharedCol, {
    fromUid: uid,
    memoryId,
    originalPath: `users/${uid}/memories/${memoryId}`,
    sharedAt: new Date().toISOString()
  })
}

/**
 * Remove compartilhamento
 */
export async function unshareMemory(memoryId, targetUid) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  
  const memRef = doc(firestore, 'users', uid, 'memories', memoryId)
  await updateDoc(memRef, {
    sharedWith: arrayRemove(targetUid)
  })
}

/**
 * Busca memorias compartilhadas comigo
 */
export async function getSharedWithMe() {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  
  const sharedCol = collection(firestore, 'users', uid, 'sharedWithMe')
  const snap = await getDocs(sharedCol)
  
  const results = []
  for (const d of snap.docs) {
    const data = d.data()
    const memSnap = await getDoc(doc(firestore, data.originalPath)).catch(() => null)
    if (memSnap?.exists()) {
      const from = await getUserById(data.fromUid)
      results.push({
        id: d.id,
        memory: { id: memSnap.id, ...memSnap.data() },
        from
      })
    }
  }
  return results
}

/**
 * Busca memorias publicas de outro usuario
 */
export async function getUserPublicMemories(uid) {
  const memoriesCol = collection(firestore, 'users', uid, 'memories')
  const q = query(memoriesCol, where('privacyLevel', '==', 'public'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Busca todas as memorias de outro usuario (se perfil publico)
 */
export async function getUserAllMemories(uid) {
  const { orderBy: ob } = await import('firebase/firestore')
  const memoriesCol = collection(firestore, 'users', uid, 'memories')
  const q = query(memoriesCol, ob('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
