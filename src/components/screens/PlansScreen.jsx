/**
 * PlansScreen — Tela de planos e assinatura
 */
import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { PLANS, getUserPlan, getStorageUsage, upgradePlan, formatBytes } from '../../services/planService.js'
import { isNativeIAP, getProducts, purchaseProduct, restorePurchases, PRODUCTS } from '../../services/iapService.js'
import styles from './PlansScreen.module.css'

const PLAN_LIST = [
  PLANS.free,
  PLANS.basic,
  PLANS.standard,
  PLANS.advanced,
  PLANS.large,
]

export default function PlansScreen({ onClose }) {
  const [currentPlan, setCurrentPlan] = useState(PLANS.free)
  const [usage, setUsage] = useState({ used: 0, limit: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const plan = await getUserPlan()
    const storageUsage = await getStorageUsage()
    setCurrentPlan(plan)
    setUsage(storageUsage)
  }

  const handleUpgrade = async (planId) => {
    if (planId === currentPlan.id) return
    if (planId === 'free') {
      toast.error('Você já está no plano gratuito')
      return
    }
    setLoading(true)
    try {
      // iOS: usar Apple In-App Purchase (StoreKit)
      if (isNativeIAP()) {
        const productId = planId === 'basic' || planId === 'standard'
          ? PRODUCTS.MENSAL
          : PRODUCTS.ANUAL
        const result = await purchaseProduct(productId)
        if (result.status === 'purchased') {
          await upgradePlan(planId)
          toast.success('Assinatura ativada! ✅')
          loadData()
        }
      } else {
        // Web: fluxo atual
        await upgradePlan(planId)
        toast.success('Plano atualizado com sucesso!')
        loadData()
      }
    } catch (err) {
      if (err.message === 'cancelled') {
        toast('Compra cancelada')
      } else {
        toast.error('Erro ao processar pagamento')
      }
    }
    setLoading(false)
  }

  const handleRestore = async () => {
    if (!isNativeIAP()) return
    setLoading(true)
    try {
      await restorePurchases()
      toast.success('Compras restauradas!')
      loadData()
    } catch {
      toast.error('Nenhuma compra encontrada para restaurar')
    }
    setLoading(false)
  }

  const usagePercent = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0

  const isIOS = isNativeIAP()

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}>← Voltar</button>
        <h1 className={styles.title}>Planos</h1>
        <p className={styles.subtitle}>Proteja suas memorias na nuvem</p>
      </div>

      {/* Uso atual */}
      {currentPlan.cloud && (
        <div className={styles.usageCard}>
          <p className={styles.usageTitle}>Seu armazenamento</p>
          <div className={styles.usageBar}>
            <div className={styles.usageFill} style={{ width: `${usagePercent}%` }} />
          </div>
          <p className={styles.usageText}>
            {formatBytes(usage.used)} de {formatBytes(usage.limit)} usados
          </p>
        </div>
      )}

      {/* Plano atual */}
      <div className={styles.currentCard}>
        <span className={styles.currentBadge}>Plano atual</span>
        <h2 className={styles.currentName}>{currentPlan.name}</h2>
        <p className={styles.currentPrice}>
          {currentPlan.price === 0 ? 'Gratis' : `R$ ${currentPlan.price.toFixed(2)}/mes`}
        </p>
      </div>

      {/* Lista de planos */}
      <div className={styles.planList}>
        {PLAN_LIST.map(plan => (
          <div
            key={plan.id}
            className={`${styles.planCard} ${plan.id === currentPlan.id ? styles.planCardActive : ''}`}
          >
            <div className={styles.planHeader}>
              <h3 className={styles.planName}>{plan.name}</h3>
              <p className={styles.planPrice}>
                {plan.price === 0 ? 'Gratis' : `R$ ${plan.price.toFixed(2)}`}
                {plan.price > 0 && <span className={styles.planPeriod}>/mes</span>}
              </p>
            </div>
            <div className={styles.planStorage}>
              {plan.storageGB === 0 ? 'Sem nuvem' : `${plan.storageGB >= 1024 ? '1TB' : plan.storageGB + 'GB'} na nuvem`}
            </div>
            <ul className={styles.planFeatures}>
              {plan.features.map((f, i) => (
                <li key={i} className={styles.planFeature}>{f}</li>
              ))}
            </ul>
            {plan.id !== currentPlan.id && plan.id !== 'free' && (
              <button
                className={styles.planBtn}
                onClick={() => handleUpgrade(plan.id)}
                disabled={loading}
              >
                {loading ? 'Processando...' : 'Assinar'}
              </button>
            )}
            {plan.id === currentPlan.id && (
              <span className={styles.planActive}>Ativo</span>
            )}
          </div>
        ))}
      </div>

      <p className={styles.disclaimer}>
        Os pagamentos são processados pela App Store. Você pode cancelar a qualquer momento nas configurações do dispositivo.
      </p>

      {/* Botão obrigatório pela Apple: Restaurar compras */}
      {isIOS && (
        <button
          onClick={handleRestore}
          disabled={loading}
          style={{
            background: 'none', border: 'none', color: '#888',
            fontSize: 13, cursor: 'pointer', padding: '8px 0',
            textDecoration: 'underline', display: 'block', margin: '0 auto 16px'
          }}
        >
          Restaurar compras anteriores
        </button>
      )}
    </div>
  )
}