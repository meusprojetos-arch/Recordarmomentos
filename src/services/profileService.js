/**
 * profileService.js — Gerencia perfil publico/privado
 */
import { firestore, auth } from '../firebase.js'
import { doc, updateDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore'

/**
 * Atualiza nivel de privacidade do perfil
 */
export async function setProfilePrivacy(level) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  await updateDoc(doc(firestore, 'users', uid), { privacyLevel: level })
}

/**
 * Atualiza dados do perfil
 */
export async function updateProfile(data) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  await updateDoc(doc(firestore, 'users', uid), data)
}

/**
 * Busca perfil publico de um usuario
 * Retorna null se o perfil for privado
 */
export async function getPublicProfile(uid) {
  const snap = await getDoc(doc(firestore, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data()
  if (data.privacyLevel === 'private') return null
  return { uid: snap.id, ...data }
}

/**
 * Busca memorias publicas de um usuario
 */
export async function getPublicMemories(uid) {
  const userSnap = await getDoc(doc(firestore, 'users', uid))
  if (!userSnap.exists() || userSnap.data().privacyLevel === 'private') return []
  
  const memsCol = collection(firestore, 'users', uid, 'memories')
  const q = query(memsCol, where('privacyLevel', '==', 'public'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
