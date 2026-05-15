/**
 * planService.js — Gerencia planos e limites de armazenamento
 */
import { firestore, auth } from '../firebase.js'
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'

const GB = 1024 * 1024 * 1024
const TB = 1024 * GB

// ── Planos disponíveis ──────────────────────────────────────────────────────
export const PLANS = {
  // MENSAIS
  free: {
    id: 'free', billing: 'mensal',
    name: 'Gratuito', price: 0,
    storageGB: 5, storageBytes: 5 * GB,
    features: ['5 GB local', 'Uso offline', 'Organização por ano/mês'],
    cloud: false,
  },
  essencial: {
    id: 'essencial', billing: 'mensal',
    name: 'Essencial', price: 6.90,
    storageGB: 20, storageBytes: 20 * GB,
    features: ['20 GB na nuvem', 'Backup automático', 'Sincronização entre dispositivos'],
    cloud: true,
  },
  padrao: {
    id: 'padrao', billing: 'mensal',
    name: 'Padrão', price: 12.90,
    storageGB: 100, storageBytes: 100 * GB,
    features: ['100 GB na nuvem', 'Backup automático', 'Sincronização', 'Compartilhamento'],
    cloud: true,
  },
  avancado: {
    id: 'avancado', billing: 'mensal',
    name: 'Avançado', price: 19.90,
    storageGB: 300, storageBytes: 300 * GB,
    features: ['300 GB na nuvem', 'Backup automático', 'Sincronização', 'Compartilhamento'],
    cloud: true,
  },
  premium: {
    id: 'premium', billing: 'mensal',
    name: 'Premium', price: 39.90,
    storageGB: 1024, storageBytes: 1 * TB,
    features: ['1 TB na nuvem', 'Backup automático', 'Sincronização', 'Suporte prioritário'],
    cloud: true,
  },
  pro: {
    id: 'pro', billing: 'mensal',
    name: 'Pro', price: 69.90,
    storageGB: 2048, storageBytes: 2 * TB,
    features: ['2 TB na nuvem', 'Backup automático', 'Sincronização', 'Suporte prioritário'],
    cloud: true,
  },
  ultra: {
    id: 'ultra', billing: 'mensal',
    name: 'Ultra', price: 129.90,
    storageGB: 5120, storageBytes: 5 * TB,
    features: ['5 TB na nuvem', 'Backup automático', 'Sincronização', 'Suporte VIP'],
    cloud: true,
  },
  master: {
    id: 'master', billing: 'mensal',
    name: 'Master', price: 199.90,
    storageGB: 10240, storageBytes: 10 * TB,
    features: ['10 TB na nuvem', 'Backup automático', 'Sincronização', 'Suporte VIP'],
    cloud: true,
  },

  // ANUAIS (15% OFF)
  essencial_anual: {
    id: 'essencial_anual', billing: 'anual',
    name: 'Essencial Anual', price: 69.90,
    storageGB: 20, storageBytes: 20 * GB,
    features: ['20 GB na nuvem', 'Backup automático', 'Sincronização', '15% de desconto'],
    cloud: true, discount: '15% OFF',
  },
  padrao_anual: {
    id: 'padrao_anual', billing: 'anual',
    name: 'Padrão Anual', price: 131.90,
    storageGB: 100, storageBytes: 100 * GB,
    features: ['100 GB na nuvem', 'Backup automático', 'Compartilhamento', '15% de desconto'],
    cloud: true, discount: '15% OFF',
  },
  avancado_anual: {
    id: 'avancado_anual', billing: 'anual',
    name: 'Avançado Anual', price: 199.90,
    storageGB: 300, storageBytes: 300 * GB,
    features: ['300 GB na nuvem', 'Backup automático', 'Compartilhamento', '16% de desconto'],
    cloud: true, discount: '16% OFF',
  },
  premium_anual: {
    id: 'premium_anual', billing: 'anual',
    name: 'Premium Anual', price: 399.99,
    storageGB: 1024, storageBytes: 1 * TB,
    features: ['1 TB na nuvem', 'Suporte prioritário', '16% de desconto'],
    cloud: true, discount: '16% OFF',
  },
  pro_anual: {
    id: 'pro_anual', billing: 'anual',
    name: 'Pro Anual', price: 700.00,
    storageGB: 2048, storageBytes: 2 * TB,
    features: ['2 TB na nuvem', 'Suporte prioritário', '16% de desconto'],
    cloud: true, discount: '16% OFF',
  },
  ultra_anual: {
    id: 'ultra_anual', billing: 'anual',
    name: 'Ultra Anual', price: 1299.99,
    storageGB: 5120, storageBytes: 5 * TB,
    features: ['5 TB na nuvem', 'Suporte VIP', '17% de desconto'],
    cloud: true, discount: '17% OFF',
  },
  master_anual: {
    id: 'master_anual', billing: 'anual',
    name: 'Master Anual', price: 2099.90,
    storageGB: 10240, storageBytes: 10 * TB,
    features: ['10 TB na nuvem', 'Suporte VIP', '12% de desconto'],
    cloud: true, discount: '12% OFF',
  },

  // Manter compatibilidade com IDs antigos
  basic:    { id: 'basic',    billing: 'mensal', name: 'Essencial',  price: 6.90,   storageGB: 20,   storageBytes: 20 * GB,   features: ['20 GB na nuvem'],  cloud: true },
  standard: { id: 'standard', billing: 'mensal', name: 'Padrão',     price: 12.90,  storageGB: 100,  storageBytes: 100 * GB,  features: ['100 GB na nuvem'], cloud: true },
  advanced: { id: 'advanced', billing: 'mensal', name: 'Avançado',   price: 19.90,  storageGB: 300,  storageBytes: 300 * GB,  features: ['300 GB na nuvem'], cloud: true },
  large:    { id: 'large',    billing: 'mensal', name: 'Premium',    price: 39.90,  storageGB: 1024, storageBytes: 1 * TB,    features: ['1 TB na nuvem'],   cloud: true },
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