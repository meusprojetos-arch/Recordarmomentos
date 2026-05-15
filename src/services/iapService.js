/**
 * iapService.js — Apple In-App Purchase via Capacitor StoreKit plugin
 * Produtos configurados no App Store Connect:
 *   - com.recordar.memorias.mensal   (assinatura mensal)
 *   - com.recordar.memorias.anual    (assinatura anual)
 */

const PRODUCT_IDS = [
  'com.recordar.memorias.mensal',
  'com.recordar.memorias.anual',
]

function getPlugin() {
  return window?.Capacitor?.Plugins?.IAPPlugin || null
}

export function isNativeIAP() {
  return !!getPlugin() && window?.Capacitor?.getPlatform?.() === 'ios'
}

export async function canMakePayments() {
  const plugin = getPlugin()
  if (!plugin) return false
  try {
    const res = await plugin.canMakePayments()
    return res.value === true
  } catch { return false }
}

export async function getProducts() {
  const plugin = getPlugin()
  if (!plugin) throw new Error('IAP não disponível')
  const res = await plugin.getProducts({ productIds: PRODUCT_IDS })
  return res.products || []
}

export async function purchaseProduct(productId) {
  const plugin = getPlugin()
  if (!plugin) throw new Error('IAP não disponível')
  return await plugin.purchase({ productId })
}

export async function restorePurchases() {
  const plugin = getPlugin()
  if (!plugin) throw new Error('IAP não disponível')
  return await plugin.restorePurchases()
}

/** Adicionar listener para compras restauradas */
export function onPurchaseRestored(callback) {
  const plugin = getPlugin()
  if (!plugin) return () => {}
  plugin.addListener?.('purchaseRestored', callback)
  return () => plugin.removeAllListeners?.('purchaseRestored')
}

/** IDs dos produtos */
export const PRODUCTS = {
  MENSAL: 'com.recordar.memorias.mensal',
  ANUAL:  'com.recordar.memorias.anual',
}