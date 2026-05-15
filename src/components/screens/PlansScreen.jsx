/**
 * PlansScreen — Planos mensais e anuais
 */
import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { PLANS, getUserPlan, getStorageUsage, upgradePlan, formatBytes } from '../../services/planService.js'
import { isNativeIAP, purchaseProduct, restorePurchases, PLAN_TO_PRODUCT } from '../../services/iapService.js'
import styles from './PlansScreen.module.css'

const MENSAIS = [
  PLANS.free, PLANS.essencial, PLANS.padrao, PLANS.avancado,
  PLANS.premium, PLANS.pro, PLANS.ultra, PLANS.master,
]

const ANUAIS = [
  PLANS.essencial_anual, PLANS.padrao_anual, PLANS.avancado_anual,
  PLANS.premium_anual, PLANS.pro_anual, PLANS.ultra_anual, PLANS.master_anual,
]

function storageLabel(gb) {
  if (gb >= 10240) return '10 TB'
  if (gb >= 5120)  return '5 TB'
  if (gb >= 2048)  return '2 TB'
  if (gb >= 1024)  return '1 TB'
  return gb + ' GB'
}

export default function PlansScreen({ onClose }) {
  const [currentPlan, setCurrentPlan] = useState(PLANS.free)
  const [usage, setUsage]             = useState({ used: 0, limit: 0 })
  const [loading, setLoading]         = useState(false)
  const [billing, setBilling]         = useState('mensal') // 'mensal' | 'anual'

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const plan = await getUserPlan().catch(() => PLANS.free)
    const storageUsage = await getStorageUsage().catch(() => ({ used: 0, limit: 0 }))
    setCurrentPlan(plan)
    setUsage(storageUsage)
  }

  const handleUpgrade = async (planId) => {
    if (planId === currentPlan.id) return
    if (planId === 'free') { toast.error('Você já está no plano gratuito'); return }
    setLoading(true)
    try {
      if (isNativeIAP()) {
        const productId = PLAN_TO_PRODUCT[planId]
        if (!productId) { toast.error('Produto não encontrado'); setLoading(false); return }
        const result = await purchaseProduct(productId)
        if (result.status === 'purchased') {
          await upgradePlan(planId)
          toast.success('Assinatura ativada! ✅')
          loadData()
        }
      } else {
        await upgradePlan(planId)
        toast.success('Plano atualizado!')
        loadData()
      }
    } catch (err) {
      if (err.message === 'cancelled') toast('Compra cancelada')
      else toast.error('Erro ao processar pagamento')
    }
    setLoading(false)
  }

  const handleRestore = async () => {
    setLoading(true)
    try {
      await restorePurchases()
      toast.success('Compras restauradas!')
      loadData()
    } catch {
      toast.error('Nenhuma compra encontrada')
    }
    setLoading(false)
  }

  const usagePercent = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0
  const isIOS = isNativeIAP()
  const planList = billing === 'anual' ? ANUAIS : MENSAIS

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose}>← Voltar</button>
        <h1 className={styles.title}>Planos</h1>
        <p className={styles.subtitle}>Proteja suas memórias na nuvem</p>
      </div>

      {/* Uso atual */}
      {currentPlan.cloud && (
        <div className={styles.usageCard}>
          <p className={styles.usageTitle}>Armazenamento atual — {currentPlan.name}</p>
          <div className={styles.usageBar}>
            <div className={styles.usageFill} style={{ width: `${usagePercent}%` }} />
          </div>
          <p className={styles.usageText}>{formatBytes(usage.used)} de {formatBytes(usage.limit)} usados</p>
        </div>
      )}

      {/* Toggle Mensal / Anual */}
      <div style={{ display: 'flex', background: 'var(--bege-claro)', borderRadius: 99, padding: 4, margin: '0 16px 16px', gap: 4 }}>
        <button
          onClick={() => setBilling('mensal')}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 99, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-sans)',
            background: billing === 'mensal' ? 'var(--verde)' : 'transparent',
            color: billing === 'mensal' ? '#fff' : 'var(--cinza)',
            transition: 'all 0.2s',
          }}
        >
          Mensal
        </button>
        <button
          onClick={() => setBilling('anual')}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 99, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-sans)',
            background: billing === 'anual' ? 'var(--verde)' : 'transparent',
            color: billing === 'anual' ? '#fff' : 'var(--cinza)',
            transition: 'all 0.2s',
          }}
        >
          Anual 🏷️ 15% OFF
        </button>
      </div>

      {/* Lista de planos */}
      <div className={styles.planList}>
        {planList.map(plan => {
          if (!plan) return null
          const isActive = plan.id === currentPlan.id
          return (
            <div
              key={plan.id}
              className={`${styles.planCard} ${isActive ? styles.planCardActive : ''}`}
            >
              <div className={styles.planHeader}>
                <div>
                  <h3 className={styles.planName}>{plan.name}</h3>
                  <div className={styles.planStorage}>{storageLabel(plan.storageGB)} na nuvem</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className={styles.planPrice}>
                    {plan.price === 0 ? 'Grátis' : `R$ ${plan.price.toFixed(2).replace('.', ',')}`}
                  </p>
                  {plan.price > 0 && (
                    <span className={styles.planPeriod}>
                      {billing === 'anual' ? '/ano' : '/mês'}
                    </span>
                  )}
                  {plan.discount && (
                    <span style={{ fontSize: 11, color: '#4F7C52', fontWeight: 700, display: 'block' }}>
                      {plan.discount}
                    </span>
                  )}
                </div>
              </div>

              <ul className={styles.planFeatures}>
                {plan.features.map((f, i) => (
                  <li key={i} className={styles.planFeature}>✓ {f}</li>
                ))}
              </ul>

              {!isActive && plan.id !== 'free' && (
                <button
                  className={styles.planBtn}
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={loading}
                >
                  {loading ? 'Processando...' : 'Assinar'}
                </button>
              )}
              {isActive && <span className={styles.planActive}>✓ Plano atual</span>}
            </div>
          )
        })}
      </div>

      <p className={styles.disclaimer}>
        Os pagamentos são processados com segurança. Cancele a qualquer momento.
      </p>

      {isIOS && (
        <button
          onClick={handleRestore}
          disabled={loading}
          style={{
            background: 'none', border: 'none', color: '#888',
            fontSize: 13, cursor: 'pointer', padding: '8px 0',
            textDecoration: 'underline', display: 'block', margin: '0 auto 24px',
          }}
        >
          Restaurar compras anteriores
        </button>
      )}
    </div>
  )
}