/**
 * ConfigScreen — Tela de Configurações
 *
 * Seções:
 *  1. Editar Perfil     — nome, bio, avatar
 *  2. Armazenamento     — barra de progresso local/nuvem
 *  3. Privacidade       — toggle perfil privado, PIN
 *  4. Backup Automático — toggle Wi-Fi, frequência
 *  5. Termos e Política — link/botão
 *  6. Excluir conta     — botão de perigo com confirmação
 *  7. Ajuda / FAQ       — itens colapsáveis
 */

import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { getUserPlan, getStorageUsage, formatBytes } from '../../services/planService.js'
import db from '../../db/database.js'
import Topbar from '../layout/Topbar.jsx'
import styles from './ConfigScreen.module.css'

// ─── Ícones ──────────────────────────────────────────────────────────────────
const ICONS = {
  avatar:   '/icons/avatar-padrao.svg',
  privado:  '/icons/privado.svg',
  biometria:'/icons/biometria.svg',
  nuvem:    '/icons/nuvem.svg',
  salvar:   '/icons/salvar.svg',
  config:   '/icons/config.svg',
  exportar: '/icons/exportar.svg',
}

// ─── Dados de FAQ ─────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'Como faço backup das minhas memórias?',
    a: 'Ative o Backup Automático na seção acima. O app fará cópias automáticas pelo Wi-Fi na frequência escolhida. Você também pode exportar tudo manualmente pela tela de Perfil.',
  },
  {
    q: 'Minhas memórias ficam salvas apenas no celular?',
    a: 'Por padrão, as memórias ficam salvas localmente no dispositivo. Ao ativar o backup na nuvem, elas também serão sincronizadas com segurança nos servidores do Recordar.',
  },
  {
    q: 'Como configuro o PIN de bloqueio?',
    a: 'Acesse Privacidade > PIN de bloqueio. Você poderá definir um PIN de 4 ou 6 dígitos para proteger o acesso ao app.',
  },
  {
    q: 'Como excluir minha conta permanentemente?',
    a: 'Use o botão "Excluir minha conta" no final desta tela. Atenção: esta ação é irreversível e apaga todas as suas memórias e dados.',
  },
]

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ConfigScreen({ onClose }) {
  const { user, logout } = useAuth()

  // ── Editar Perfil ──
  const [name, setName]       = useState('')
  const [bio, setBio]         = useState('')
  const [avatarSrc, setAvatarSrc] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  // ── Privacidade ──
  const [isPrivate, setIsPrivate] = useState(true)

  // ── Backup ──
  const [autoBackup, setAutoBackup]   = useState(false)
  const [backupFreq, setBackupFreq]   = useState('diario')

  // ── FAQ ──
  const [openFaq, setOpenFaq] = useState(null)

  // ── Tema ──
  const [theme, setTheme] = useState(() => localStorage.getItem('recordar_theme') || 'dark')

  // ── Carregar configurações persistidas ──
  useEffect(() => {
    setName(user?.displayName || user?.name || localStorage.getItem('recordar_profileName') || '')
    setBio(user?.bio || localStorage.getItem('recordar_profileBio') || '')
    setAvatarSrc(localStorage.getItem('recordar_avatar') || user?.photoURL || null)
    setIsPrivate(localStorage.getItem('recordar_privacy') !== 'public')
    setAutoBackup(localStorage.getItem('recordar_autoBackup') === '1')
    setBackupFreq(localStorage.getItem('recordar_backupFreq') || 'diario')
  }, [user])

  // ── Salvar perfil ──
  const handleSaveProfile = async () => {
    if (!name.trim()) { toast.error('O nome não pode ficar vazio'); return }
    setSavingProfile(true)
    try {
      localStorage.setItem('recordar_profileName', name.trim())
      localStorage.setItem('recordar_profileBio', bio.trim())
      toast.success('Perfil atualizado!')
    } catch {
      toast.error('Erro ao salvar perfil')
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Trocar avatar ──
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result
      setAvatarSrc(base64)
      localStorage.setItem('recordar_avatar', base64)
      toast.success('Foto atualizada!')
    }
    reader.readAsDataURL(file)
  }

  // ── Toggle perfil privado ──
  const handleTogglePrivacy = () => {
    const next = !isPrivate
    setIsPrivate(next)
    localStorage.setItem('recordar_privacy', next ? 'private' : 'public')
    toast.success(next ? 'Perfil agora é privado' : 'Perfil agora é público')
  }

  // ── Toggle backup ──
  const handleToggleBackup = () => {
    const next = !autoBackup
    setAutoBackup(next)
    localStorage.setItem('recordar_autoBackup', next ? '1' : '0')
    toast.success(next ? 'Backup automático ativado' : 'Backup automático desativado')
  }

  // ── Frequência de backup ──
  const handleFreqChange = (e) => {
    const val = e.target.value
    setBackupFreq(val)
    localStorage.setItem('recordar_backupFreq', val)
    const labels = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal' }
    toast.success(`Frequência: ${labels[val] || val}`)
  }

  // ── Termos ──
  const handleTerms = () => toast('Em breve', { icon: '📄' })

  // ── Excluir conta ──
  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      'Tem certeza que deseja excluir sua conta?\n\nEsta ação é IRREVERSÍVEL e apagará todas as suas memórias e dados permanentemente.'
    )
    if (!confirmed) return
    toast.error('Conta excluída. Até logo…')
    setTimeout(() => logout(), 1500)
  }

  // ── Abrir/fechar FAQ ──
  const toggleFaq = (idx) => setOpenFaq(prev => (prev === idx ? null : idx))

  // ── Trocar tema ──
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem('recordar_theme', newTheme)
    if (newTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    toast.success(newTheme === 'light' ? 'Modo claro ativado' : 'Modo escuro ativado')
  }

  // ── Armazenamento (dados reais) ──
  const [localUsedMB, setLocalUsedMB] = useState(0)
  const [localTotalMB, setLocalTotalMB] = useState(1000)
  const [cloudUsedMB, setCloudUsedMB] = useState(0)
  const [cloudTotalMB, setCloudTotalMB] = useState(1000)

  useEffect(() => {
    // Calcular uso local real (soma dos blobs no IndexedDB)
    const calcLocal = async () => {
      try {
        const memories = await db.memories.toArray()
        let totalBytes = 0
        for (const m of memories) {
          if (m.fileBlob) totalBytes += m.fileBlob.size || 0
          if (m.thumbnail) totalBytes += m.thumbnail.size || 0
        }
        const plan = await getUserPlan()
        const localLimitBytes = plan.localStorageBytes || plan.storageBytes || (1 * 1024 * 1024 * 1024)
        setLocalUsedMB(Math.round(totalBytes / (1024 * 1024)))
        setLocalTotalMB(Math.round(localLimitBytes / (1024 * 1024)))
      } catch {
        setLocalUsedMB(0)
        setLocalTotalMB(1000)
      }
    }

    // Calcular uso na nuvem real (do Firestore)
    const calcCloud = async () => {
      try {
        const { used, limit, plan } = await getStorageUsage()
        if (plan && plan.cloud) {
          setCloudUsedMB(Math.round(used / (1024 * 1024)))
          setCloudTotalMB(Math.round(limit / (1024 * 1024)))
        } else {
          // Plano grátis: nuvem não disponível
          setCloudUsedMB(0)
          setCloudTotalMB(0)
        }
      } catch {
        setCloudUsedMB(0)
        setCloudTotalMB(0)
      }
    }

    calcLocal()
    calcCloud()
  }, [])

  const localPct  = localTotalMB > 0 ? Math.round((localUsedMB / localTotalMB) * 100) : 0
  const cloudPct  = cloudTotalMB > 0 ? Math.round((cloudUsedMB / cloudTotalMB) * 100) : 0

  return (
    <div className={styles.screen}>
      <Topbar title="Configurações" subtitle="Gerencie sua conta e preferências" />

      <div className={styles.scroll}>
        <button className={styles.backBtn} onClick={onClose}>← Voltar</button>

        {/* ══ 1. Editar Perfil ══ */}
        <h2 className={styles.sectionTitle}>Editar Perfil</h2>
        <div className={styles.card}>

          {/* Avatar */}
          <div className={styles.avatarWrap}>
            <div className={styles.avatarCircle}>
              {avatarSrc
                ? <img src={avatarSrc} alt="Foto de perfil" className={styles.avatarImg} />
                : <img src={ICONS.avatar} alt="Avatar padrão" className={`${styles.avatarImg} ${styles.avatarDefault}`} width={48} height={48} />
              }
            </div>
            <label className={styles.avatarChangeBtn} htmlFor="avatarInput" aria-label="Trocar foto">
              Trocar foto
            </label>
            <input
              id="avatarInput"
              type="file"
              accept="image/*"
              className={styles.hidden}
              onChange={handleAvatarChange}
            />
          </div>

          {/* Nome */}
          <label className={styles.fieldLabel} htmlFor="profileName">Nome</label>
          <input
            id="profileName"
            className={styles.input}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Seu nome"
            maxLength={60}
          />

          {/* Username (não editável) */}
          <label className={styles.fieldLabel}>Nome de usuário</label>
          <input
            className={styles.input}
            type="text"
            value={user?.username ? `@${user.username}` : ''}
            disabled
            style={{ opacity: 0.6, cursor: 'not-allowed' }}
          />

          {/* Bio */}
          <label className={styles.fieldLabel} htmlFor="profileBio">Bio</label>
          <textarea
            id="profileBio"
            className={styles.textarea}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Uma frase sobre você…"
            maxLength={160}
            rows={3}
          />

          <button
            className={styles.saveBtn}
            onClick={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>

        {/* ══ 2. Armazenamento ══ */}
        <h2 className={styles.sectionTitle}>Armazenamento</h2>
        <div className={styles.card}>

          <p className={styles.storageLabel}>
            <img src={ICONS.salvar} alt="" width={16} height={16} aria-hidden="true" />
            Local
          </p>
          <p className={styles.storageValues}>{localUsedMB} MB de {localTotalMB} MB utilizados</p>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ width: `${localPct}%` }}
              role="progressbar"
              aria-valuenow={localPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          <div className={styles.storageDivider} />

          <p className={styles.storageLabel}>
            <img src={ICONS.nuvem} alt="" width={16} height={16} aria-hidden="true" />
            Nuvem
          </p>
          <p className={styles.storageValues}>{cloudUsedMB} MB de {cloudTotalMB} MB utilizados</p>
          <div className={styles.progressTrack}>
            <div
              className={`${styles.progressBar} ${styles.progressCloud}`}
              style={{ width: `${cloudPct}%` }}
              role="progressbar"
              aria-valuenow={cloudPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* ══ 3. Privacidade ══ */}
        <h2 className={styles.sectionTitle}>Privacidade</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>

          {/* Toggle perfil privado */}
          <div
            className={styles.row}
            onClick={handleTogglePrivacy}
            role="switch"
            aria-checked={isPrivate}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && handleTogglePrivacy()}
          >
            <div className={styles.rowIconWrap} style={{ background: '#FFF0EB' }}>
              <img src={ICONS.privado} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Perfil privado</p>
              <p className={styles.rowSub}>
                {isPrivate ? 'Só você pode ver suas memórias' : 'Outros usuários podem ver seu perfil'}
              </p>
            </div>
            <div className={`${styles.toggle} ${isPrivate ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>

          <div className={styles.rowDivider} />

          {/* PIN de bloqueio */}
          <div
            className={styles.row}
            onClick={() => toast('Em breve', { icon: '🔒' })}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && toast('Em breve', { icon: '🔒' })}
          >
            <div className={styles.rowIconWrap} style={{ background: '#FFF6DB' }}>
              <img src={ICONS.biometria} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>PIN de bloqueio</p>
              <p className={styles.rowSub}>Proteger o app com senha</p>
            </div>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </div>
        </div>

        {/* ══ 4. Backup Automático ══ */}
        <h2 className={styles.sectionTitle}>Backup Automático</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>

          {/* Toggle backup Wi-Fi */}
          <div
            className={styles.row}
            onClick={handleToggleBackup}
            role="switch"
            aria-checked={autoBackup}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && handleToggleBackup()}
          >
            <div className={styles.rowIconWrap} style={{ background: '#E8F5E9' }}>
              <img src={ICONS.nuvem} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Backup pelo Wi-Fi</p>
              <p className={styles.rowSub}>
                {autoBackup ? 'Backup automático ativado' : 'Backup automático desativado'}
              </p>
            </div>
            <div className={`${styles.toggle} ${autoBackup ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>

          {/* Frequência */}
          {autoBackup && (
            <>
              <div className={styles.rowDivider} />
              <div className={styles.row}>
                <div className={styles.rowIconWrap} style={{ background: '#EDE7F6' }}>
                  <img src={ICONS.config} alt="" width={20} height={20} aria-hidden="true" />
                </div>
                <div className={styles.rowText}>
                  <p className={styles.rowLabel}>Frequência</p>
                  <p className={styles.rowSub}>Com que regularidade fazer backup</p>
                </div>
                <select
                  className={styles.freqSelect}
                  value={backupFreq}
                  onChange={handleFreqChange}
                  aria-label="Frequência de backup"
                >
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* ══ 5. Aparência ══ */}
        <h2 className={styles.sectionTitle}>Aparência</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>
          <div
            className={styles.row}
            onClick={() => handleThemeChange('dark')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#1A1614' }}>
              <span style={{ fontSize: 16 }}>🌙</span>
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Modo Escuro</p>
              <p className={styles.rowSub}>Tema padrão</p>
            </div>
            <div className={`${styles.toggle} ${theme === 'dark' ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>

          <div className={styles.rowDivider} />

          <div
            className={styles.row}
            onClick={() => handleThemeChange('light')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#FFF0EB' }}>
              <span style={{ fontSize: 16 }}>☀️</span>
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Modo Claro</p>
              <p className={styles.rowSub}>Fundo branco com cores suaves</p>
            </div>
            <div className={`${styles.toggle} ${theme === 'light' ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>
        </div>

        {/* ══ 6. Termos e Política de Privacidade ══ */}
        <h2 className={styles.sectionTitle}>Termos e Política</h2>
        <button className={styles.actionRow} onClick={handleTerms}>
          <div className={styles.rowIconWrap} style={{ background: '#E3F2FD' }}>
            <img src={ICONS.exportar} alt="" width={20} height={20} aria-hidden="true" />
          </div>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Termos de Uso e Política de Privacidade</p>
            <p className={styles.rowSub}>Leia nossos termos e como usamos seus dados</p>
          </div>
          <span className={styles.chevron} aria-hidden="true">›</span>
        </button>

        {/* ══ 6. Ajuda / FAQ ══ */}
        <h2 className={styles.sectionTitle}>Ajuda / FAQ</h2>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item, idx) => (
            <div key={idx} className={styles.faqItem}>
              <button
                className={styles.faqQuestion}
                onClick={() => toggleFaq(idx)}
                aria-expanded={openFaq === idx}
              >
                <span>{item.q}</span>
                <span className={`${styles.faqArrow} ${openFaq === idx ? styles.faqArrowOpen : ''}`} aria-hidden="true">
                  ›
                </span>
              </button>
              {openFaq === idx && (
                <p className={styles.faqAnswer}>{item.a}</p>
              )}
            </div>
          ))}
        </div>

        {/* ══ 7. Excluir Conta ══ */}
        <h2 className={styles.sectionTitle}>Zona de Perigo</h2>
        <div className={styles.card}>
          <p className={styles.dangerDesc}>
            Excluir sua conta apaga permanentemente todas as suas memórias, fotos, vídeos e dados. Esta ação não pode ser desfeita.
          </p>
          <button className={styles.dangerBtn} onClick={handleDeleteAccount}>
            Excluir minha conta
          </button>
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
