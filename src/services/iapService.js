/**
 * iapService.js — Apple In-App Purchase via Capacitor StoreKit plugin
 * IDs configurados no App Store Connect
 *
 * Acessa o plugin nativo direto via window.Capacitor.Plugins.IAPPlugin
 * (registrado pelo CAP_PLUGIN macro no IAPPlugin.m).
 */

import { Capacitor } from '@capacitor/core'

// Mapeamento: productId → planId interno
export const PRODUCT_TO_PLAN = {
  // Mensais
  'recordar_20gb_month':   'essencial',
  'recordar_100gb_month':  'padrao',
  'recordar_300gb_month':  'avancado',
  'recordar_1tb_month':    'premium',
  'recordar_2tb_month':    'pro',
  'recordar_5tb_month':    'ultra',
  'recordar_10tb_month':   'master',
  // Anuais
  'recordar_20gb_year':    'essencial_anual',
  'recordar_100gb_year':   'padrao_anual',
  'recordar_300gb_year':   'avancado_anual',
  'recordar_1tb_year':     'premium_anual',
  'recordar_2tb_year':     'pro_anual',
  'recordar_5tb_year':     'ultra_anual',
  'recordar_10tb_year':    'master_anual',
}

// Mapeamento inverso: planId → productId
export const PLAN_TO_PRODUCT = {
  essencial:       'recordar_20gb_month',
  padrao:          'recordar_100gb_month',
  avancado:        'recordar_300gb_month',
  premium:         'recordar_1tb_month',
  pro:             'recordar_2tb_month',
  ultra:           'recordar_5tb_month',
  master:          'recordar_10tb_month',
  essencial_anual: 'recordar_20gb_year',
  padrao_anual:    'recordar_100gb_year',
  avancado_anual:  'recordar_300gb_year',
  premium_anual:   'recordar_1tb_year',
  pro_anual:       'recordar_2tb_year',
  ultra_anual:     'recordar_5tb_year',
  master_anual:    'recordar_10tb_year',
}

export const ALL_PRODUCT_IDS = Object.keys(PRODUCT_TO_PLAN)

function getPlugin() {
  return window?.Capacitor?.Plugins?.IAPPlugin || null
}

export function isNativeIAP() {
  if (Capacitor?.getPlatform?.() !== 'ios') return false
  return !!getPlugin()
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
  const res = await plugin.getProducts({ productIds: ALL_PRODUCT_IDS })
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

export function onPurchaseRestored(callback) {
  const plugin = getPlugin()
  if (!plugin) return () => {}
  plugin.addListener?.('purchaseRestored', callback)
  return () => plugin.removeAllListeners?.('purchaseRestored')
}

// Mantido para compatibilidade
export const PRODUCTS = PLAN_TO_PRODUCT