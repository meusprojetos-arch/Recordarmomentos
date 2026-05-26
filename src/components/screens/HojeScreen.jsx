/**
 * HojeScreen — Tela "Hoje"
 *
 * Exibe:
 *  - Card de Armazenamento
 *  - Carrossel horizontal de Memórias Recentes (10 últimas)
 *  - Atalhos rápidos para adicionar memória
 *  - Botão importar da galeria
 */

import React, { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { getRecentMemories } from '../../services/memoriesService.js'
import { openGalleryImport } from '../../services/importService.js'
import { getUserPlan, getStorageUsage } from '../../services/planService.js'
import { db } from '../../db/database.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useApp } from '../../App.jsx'
import Topbar from '../layout/Topbar.jsx'
import QuickAction from '../ui/QuickAction.jsx'
import LazyImage from '../ui/LazyImage.jsx'
import SearchUsersModal from '../modals/SearchUsersModal.jsx'
import styles from './HojeScreen.module.css'

// ÍCONES
const ICONS = {
  notificacao: '/icons/notificacao.svg',
  fotovideo:   '/icons/fotovideo.svg',
  escrever:    '/icons/escrever.svg',
  audio:       '/icons/audio.svg',
}

// ── Card de Armazenamento ──────────────────────────────────────────────────
function StorageCard({ onUpgrade }) {
  const [localUsedMB, setLocalUsedMB] = useState(0)
  const [localTotalMB, setLocalTotalMB] = useState(1000)
  const [isPremiumUser, setIsPremiumUser] = useState(false)

  useEffect(() => {
    // Cálculo real: lê os blobs diretamente do IndexedDB (igual ao ConfigScreen)
    const calcLocal = async () => {
      try {
        let totalBytes = 0
        const blobs = await db.fileBlobs.toArray()
        for (const b of blobs) {
          if (b.blob) totalBytes += b.blob.size || 0
        }
        const memories = await db.memories.toArray()
        for (const m of memories) {
          if (m.fileBlob) totalBytes += m.fileBlob.size || 0
          if (m.thumbnail) totalBytes += m.thumbnail.size || 0
        }
        const plan = await getUserPlan()
        const limitBytes = plan.localStorageBytes || plan.storageBytes || (1 * 1024 * 1024 * 1024)
        setLocalUsedMB(Math.round(totalBytes / (1024 * 1024)))
        setLocalTotalMB(Math.round(limitBytes / (1024 * 1024)))
      } catch {
        setLocalUsedMB(0)
        setLocalTotalMB(1000)
      }
    }

    const calcCloud = async () => {
      try {
        const { plan } = await getStorageUsage()
        if (plan && plan.cloud) setIsPremiumUser(true)
      } catch {}
    }

    calcLocal()
    calcCloud()
  }, [])

  const pct = localTotalMB > 0 ? Math.min(100, Math.round((localUsedMB / localTotalMB) * 100)) : 0

  const formatMB = (mb) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb} MB`
  }

  return (
    <div className={styles.storageCard}>
      <div className={styles.storageTop}>
        <div className={styles.storageIconWrap}>
          {/* Anel de progresso SVG */}
          <svg width="68" height="68" viewBox="0 0 68 68" className={styles.storageRing}>
            <circle cx="34" cy="34" r="28" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="6"/>
            <circle
              cx="34" cy="34" r="28"
              fill="none"
              stroke="#8BC34A"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct / 100)}`}
              transform="rotate(-90 34 34)"
            />
          </svg>
          <div className={styles.storageCloudIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" width="26" height="26">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              <polyline points="8 17 12 13 16 17" stroke="white" strokeWidth="1.8"/>
              <line x1="12" y1="13" x2="12" y2="21" stroke="white" strokeWidth="1.8"/>
            </svg>
          </div>
        </div>

        <div className={styles.storageInfo}>
          <p className={styles.storageLabel}>Armazenamento</p>
          <p className={styles.storageUsed}>{formatMB(localUsedMB)} usados</p>
          <p className={styles.storageLimit}>
            de {formatMB(localTotalMB)} {isPremiumUser ? 'na nuvem' : 'gratuitos'}
          </p>
        </div>

        {/* Folha decorativa */}
        <div className={styles.storageLeaf} aria-hidden="true">🌿</div>
      </div>

      <div className={styles.storageBarWrap}>
        <div className={styles.storageBarBg}>
          <div className={styles.storageBarFill} style={{ width: `${pct}%` }} />
        </div>
        <span className={styles.storagePct}>{pct}%</span>
      </div>

      <div className={styles.storageSafe}>
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" width="14" height="14">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Seus momentos estão seguros</span>
      </div>
    </div>
  )
}

// ── Item individual do carrossel ──────────────────────────────────────────
function CarouselItem({ memory }) {
  const isMedia = memory.type === 'photo' || memory.type === 'video'

  // Mesmo resolver usado pelo MemoryCard — cobre nuvem, objectURL e blob local
  const resolveSrc = async () => {
    if (memory.fileUrl) return memory.fileUrl
    if (memory._objectUrl) return memory._objectUrl
    if (memory.thumbnail instanceof Blob) return URL.createObjectURL(memory.thumbnail)
    if (memory.fileBlob instanceof Blob) return URL.createObjectURL(memory.fileBlob)
    return null
  }

  const typeIcon = { audio: '🎙️', text: '✏️', video: '🎬', photo: '📷' }[memory.type] ?? '📷'

  // Formata data do card
  let line1 = '', line2 = ''
  try {
    const d = memory.date ? new Date(memory.date + 'T00:00') : new Date(memory.createdAt)
    const today = new Date()
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) {
      line1 = 'Hoje'; line2 = memory.time || ''
    } else if (d.toDateString() === yesterday.toDateString()) {
      line1 = 'Ontem'; line2 = memory.time || ''
    } else {
      line1 = format(d, 'dd/MM', { locale: ptBR })
      line2 = memory.time || format(d, 'HH:mm', { locale: ptBR })
    }
  } catch { line1 = '' }

  return (
    <div className={styles.carouselItem}>
      <div className={styles.carouselThumb}>
        {isMedia ? (
          <LazyImage
            src={resolveSrc}
            cacheKey={memory.id}
            alt={memory.title || 'Memória'}
            placeholder={
              <div className={styles.carouselPlaceholder}>{typeIcon}</div>
            }
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
          />
        ) : (
          <div className={styles.carouselPlaceholder}>{typeIcon}</div>
        )}
      </div>
      <p className={styles.carouselDate}>{line1}</p>
      {line2 && <p className={styles.carouselTime}>{line2}</p>}
    </div>
  )
}

// ── Carrossel de Memórias ─────────────────────────────────────────────────
function MemoryCarousel({ memories, onViewAll }) {
  if (memories.length === 0) return null

  return (
    <div className={styles.carouselSection}>
      <div className={styles.carouselHeader}>
        <h3 className={styles.sectionTitle}>Memórias Recentes</h3>
        <button className={styles.verTodasBtn} onClick={onViewAll}>Ver todas</button>
      </div>
      <div className={styles.carousel}>
        {memories.map((m) => (
          <CarouselItem key={m.id} memory={m} />
        ))}
      </div>
    </div>
  )
}

// ── Tela Principal ─────────────────────────────────────────────────────────
export default function HojeScreen() {
  const { setShowAddModal, setShowPlans, setActiveTab } = useApp()
  const { user } = useAuth()
  const [showSearch, setShowSearch] = useState(false)
  const [recentMemories, setRecentMemories] = useState([])

  // Carrega memórias recentes
  useEffect(() => {
    getRecentMemories(10).then(setRecentMemories).catch(() => {})
    const handler = () => getRecentMemories(10).then(setRecentMemories).catch(() => {})
    window.addEventListener('memory-added', handler)
    return () => window.removeEventListener('memory-added', handler)
  }, [])

  const quickActions = [
    { iconUrl: ICONS.fotovideo,              label: 'Foto',  sub: 'Da câmera ou galeria', color: 'green', type: 'photo' },
    { iconUrl: '/icons/filtro-video.svg',    label: 'Vídeo', sub: 'Da câmera ou galeria', color: 'green', type: 'video' },
    { iconUrl: ICONS.audio,                  label: 'Áudio', sub: 'Gravar voz',            color: 'blue',  type: 'audio' },
    { iconUrl: ICONS.escrever,               label: 'Frase', sub: 'Reflexão ou história',  color: 'gold',  type: 'text'  },
  ]

  return (
    <div className={styles.screen}>
      <Topbar
        title="Recordar"
        leftIconUrl="/icons/logo-recordar.png"
        leftIconSize={40}
        subtitle="Seus melhores momentos"
        rightIconUrl={ICONS.notificacao}
        rightIconSize={24}
        onRight={() => toast('Nenhuma notificação nova')}
      />

      <div className={styles.scroll}>

        {/* ── Card de Armazenamento ── */}
        <StorageCard onUpgrade={() => setShowPlans(true)} />

        {/* ── Carrossel de Memórias Recentes ── */}
        <MemoryCarousel
          memories={recentMemories}
          onViewAll={() => setActiveTab && setActiveTab('tempo')}
        />

        {/* ── Ações rápidas ── */}
        <h3 className={styles.sectionTitle}>
          Adicionar Memória <span className={styles.sectionSub}>para hoje</span>
        </h3>
        <div className={styles.quickGrid}>
          {quickActions.map(a => (
            <QuickAction
              key={a.type}
              iconUrl={a.iconUrl}
              label={a.label}
              sub={a.sub}
              color={a.color}
              onClick={() => setShowAddModal(a.type)}
            />
          ))}
        </div>

        {/* ── Importar da galeria ── */}
        <button
          className={styles.importBtn}
          onClick={() => {
            const tid = toast.loading('Importando...')
            openGalleryImport(
              () => {},
              (done, total) => { toast.dismiss(tid); toast.success(`${done} de ${total} importados!`) }
            )
          }}
        >
          🖼️ Importar fotos da galeria
        </button>

      </div>

      {showSearch && (
        <SearchUsersModal onClose={() => setShowSearch(false)} />
      )}
    </div>
  )
}