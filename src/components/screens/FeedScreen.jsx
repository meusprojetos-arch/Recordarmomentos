/**
 * FeedScreen — Feed social tipo Instagram/Facebook
 * Mostra posts (reflexões/frases) em estilo de feed sequencial
 */
import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { getMemories, addMemory } from '../../services/memoriesService.js'
import { getSharedWithMe } from '../../services/usersService.js'
import Topbar from '../layout/Topbar.jsx'
import styles from './FeedScreen.module.css'

export default function FeedScreen() {
  const { user } = useAuth()
  const [posts, setPosts]             = useState([])
  const [newPost, setNewPost]         = useState('')
  const [posting, setPosting]         = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [likedIds, setLikedIds]       = useState([])
  const [selectedPost, setSelectedPost] = useState(null)
  const [loading, setLoading]         = useState(true)

  useEffect(() => { loadFeed() }, [])

  /* ── Data load ── */
  const loadFeed = async () => {
    setLoading(true)
    try {
      // Busca todas e filtra client-side (evita necessidade de índice composto)
      const allMems = await getMemories()
      const myMems = (allMems || []).filter(m => m.type === 'text')
      let sharedPosts = []
      try {
        const shared = await getSharedWithMe()
        sharedPosts = (shared || [])
          .filter(s => s.memory?.type === 'text')
          .map(s => ({ ...s.memory, fromUser: s.from }))
      } catch { /* ignore shared errors */ }

      const all = [...myMems, ...sharedPosts].sort((a, b) => {
        const da = a.createdAt?.seconds ?? 0
        const db = b.createdAt?.seconds ?? 0
        return db - da
      })
      setPosts(all)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  /* ── Post creation ── */
  const handlePost = async () => {
    if (!newPost.trim()) {
      toast.error('Escreva algo antes de postar')
      return
    }
    setPosting(true)
    try {
      await addMemory({
        type: 'text',
        title: newPost.substring(0, 60),
        description: newPost,
        date: new Date().toISOString().substring(0, 10),
        tags: [],
        privacyLevel: 'private',
      })
      toast.success('Reflexão publicada!')
      setNewPost('')
      setShowCompose(false)
      loadFeed()
    } catch {
      toast.error('Erro ao publicar')
    }
    setPosting(false)
  }

  /* ── Like toggle ── */
  const toggleLike = (id, e) => {
    e.stopPropagation()
    setLikedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  /* ── Share ── */
  const handleShare = async (post, e) => {
    if (e) e.stopPropagation()
    const text = post.description || post.title || ''
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Reflexão — Recordar', text })
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Copiado para a área de transferência!')
    }
  }

  /* ── Date formatting ── */
  const formatDateTime = (timestamp) => {
    if (!timestamp) return ''
    const d = timestamp.seconds
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp)
    const date = d.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const time = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${date} às ${time}`
  }

  /* ── Avatar helpers ── */
  const avatarLetter = (post) => {
    if (post.fromUser?.name) return post.fromUser.name.charAt(0).toUpperCase()
    if (user?.displayName)   return user.displayName.charAt(0).toUpperCase()
    return '?'
  }
  const authorName = (post) =>
    post.fromUser?.name || user?.displayName || 'Você'

  /* ── Render ── */
  return (
    <div className={styles.screen}>
      <Topbar title="Feed" subtitle="Reflexões e momentos" />

      <div className={styles.scroll}>

        {/* ── Compose button ── */}
        <button
          className={`${styles.composeBtn} ${showCompose ? styles.composeBtnActive : ''}`}
          onClick={() => setShowCompose(v => !v)}
        >
          {showCompose ? '✕ Fechar' : '✏️ Escrever uma reflexão'}
        </button>

        {/* ── Compose area ── */}
        {showCompose && (
          <div className={styles.composeArea}>
            <div className={styles.composeRow}>
              <div className={styles.composeAvatar}>
                {user?.displayName?.charAt(0).toUpperCase() || '?'}
              </div>
              <textarea
                className={styles.composeInput}
                placeholder="O que você está pensando? Compartilhe uma reflexão, frase ou momento…"
                value={newPost}
                onChange={e => setNewPost(e.target.value)}
                rows={4}
                autoFocus
              />
            </div>
            <div className={styles.composeFooter}>
              <span className={styles.charCount}>{newPost.length} caracteres</span>
              <button
                className={styles.postBtn}
                onClick={handlePost}
                disabled={posting || !newPost.trim()}
              >
                {posting ? 'Publicando…' : 'Publicar'}
              </button>
            </div>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className={styles.skeletonWrap}>
            {[1, 2, 3].map(i => (
              <div key={i} className={styles.skeleton}>
                <div className={styles.skeletonHeader}>
                  <div className={styles.skeletonAvatar} />
                  <div className={styles.skeletonMeta}>
                    <div className={styles.skeletonLine} style={{ width: '40%' }} />
                    <div className={styles.skeletonLine} style={{ width: '60%', marginTop: 6 }} />
                  </div>
                </div>
                <div className={styles.skeletonLine} style={{ width: '100%', marginTop: 14 }} />
                <div className={styles.skeletonLine} style={{ width: '80%', marginTop: 8 }} />
                <div className={styles.skeletonLine} style={{ width: '55%', marginTop: 8 }} />
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && posts.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>💭</span>
            <p className={styles.emptyTitle}>Nenhuma reflexão ainda</p>
            <p className={styles.emptySub}>
              Clique em "✏️ Escrever uma reflexão" e comece a registrar seus pensamentos e momentos.
            </p>
          </div>
        )}

        {/* ── Feed cards ── */}
        {!loading && posts.map(post => {
          const liked = likedIds.includes(post.id)
          const text  = post.description || post.title || ''
          const preview = text.length > 280 ? text.substring(0, 280) + '…' : text

          return (
            <article
              key={post.id}
              className={styles.postCard}
              onClick={() => setSelectedPost(post)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelectedPost(post)}
            >
              {/* Header */}
              <div className={styles.postHeader}>
                <div className={styles.postAvatar}>{avatarLetter(post)}</div>
                <div className={styles.postMeta}>
                  <p className={styles.postAuthor}>{authorName(post)}</p>
                  <p className={styles.postDate}>{formatDateTime(post.createdAt)}</p>
                </div>
              </div>

              {/* Text content */}
              <p className={styles.postText}>{preview}</p>
              {text.length > 280 && (
                <span className={styles.readMore}>Ver mais</span>
              )}

              {/* Actions */}
              <div className={styles.postActions}>
                <button
                  className={`${styles.actionBtn} ${liked ? styles.actionBtnLiked : ''}`}
                  onClick={e => toggleLike(post.id, e)}
                  aria-label="Curtir"
                >
                  <span className={styles.actionIcon}>{liked ? '❤️' : '🤍'}</span>
                  <span className={styles.actionLabel}>{liked ? 'Curtido' : 'Curtir'}</span>
                </button>

                <button
                  className={styles.actionBtn}
                  onClick={e => handleShare(post, e)}
                  aria-label="Compartilhar"
                >
                  <span className={styles.actionIcon}>🔗</span>
                  <span className={styles.actionLabel}>Compartilhar</span>
                </button>
              </div>
            </article>
          )
        })}

      </div>

      {/* ── Detail Modal ── */}
      {selectedPost && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedPost(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={styles.modal}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal gradient header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalAvatar}>{avatarLetter(selectedPost)}</div>
              <div className={styles.modalMeta}>
                <p className={styles.modalAuthor}>{authorName(selectedPost)}</p>
                <p className={styles.modalDate}>{formatDateTime(selectedPost.createdAt)}</p>
              </div>
              <button
                className={styles.modalClose}
                onClick={() => setSelectedPost(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className={styles.modalBody}>
              <p className={styles.modalText}>
                {selectedPost.description || selectedPost.title}
              </p>
            </div>

            {/* Modal footer */}
            <div className={styles.modalFooter}>
              <button
                className={`${styles.actionBtn} ${likedIds.includes(selectedPost.id) ? styles.actionBtnLiked : ''}`}
                onClick={e => toggleLike(selectedPost.id, e)}
              >
                <span className={styles.actionIcon}>
                  {likedIds.includes(selectedPost.id) ? '❤️' : '🤍'}
                </span>
                <span className={styles.actionLabel}>
                  {likedIds.includes(selectedPost.id) ? 'Curtido' : 'Curtir'}
                </span>
              </button>

              <button
                className={`${styles.actionBtn} ${styles.shareBtn}`}
                onClick={e => handleShare(selectedPost, e)}
              >
                <span className={styles.actionIcon}>🔗</span>
                <span className={styles.actionLabel}>Compartilhar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
