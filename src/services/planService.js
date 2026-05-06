/**
 * planService.js — Gerencia planos e limites de armazenamento
 */
import { firestore, auth } from '../firebase.js'
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'

// Planos disponiveis
export const PLANS = {
  free: {
    id: 'free',
    name: 'Gratuito',
    price: 0,
    storageGB: 0,
    storageBytes: 0,
    features: ['Uso offline', 'Armazenamento local', 'Organizacao por ano/mes'],
    cloud: false,
  },
  basic: {
    id: 'basic',
    name: 'Basico',
    price: 9.90,
    storageGB: 5,
    storageBytes: 5 * 1024 * 1024 * 1024,
    features: ['5GB na nuvem', 'Backup automatico', 'Sincronizacao entre dispositivos'],
    cloud: true,
  },
  standard: {
    id: 'standard',
    name: 'Padrao',
    price: 19.90,
    storageGB: 50,
    storageBytes: 50 * 1024 * 1024 * 1024,
    features: ['50GB na nuvem', 'Backup automatico', 'Sincronizacao', 'Compartilhamento'],
    cloud: true,
  },
  advanced: {
    id: 'advanced',
    name: 'Avancado',
    price: 39.90,
    storageGB: 200,
    storageBytes: 200 * 1024 * 1024 * 1024,
    features: ['200GB na nuvem', 'Backup automatico', 'Sincronizacao', 'Compartilhamento', 'Prioridade no suporte'],
    cloud: true,
  },
  large: {
    id: 'large',
    name: 'Grande',
    price: 59.90,
    storageGB: 1024,
    storageBytes: 1024 * 1024 * 1024 * 1024,
    features: ['1TB na nuvem', 'Backup automatico', 'Sincronizacao', 'Compartilhamento', 'Prioridade no suporte'],
    cloud: true,
  },
}

/**
 * Busca o plano atual do usuario
 */
export async function getUserPlan() {
  const uid = auth.currentUser?.uid
  if (!uid) return PLANS.free

  const snap = await getDoc(doc(firestore, 'users', uid))
  if (!snap.exists()) return PLANS.free

  const data = snap.data()
  const planId = data.plan || 'free'
  return PLANS[planId] || PLANS.free
}

/**
 * Busca uso de armazenamento atual
 */
export async function getStorageUsage() {
  const uid = auth.currentUser?.uid
  if (!uid) return { used: 0, limit: 0 }

  const snap = await getDoc(doc(firestore, 'users', uid))
  if (!snap.exists()) return { used: 0, limit: 0 }

  const data = snap.data()
  const plan = PLANS[data.plan || 'free'] || PLANS.free
  return {
    used: data.storageUsed || 0,
    limit: plan.storageBytes,
    plan: plan,
  }
}

/**
 * Verifica se o usuario pode fazer upload (tem espaco)
 */
export async function canUpload(fileSizeBytes) {
  const { used, limit } = await getStorageUsage()
  if (limit === 0) return false // plano gratis
  return (used + fileSizeBytes) <= limit
}

/**
 * Verifica se o usuario e premium
 */
export async function isPremium() {
  const plan = await getUserPlan()
  return plan.cloud === true
}

/**
 * Atualiza o plano do usuario (simulado — em producao usaria Stripe/gateway)
 */
export async function upgradePlan(planId) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Nao autenticado')
  if (!PLANS[planId]) throw new Error('Plano invalido')

  await updateDoc(doc(firestore, 'users', uid), {
    plan: planId,
    planUpdatedAt: new Date().toISOString(),
  })
}

/**
 * Incrementa uso de armazenamento apos upload
 */
export async function addStorageUsage(bytes) {
  const uid = auth.currentUser?.uid
  if (!uid) return

  const snap = await getDoc(doc(firestore, 'users', uid))
  const current = snap.data()?.storageUsed || 0
  await updateDoc(doc(firestore, 'users', uid), {
    storageUsed: current + bytes,
  })
}

/**
 * Formata bytes para exibicao
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
