/**
 * PerfilScreen — Tela de Perfil
 */

import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useApp } from '../../App.jsx'
import { getMemories } from '../../services/memoriesService.js'
import { setProfilePrivacy } from '../../services/profileService.js'
import { auth, firestore } from '../../firebase.js'
import { doc, updateDoc } from 'firebase/firestore'
import PrivacyRow from '../ui/PrivacyRow.jsx'
import PinLockModal from '../modals/PinLockModal.jsx'
import styles from './PerfilScreen.module.css'

const PERFIL_ICONS = {
  config:    '/icons/config.svg',
  avatarPad: '/icons/avatar-padrao.svg',
  privado:   '/icons/privado.svg',
  nuvem:     '/icons/nuvem.svg',
}

export default function PerfilScreen() {
  const { user, logout } = useAuth()
  const { setShowPlans, setShowConfig } = useApp()
  const [isPrivate, setIsPrivate] = useState(true)
  const [cloudBackup, setCloudBackup] = useState(false)
  const [stats, setStats] = useState({ photos: 0, videos: 0, audios: 0, feed: 0 })

  // Editar perfil
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [avatarSrc, setAvatarSrc] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)

  useEffect(() => {
    getMemories().then(async mems => {
      // Excluir fotos trancadas (pasta Trancadas + privacyLevel private)
      let lockedFolderId = null
      try {
        const { db } = await import('../../db/database.js')
        const uid = user?.uid || ''
        const lockedFolder = uid
          ? await db.folders.where('uid').equals(uid).and(f => f.name === 'Trancadas').first()
          : await db.folders.filter(f => f.name === 'Trancadas').first()
        if (lockedFolder) lockedFolderId = lockedFolder.id
      } catch { /* sem pasta trancadas */ }

      const visible = mems.filter(m =>
        !(lockedFolderId && m.folderId === lockedFolderId && m.privacyLevel === 'private')
      )
      setStats({
        photos: visible.filter(m => m.type === 'photo').length,
        videos: visible.filter(m => m.type === 'video').length,
        audios: visible.filter(m => m.type === 'audio').length,
        feed: visible.filter(m => m.type === 'text').length,
      })
    }).catch(() => {})
    if (user?.privacyLevel) setIsPrivate(user.privacyLevel === 'private')
    const uid = user?.uid || ''
    setEditName(user?.name || user?.displayName || localStorage.getItem(`recordar_profileName_${uid}`) || '')
    setEditBio(user?.bio || localStorage.getItem(`recordar_profileBio_${uid}`) || '')
    setAvatarSrc(localStorage.getItem(`recordar_avatar_${uid}`) || user?.photoURL || null)
  }, [user])

  const handleSaveProfile = async () => {
    if (!editName.trim()) { toast.error('O nome não pode ficar vazio'); return }
    setSavingProfile(true)
    try {
      localStorage.setItem(`recordar_profileName_${auth.currentUser?.uid || ''}`, editName.trim())
      localStorage.setItem(`recordar_profileBio_${auth.currentUser?.uid || ''}`, editBio.trim())
      const uid = auth.currentUser?.uid
      if (uid) {
        await updateDoc(doc(firestore, 'users', uid), {
          name: editName.trim(),
          bio: editBio.trim(),
        })
      }
      toast.success('Perfil atualizado!')
      setShowEdit(false)
    } catch {
      toast.error('Erro ao salvar perfil')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result
      setAvatarSrc(base64)
      localStorage.setItem(`recordar_avatar_${auth.currentUser?.uid || ''}`, base64)
      const uid = auth.currentUser?.uid
      if (uid) {
        try { await updateDoc(doc(firestore, 'users', uid), { photoURL: base64 }) } catch {}
      }
      toast.success('Foto atualizada!')
    }
    reader.readAsDataURL(file)
  }

  const handleTogglePrivacy = async () => {
    const newLevel = isPrivate ? 'public' : 'private'
    setIsPrivate(!isPrivate)
    try {
      await setProfilePrivacy(newLevel)
      toast.success(newLevel === 'private' ? 'Perfil agora é privado' : 'Perfil agora é público')
    } catch { toast.error('Erro ao mudar privacidade') }
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
        <div className={styles.avatar} onClick={() => setShowEdit(true)}>
          {avatarSrc
            ? <img src={avatarSrc} alt="Foto de perfil" />
            : <img src={PERFIL_ICONS.avatarPad} alt="Avatar padrao" width={60} height={60} className={styles.avatarDefault} />
          }
        </div>
        <h1 className={styles.name}>{editName || 'Meu Perfil'}</h1>
        {user?.username && <p className={styles.username}>@{user.username}</p>}
        <p className={styles.bio}>{editBio || '"Cada foto guarda um pedaco da nossa historia."'}</p>
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
        <button className={styles.editProfileBtn} onClick={() => setShowEdit(true)}>Editar Perfil</button>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>

        {/* ── Privacidade ── */}
        <h2 className={styles.sectionTitle}>
          <img src={PERFIL_ICONS.privado} alt="" aria-hidden="true" width={22} height={22} style={{verticalAlign:'middle', marginRight:6}} />
          Privacidade
        </h2>
        <div className={styles.privacyCard}>
          <PrivacyRow
            iconUrl={PERFIL_ICONS.privado} iconBg="#FFF0EB"
            label="Perfil privado"
            sub={isPrivate ? 'Só você pode ver suas memórias' : 'Outros usuários podem ver seu perfil'}
            type="toggle"
            value={isPrivate}
            onChange={handleTogglePrivacy}
          />
        </div>

        {/* ── PIN de Bloqueio ── */}
        <h2 className={styles.sectionTitle}>
          <span style={{marginRight:6, verticalAlign:'middle', fontSize: 18}}>🔒</span>
          Segurança
        </h2>
        <button className={styles.exportBtn} onClick={() => setShowPinModal(true)}>
          <span style={{ fontSize: 24 }}>🔑</span>
          <div className={styles.exportText}>
            <p className={styles.exportLabel}>PIN de Bloqueio</p>
            <p className={styles.exportSub}>Protege a pasta "Trancadas" com senha</p>
          </div>
          <span className={styles.exportArrow}>›</span>
        </button>

        <div style={{ height: 16 }} />

        {/* ── Backup na nuvem ── */}
        <h2 className={styles.sectionTitle}>
          <img src={PERFIL_ICONS.nuvem} alt="" aria-hidden="true" width={22} height={22} style={{verticalAlign:'middle', marginRight:6}} />
          Backup
        </h2>
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
            <p className={styles.exportSub}>Proteja suas memórias na nuvem</p>
          </div>
          <span className={styles.exportArrow}>›</span>
        </button>

        <div style={{ height: 16 }} />

        {/* ── Sair ── */}
        <button className={styles.logoutBtn} onClick={() => { logout(); toast.success('Você saiu da conta') }}>
          Sair da conta
        </button>

        <div style={{ height: 32 }} />
      </div>

      {/* ── Modal Editar Perfil ── */}
      {showEdit && (
        <div className={styles.editOverlay} onClick={() => setShowEdit(false)}>
          <div className={styles.editModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.editTitle}>Editar Perfil</h3>

            <div className={styles.editAvatarWrap}>
              <div className={styles.editAvatarCircle}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="" className={styles.editAvatarImg} />
                  : <span className={styles.editAvatarLetter}>{editName?.charAt(0)?.toUpperCase() || '?'}</span>
                }
              </div>
              <label className={styles.editAvatarBtn} htmlFor="perfilAvatarInput">Trocar foto</label>
              <input
                id="perfilAvatarInput"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>

            <label className={styles.editLabel}>Nome</label>
            <input
              className={styles.editInput}
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Seu nome"
              maxLength={60}
            />

            <label className={styles.editLabel}>Nome de usuário</label>
            <input
              className={styles.editInput}
              type="text"
              value={user?.username ? `@${user.username}` : ''}
              disabled
              style={{ opacity: 0.6 }}
            />

            <label className={styles.editLabel}>Bio</label>
            <textarea
              className={styles.editTextarea}
              value={editBio}
              onChange={e => setEditBio(e.target.value)}
              placeholder="Uma frase sobre você…"
              maxLength={160}
              rows={3}
            />

            <button className={styles.editSaveBtn} onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? 'Salvando…' : 'Salvar'}
            </button>
            <button className={styles.editCancelBtn} onClick={() => setShowEdit(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal PIN */}
      {showPinModal && (
        <PinLockModal
          uid={user?.uid}
          mode="manage"
          onClose={() => setShowPinModal(false)}
          onUnlock={() => setShowPinModal(false)}
        />
      )}
    </div>
  )
}