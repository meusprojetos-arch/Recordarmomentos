/**
 * HojeScreen — Tela "Hoje"
 * 
 * Exibe:
 *  - Saudação personalizada com data
 *  - Banner de lembrete anual (se houver)
 *  - Atalhos rápidos para adicionar memória
 *  - Feed de memórias recentes
 */

import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { getRecentMemories } from '../../services/memoriesService.js'
import { openGalleryImport } from '../../services/importService.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useApp } from '../../App.jsx'
import Topbar from '../layout/Topbar.jsx'
import MemoryCard from '../ui/MemoryCard.jsx'
import QuickAction from '../ui/QuickAction.jsx'
import BackupBanner from '../ui/BackupBanner.jsx'
import SearchUsersModal from '../modals/SearchUsersModal.jsx'
import styles from './HojeScreen.module.css'

// ÍCONES — substitua cada URL pela sua imagem personalizada
// Tamanho: 32x32px para ações rápidas, 24x24px para topbar
const ICONS = {
  notificacao:  '/icons/notificacao.svg',   // 24x24 — sino / notificação
  lembrete:     '/icons/lembrete.svg',      // 40x40 — relógio / lembrete
  fotovideo:    '/icons/fotovideo.svg',     // 32x32 — câmera
  escrever:     '/icons/escrever.svg',      // 32x32 — lápis / caneta
  audio:        '/icons/audio.svg',         // 32x32 — microfone
  local:        '/icons/local.svg',         // 32x32 — pin de localização
}

// Frases inspiradoras em português
const FRASES = [
  '"A memória é o diário que todos carregamos conosco." — Oscar Wilde',
  '"Lembrar é viver duas vezes."',
  '"Os melhores momentos merecem ser guardados para sempre."',
  '"Cada foto conta uma história que vale a pena reviver."',
  '"A vida é feita de momentos — guarde os seus favoritos."',
]

export default function HojeScreen() {
  const { setShowAddModal, setShowPlans } = useApp()
  const { user } = useAuth()
  const [userName, setUserName] = useState('voce')
  const [frase] = useState(() => FRASES[Math.floor(Math.random() * FRASES.length)])
  const [showSearch, setShowSearch] = useState(false)
  const [showPermissionBanner, setShowPermissionBanner] = useState(false)
  const [reminder, setReminder] = useState(null)
  const [recentMemories, setRecentMemories] = useState([])

  const today = new Date()
  const todayFormatted = format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })

  // Solicitar permissões na primeira vez
  useEffect(() => {
    const asked = localStorage.getItem('recordar_permissions_asked')
    if (!asked) {
      setShowPermissionBanner(true)
    }
  }, [])

  const handleAllowPermissions = async () => {
    localStorage.setItem('recordar_permissions_asked', '1')
    setShowPermissionBanner(false)
    try {
      // Solicitar acesso à câmera (isso dispara o prompt do navegador/SO)
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.getTracks().forEach(t => t.stop())
      toast.success('Permissões concedidas!')
    } catch {
      toast('Você pode permitir depois nas configurações do navegador')
    }
  }

  const handleDismissPermissions = () => {
    localStorage.setItem('recordar_permissions_asked', '1')
    setShowPermissionBanner(false)
  }

  // Carrega nome do usuario
  useEffect(() => {
    if (user?.displayName) {
      setUserName(user.displayName.split(' ')[0])
    } else if (user?.name) {
      setUserName(user.name.split(' ')[0])
    }
  }, [user])

  // Carrega memorias recentes
  useEffect(() => {
    getRecentMemories(10).then(setRecentMemories).catch(() => {})
  }, [])

  // Verifica lembretes de aniversario de memorias
  useEffect(() => {
    const checkReminders = async () => {
      const todayStr = format(today, 'MM-dd')
      const all = recentMemories || []
      const match = all.find(m => {
        if (!m.date) return false
        const memDate = m.date.substring(5, 10)
        const memYear = m.date.substring(0, 4)
        const diff = today.getFullYear() - Number(memYear)
        return memDate === todayStr && diff > 0
      })
      if (match) {
        const year = today.getFullYear() - Number(match.date.substring(0,4))
        setReminder({ memory: match, years: year })
      }
    }
    checkReminders()
  }, [recentMemories])

  const getGreeting = () => {
    const h = today.getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const quickActions = [
    { iconUrl: ICONS.fotovideo, label: 'Foto',    sub: 'Da câmera ou galeria',   color: 'green', type: 'photo' },
    { iconUrl: '/icons/filtro-video.svg', label: 'Vídeo',   sub: 'Da câmera ou galeria',   color: 'green', type: 'video' },
    { iconUrl: ICONS.audio,     label: 'Áudio',   sub: 'Gravar voz',             color: 'blue',  type: 'audio' },
    { iconUrl: ICONS.escrever,  label: 'Frase',   sub: 'Reflexão ou história',   color: 'gold',  type: 'text'  },
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

        {/* ── Banner de permissão ── */}
        {showPermissionBanner && (
          <div className={styles.permissionBanner}>
            <div className={styles.permissionContent}>
              <span className={styles.permissionIcon}>📸</span>
              <div>
                <p className={styles.permissionTitle}>Permitir acesso às fotos e câmera</p>
                <p className={styles.permissionSub}>Para salvar e importar suas memórias automaticamente</p>
              </div>
            </div>
            <div className={styles.permissionActions}>
              <button className={styles.permissionAllow} onClick={handleAllowPermissions}>Permitir</button>
              <button className={styles.permissionDismiss} onClick={handleDismissPermissions}>Agora não</button>
            </div>
          </div>
        )}
        {/* ── Cartão de saudação ── */}
        <div className={styles.greetingCard}>
          <p className={styles.greetingDate}>{todayFormatted.toUpperCase()}</p>
          <h2 className={styles.greetingText}>{getGreeting()}, {userName}!</h2>
          <p className={styles.greetingPhrase}>{frase}</p>
        </div>

        {/* ── Buscar Pessoas ── */}
        <button className={styles.searchPeopleBtn} onClick={() => setShowSearch(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Buscar Pessoas
        </button>

        {/* ── Aviso de backup ── */}
        <BackupBanner onUpgrade={() => setShowPlans(true)} />

        {/* ── Banner de lembrete anual ── */}
        {reminder && (
          <div className={styles.reminderBanner}>
            <img src={ICONS.lembrete} alt="" aria-hidden="true" className={styles.reminderIcon} width={40} height={40} />
            <div className={styles.reminderText}>
              <p className={styles.reminderTitle}>Memória do Passado</p>
              <p className={styles.reminderSub}>
                Hoje faz {reminder.years} {reminder.years === 1 ? 'ano' : 'anos'} de:{' '}
                <strong>{reminder.memory.title || 'uma memória especial'}</strong>
              </p>
            </div>
            <span className={styles.reminderArrow}>›</span>
          </div>
        )}

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
              (done, total) => {},
              (done, total) => { toast.dismiss(tid); toast.success(`${done} de ${total} importados!`) }
            )
          }}
        >
          🖼️ Importar fotos da galeria
        </button>

        {/* ── Feed recente ── */}
        <h3 className={styles.sectionTitle}>Memórias Recentes</h3>

        {recentMemories?.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📸</span>
            <p className={styles.emptyTitle}>Sua primeira memória te espera!</p>
            <p className={styles.emptySub}>Toque no botão + para começar</p>
          </div>
        )}

        <div className={styles.feed}>
          {recentMemories?.map(m => (
            <MemoryCard key={m.id} memory={m} />
          ))}
        </div>
      </div>

      {showSearch && (
        <SearchUsersModal onClose={() => setShowSearch(false)} />
      )}
    </div>
  )
}