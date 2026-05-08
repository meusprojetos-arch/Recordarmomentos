/**
 * UserProfileModal — Visualizar perfil de outro usuário
 * - Privado: mostra foto, nome, bio e aviso "Perfil privado"
 * - Público: mostra perfil completo com tabs Feed e Memórias
 */
import React, { useState, useEffect } from 'react'
import { getUserAllMemories, getUserById } from '../../services/usersService.js'
import styles from './UserProfileModal.module.css'

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function formatDateTime(timestamp) {
  if (!timestamp) return ''
  const d = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp)
  const date = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${date} às ${time}`
}

export default function UserProfileModal({ user: initialUser, onClose }) {
  const [activeTab, setActiveTab] = useState('feed')
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(initialUser)

  // Buscar dados frescos do perfil
  useEffect(() => {
    if (initialUser?.uid) {
      getUserById(initialUser.uid).then(freshUser => {
        if (freshUser) setUser(freshUser)
      }).catch(() => {})
    }
  }, [initialUser?.uid])

  const isPrivate = user?.privacyLevel === 'private'

  useEffect(() => {
    if (!isPrivate && user?.uid) {
      setLoading(true)
      getUserAllMemories(user.uid)
        .then(setMemories)
        .catch(() => setMemories([]))
        .finally(() => setLoading(false))
    }
  }, [user?.uid, isPrivate])

  const posts = memories.filter(m => m.type === 'text')
  const media = memories.filter(m => m.type !== 'text')

  // Agrupar mídia por mês/ano
  const groupedMedia = {}
  for (const m of media) {
    const y = m.date?.substring(0, 4) || 'Sem data'
    const mo = m.date?.substring(5, 7) || ''
    const key = mo ? `${y}-${mo}` : y
    const label = mo ? `${MONTHS_PT[Number(mo) - 1]} de ${y}` : y
    if (!groupedMedia[key]) groupedMedia[key] = { label, items: [] }
    groupedMedia[key].items.push(m)
  }
  const mediaGroups = Object.entries(groupedMedia).sort(([a], [b]) => b.localeCompare(a))

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.sheet}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
          <div className={styles.avatar}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" className={styles.avatarImg} />
              : <span className={styles.avatarLetter}>{user?.name?.charAt(0)?.toUpperCase() || '?'}</span>
            }
          </div>
          <h2 className={styles.name}>{user?.name || 'Usuário'}</h2>
          {user?.username && <p className={styles.username}>@{user.username}</p>}
          {user?.bio && <p className={styles.bio}>{user.bio}</p>}
        </div>

        {/* Privado */}
        {isPrivate && (
          <div className={styles.privateBox}>
            <span className={styles.privateIcon}>🔒</span>
            <p className={styles.privateTitle}>Perfil Privado</p>
            <p className={styles.privateSub}>Este usuário mantém suas memórias privadas.</p>
          </div>
        )}

        {/* Público — Tabs */}
        {!isPrivate && (
          <>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'feed' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('feed')}
              >
                Feed
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'memorias' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('memorias')}
              >
                Memórias
              </button>
            </div>

            <div className={styles.content}>
              {loading && <p className={styles.loadingText}>Carregando...</p>}

              {/* Tab Feed */}
              {!loading && activeTab === 'feed' && (
                <>
                  {posts.length === 0 && (
                    <p className={styles.emptyText}>Nenhuma publicação ainda</p>
                  )}
                  {posts.map(post => (
                    <div key={post.id} className={styles.postCard}>
                      <p className={styles.postText}>{post.description || post.title}</p>
                      <p className={styles.postDate}>{formatDateTime(post.createdAt)}</p>
                    </div>
                  ))}
                </>
              )}

              {/* Tab Memórias */}
              {!loading && activeTab === 'memorias' && (
                <>
                  {media.length === 0 && (
                    <p className={styles.emptyText}>Nenhuma memória compartilhada</p>
                  )}
                  {mediaGroups.map(([key, { label, items }]) => (
                    <div key={key} className={styles.mediaGroup}>
                      <h4 className={styles.mediaGroupTitle}>{label}</h4>
                      <div className={styles.mediaGrid}>
                        {items.map(m => (
                          <div key={m.id} className={styles.mediaThumb}>
                            {m.fileUrl && m.type === 'photo' && (
                              <img src={m.fileUrl} alt={m.title || ''} className={styles.mediaImg} />
                            )}
                            {m.fileUrl && m.type === 'video' && (
                              <video src={m.fileUrl} className={styles.mediaImg} muted playsInline preload="metadata" />
                            )}
                            {!m.fileUrl && (
                              <div className={styles.mediaPlaceholder}>
                                <span>{m.type === 'audio' ? '🎵' : '📷'}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
