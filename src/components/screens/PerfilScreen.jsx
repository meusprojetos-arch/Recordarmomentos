/**
 * PerfilScreen — Tela de Perfil
 * 
 * Contém:
 *  - Header com avatar, nome, estatísticas
 *  - Círculo Familiar
 *  - Privacidade (toggle biometria, perfil privado)
 *  - Pastas
 *  - Exportação / Backup
 */

import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useApp } from '../../App.jsx'
import { getMemories } from '../../services/memoriesService.js'
import { setProfilePrivacy } from '../../services/profileService.js'
import { exportAllAsZip } from '../../services/exportService.js'
import PrivacyRow from '../ui/PrivacyRow.jsx'
import SearchUsersModal from '../modals/SearchUsersModal.jsx'
import PinLockModal from '../modals/PinLockModal.jsx'
import styles from './PerfilScreen.module.css'

// ICONES DO PERFIL
const PERFIL_ICONS = {
  config:    '/icons/config.svg',
  avatarPad: '/icons/avatar-padrao.svg',
  circulo:   '/icons/circulo-familiar.svg',
  privado:   '/icons/privado.svg',
  biometria: '/icons/biometria.svg',
  pastas:    '/icons/pastas.svg',
  exportar:  '/icons/exportar.svg',
  salvar:    '/icons/salvar.svg',
  nuvem:     '/icons/nuvem.svg',
  adicionar: '/icons/adicionar.svg',
}

export default function PerfilScreen() {
  const { user, logout } = useAuth()
  const { setShowPlans, setShowConfig } = useApp()
  const [biometric, setBiometric] = useState(false)
  const [isPrivate, setIsPrivate] = useState(true)
  const [cloudBackup, setCloudBackup] = useState(false)
  const [stats, setStats] = useState({ photos: 0, videos: 0, audios: 0, feed: 0 })
  const [showSearch, setShowSearch] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)

  useEffect(() => {
    getMemories().then(mems => {
      setStats({
        photos: mems.filter(m => m.type === 'photo').length,
        videos: mems.filter(m => m.type === 'video').length,
        audios: mems.filter(m => m.type === 'audio').length,
        feed: mems.filter(m => m.type === 'text').length,
      })
    }).catch(() => {})
    if (user?.privacyLevel) setIsPrivate(user.privacyLevel === 'private')
  }, [user])

  const handleTogglePrivacy = async () => {
    const newLevel = isPrivate ? 'public' : 'private'
    setIsPrivate(!isPrivate)
    try {
      await setProfilePrivacy(newLevel)
      toast.success(newLevel === 'private' ? 'Perfil agora e privado' : 'Perfil agora e publico')
    } catch { toast.error('Erro ao mudar privacidade') }
  }

  const handleExportAll = async () => {
    const tid = toast.loading('Preparando exportacao...')
    try {
      await exportAllAsZip()
      toast.dismiss(tid)
      toast.success('Exportacao pronta! Verifique seus downloads.')
    } catch (err) {
      toast.dismiss(tid)
      toast.error('Erro na exportacao')
    }
  }

  return (
    <div className={styles.screen}>
      {/* ── Header do Perfil ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <button className={styles.settingsBtn} onClick={() => setShowConfig(true)}>
            <img src={PERFIL_ICONS.config} alt="Configurações" width={22} height={22} />
          </button>
        </div>
        <div className={styles.avatar}>
          {(localStorage.getItem('recordar_avatar') || user?.photoURL)
            ? <img src={localStorage.getItem('recordar_avatar') || user.photoURL} alt="Foto de perfil" />
            : <img src={PERFIL_ICONS.avatarPad} alt="Avatar padrao" width={60} height={60} className={styles.avatarDefault} />
          }
        </div>
        <h1 className={styles.name}>{user?.name || user?.displayName || localStorage.getItem('recordar_profileName') || 'Meu Perfil'}</h1>
        {user?.username && <p className={styles.username}>@{user.username}</p>}
        <p className={styles.bio}>{localStorage.getItem('recordar_profileBio') || user?.bio || '"Cada foto guarda um pedaco da nossa historia."'}</p>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statVal}>{stats.photos}</span>
            <span className={styles.statLbl}>fotos</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statVal}>{stats.videos}</span>
            <span className={styles.statLbl}>vídeos</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statVal}>{stats.feed}</span>
            <span className={styles.statLbl}>feed</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statVal}>{stats.audios}</span>
            <span className={styles.statLbl}>áudios</span>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>

        {/* ── Buscar Pessoas ── */}
        <h2 className={styles.sectionTitle}>
          <img src={PERFIL_ICONS.circulo} alt="" aria-hidden="true" width={22} height={22} style={{verticalAlign:'middle', marginRight:6}} />
          Buscar Pessoas
        </h2>
        <button className={styles.circleCard} onClick={() => setShowSearch(true)} style={{ cursor: 'pointer', width: '100%', border: 'none', textAlign: 'left' }}>
          <div className={styles.avatarRow}>
            <div className={`${styles.miniAvatar} ${styles.addAvatar}`}>
              <img src={PERFIL_ICONS.adicionar} alt="Buscar" width={16} height={16} />
            </div>
          </div>
          <p className={styles.circleDesc}>
            Busque pessoas pelo @usuario para ver o perfil
          </p>
        </button>

        {/* ── Privacidade ── */}
        <h2 className={styles.sectionTitle}>
          <img src={PERFIL_ICONS.privado} alt="" aria-hidden="true" width={22} height={22} style={{verticalAlign:'middle', marginRight:6}} />
          Privacidade
        </h2>
        <div className={styles.privacyCard}>
          <PrivacyRow
            iconUrl={PERFIL_ICONS.privado} iconBg="#FFF0EB"
            label="Perfil privado"
            sub={isPrivate ? 'So voce pode ver suas memorias' : 'Outros usuarios podem ver seu perfil'}
            type="toggle"
            value={isPrivate}
            onChange={handleTogglePrivacy}
          />
          <PrivacyRow
            iconUrl={PERFIL_ICONS.biometria} iconBg="#FFF6DB"
            label="PIN de bloqueio"
            sub="Proteger o app com senha"
            type="chevron"
            onClick={() => setShowPinModal(true)}
          />
        </div>

        {/* ── Exportar / Backup ── */}
        <h2 className={styles.sectionTitle}>
          <img src={PERFIL_ICONS.exportar} alt="" aria-hidden="true" width={22} height={22} style={{verticalAlign:'middle', marginRight:6}} />
          Exportar e Backup
        </h2>
        <button className={styles.exportBtn} onClick={handleExportAll}>
          <img src={PERFIL_ICONS.salvar} alt="" aria-hidden="true" className={styles.exportIcon} width={28} height={28} />
          <div className={styles.exportText}>
            <p className={styles.exportLabel}>Exportar tudo (ZIP)</p>
            <p className={styles.exportSub}>Fotos, vídeos e textos organizados</p>
          </div>
          <span className={styles.exportArrow}>›</span>
        </button>
        <div className={styles.exportBtn} onClick={() => {
          setCloudBackup(v => !v)
          toast(!cloudBackup ? 'Backup na nuvem ativado!' : 'Backup desativado')
        }}>
          <img src={PERFIL_ICONS.nuvem} alt="" aria-hidden="true" className={styles.exportIcon} width={28} height={28} />
          <div className={styles.exportText}>
            <p className={styles.exportLabel}>Backup na nuvem</p>
            <p className={styles.exportSub}>Automático pelo Wi-Fi</p>
          </div>
          <div className={`${styles.toggle} ${cloudBackup ? '' : styles.toggleOff}`} />
        </div>

        <div style={{ height: 16 }} />

        {/* ── Planos ── */}
        <button className={styles.exportBtn} onClick={() => setShowPlans(true)}>
          <span style={{ fontSize: 24 }}>💎</span>
          <div className={styles.exportText}>
            <p className={styles.exportLabel}>Planos e Armazenamento</p>
            <p className={styles.exportSub}>Proteja suas memorias na nuvem</p>
          </div>
          <span className={styles.exportArrow}>›</span>
        </button>

        <div style={{ height: 8 }} />

        {/* ── Sair ── */}
        <button className={styles.logoutBtn} onClick={() => { logout(); toast.success('Voce saiu da conta') }}>
          Sair da conta
        </button>

        <div style={{ height: 32 }} />
      </div>

      {/* Modal de busca de pessoas */}
      {showSearch && (
        <SearchUsersModal onClose={() => setShowSearch(false)} />
      )}
      {/* Modal de PIN */}
      {showPinModal && (
        <PinLockModal onClose={() => setShowPinModal(false)} />
      )}
    </div>
  )
}
