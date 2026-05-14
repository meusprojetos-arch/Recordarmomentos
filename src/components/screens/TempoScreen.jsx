/**
 * TempoScreen — Galeria de Fotos e Vídeos
 *
 * Exibe memórias de mídia (foto, vídeo, áudio) em grid de 3 colunas,
 * com visualizador fullscreen, navegação por swipe, seleção múltipla,
 * filtros por tipo e filtro por data (ano/mês).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getMemories, searchMemories, deleteMemory, updateMemory, getTrashItems, restoreFromTrash, permanentDeleteFromTrash } from '../../services/memoriesService.js'
import { db as localDb } from '../../db/database.js'
import Topbar from '../layout/Topbar.jsx'
import FolderGrid from '../ui/FolderGrid.jsx'
import PinLockModal from '../modals/PinLockModal.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import styles from './TempoScreen.module.css'
import toast from 'react-hot-toast'

// ─── Constantes ────────────────────────────────────────────────────────────────

const FILTER_ICONS = {
  photo:     '/icons/filtro-foto.svg',
  video:     '/icons/filtro-video.svg',
  audio:     '/icons/filtro-audio.svg',
  highlight: '/icons/filtro-destaque.svg',
}

const FILTERS = [
  { id: 'all',       label: 'Todas'     },
  { id: 'photo',     label: 'Fotos'     },
  { id: 'video',     label: 'Videos'    },
  { id: 'audio',     label: 'Audios'    },
  { id: 'highlight', label: 'Destaques' },
]

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Componente principal ───────────────────────────────────────────────────────

export default function TempoScreen() {
  // Tab ativa: galeria | pastas | lixeira
  const [activeTab, setActiveTab]       = useState('galeria')

  const [memories, setMemories]         = useState([])
  const [thumbUrls, setThumbUrls]       = useState({})
  const [filter, setFilter]             = useState('all')
  const [query, setQuery]               = useState('')
  const [searchResults, setSearchResults] = useState(null)

  // Lixeira
  const [trashItems, setTrashItems]     = useState([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashConfirm, setTrashConfirm]   = useState(null)

  // Filtro por data
  const [yearFilter, setYearFilter]     = useState('')
  const [monthFilter, setMonthFilter]   = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Visualizador fullscreen
  const [viewerOpen, setViewerOpen]     = useState(false)
  const [viewerIndex, setViewerIndex]   = useState(0)

  // Seleção múltipla
  const [selectMode, setSelectMode]     = useState(false)
  const [selectedIds, setSelectedIds]   = useState(new Set())

  // Modal mover para pasta
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [folders, setFolders]           = useState([])

  // Visualização de pasta aberta
  const [openFolder, setOpenFolder]     = useState(null)
  const [folderMemories, setFolderMemories] = useState([])
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderThumbUrls, setFolderThumbUrls] = useState({})
  const [folderViewerOpen, setFolderViewerOpen] = useState(false)
  const [folderViewerIndex, setFolderViewerIndex] = useState(0)

  // Contagem de memórias por pasta (para FolderGrid)
  const [memoryCounts, setMemoryCounts] = useState({})

  // Modo trancar
  const [lockMode, setLockMode]         = useState(false)
  const [lockSelectedIds, setLockSelectedIds] = useState(new Set())

  // PIN para pasta trancadas
  const [showPinModal, setShowPinModal] = useState(false)
  const [pendingFolder, setPendingFolder] = useState(null)
  const { user } = useAuth()

  // Swipe no viewer
  const touchStartX = useRef(null)
  const longPressTimer = useRef(null)

  // ── Carregamento de memórias ───────────────────────────────────────────────

  const loadMemories = useCallback(async () => {
    try {
      const mems = await getMemories()
      // Encontrar a pasta "Trancadas" para excluir da galeria principal
      let lockedFolderId = null
      try {
        const uid = user?.uid || ''
        const lockedFolder = await localDb.folders
          .where('uid').equals(uid)
          .and(f => f.name === 'Trancadas')
          .first()
        if (lockedFolder) lockedFolderId = lockedFolder.id
      } catch { /* ignore */ }
      // Filtrar memórias trancadas (privadas + na pasta Trancadas)
      const visible = mems.filter(m => {
        if (lockedFolderId && m.folderId === lockedFolderId && m.privacyLevel === 'private') return false
        return true
      })
      setMemories(visible)
      // Calcular contagem por pasta
      const countMap = {}
      for (const m of mems) {
        if (m.folderId) countMap[m.folderId] = (countMap[m.folderId] || 0) + 1
      }
      setMemoryCounts(countMap)
    } catch (e) {
      console.error(e)
    }
  }, [user?.uid])

  useEffect(() => { loadMemories() }, [loadMemories])

  // Abrir pasta e carregar suas memórias
  const handleOpenFolder = async (folder) => {
    // Se for pasta Trancadas e tem PIN configurado, pedir PIN
    if (folder.name === 'Trancadas') {
      const uid = user?.uid || ''
      const pinHash = localStorage.getItem(`recordar_pin_hash_${uid}`)
      if (pinHash) {
        setPendingFolder(folder)
        setShowPinModal(true)
        return
      }
    }
    openFolderDirectly(folder)
  }

  const openFolderDirectly = async (folder) => {
    setOpenFolder(folder)
    setFolderLoading(true)
    try {
      const mems = await getMemories()
      const folderMems = mems.filter(m => m.folderId === folder.id)
      setFolderMemories(folderMems)
      // Gerar URLs de blob para fotos da pasta
      const urls = {}
      for (const m of folderMems) {
        try {
          if (m._objectUrl && (m.type === 'photo' || m.type === 'video')) {
            urls[m.id] = m._objectUrl
          } else if (m.fileUrl && (m.type === 'photo' || m.type === 'video')) {
            urls[m.id] = m.fileUrl
          } else if (m.thumbnail && m.thumbnail instanceof Blob) {
            urls[m.id] = URL.createObjectURL(m.thumbnail)
          } else if (m.fileBlob && m.fileBlob instanceof Blob && (m.type === 'photo' || m.type === 'video')) {
            urls[m.id] = URL.createObjectURL(m.fileBlob)
          } else if (m.fileBlob && !(m.fileBlob instanceof Blob) && (m.type === 'photo' || m.type === 'video')) {
            const blob = new Blob([m.fileBlob], { type: m.type === 'photo' ? 'image/jpeg' : 'video/mp4' })
            urls[m.id] = URL.createObjectURL(blob)
          }
        } catch { /* skip */ }
      }
      setFolderThumbUrls(urls)
    } catch (e) {
      console.error(e)
      setFolderMemories([])
    }
    setFolderLoading(false)
  }

  // Recarregar ao voltar para a tela ou após importação
  useEffect(() => {
    const handleFocus = () => loadMemories()
    const handleUpdate = () => loadMemories()
    window.addEventListener('focus', handleFocus)
    window.addEventListener('memories-updated', handleUpdate)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('memories-updated', handleUpdate)
    }
  }, [loadMemories])

  // ── Geração de URLs de blob ────────────────────────────────────────────────

  useEffect(() => {
    const urls = {}
    for (const m of memories) {
      try {
        if (m._objectUrl) {
          urls[m.id] = m._objectUrl
        } else if (m.fileUrl) {
          urls[m.id] = m.fileUrl
        } else if (m.thumbnail && m.thumbnail instanceof Blob) {
          urls[m.id] = URL.createObjectURL(m.thumbnail)
        } else if (m.fileBlob && m.fileBlob instanceof Blob) {
          urls[m.id] = URL.createObjectURL(m.fileBlob)
        } else if (m.fileBlob && !(m.fileBlob instanceof Blob)) {
          const mimeType = m.type === 'audio' ? 'audio/webm' : m.type === 'video' ? 'video/mp4' : 'image/jpeg'
          const blob = new Blob([m.fileBlob], { type: mimeType })
          urls[m.id] = URL.createObjectURL(blob)
        }
      } catch (e) { /* skip invalid blobs */ }
    }
    setThumbUrls(urls)
    return () => {
      Object.entries(urls).forEach(([id, u]) => {
        // Não revogar _objectUrl pois é gerenciado externamente
        const mem = memories.find(m => m.id === id)
        if (!mem?._objectUrl || u !== mem._objectUrl) {
          URL.revokeObjectURL(u)
        }
      })
    }
  }, [memories])

  // ── Busca ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!query.trim()) { setSearchResults(null); return }
    searchMemories(query).then(setSearchResults).catch(() => {})
  }, [query])

  // ── Lixeira ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'lixeira') loadTrash()
  }, [activeTab])

  async function loadTrash() {
    setTrashLoading(true)
    try {
      const items = await getTrashItems()
      setTrashItems(items)
    } catch { setTrashItems([]) }
    setTrashLoading(false)
  }

  async function handleRestore(itemId) {
    try {
      await restoreFromTrash(itemId)
      setTrashItems(prev => prev.filter(i => i.id !== itemId))
      toast.success('Restaurado com sucesso!')
    } catch { toast.error('Erro ao restaurar') }
  }

  async function confirmTrashAction() {
    if (!trashConfirm) return
    if (trashConfirm.type === 'delete') {
      setTrashItems(prev => prev.filter(i => i.id !== trashConfirm.id))
      permanentDeleteFromTrash(trashConfirm.id).catch(() => {})
      toast.success('Item excluído permanentemente')
    } else if (trashConfirm.type === 'restore') {
      await handleRestore(trashConfirm.id)
      toast.success('Item restaurado!')
    } else if (trashConfirm.type === 'deleteAll') {
      const ids = trashItems.map(i => i.id)
      setTrashItems([])
      for (const id of ids) await permanentDeleteFromTrash(id).catch(() => {})
      toast.success('Lixeira esvaziada!')
    }
    setTrashConfirm(null)
  }

  async function handlePermanentDelete(itemId) {
    const ok = window.confirm('Excluir permanentemente? Esta ação não pode ser desfeita.')
    if (!ok) return
    try {
      await permanentDeleteFromTrash(itemId)
      setTrashItems(prev => prev.filter(i => i.id !== itemId))
      toast.success('Excluído permanentemente')
    } catch { toast.error('Erro ao excluir') }
  }

  // ── Memórias filtradas ─────────────────────────────────────────────────────

  // Apenas mídias (sem texto)
  const mediaMemories = useMemo(() => {
    return memories.filter(m => m.type !== 'text')
  }, [memories])

  const filteredMemories = useMemo(() => {
    let list = mediaMemories

    // Filtro de tipo
    if (filter === 'highlight') list = list.filter(m => m.isHighlight)
    else if (filter !== 'all') list = list.filter(m => m.type === filter)

    // Filtro de ano
    if (yearFilter) list = list.filter(m => m.date?.substring(0, 4) === yearFilter)

    // Filtro de mês
    if (monthFilter) list = list.filter(m => m.date?.substring(5, 7) === monthFilter)

    return list
  }, [mediaMemories, filter, yearFilter, monthFilter])

  // Anos disponíveis para o seletor de data
  const availableYears = useMemo(() => {
    const ys = new Set(mediaMemories.map(m => m.date?.substring(0, 4)).filter(Boolean))
    return Array.from(ys).sort((a, b) => Number(b) - Number(a))
  }, [mediaMemories])

  // ── Agrupamento por ano/mês ─────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const map = {}
    for (const m of filteredMemories) {
      const y = m.date?.substring(0, 4) || 'Sem data'
      const mo = m.date?.substring(5, 7) || ''
      const key = mo ? `${y}-${mo}` : y
      const label = mo
        ? `${MONTHS_PT[Number(mo) - 1]} de ${y}`
        : y
      if (!map[key]) map[key] = { label, year: y, month: mo, items: [] }
      map[key].items.push(m)
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredMemories])

  // ── Viewer: lista plana navegável ──────────────────────────────────────────

  const viewerList = useMemo(() => filteredMemories, [filteredMemories])

  function openViewer(memory) {
    const idx = viewerList.findIndex(m => m.id === memory.id)
    if (idx === -1) return
    setViewerIndex(idx)
    setViewerOpen(true)
  }

  function closeViewer() {
    setViewerOpen(false)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function goNext() {
    setViewerIndex(i => Math.min(i + 1, viewerList.length - 1))
  }

  function goPrev() {
    setViewerIndex(i => Math.max(i - 1, 0))
  }

  // Swipe handlers
  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) {
      dx < 0 ? goNext() : goPrev()
    }
    touchStartX.current = null
  }

  // Teclado no viewer
  useEffect(() => {
    if (!viewerOpen) return
    function onKey(e) {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft')  goPrev()
      if (e.key === 'Escape')     closeViewer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerOpen, viewerList.length])

  // ── Seleção múltipla ───────────────────────────────────────────────────────

  function startLongPress(memory) {
    longPressTimer.current = setTimeout(() => {
      setLockMode(false)
      setLockSelectedIds(new Set())
      setSelectMode(true)
      setSelectedIds(new Set([memory.id]))
    }, 500)
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer.current)
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setLockMode(false)
    setLockSelectedIds(new Set())
  }

  function handleThumbClick(memory) {
    if (lockMode) {
      toggleLockSelect(memory.id)
    } else if (selectMode) {
      toggleSelect(memory.id)
    } else {
      const src = thumbUrls[memory.id] || memory.fileUrl
      if (src || memory.type === 'audio') {
        openViewer(memory)
      } else {
        toast('Arquivo indisponível. Re-adicione esta memória.')
      }
    }
  }

  // ── Share / Download ───────────────────────────────────────────────────────

  async function shareMemory(memory) {
    const url = thumbUrls[memory.id] || memory.fileUrl
    if (!url) { toast.error('Sem arquivo para partilhar'); return }
    if (navigator.share) {
      try {
        await navigator.share({ title: memory.title || 'Memória', url })
      } catch {/* cancelado */}
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado!')
    }
  }

  async function downloadMemory(memory) {
    const url = thumbUrls[memory.id] || memory.fileUrl
    if (!url) { toast.error('Sem arquivo para guardar'); return }
    const a = document.createElement('a')
    a.href = url
    a.download = memory.title || 'memoria'
    a.click()
    toast.success('Download iniciado')
  }

  async function toggleMemoryPrivacy(memory) {
    const newLevel = memory.privacyLevel === 'public' ? 'private' : 'public'
    try {
      await updateMemory(memory.id, { privacyLevel: newLevel })
      setMemories(prev => prev.map(m => m.id === memory.id ? { ...m, privacyLevel: newLevel } : m))
      toast.success(newLevel === 'public' ? 'Agora é pública' : 'Agora é só sua')
    } catch { toast.error('Erro ao alterar') }
  }

  async function batchShare() {
    const items = Array.from(selectedIds)
    const files = []
    for (const id of items) {
      const m = memories.find(x => x.id === id)
      if (!m) continue
      const blob = m.fileBlob || null
      const url = thumbUrls[m.id] || m.fileUrl
      if (blob && blob instanceof Blob) {
        const ext = m.type === 'video' ? 'mp4' : 'jpg'
        files.push(new File([blob], `${m.title || 'memoria'}.${ext}`, { type: blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg') }))
      } else if (url) {
        try {
          const resp = await fetch(url)
          const b = await resp.blob()
          const ext = m.type === 'video' ? 'mp4' : 'jpg'
          files.push(new File([b], `${m.title || 'memoria'}.${ext}`, { type: b.type }))
        } catch { /* skip */ }
      }
    }

    if (files.length === 0) {
      toast.error('Nenhum arquivo disponível para compartilhar')
      exitSelectMode()
      return
    }

    // Tenta Web Share API com múltiplos arquivos
    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: 'Memórias — Recordar' })
      } catch { /* cancelado pelo usuário */ }
    } else {
      // Fallback: download de todos
      for (const file of files) {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
      toast.success(`${files.length} arquivo(s) salvos`)
    }
    exitSelectMode()
  }

  async function batchDownload() {
    const items = Array.from(selectedIds)
    for (const id of items) {
      const m = memories.find(x => x.id === id)
      if (m) await downloadMemory(m)
    }
    exitSelectMode()
  }

  async function batchDelete() {
    const count = selectedIds.size
    const confirmed = window.confirm(`Excluir ${count} item(s) permanentemente?`)
    if (!confirmed) return
    try {
      for (const id of selectedIds) {
        await deleteMemory(id)
      }
      setMemories(prev => prev.filter(m => !selectedIds.has(m.id)))
      toast.success(`${count} item(s) excluído(s)`)
    } catch {
      toast.error('Erro ao excluir')
    }
    exitSelectMode()
  }

  async function openMoveModal() {
    const allFolders = await localDb.folders.orderBy('order').toArray()
    setFolders(allFolders)
    setShowMoveModal(true)
  }

  async function batchMoveToFolder(folderId) {
    const count = selectedIds.size
    try {
      for (const id of selectedIds) {
        await updateMemory(id, { folderId })
      }
      const folder = folders.find(f => f.id === folderId)
      toast.success(`${count} item(s) movido(s) para "${folder?.name || 'pasta'}"`)
      // Recarregar para atualizar contagens
      await loadMemories()
    } catch (err) {
      console.error('Erro ao mover:', err)
      toast.error('Erro ao mover para pasta')
    }
    setShowMoveModal(false)
    exitSelectMode()
  }

  // ── Modo Trancar ──────────────────────────────────────────────────────────

  function toggleLockSelect(id) {
    setLockSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleLockPhotos() {
    if (lockSelectedIds.size === 0) return
    const uid = user?.uid || ''
    try {
      // Criar/encontrar pasta "Trancadas" do usuário atual
      let lockedFolder = await localDb.folders
        .where('uid').equals(uid)
        .and(f => f.name === 'Trancadas')
        .first()
      if (!lockedFolder) {
        const folderId = await localDb.folders.add({
          name: 'Trancadas',
          emoji: '/icons/pasta-generica.svg',
          isAuto: false,
          autoRule: null,
          uid,
          order: 99,
          createdAt: new Date().toISOString(),
        })
        lockedFolder = { id: folderId }
      }

      // Mover para pasta + marcar como privado
      for (const id of lockSelectedIds) {
        await updateMemory(id, { privacyLevel: 'private', folderId: lockedFolder.id })
      }

      // Remover da galeria visível
      setMemories(prev => prev.filter(m => !lockSelectedIds.has(m.id)))
      toast.success(`${lockSelectedIds.size} item(s) trancado(s)`)
    } catch {
      toast.error('Erro ao trancar')
    }
    setLockMode(false)
    setLockSelectedIds(new Set())
  }

  // ── Renders auxiliares ─────────────────────────────────────────────────────

  function getThumbSrc(m) {
    return thumbUrls[m.id] || m.fileUrl || null
  }

  function GridItem({ memory }) {
    const src = getThumbSrc(memory)
    const isSelected = selectedIds.has(memory.id)
    const isLockSelected = lockSelectedIds.has(memory.id)

    return (
      <div
        className={`${styles.memThumb} ${isSelected ? styles.memThumbSelected : ''} ${isLockSelected ? styles.memThumbLocked : ''}`}
        onClick={() => handleThumbClick(memory)}
        onTouchStart={() => !selectMode && startLongPress(memory)}
        onTouchEnd={cancelLongPress}
        onMouseDown={() => !selectMode && startLongPress(memory)}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        role="button"
        aria-label={memory.title || 'Memória'}
      >
        {/* Imagem / Vídeo / Áudio */}
        {src && memory.type === 'photo' && (
          <img
            src={src}
            alt={memory.title || ''}
            className={styles.thumbImg}
            loading="lazy"
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex') }}
          />
        )}
        {src && memory.type === 'photo' && (
          <div className={styles.thumbPlaceholder} style={{ display: 'none' }}>
            <img src={FILTER_ICONS.photo} alt="" width={32} height={32} aria-hidden="true" />
            <span className={styles.thumbTitle}>{memory.title}</span>
          </div>
        )}
        {memory.type === 'video' && (
          <>
            <div className={styles.thumbPlaceholder} style={{ background: '#1a1a2e' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#D37E65" strokeWidth="1.5" width="36" height="36">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <path d="m16 10-6-4v8l6-4z" fill="#D37E65" stroke="none"/>
              </svg>
            </div>
            <div className={styles.playOverlay} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </>
        )}
        {memory.type === 'audio' && (
          <div className={styles.thumbPlaceholder}>
            <img src={FILTER_ICONS.audio} alt="" width={32} height={32} aria-hidden="true" />
            <span className={styles.thumbTitle}>{memory.title || 'Audio'}</span>
          </div>
        )}
        {!src && memory.type !== 'audio' && (
          <div className={styles.thumbPlaceholder}>
            <img src={FILTER_ICONS[memory.type] || FILTER_ICONS.photo} alt="" width={32} height={32} aria-hidden="true" />
            <span className={styles.thumbTitle}>{memory.title}</span>
          </div>
        )}

        {/* Badge de destaque */}
        {memory.isHighlight && (
          <div className={styles.highlightBadge} aria-hidden="true">
            <img src={FILTER_ICONS.highlight} alt="" width={14} height={14} />
          </div>
        )}

        {/* Checkbox de seleção */}
        {selectMode && (
          <div className={`${styles.selectCircle} ${isSelected ? styles.selectCircleActive : ''}`} aria-hidden="true">
            {isSelected && (
              <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Viewer fullscreen ──────────────────────────────────────────────────────

  const currentMemory = viewerList[viewerIndex]

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.screen}>
      <Topbar
        title="Memórias"
        subtitle={`${mediaMemories.length} memória${mediaMemories.length !== 1 ? 's' : ''}`}
      />

      <div className={styles.scroll}>

        {/* ── Tabs: Galeria | Pastas | Lixeira ── */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'galeria' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('galeria')}
          >
            Galeria
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'pastas' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('pastas')}
          >
            Pastas
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'lixeira' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('lixeira')}
          >
            Lixeira
          </button>
        </div>

        {/* ══ TAB: Pastas ══ */}
        {activeTab === 'pastas' && (
          <div style={{ marginTop: 12 }}>
            {!openFolder ? (
              <FolderGrid onOpenFolder={handleOpenFolder} memoryCounts={memoryCounts} />
            ) : (
              <div className={styles.folderView}>
                <button className={styles.folderBackBtn} onClick={() => setOpenFolder(null)}>
                  ← Voltar para pastas
                </button>
                <h3 className={styles.folderViewTitle}>
                  <img src={openFolder.emoji} alt="" width={24} height={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  {openFolder.name}
                </h3>
                {folderLoading && <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>Carregando...</p>}
                {!folderLoading && folderMemories.length === 0 && (
                  <div className={styles.emptyState}>
                    <span>📂</span>
                    <p>Pasta vazia</p>
                    <p className={styles.emptySub}>Mova memórias para esta pasta usando o botão "Mover"</p>
                  </div>
                )}
                {!folderLoading && folderMemories.length > 0 && (
                  <div className={styles.yearGrid}>
                    {folderMemories.map((m, idx) => {
                      const thumbSrc = folderThumbUrls[m.id] || m.fileUrl || null
                      return (
                        <div
                          key={m.id}
                          className={styles.memThumb}
                          onClick={() => {
                            if (thumbSrc) {
                              setFolderViewerIndex(idx)
                              setFolderViewerOpen(true)
                            }
                          }}
                        >
                          {thumbSrc ? (
                            <>
                              <img
                                src={thumbSrc}
                                alt={m.title || ''}
                                className={styles.thumbImg}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex') }}
                              />
                              <div className={styles.thumbPlaceholder} style={{ display: 'none' }}>
                                <span style={{ fontSize: 24 }}>📷</span>
                                <span className={styles.thumbTitle}>{m.title || 'Foto'}</span>
                              </div>
                            </>
                          ) : (
                            <div className={styles.thumbPlaceholder}>
                              <span style={{ fontSize: 24 }}>{m.type === 'video' ? '🎬' : m.type === 'audio' ? '🎵' : '📷'}</span>
                              <span className={styles.thumbTitle}>{m.title || m.description || m.type}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: Lixeira ══ */}
        {activeTab === 'lixeira' && (
            <div style={{ marginTop: 12 }}>
              <p className={styles.trashInfo}>Itens excluídos ficam aqui por 90 dias.</p>

              {!trashLoading && trashItems.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button
                    className={styles.trashDeleteBtn}
                    onClick={() => setTrashConfirm({ type: 'deleteAll', count: trashItems.length })}
                  >
                    Esvaziar lixeira ({trashItems.length})
                  </button>
                </div>
              )}

              {trashLoading && <p style={{ textAlign: 'center', color: '#999', padding: 20 }}>Carregando...</p>}

              {!trashLoading && trashItems.length === 0 && (
                <div className={styles.emptyState}>
                  <span>🗑️</span>
                  <p>Lixeira vazia</p>
                  <p className={styles.emptySub}>Nenhum item excluído recentemente</p>
                </div>
              )}

              {!trashLoading && trashItems.map(item => {
                // Gerar URL da miniatura — fileUrl (nuvem) ou fileBlob (local)
                const thumbSrc = item.type === 'photo'
                  ? (item.fileUrl || (item.fileBlob instanceof Blob ? URL.createObjectURL(item.fileBlob) : null))
                  : null
                const hasThumb = !!thumbSrc
                const canView = item.fileUrl || item.fileBlob instanceof Blob
                const deletedDate = item.deletedAt?.seconds
                  ? new Date(item.deletedAt.seconds * 1000).toLocaleDateString('pt-BR')
                  : '—'

                return (
                  <div key={item.id} className={styles.trashItem}>
                    {/* Miniatura clicável */}
                    <div
                      style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--bege-claro)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canView ? 'pointer' : 'default' }}
                      onClick={() => { if (canView) openViewer({ ...item, _objectUrl: item.fileBlob instanceof Blob ? URL.createObjectURL(item.fileBlob) : item.fileUrl }) }}
                    >
                      {hasThumb
                        ? <img src={thumbSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : item.type === 'video'
                          ? <svg viewBox="0 0 24 24" fill="none" stroke="#D37E65" strokeWidth="1.5" width="28" height="28"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="m16 10-6-4v8l6-4z" fill="#D37E65" stroke="none"/></svg>
                          : item.type === 'audio'
                            ? <img src={FILTER_ICONS.audio} alt="" width={28} height={28} />
                            : <span style={{ fontSize: 26 }}>📝</span>
                      }
                    </div>

                    {/* Info — só data, sem nome */}
                    <div className={styles.trashItemInfo}>
                      <p className={styles.trashItemDate} style={{ marginTop: 0 }}>Excluído em {deletedDate}</p>
                    </div>

                    {/* Ações */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <button className={styles.trashRestoreBtn} onClick={() => setTrashConfirm({ type: 'restore', id: item.id, title: item.title })}>
                        Restaurar
                      </button>
                      <button className={styles.trashDeleteBtn} onClick={() => setTrashConfirm({ type: 'delete', id: item.id, title: item.title })}>
                        Excluir
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Modal de confirmação */}
              {trashConfirm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                  <div style={{ background: 'var(--bege-claro)', borderRadius: 16, padding: 24, width: 300, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>
                      {trashConfirm.type === 'restore' ? '↩️' : '🗑️'}
                    </p>
                    <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                      {trashConfirm.type === 'restore' ? 'Restaurar item?' :
                       trashConfirm.type === 'deleteAll' ? 'Esvaziar lixeira?' : 'Excluir permanentemente?'}
                    </p>
                    <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
                      {trashConfirm.type === 'restore'
                        ? `"${trashConfirm.title || 'Este item'}" voltará para suas memórias.`
                        : trashConfirm.type === 'deleteAll'
                        ? `${trashConfirm.count} itens serão apagados para sempre.`
                        : `"${trashConfirm.title || 'Este item'}" será apagado para sempre.`}
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => setTrashConfirm(null)}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 99, border: '1.5px solid #ccc', background: 'transparent', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={confirmTrashAction}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 99, border: 'none', background: trashConfirm.type === 'restore' ? 'var(--verde)' : '#e53935', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
                      >
                        {trashConfirm.type === 'restore' ? 'Restaurar' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
        )}

        {/* ══ TAB: Galeria ══ */}
        {activeTab === 'galeria' && (<>

        {/* ── Busca ── */}
        <div className={styles.searchBar}>
          <span aria-hidden="true" style={{ fontSize: 18 }}>🔍</span>
          <input
            className={styles.searchInput}
            placeholder="Buscar por título, pessoa, lugar..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Buscar memórias"
          />
          {query && (
            <button className={styles.searchClear} onClick={() => setQuery('')} aria-label="Limpar busca">
              ✕
            </button>
          )}
        </div>

        {/* ── Filtros por tipo ── */}
        <div className={styles.filters} role="tablist" aria-label="Filtrar por tipo">
          {FILTERS.map(f => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`${styles.chip} ${filter === f.id ? styles.chipActive : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.id !== 'all' && (
                <img src={FILTER_ICONS[f.id]} alt="" aria-hidden="true" width={15} height={15} className={styles.chipIcon} />
              )}
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Filtro de data ── */}
        <div className={styles.dateFilterRow}>
          <button
            className={`${styles.dateFilterBtn} ${(yearFilter || monthFilter) ? styles.dateFilterBtnActive : ''}`}
            onClick={() => setShowDatePicker(v => !v)}
            aria-expanded={showDatePicker}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {yearFilter
              ? monthFilter
                ? `${MONTHS_PT[Number(monthFilter) - 1]} ${yearFilter}`
                : yearFilter
              : 'Filtrar por data'}
          </button>

          {(yearFilter || monthFilter) && (
            <button
              className={styles.dateFilterClear}
              onClick={() => { setYearFilter(''); setMonthFilter(''); }}
              aria-label="Limpar filtro de data"
            >
              ✕
            </button>
          )}

          {/* Botão Trancar — oculto durante seleção múltipla */}
          {!selectMode && (
            <button
              className={`${styles.lockBtn} ${lockMode ? styles.lockBtnActive : ''}`}
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()); setLockMode(v => !v); setLockSelectedIds(new Set()) }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {lockMode ? 'Trancando...' : 'Trancar'}
            </button>
          )}
        </div>

        {/* Barra de trancar */}
        {lockMode && !selectMode && (
          <div className={styles.lockBar}>
            <span className={styles.lockBarText}>
              {lockSelectedIds.size} selecionado(s) — toque nas fotos para trancar
            </span>
            <button className={styles.lockBarBtn} onClick={handleLockPhotos} disabled={lockSelectedIds.size === 0}>
              Trancar
            </button>
            <button className={styles.lockBarCancel} onClick={() => { setLockMode(false); setLockSelectedIds(new Set()) }}>
              Cancelar
            </button>
          </div>
        )}

        {showDatePicker && (
          <div className={styles.datePicker}>
            <div className={styles.datePickerSection}>
              <p className={styles.datePickerLabel}>Ano</p>
              <div className={styles.datePickerOptions}>
                {availableYears.map(y => (
                  <button
                    key={y}
                    className={`${styles.dateOption} ${yearFilter === y ? styles.dateOptionActive : ''}`}
                    onClick={() => { setYearFilter(y); setMonthFilter(''); }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {yearFilter && (
              <div className={styles.datePickerSection}>
                <p className={styles.datePickerLabel}>Mês</p>
                <div className={styles.datePickerOptions}>
                  {MONTHS_PT.map((mo, i) => {
                    const val = String(i + 1).padStart(2, '0')
                    return (
                      <button
                        key={val}
                        className={`${styles.dateOption} ${monthFilter === val ? styles.dateOptionActive : ''}`}
                        onClick={() => { setMonthFilter(monthFilter === val ? '' : val); setShowDatePicker(false); }}
                      >
                        {mo.substring(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <button className={styles.datePickerClose} onClick={() => setShowDatePicker(false)}>
              Fechar
            </button>
          </div>
        )}

        {/* ── Resultados de busca ── */}
        {searchResults && (
          <div className={styles.searchResults}>
            <p className={styles.searchCount}>
              {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para &ldquo;{query}&rdquo;
            </p>
            {searchResults.filter(m => m.type !== 'text').map(m => {
              const src = getThumbSrc(m)
              return (
                <div
                  key={m.id}
                  className={styles.searchItem}
                  onClick={() => { setQuery(''); openViewer(m) }}
                  role="button"
                >
                  <div className={styles.searchThumb}>
                    {src && m.type === 'photo' && <img src={src} alt="" className={styles.searchThumbImg} />}
                    {src && m.type === 'video' && <video src={src} className={styles.searchThumbImg} muted playsInline preload="metadata" />}
                    {(!src || m.type === 'audio') && (
                      <img src={FILTER_ICONS[m.type] || FILTER_ICONS.photo} alt="" width={24} height={24} />
                    )}
                  </div>
                  <div>
                    <p className={styles.searchTitle}>{m.title || 'Sem título'}</p>
                    <p className={styles.searchDate}>{formatDate(m.date)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Barra de seleção múltipla ── */}
        {selectMode && (
          <div className={styles.selectionBar}>
            <span className={styles.selectionCount}>{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
            <div className={styles.selectionActions}>
              <button className={styles.selectionBtn} onClick={batchShare} disabled={selectedIds.size === 0}>
                Compartilhar
              </button>
              <button className={styles.selectionBtn} onClick={openMoveModal} disabled={selectedIds.size === 0}>
                Mover
              </button>
              <button className={styles.selectionBtn} onClick={async (e) => {
                e.stopPropagation()
                if (selectedIds.size === 0) return
                // Capturar IDs antes de qualquer mudança de estado
                const idsToLock = new Set(selectedIds)
                const uid = user?.uid || ''
                exitSelectMode()
                try {
                  let lockedFolder = await localDb.folders
                    .where('uid').equals(uid)
                    .and(f => f.name === 'Trancadas')
                    .first()
                  if (!lockedFolder) {
                    const folderId = await localDb.folders.add({
                      name: 'Trancadas',
                      emoji: '/icons/pasta-generica.svg',
                      isAuto: false,
                      autoRule: null,
                      uid,
                      order: 99,
                      createdAt: new Date().toISOString(),
                    })
                    lockedFolder = { id: folderId }
                  }
                  for (const id of idsToLock) {
                    await updateMemory(id, { privacyLevel: 'private', folderId: lockedFolder.id })
                  }
                  setMemories(prev => prev.filter(m => !idsToLock.has(m.id)))
                  toast.success(`${idsToLock.size} item(s) trancado(s)`)
                } catch {
                  toast.error('Erro ao trancar')
                }
              }} disabled={selectedIds.size === 0}>
                Trancar
              </button>
              <button className={`${styles.selectionBtn} ${styles.selectionBtnDanger}`} onClick={batchDelete} disabled={selectedIds.size === 0}>
                Excluir
              </button>
              <button className={styles.selectionBtnCancel} onClick={exitSelectMode}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Grid de memórias ── */}
        {!query && (
          <>
            {filteredMemories.length === 0 && (
              <div className={styles.emptyState}>
                <span>📷</span>
                <p>Nenhuma memória aqui ainda</p>
                <p className={styles.emptySub}>Adicione fotos, vídeos ou áudios pelo botão +</p>
              </div>
            )}

            {grouped.map(([key, { label, items }]) => (
              <div key={key} className={styles.yearBlock}>
                <h3 className={styles.yearTitle}>
                  {label}
                  <span className={styles.yearCount}> ({items.length})</span>
                </h3>
                <div className={styles.yearGrid}>
                  {items.map(m => <GridItem key={m.id} memory={m} />)}
                </div>
              </div>
            ))}
          </>
        )}

        </>)}
      </div>

      {/* ── Viewer fullscreen ── */}
      {viewerOpen && currentMemory && (
        <div
          className={styles.viewer}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de memória"
        >
          {/* Fundo escuro para fechar */}
          <div className={styles.viewerBackdrop} onClick={closeViewer} />

          {/* Imagem / Vídeo / Áudio */}
          <div className={styles.viewerMedia}>
            {(thumbUrls[currentMemory.id] || currentMemory.fileUrl) && currentMemory.type === 'photo' && (
              <img
                src={thumbUrls[currentMemory.id] || currentMemory.fileUrl}
                alt={currentMemory.title || ''}
                className={styles.viewerImg}
              />
            )}
            {currentMemory.type === 'video' && (() => {
              const videoSrc = currentMemory.fileUrl ||
                (currentMemory.fileBlob instanceof Blob ? URL.createObjectURL(currentMemory.fileBlob) : null) ||
                thumbUrls[currentMemory.id] || null
              return videoSrc ? (
                <video
                  key={currentMemory.id}
                  src={videoSrc}
                  controls
                  playsInline
                  preload="metadata"
                  className={styles.viewerImg}
                  style={{ maxHeight: '70vh', width: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div className={styles.thumbPlaceholder}>
                  <span style={{ fontSize: 48 }}>🎬</span>
                  <span>Vídeo não disponível</span>
                </div>
              )
            })()}
            {currentMemory.type === 'audio' && (
              <div className={styles.viewerAudio}>
                <img src={FILTER_ICONS.audio} alt="" width={64} height={64} aria-hidden="true" />
                {(thumbUrls[currentMemory.id] || currentMemory.fileUrl) && (
                  <audio
                    src={thumbUrls[currentMemory.id] || currentMemory.fileUrl}
                    controls
                    autoPlay
                    className={styles.audioPlayer}
                  />
                )}
              </div>
            )}
          </div>

          {/* Navegação anterior / próximo */}
          {viewerIndex > 0 && (
            <button className={`${styles.navBtn} ${styles.navBtnLeft}`} onClick={goPrev} aria-label="Anterior">
              <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
          )}
          {viewerIndex < viewerList.length - 1 && (
            <button className={`${styles.navBtn} ${styles.navBtnRight}`} onClick={goNext} aria-label="Próximo">
              <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          )}

          {/* Barra superior do viewer */}
          <div className={styles.viewerTopBar}>
            <button className={styles.viewerIconBtn} onClick={closeViewer} aria-label="Fechar">
              <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <span className={styles.viewerCounter}>
              {viewerIndex + 1} / {viewerList.length}
            </span>

            <div className={styles.viewerTopActions}>
              <button
                className={styles.viewerIconBtn}
                onClick={() => toggleMemoryPrivacy(currentMemory)}
                aria-label={currentMemory.privacyLevel === 'public' ? 'Tornar privado' : 'Tornar público'}
                title={currentMemory.privacyLevel === 'public' ? 'Público' : 'Privado'}
              >
                <span style={{ fontSize: 18 }}>{currentMemory.privacyLevel === 'public' ? '🌐' : '🔒'}</span>
              </button>
              <button
                className={styles.viewerIconBtn}
                onClick={() => shareMemory(currentMemory)}
                aria-label="Partilhar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="22" height="22">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
              <button
                className={styles.viewerIconBtn}
                onClick={() => downloadMemory(currentMemory)}
                aria-label="Guardar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="22" height="22">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Info inferior */}
          <div className={styles.viewerInfo}>
            {currentMemory.title && (
              <p className={styles.viewerTitle}>{currentMemory.title}</p>
            )}
            {currentMemory.date && (
              <p className={styles.viewerDate}>{formatDate(currentMemory.date)}</p>
            )}
            {currentMemory.description && (
              <p className={styles.viewerDesc}>{currentMemory.description}</p>
            )}
            {currentMemory.tags?.length > 0 && (
              <div className={styles.detailTags}>
                {currentMemory.tags.map(t => (
                  <span key={t} className={styles.detailTag}>#{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Viewer de pasta ── */}
      {folderViewerOpen && folderMemories[folderViewerIndex] && (() => {
        const mem = folderMemories[folderViewerIndex]
        const src = folderThumbUrls[mem.id] || mem.fileUrl || null
        return (
          <div className={styles.viewer} role="dialog" aria-modal="true">
            <div className={styles.viewerBackdrop} onClick={() => setFolderViewerOpen(false)} />
            <div className={styles.viewerMedia}>
              {src && mem.type === 'photo' && (
                <img src={src} alt={mem.title || ''} className={styles.viewerImg} />
              )}
              {src && mem.type === 'video' && (
                <video src={src} controls autoPlay className={styles.viewerImg} />
              )}
            </div>
            {folderViewerIndex > 0 && (
              <button className={`${styles.navBtn} ${styles.navBtnLeft}`} onClick={() => setFolderViewerIndex(i => i - 1)} aria-label="Anterior">
                <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
              </button>
            )}
            {folderViewerIndex < folderMemories.length - 1 && (
              <button className={`${styles.navBtn} ${styles.navBtnRight}`} onClick={() => setFolderViewerIndex(i => i + 1)} aria-label="Próximo">
                <svg viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
              </button>
            )}
            <div className={styles.viewerTopBar}>
              <button className={styles.viewerIconBtn} onClick={() => setFolderViewerOpen(false)} aria-label="Fechar">
                <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              </button>
              <span className={styles.viewerCounter}>{folderViewerIndex + 1} / {folderMemories.length}</span>
              <div className={styles.viewerTopActions} />
            </div>
            <div className={styles.viewerInfo}>
              {mem.title && <p className={styles.viewerTitle}>{mem.title}</p>}
              {mem.date && <p className={styles.viewerDate}>{mem.date}</p>}
            </div>
          </div>
        )
      })()}

      {/* ── Modal mover para pasta ── */}
      {showMoveModal && (
        <div className={styles.moveModalOverlay} onClick={() => setShowMoveModal(false)}>
          <div className={styles.moveModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.moveModalTitle}>Mover para pasta</h3>
            <div className={styles.moveModalList}>
              {folders.map(f => (
                <button
                  key={f.id}
                  className={styles.moveModalItem}
                  onClick={() => batchMoveToFolder(f.id)}
                >
                  <img src={f.emoji} alt="" width={24} height={24} aria-hidden="true" />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <button className={styles.moveModalCancel} onClick={() => setShowMoveModal(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal PIN para pasta Trancadas */}
      {showPinModal && (
        <PinLockModal
          uid={user?.uid}
          onClose={() => { setShowPinModal(false); setPendingFolder(null) }}
          onUnlock={() => {
            setShowPinModal(false)
            if (pendingFolder) openFolderDirectly(pendingFolder)
            setPendingFolder(null)
          }}
        />
      )}
    </div>
  )
}