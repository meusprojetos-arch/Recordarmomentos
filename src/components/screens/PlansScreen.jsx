/**
 * PlansScreen — Planos mensais e anuais (compatível Apple Guideline 3.1.2)
 *
 * Regras de Compliance Apple:
 *  - Em iOS, NUNCA ativa plano sem comprovação de compra do StoreKit
 *  - Mostra preço vindo do StoreKit (localizado pela região do usuário)
 *  - Textos obrigatórios: renovação automática, como cancelar
 *  - Links visíveis: Privacy Policy, Terms of Use (EULA), Suporte
 *  - Botão "Restaurar Compras"
 */
import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Capacitor } from '@capacitor/core'
import { PLANS, getUserPlan, getStorageUsage, upgradePlan, formatBytes } from '../../services/planService.js'
import {
  isNativeIAP, purchaseProduct, restorePurchases,
  onPurchaseRestored, PLAN_TO_PRODUCT, PRODUCT_TO_PLAN,
} from '../../services/iapService.js'
import styles from './PlansScreen.module.css'

// URLs legais (Apple exige links visíveis na tela de assinatura)
const PRIVACY_URL = 'https://recordarmomentos.vercel.app/'
const TERMS_URL   = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const SUPPORT_URL = 'https://recordarmomentos.vercel.app/suporte.html'

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
  const [iapProducts, setIapProducts]  = useState({})

  useEffect(() => {
    loadData()
    // Carregar produtos do StoreKit ao abrir a tela
    if (isNativeIAP()) {
      import('../../services/iapService.js').then(({ getProducts }) => {
        getProducts().then(prods => {
          const map = {}
          prods.forEach(p => { map[p.productId] = p })
          setIapProducts(map)
        }).catch(() => {})
      })

      // Escuta compras restauradas (cada transação restored vira upgrade)
      const off = onPurchaseRestored(async ({ productId, transactionId }) => {
        const planId = PRODUCT_TO_PLAN[productId]
        if (!planId) return
        try {
          await upgradePlan(planId, {
            source: 'apple_iap',
            productId,
            transactionId,
            originalTransactionId: transactionId,
            // Sem receipt aqui (vem só na compra original) — restore confia no StoreKit
          })
          loadData()
        } catch (e) { console.warn('restore upgradePlan falhou:', e.message) }
      })
      return () => { off?.() }
    }
  }, [])

  const loadData = async () => {
    const plan = await getUserPlan().catch(() => PLANS.free)
    const storageUsage = await getStorageUsage().catch(() => ({ used: 0, limit: 0 }))
    setCurrentPlan(plan)
    setUsage(storageUsage)
  }

  const handleUpgrade = async (planId) => {
    if (planId === currentPlan.id) return
    if (planId === 'free') { toast.error('Você já está no plano gratuito'); return }

    const platform = Capacitor.getPlatform?.() || 'web'

    // 🍎 iOS: SEMPRE exige compra via StoreKit. Sem bypass.
    if (platform === 'ios') {
      if (!isNativeIAP()) {
        toast.error('Loja indisponível. Atualize o app pela App Store.')
        return
      }
      const productId = PLAN_TO_PRODUCT[planId]
      if (!productId) { toast.error('Produto não encontrado'); return }
      if (!iapProducts[productId]) {
        toast.error('Produto não carregou da App Store. Verifique sua conexão e tente novamente.')
        return
      }

      setLoading(true)
      try {
        const result = await purchaseProduct(productId)
        // Só ativa se o StoreKit confirmou pagamento E retornou receipt
        if (result?.status === 'purchased' && result?.receipt) {
          await upgradePlan(planId, {
            source: 'apple_iap',
            productId,
            transactionId: result.transactionId,
            receipt: result.receipt,
          })
          toast.success('Assinatura ativada!')
          loadData()
        } else {
          toast.error('Compra não confirmada. Tente novamente.')
        }
      } catch (err) {
        if (err?.message === 'cancelled') toast('Compra cancelada')
        else toast.error('Erro ao processar pagamento')
      }
      setLoading(false)
      return
    }

    // 🤖 Android: TODO — implementar Google Play Billing (mesmo padrão do iOS).
    if (platform === 'android') {
      toast.error('Pagamento Android em breve. Use o app iOS por enquanto.')
      return
    }

    // 🌐 Web (browser): assinatura precisa ser feita pelo app nativo na loja oficial.
    // Não ativamos nada client-side aqui pra evitar fraude.
    toast.error('Assine pelo app no seu iPhone ou iPad (App Store).')
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
                    {(() => {
                      if (plan.price === 0) return 'Grátis'
                      // Em iOS, usa o preço localizado vindo do StoreKit (regra Apple)
                      const productId = PLAN_TO_PRODUCT[plan.id]
                      const storeKitPrice = isIOS && productId ? iapProducts[productId]?.priceString : null
                      return storeKitPrice || `R$ ${plan.price.toFixed(2).replace('.', ',')}`
                    })()}
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

      {/* ─── Seção legal exigida pela Apple Guideline 3.1.2(a) ─── */}
      <div style={{
        margin: '8px 16px 16px',
        padding: 16,
        background: 'var(--bege-claro)',
        borderRadius: 12,
        fontSize: 12,
        lineHeight: 1.55,
        color: '#555',
      }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#333' }}>
          Informações da assinatura
        </p>
        <p style={{ margin: '0 0 6px' }}>
          • O pagamento será cobrado na sua conta da Apple ao confirmar a compra.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          • A assinatura é renovada automaticamente pelo mesmo período (mensal ou anual),
          salvo se cancelada com pelo menos 24 horas de antecedência do fim do período atual.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          • A cobrança da renovação ocorre nas 24 horas anteriores ao fim do período vigente.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          • Você pode gerenciar ou cancelar sua assinatura em{' '}
          <strong>Ajustes &gt; seu nome &gt; Assinaturas</strong> no seu iPhone ou iPad.
        </p>
        <p style={{ margin: '12px 0 0', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--verde, #4F7C52)', textDecoration: 'underline', fontWeight: 600 }}
          >
            Política de Privacidade
          </a>
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--verde, #4F7C52)', textDecoration: 'underline', fontWeight: 600 }}
          >
            Termos de Uso (EULA)
          </a>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--verde, #4F7C52)', textDecoration: 'underline', fontWeight: 600 }}
          >
            Suporte
          </a>
        </p>
      </div>

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