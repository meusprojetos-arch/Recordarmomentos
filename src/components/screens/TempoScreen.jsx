/**
 * TempoScreen — Galeria de Fotos e Vídeos
 *
 * Exibe memórias de mídia (foto, vídeo, áudio) em grid de 3 colunas,
 * com visualizador fullscreen, navegação por swipe, seleção múltipla,
 * filtros por tipo e filtro por data (ano/mês).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getMemories, deleteMemory, updateMemory, getTrashItems, restoreFromTrash, permanentDeleteFromTrash, bulkPermanentDeleteFromTrash } from '../../services/memoriesService.js'
import { db as localDb, SYSTEM_FOLDERS, AI_FOLDERS } from '../../db/database.js'
import { auth } from '../../firebase.js'
import Topbar from '../layout/Topbar.jsx'
import FolderGrid from '../ui/FolderGrid.jsx'
import LazyImage from '../ui/LazyImage.jsx'
import MemoryGridItem from '../ui/MemoryGridItem.jsx'
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

export default function TempoScreen({ pendingMemories }) {
  // Tab ativa: galeria | pastas | lixeira
  const [activeTab, setActiveTab]       = useState('galeria')

  const [memories, setMemories]         = useState([])
  const [allMemories, setAllMemories]   = useState([]) // inclui trancadas, para contagens
  const [thumbUrls, setThumbUrls]       = useState({})
  const [filter, setFilter]             = useState('all')
  const [highlightFolderId, setHighlightFolderId] = useState(null)

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
  const [viewerDeleteConfirm, setViewerDeleteConfirm] = useState(false) // confirmação de lixeira no viewer

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

  // Capa dinâmica das pastas: folderId → URL da primeira foto
  const [folderCovers, setFolderCovers] = useState({})
  const folderCoverObjUrls = useRef([]) // objectURLs criados para blobs locais (cleanup)

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

  // Ref do container de scroll da galeria
  const scrollRef = useRef(null)

  // ── Carregamento de memórias ───────────────────────────────────────────────

  // Carrega o id da pasta Destaques do IndexedDB (rápido, local)
  const loadHighlightFolderId = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid || ''
      const destaqueFolder = await localDb.folders
        .filter(f => f.autoRule === 'isHighlight:true' && (!f.uid || f.uid === '' || f.uid === uid))
        .first()
      if (destaqueFolder) setHighlightFolderId(destaqueFolder.id)
    } catch {}
  }, [user?.uid])

  const loadMemories = useCallback(async () => {
    try {
      // Uma única chamada incluindo trancadas — evita 2 roundtrips ao Firestore
      const all = await getMemories({ includeLocked: true })
      setAllMemories(all)
      setMemories(all.filter(m => m.isLocked !== true))

      // Contagem por pasta
      const countMap = {}

      // Pastas de usuário: folderId (legado) + folderIds (novo, multi-pasta)
      for (const m of all) {
        if (m.folderId) countMap[m.folderId] = (countMap[m.folderId] || 0) + 1
        if (Array.isArray(m.folderIds)) {
          for (const fid of m.folderIds) {
            countMap[fid] = (countMap[fid] || 0) + 1
          }
        }
      }

      // Pastas IA: conta por tags
      for (const f of AI_FOLDERS) {
        countMap[f.id] = all.filter(m =>
          Array.isArray(m.tags) && m.tags.includes(f.tag)
        ).length
      }

      // Pastas sistema
      countMap['favoritos'] = all.filter(m => m.isHighlight === true).length
      // 'trancados' não conta aqui (itens trancados já foram filtrados)

      setMemoryCounts(countMap)

      // ── Capas dinâmicas das pastas ─────────────────────────────────────
      // Revogar objectURLs antigos antes de criar novos
      for (const u of folderCoverObjUrls.current) {
        try { URL.revokeObjectURL(u) } catch {}
      }
      folderCoverObjUrls.current = []

      const coverMap = {}

      // Helper: retorna uma URL usável para uma memória
      const getMemUrl = (m) => {
        if (m.fileUrl) return m.fileUrl
        if (m.fileBlob instanceof Blob) {
          const u = URL.createObjectURL(m.fileBlob)
          folderCoverObjUrls.current.push(u)
          return u
        }
        return null
      }

      // Só fotos e vídeos têm capa visual
      const photoMems = all.filter(m => m.type === 'photo' || m.type === 'video')

      for (const m of photoMems) {
        // Pastas de usuário — folderId (legado)
        if (m.folderId && !coverMap[m.folderId]) {
          const u = getMemUrl(m)
          if (u) coverMap[m.folderId] = u
        }
        // Pastas de usuário — folderIds (multi-pasta)
        if (Array.isArray(m.folderIds)) {
          for (const fid of m.folderIds) {
            if (!coverMap[fid]) {
              const u = getMemUrl(m)
              if (u) coverMap[fid] = u
            }
          }
        }
        // Pastas de IA — por tags
        for (const f of AI_FOLDERS) {
          if (!coverMap[f.id] && Array.isArray(m.tags) && m.tags.includes(f.tag)) {
            const u = getMemUrl(m)
            if (u) coverMap[f.id] = u
          }
        }
        // Favoritos
        if (!coverMap['favoritos'] && m.isHighlight) {
          const u = getMemUrl(m)
          if (u) coverMap['favoritos'] = u
        }
        // Trancados
        if (!coverMap['trancados'] && m.isLocked) {
          const u = getMemUrl(m)
          if (u) coverMap['trancados'] = u
        }
      }

      setFolderCovers(coverMap)
    } catch (e) {
      console.error(e)
    }
  }, [user?.uid])

  // Contagem de Destaques derivada reativamente: atualiza sempre que allMemories muda,
  // sem precisar de nova chamada ao Firestore
  useEffect(() => {
    if (!highlightFolderId) return
    const count = allMemories.filter(m => m.isHighlight === true).length
    setMemoryCounts(prev => ({ ...prev, [highlightFolderId]: count }))
  }, [allMemories, highlightFolderId])

  useEffect(() => {
    // highlightFolderId carrega do IndexedDB local — rápido
    loadHighlightFolderId()
    // memórias carregam do Firestore — mais lento, mas só 1 roundtrip agora
    loadMemories()
  }, [loadMemories, loadHighlightFolderId])

  // Abrir pasta e carregar suas memórias
  const handleOpenFolder = async (folder) => {
    // Se for pasta Trancados e tem PIN configurado, pedir PIN
    if (folder.rule === 'isLocked' || folder.id === 'trancados') {
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
      const type = folder.folderType || 'user'
      const isLockedFolder = type === 'system' && folder.rule === 'isLocked'

      const mems = await getMemories({
        includeLocked: isLockedFolder,
        onlyLocked: isLockedFolder,
      })

      let folderMems
      if (isLockedFolder) {
        folderMems = mems // já filtrou só trancadas
      } else if (type === 'system' && folder.rule === 'isHighlight') {
        folderMems = mems.filter(m => m.isHighlight === true)
      } else if (type === 'ai') {
        // Pasta IA — filtra por tag
        folderMems = mems.filter(m => Array.isArray(m.tags) && m.tags.includes(folder.tag))
      } else {
        // Pasta do usuário — suporta folderId legado + folderIds novo
        folderMems = mems.filter(m =>
          m.folderId === folder.id ||
          (Array.isArray(m.folderIds) && m.folderIds.includes(folder.id))
        )
      }
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

    // Injetar nova memória diretamente no estado — acumula sem substituir
    const handleMemoryAdded = (e) => {
      const newMem = e.detail
      if (!newMem) return
      setMemories(prev => {
        if (prev.find(m => m.id === newMem.id)) return prev
        return [newMem, ...prev]
      })
      // Mantém allMemories em sincronia para contagem correta de Destaques
      setAllMemories(prev => {
        if (prev.find(m => m.id === newMem.id)) return prev
        return [newMem, ...prev]
      })
    }

    const handleNavReclick = (e) => {
      if (e.detail?.tab === 'tempo' && scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('memories-updated', handleUpdate)
    window.addEventListener('memory-added', handleMemoryAdded)
    window.addEventListener('nav-tab-reclick', handleNavReclick)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('memories-updated', handleUpdate)
      window.removeEventListener('memory-added', handleMemoryAdded)
      window.removeEventListener('nav-tab-reclick', handleNavReclick)
    }
  }, [loadMemories])

  // ── Geração de URLs de blob (SOB DEMANDA via LazyImage) ───────────────────
  //
  // Antes: criávamos URL.createObjectURL pra TODAS as memórias de uma vez
  // (consumia memória proporcional ao total de fotos do usuário).
  //
  // Agora: o componente LazyImage cria a URL SÓ quando a foto entra/se aproxima
  // do viewport, e libera quando sai. Memória usada é proporcional só ao que
  // está visível na tela (~constante, não cresce com a galeria).
  //
  // Mantemos thumbUrls como CACHE: depois que LazyImage resolve uma URL do
  // Firebase (filePath → getDownloadURL), guardamos pra não chamar de novo.
  useEffect(() => {
    // Gera URLs para TODAS as memórias com blob local, igual ao que openFolderDirectly faz.
    // Isso garante que thumbUrls[id] funcione tanto nos thumbnails como no viewer fullscreen.
    const urls = {}
    const createdBlobUrls = [] // para revogar no cleanup e evitar leak

    for (const m of memories) {
      if (m._objectUrl) {
        urls[m.id] = m._objectUrl
      } else if (m.fileUrl) {
        urls[m.id] = m.fileUrl
      } else if (m.fileBlob) {
        try {
          const isMedia = m.type === 'photo' || m.type === 'video'
          if (!isMedia) continue
          const mimeType = m.type === 'video' ? 'video/mp4' : 'image/jpeg'
          const blob = m.fileBlob instanceof Blob
            ? m.fileBlob
            : new Blob([m.fileBlob], { type: mimeType })
          const url = URL.createObjectURL(blob)
          urls[m.id] = url
          createdBlobUrls.push(url)
        } catch { /* skip */ }
      }
    }

    setThumbUrls(urls)

    // Limpar resolver cache para que novos resolvers usem as URLs frescas
    resolverCacheRef.current.clear()

    return () => {
      // Revogar apenas as blob URLs criadas aqui (Firebase URLs não precisam de revoke)
      createdBlobUrls.forEach(u => URL.revokeObjectURL(u))
    }
  }, [memories])

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
    const action = trashConfirm
    setTrashConfirm(null) // fecha o modal imediatamente
    if (action.type === 'delete') {
      const itemData = trashItems.find(i => i.id === action.id) || null
      setTrashItems(prev => prev.filter(i => i.id !== action.id))
      permanentDeleteFromTrash(action.id, itemData).catch(err => {
        console.error('[lixeira] erro ao excluir:', err)
        loadTrash()
      })
      toast.success('Item excluído permanentemente')
    } else if (action.type === 'restore') {
      await handleRestore(action.id)
      toast.success('Item restaurado!')
    } else if (action.type === 'deleteAll') {
      const itemsToDelete = [...trashItems]
      setTrashItems([])
      toast.success('Lixeira esvaziada!')
      bulkPermanentDeleteFromTrash(itemsToDelete).catch(err => {
        console.error('[lixeira] erro ao esvaziar:', err)
        // Recarrega para refletir estado real se algo falhou
        loadTrash()
      })
    }
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

  // Mantém ref da lista filtrada atualizada para o range-select por índice
  useEffect(() => { filteredMemoriesRef.current = filteredMemories }, [filteredMemories])

  // ── Viewer: lista plana navegável ──────────────────────────────────────────

  const viewerList = useMemo(() => filteredMemories, [filteredMemories])

  function openViewer(memory) {
    const idx = viewerList.findIndex(m => m.id === memory.id)
    if (idx === -1) return
    setViewerIndex(idx)
    setViewerOpen(true)
    resetViewerZoom()
    // Volta o scroll da galeria para o topo ao abrir o viewer
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  function closeViewer() {
    setViewerOpen(false)
    setSelectMode(false)
    setSelectedIds(new Set())
    resetViewerZoom()
  }

  function goNext() {
    setViewerIndex(i => Math.min(i + 1, viewerList.length - 1))
    resetViewerZoom()
  }

  function goPrev() {
    setViewerIndex(i => Math.max(i - 1, 0))
    resetViewerZoom()
  }

  // ── Zoom / Pan do viewer ─────────────────────────────────────────────────
  const [vZoom, setVZoom] = useState(1)
  const [vPan,  setVPan]  = useState({ x: 0, y: 0 })
  const vZoomRef = useRef(1)
  const vPanRef  = useRef({ x: 0, y: 0 })
  const zg = useRef({
    pinching: false, startDist: 0, startScale: 1,
    panning: false,  panStartX: 0, panStartY: 0, panBaseX: 0, panBaseY: 0,
    lastTapTime: 0,  swipeStartX: 0,
    mousePanning: false, mousePanStartX: 0, mousePanStartY: 0,
  })

  function resetViewerZoom() {
    vZoomRef.current = 1
    vPanRef.current  = { x: 0, y: 0 }
    setVZoom(1)
    setVPan({ x: 0, y: 0 })
  }

  function clampPan(px, py, scale) {
    const maxX = Math.max(0, (scale - 1) * window.innerWidth  * 0.5)
    const maxY = Math.max(0, (scale - 1) * window.innerHeight * 0.4)
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    }
  }

  function applyZoom(newScale) {
    const s = Math.max(1, Math.min(5, newScale))
    vZoomRef.current = s
    setVZoom(s)
    if (s <= 1) { vPanRef.current = { x:0, y:0 }; setVPan({ x:0, y:0 }) }
  }

  // Touch no viewer — substitui os antigos onTouchStart/onTouchEnd
  function onViewerTouchStart(e) {
    const t = e.touches
    if (t.length === 2) {
      zg.current.pinching = true
      zg.current.panning  = false
      const dx = t[0].clientX - t[1].clientX
      const dy = t[0].clientY - t[1].clientY
      zg.current.startDist  = Math.sqrt(dx*dx + dy*dy) || 1
      zg.current.startScale = vZoomRef.current
      if (e.cancelable) e.preventDefault()
      return
    }
    if (t.length === 1) {
      const now = Date.now()
      // Double-tap: alterna zoom 1 ↔ 2.5
      if (now - zg.current.lastTapTime < 280) {
        zg.current.lastTapTime = 0
        if (vZoomRef.current > 1) resetViewerZoom()
        else applyZoom(2.5)
        return
      }
      zg.current.lastTapTime = now

      if (vZoomRef.current > 1) {
        // Pan
        zg.current.panning   = true
        zg.current.panStartX = t[0].clientX
        zg.current.panStartY = t[0].clientY
        zg.current.panBaseX  = vPanRef.current.x
        zg.current.panBaseY  = vPanRef.current.y
        if (e.cancelable) e.preventDefault()
      } else {
        // Swipe para navegar
        touchStartX.current = t[0].clientX
      }
    }
  }

  function onViewerTouchMove(e) {
    const t = e.touches
    if (zg.current.pinching && t.length === 2) {
      const dx = t[0].clientX - t[1].clientX
      const dy = t[0].clientY - t[1].clientY
      const dist = Math.sqrt(dx*dx + dy*dy)
      applyZoom(zg.current.startScale * (dist / zg.current.startDist))
      if (e.cancelable) e.preventDefault()
      return
    }
    if (zg.current.panning && t.length === 1) {
      const dx = t[0].clientX - zg.current.panStartX
      const dy = t[0].clientY - zg.current.panStartY
      const p = clampPan(zg.current.panBaseX + dx, zg.current.panBaseY + dy, vZoomRef.current)
      vPanRef.current = p
      setVPan(p)
      if (e.cancelable) e.preventDefault()
    }
  }

  function onViewerTouchEnd(e) {
    if (zg.current.pinching) {
      zg.current.pinching = false
      if (vZoomRef.current < 1.08) resetViewerZoom()
      return
    }
    if (zg.current.panning) {
      zg.current.panning = false
      return
    }
    // Swipe (só quando zoom = 1)
    if (vZoomRef.current <= 1 && e.changedTouches.length === 1 && touchStartX.current !== null) {
      const dx = e.changedTouches[0].clientX - touchStartX.current
      if (Math.abs(dx) > 50) { dx < 0 ? goNext() : goPrev() }
      touchStartX.current = null
    }
  }

  // Mouse wheel zoom (desktop)
  function onViewerWheel(e) {
    e.preventDefault()
    applyZoom(vZoomRef.current * (e.deltaY > 0 ? 0.88 : 1.14))
  }

  // Mouse drag para pan (desktop)
  function onViewerMouseDown(e) {
    if (e.button !== 0 || vZoomRef.current <= 1) return
    e.preventDefault()
    zg.current.mousePanning   = true
    zg.current.mousePanStartX = e.clientX
    zg.current.mousePanStartY = e.clientY

    const baseX = vPanRef.current.x
    const baseY = vPanRef.current.y

    function onMove(ev) {
      const p = clampPan(baseX + ev.clientX - zg.current.mousePanStartX,
                         baseY + ev.clientY - zg.current.mousePanStartY,
                         vZoomRef.current)
      vPanRef.current = p
      setVPan(p)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      zg.current.mousePanning = false
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Swipe handlers (legado — mantidos só para uso fora do viewer principal)
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) { dx < 0 ? goNext() : goPrev() }
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

  // ── Ref do elemento viewer + listeners não-passivos ───────────────────────
  // React registra onTouch* como passive por padrão, o que impede e.preventDefault().
  // Solução: registrar os listeners diretamente no DOM com { passive: false }.
  const viewerRef = useRef(null)
  const viewerHandlersRef = useRef({})
  // Atualiza os handlers na ref a cada render para sempre ter a versão mais recente
  viewerHandlersRef.current = { onViewerTouchStart, onViewerTouchMove, onViewerTouchEnd, onViewerWheel }

  useEffect(() => {
    if (!viewerOpen) return
    const el = viewerRef.current
    if (!el) return
    const h = viewerHandlersRef.current
    const start  = e => viewerHandlersRef.current.onViewerTouchStart(e)
    const move   = e => viewerHandlersRef.current.onViewerTouchMove(e)
    const end    = e => viewerHandlersRef.current.onViewerTouchEnd(e)
    const wheel  = e => viewerHandlersRef.current.onViewerWheel(e)
    el.addEventListener('touchstart',  start, { passive: false })
    el.addEventListener('touchmove',   move,  { passive: false })
    el.addEventListener('touchend',    end,   { passive: false })
    el.addEventListener('touchcancel', end,   { passive: false })
    el.addEventListener('wheel',       wheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart',  start)
      el.removeEventListener('touchmove',   move)
      el.removeEventListener('touchend',    end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('wheel',       wheel)
    }
  }, [viewerOpen])

  // ── Seleção múltipla ───────────────────────────────────────────────────────

  // Posição inicial do toque pra detectar se virou scroll (não seleção)
  const longPressStart = useRef({ x: 0, y: 0 })
  const LONG_PRESS_MOVE_THRESHOLD = 10 // px — qualquer movimento maior cancela

  function startLongPress(memory, event) {
    // Captura posição inicial pra detectar scroll
    const touch = event?.touches?.[0]
    if (touch) {
      longPressStart.current = { x: touch.clientX, y: touch.clientY }
    } else {
      longPressStart.current = { x: 0, y: 0 }
    }
    longPressTimer.current = setTimeout(() => {
      setLockMode(false)
      setLockSelectedIds(new Set())
      setSelectMode(true)
      setSelectedIds(new Set([memory.id]))
      // ATIVA drag-to-select com auto-scroll (dedo já pressionado)
      beginDragSelect(memory, 'add')
    }, 500)
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer.current)
  }

  // Cancela long-press se o dedo se moveu mais que o threshold (= usuário tá rolando)
  function cancelLongPressOnMove(event) {
    const touch = event?.touches?.[0]
    if (!touch) return
    const dx = Math.abs(touch.clientX - longPressStart.current.x)
    const dy = Math.abs(touch.clientY - longPressStart.current.y)
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      clearTimeout(longPressTimer.current)
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ─── Drag-to-select estilo Google Photos (gerenciado pelo CONTAINER) ─────
  //
  // Toda a lógica de toque vive aqui (no container .yearGrid), não nas fotos.
  // Isso é mais simples e robusto: um único conjunto de listeners gerencia
  // tudo via elementFromPoint pra descobrir qual foto está sob o dedo.
  //
  const selectModeRef = useRef(false)
  useEffect(() => { selectModeRef.current = selectMode }, [selectMode])
  const selectedIdsRef = useRef(selectedIds)
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
  const memoriesRef = useRef(memories)
  useEffect(() => { memoriesRef.current = memories }, [memories])
  // Ref para filteredMemories — necessário para range-select por índice
  const filteredMemoriesRef = useRef([])

  // Ref que sempre aponta para os handlers atuais — permite useEffect([], []) estável
  // enquanto os handlers lêem estado reativo via closure frescos a cada render.
  const touchHandlersRef = useRef({})

  const drag = useRef({
    touchActive: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    startId: null,
    startIndex: -1,        // índice da foto âncora na lista filtrada
    preSelection: new Set(), // seleção antes do drag começar
    longPressArmed: false,
    longPressTimer: null,
    moved: false,
    dragActive: false,
    mode: 'add',
    lastX: 0,
    lastY: 0,
    scrollRaf: null,
  })

  function getMemoryIdFromPoint(x, y) {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const node = el.closest('[data-memory-id]')
    return node ? node.getAttribute('data-memory-id') : null
  }

  // Seleção por range — seleciona TODAS as fotos entre a âncora e a posição atual
  function dragCheckCurrentPoint() {
    const id = getMemoryIdFromPoint(drag.current.lastX, drag.current.lastY)
    if (!id) return

    const mems = filteredMemoriesRef.current
    const startIdx = drag.current.startIndex
    if (startIdx === -1) return

    const currentIdx = mems.findIndex(m => m.id === id)
    if (currentIdx === -1) return

    const minIdx = Math.min(startIdx, currentIdx)
    const maxIdx = Math.max(startIdx, currentIdx)

    // Aplica o range sobre a seleção pré-drag (reversível se voltar o dedo)
    setSelectedIds(() => {
      const next = new Set(drag.current.preSelection)
      for (let i = minIdx; i <= maxIdx; i++) {
        const memId = mems[i]?.id
        if (!memId) continue
        if (drag.current.mode === 'add') next.add(memId)
        else next.delete(memId)
      }
      return next
    })
  }

  function startDragMode(initialId) {
    const mems = filteredMemoriesRef.current
    const startIdx = mems.findIndex(m => m.id === initialId)
    const wasSelected = selectedIdsRef.current.has(initialId)

    drag.current.dragActive = true
    drag.current.startIndex = startIdx
    drag.current.startId = initialId
    drag.current.mode = wasSelected ? 'remove' : 'add'
    // Salva o estado de seleção pré-drag para que o range seja reversível
    drag.current.preSelection = new Set(selectedIdsRef.current)

    // Aplica a foto âncora imediatamente
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (drag.current.mode === 'add') next.add(initialId)
      else next.delete(initialId)
      return next
    })
    try { navigator.vibrate?.(15) } catch {}
    if (!drag.current.scrollRaf) {
      drag.current.scrollRaf = requestAnimationFrame(autoScrollLoop)
    }
  }

  function autoScrollLoop() {
    if (!drag.current.dragActive) {
      drag.current.scrollRaf = null
      return
    }
    const SCROLL_ZONE = 110
    const MAX_SPEED = 16
    const y = drag.current.lastY
    const container = scrollRef.current
    if (!container) {
      drag.current.scrollRaf = requestAnimationFrame(autoScrollLoop)
      return
    }
    const rect = container.getBoundingClientRect()
    let delta = 0
    if (y < rect.top + SCROLL_ZONE) {
      delta = -MAX_SPEED * ((SCROLL_ZONE - (y - rect.top)) / SCROLL_ZONE)
    } else if (y > rect.bottom - SCROLL_ZONE) {
      delta = MAX_SPEED * ((y - (rect.bottom - SCROLL_ZONE)) / SCROLL_ZONE)
    }
    if (delta !== 0) {
      container.scrollBy(0, delta)
      dragCheckCurrentPoint()
    }
    drag.current.scrollRaf = requestAnimationFrame(autoScrollLoop)
  }

  // ── Handlers do container do grid ────────────────────────────────────────────
  //
  // Estratégia:
  //  • Fora do selectMode  → scroll nativo (rápido), long-press de 600ms entra no modo
  //  • Em selectMode       → touch-action:none no container (veja JSX abaixo),
  //                          então o browser não interfere e o drag funciona em
  //                          QUALQUER direção sem precisar de e.preventDefault().
  //                          Tap curto (< 500ms, < 10px) → toggle no touchend.
  //                          Movimento > 10px → drag-to-select imediato.
  //
  function onContainerTouchStart(e) {
    const t = e.touches[0]
    if (!t) return
    const id = getMemoryIdFromPoint(t.clientX, t.clientY)
    if (!id) return

    drag.current.touchActive = true
    drag.current.startX    = t.clientX
    drag.current.startY    = t.clientY
    drag.current.lastX     = t.clientX
    drag.current.lastY     = t.clientY
    drag.current.startTime = Date.now()
    drag.current.startId   = id
    drag.current.moved     = false
    drag.current.dragActive = false

    if (selectModeRef.current) {
      // Em selectMode: guarda snapshot da seleção para uso no drag
      drag.current.preSelection  = new Set(selectedIdsRef.current)
      drag.current.longPressArmed = false
      // Sem toggle antecipado — o toggle acontece no touchend (tap intencional)
    } else {
      // Fora do selectMode: long-press entra no modo e inicia drag
      drag.current.longPressArmed = true
      drag.current.preSelection   = new Set()
      clearTimeout(drag.current.longPressTimer)
      drag.current.longPressTimer = setTimeout(() => {
        if (!drag.current.longPressArmed) return
        setLockMode(false)
        setLockSelectedIds(new Set())
        setSelectMode(true)
        setSelectedIds(new Set([id]))
        startDragMode(id)
      }, 600)
    }
  }

  function onContainerTouchMove(e) {
    if (!drag.current.touchActive) return
    const t = e.touches[0]
    if (!t) return
    drag.current.lastX = t.clientX
    drag.current.lastY = t.clientY

    if (drag.current.dragActive) {
      // Drag ativo em selectMode: touch-action:none já bloqueou o scroll nativo.
      // Fora do selectMode (long-press drag): precisa de preventDefault.
      if (!selectModeRef.current) e.preventDefault()
      dragCheckCurrentPoint()
      return
    }

    const dx   = Math.abs(t.clientX - drag.current.startX)
    const dy   = Math.abs(t.clientY - drag.current.startY)
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (selectModeRef.current) {
      // Em selectMode com touch-action:none: qualquer movimento > 10px inicia drag
      // (o browser não vai rolar, então não precisamos distinguir direção)
      if (dist > 10) {
        drag.current.moved = true
        startDragMode(drag.current.startId)
      }
      return
    }

    // Fora do selectMode: cancela long-press se o dedo se moveu
    if (dist > 10) {
      drag.current.moved     = true
      drag.current.longPressArmed = false
      clearTimeout(drag.current.longPressTimer)
    }
  }

  function onContainerTouchEnd(e) {
    const elapsed    = Date.now() - drag.current.startTime
    const wasShortTap = drag.current.touchActive
                      && !drag.current.moved
                      && !drag.current.dragActive
                      && elapsed < 500

    drag.current.longPressArmed = false
    clearTimeout(drag.current.longPressTimer)

    if (wasShortTap && selectModeRef.current && drag.current.startId) {
      // Tap intencional em selectMode → toggle
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.has(drag.current.startId)
          ? next.delete(drag.current.startId)
          : next.add(drag.current.startId)
        return next
      })
    }

    if (wasShortTap && !selectModeRef.current && drag.current.startId) {
      // Tap fora do selectMode → abre viewer
      const mem = memoriesRef.current.find(m => m.id === drag.current.startId)
      if (mem) handleThumbClickRef.current?.(mem)
    }

    drag.current.touchActive = false
    drag.current.dragActive  = false
    drag.current.startIndex  = -1
    drag.current.preSelection = new Set()
    if (drag.current.scrollRaf) {
      cancelAnimationFrame(drag.current.scrollRaf)
      drag.current.scrollRaf = null
    }
  }

  // ── Atualiza o ref com os handlers desta renderização ───────────────────────
  // Os wrappers estáveis no useEffect chamam sempre a versão mais recente.
  touchHandlersRef.current.start  = onContainerTouchStart
  touchHandlersRef.current.move   = onContainerTouchMove
  touchHandlersRef.current.end    = onContainerTouchEnd

  // ── Listeners nativos no scrollRef com { passive: false } ───────────────────
  // Todos os quatro eventos ficam no mesmo elemento e no mesmo modo passivo,
  // eliminando qualquer discrepância entre React synthetic events e DOM events.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    // Wrappers estáveis — a referência da função nunca muda, mas o handler
    // chamado internamente é sempre o da renderização mais recente.
    const onStart  = (e) => touchHandlersRef.current.start(e)
    const onMove   = (e) => touchHandlersRef.current.move(e)
    const onEnd    = (e) => touchHandlersRef.current.end(e)
    container.addEventListener('touchstart',  onStart,  { passive: true  }) // passive: não precisa de preventDefault no touchstart
    container.addEventListener('touchmove',   onMove,   { passive: false }) // passive:false para bloquear scroll no long-press drag
    container.addEventListener('touchend',    onEnd,    { passive: false })
    container.addEventListener('touchcancel', onEnd,    { passive: false })
    return () => {
      container.removeEventListener('touchstart',  onStart)
      container.removeEventListener('touchmove',   onMove)
      container.removeEventListener('touchend',    onEnd)
      container.removeEventListener('touchcancel', onEnd)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Mouse handlers (desktop) — espelham a lógica de touch ────────────────
  function onContainerMouseDown(e) {
    if (e.button !== 0) return // só botão esquerdo
    const id = getMemoryIdFromPoint(e.clientX, e.clientY)
    if (!id) return

    drag.current.touchActive = true
    drag.current.startX = e.clientX
    drag.current.startY = e.clientY
    drag.current.lastX = e.clientX
    drag.current.lastY = e.clientY
    drag.current.startTime = Date.now()
    drag.current.startId = id
    drag.current.moved = false
    drag.current.longPressArmed = true

    clearTimeout(drag.current.longPressTimer)
    const delay = selectModeRef.current ? 250 : 500
    drag.current.longPressTimer = setTimeout(() => {
      if (!drag.current.longPressArmed) return
      if (!selectModeRef.current) {
        setLockMode(false)
        setLockSelectedIds(new Set())
        setSelectMode(true)
        setSelectedIds(new Set([id]))
      }
      startDragMode(id)
    }, delay)

    // Captura mousemove/mouseup no document para drag fora do container
    function handleMouseMove(ev) {
      if (!drag.current.touchActive) return
      drag.current.lastX = ev.clientX
      drag.current.lastY = ev.clientY

      if (!drag.current.dragActive) {
        const dx = Math.abs(ev.clientX - drag.current.startX)
        const dy = Math.abs(ev.clientY - drag.current.startY)
        if (dx > 8 || dy > 8) {
          drag.current.moved = true
          drag.current.longPressArmed = false
          clearTimeout(drag.current.longPressTimer)
        }
        return
      }
      // Drag ativo: previne seleção de texto e marca fotos
      ev.preventDefault()
      dragCheckCurrentPoint()
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      const wasShortClick = drag.current.touchActive
                         && !drag.current.moved
                         && !drag.current.dragActive
                         && (Date.now() - drag.current.startTime < 300)

      drag.current.longPressArmed = false
      clearTimeout(drag.current.longPressTimer)

      // Click rápido em selectMode = toggle
      if (wasShortClick && selectModeRef.current && drag.current.startId) {
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.has(drag.current.startId) ? next.delete(drag.current.startId) : next.add(drag.current.startId)
          return next
        })
      }

      // Click rápido fora de selectMode = abre viewer
      if (wasShortClick && !selectModeRef.current && drag.current.startId) {
        const mem = memoriesRef.current.find(m => m.id === drag.current.startId)
        if (mem) handleThumbClick(mem)
      }

      drag.current.touchActive = false
      drag.current.dragActive = false
      drag.current.startIndex = -1
      drag.current.preSelection = new Set()
      if (drag.current.scrollRaf) {
        cancelAnimationFrame(drag.current.scrollRaf)
        drag.current.scrollRaf = null
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Compat: handlers antigos no-op (lógica agora é no container)
  function startLongPress() {}
  function cancelLongPress() {}
  function cancelLongPressOnMove() {}
  function onGridPointerDown() {}
  function onGridPointerMove() {}
  function onGridPointerUp() {}

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setLockMode(false)
    setLockSelectedIds(new Set())
  }

  // Ref estável para handleThumbClick — usado nos listeners nativos
  const handleThumbClickRef = useRef(null)

  function handleThumbClick(memory) {
    if (lockMode) {
      toggleLockSelect(memory.id)
    } else if (selectMode) {
      toggleSelect(memory.id)
    } else {
      const hasSource = thumbUrls[memory.id]
        || memory.fileUrl
        || memory._objectUrl
        || !!memory.fileBlob
        || !!memory.thumbnail
      if (hasSource || memory.type === 'audio' || memory.type === 'text') {
        openViewer(memory)
      } else {
        toast('Arquivo indisponível. Re-adicione esta memória.')
      }
    }
  }

  // Mantém ref sempre atualizada (usada em listeners nativos para evitar closures stale)
  handleThumbClickRef.current = handleThumbClick

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

  // async function toggleMemoryPrivacy(memory) {
  //   const newLevel = memory.privacyLevel === 'public' ? 'private' : 'public'
  //   try {
  //     await updateMemory(memory.id, { privacyLevel: newLevel })
  //     setMemories(prev => prev.map(m => m.id === memory.id ? { ...m, privacyLevel: newLevel } : m))
  //     toast.success(newLevel === 'public' ? 'Agora é pública' : 'Agora é só sua')
  //   } catch { toast.error('Erro ao alterar') }
  // }

  async function toggleHighlight(memory) {
    const next = !memory.isHighlight
    try {
      await updateMemory(memory.id, { isHighlight: next })
      setMemories(prev => prev.map(m =>
        m.id === memory.id ? { ...m, isHighlight: next } : m
      ))
      toast.success(next ? '⭐ Adicionado aos Destaques!' : 'Removido dos Destaques')
    } catch {
      toast.error('Erro ao atualizar destaque')
    }
  }

  async function handleViewerDelete(memoryId, { fromFolder = false, knownData = null } = {}) {
    try {
      await deleteMemory(memoryId, knownData)
      if (fromFolder) {
        setFolderMemories(prev => {
          const updated = prev.filter(m => m.id !== memoryId)
          if (updated.length === 0) {
            setFolderViewerOpen(false)
          } else {
            setFolderViewerIndex(i => Math.min(i, updated.length - 1))
          }
          return updated
        })
      } else {
        setMemories(prev => {
          const updated = prev.filter(m => m.id !== memoryId)
          if (updated.length === 0) {
            setViewerOpen(false)
          } else {
            setViewerIndex(i => Math.min(i, updated.length - 1))
          }
          return updated
        })
      }
      setViewerDeleteConfirm(false)
      toast.success('Memória movida para a lixeira')
    } catch {
      toast.error('Erro ao excluir memória')
    }
  }

  // async function batchShare() {
  //   const items = Array.from(selectedIds)
  //   const files = []
  //   for (const id of items) {
  //     const m = memories.find(x => x.id === id)
  //     if (!m) continue
  //     const blob = m.fileBlob || null
  //     const url = thumbUrls[m.id] || m.fileUrl
  //     if (blob && blob instanceof Blob) {
  //       const ext = m.type === 'video' ? 'mp4' : 'jpg'
  //       files.push(new File([blob], `${m.title || 'memoria'}.${ext}`, { type: blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg') }))
  //     } else if (url) {
  //       try {
  //         const resp = await fetch(url)
  //         const b = await resp.blob()
  //         const ext = m.type === 'video' ? 'mp4' : 'jpg'
  //         files.push(new File([b], `${m.title || 'memoria'}.${ext}`, { type: b.type }))
  //       } catch { /* skip */ }
  //     }
  //   }
  //   if (files.length === 0) {
  //     toast.error('Nenhum arquivo disponível para compartilhar')
  //     exitSelectMode()
  //     return
  //   }
  //   if (navigator.canShare && navigator.canShare({ files })) {
  //     try {
  //       await navigator.share({ files, title: 'Memórias — Recordar' })
  //     } catch { /* cancelado pelo usuário */ }
  //   } else {
  //     for (const file of files) {
  //       const url = URL.createObjectURL(file)
  //       const a = document.createElement('a')
  //       a.href = url
  //       a.download = file.name
  //       a.click()
  //       URL.revokeObjectURL(url)
  //     }
  //     toast.success(`${files.length} arquivo(s) salvos`)
  //   }
  //   exitSelectMode()
  // }

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
      // Passa os dados já conhecidos para evitar getDoc por item — roda em paralelo
      const selectedMemories = memories.filter(m => selectedIds.has(m.id))
      await Promise.all(
        selectedMemories.map(m => deleteMemory(m.id, m))
      )
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

  async function batchMoveToFolder(targetFolder) {
    const count = selectedIds.size
    try {
      for (const id of selectedIds) {
        const mem = allMemories.find(m => m.id === id)
        if (!mem) continue
        // Adiciona à pasta sem remover das outras (metadados, sem duplicação)
        const existing = Array.isArray(mem.folderIds) ? mem.folderIds : []
        if (!existing.includes(targetFolder.id)) {
          await updateMemory(id, { folderIds: [...existing, targetFolder.id] })
        }
      }
      toast.success(`${count} item(s) adicionado(s) a "${targetFolder.name}"`)
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
      // Pasta local "Trancadas" só pra organização visual (FolderGrid). Opcional.
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

      // CRÍTICO: isLocked=true vai pro Firestore — sincroniza entre dispositivos
      for (const id of lockSelectedIds) {
        await updateMemory(id, {
          privacyLevel: 'private',
          folderId: lockedFolder.id,
          isLocked: true,
        })
      }

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

  // Resolve URL da foto SOB DEMANDA (chamado pelo LazyImage só quando entra no viewport)
  function makeResolver(memory) {
    return async () => {
      // 1) Já tem URL pronta (cache do state ou Firebase URL)
      const cached = thumbUrls[memory.id] || memory.fileUrl
      if (cached) return cached
      // 2) Tenta resolver do Firebase Storage pela filePath
      if (memory.filePath) {
        try {
          const { getDownloadURL, ref: sRef } = await import('firebase/storage')
          const { storage: st } = await import('../../firebase.js')
          const fresh = await getDownloadURL(sRef(st, memory.filePath))
          setThumbUrls(prev => ({ ...prev, [memory.id]: fresh }))
          return fresh
        } catch { /* segue pro blob local */ }
      }
      // 3) Blob local
      if (memory._objectUrl) return memory._objectUrl
      if (memory.thumbnail instanceof Blob) return URL.createObjectURL(memory.thumbnail)
      if (memory.fileBlob instanceof Blob) return URL.createObjectURL(memory.fileBlob)
      // fileBlob pode chegar como ArrayBuffer (desserialização do IndexedDB em alguns browsers)
      if (memory.fileBlob) {
        try {
          const mimeType = memory.type === 'video' ? 'video/mp4' : 'image/jpeg'
          return URL.createObjectURL(new Blob([memory.fileBlob], { type: mimeType }))
        } catch { /* segue */ }
      }
      return null
    }
  }

  // Cache de resolvers: garante que cada memory.id tem SEMPRE a mesma função
  // (sem isso, o React.memo do MemoryGridItem detecta "src novo" e re-renderiza)
  const resolverCacheRef = useRef(new Map())
  function getStableResolver(memory) {
    if (!resolverCacheRef.current.has(memory.id)) {
      resolverCacheRef.current.set(memory.id, makeResolver(memory))
    }
    return resolverCacheRef.current.get(memory.id)
  }

  // Wrapper minimalista — toda lógica de toque está no CONTAINER do grid.
  // O GridItem só recebe handlers de seleção via teclado/mouse (lock mode).
  function GridItem({ memory }) {
    const isSelected = selectedIds.has(memory.id)
    const isLockSelected = lockSelectedIds.has(memory.id)
    return (
      <MemoryGridItem
        memory={memory}
        isSelected={isSelected}
        isLockSelected={isLockSelected}
        selectMode={selectMode}
        lockMode={lockMode}
        resolver={getStableResolver(memory)}
        styles={styles}
        filterIcons={FILTER_ICONS}
        onPointerDown={(e) => {
          // Em lockMode: marca/desmarca direto (sem long-press)
          if (lockMode) {
            e.stopPropagation()
            handleThumbClick(memory)
          }
          // Em selectMode e fora dele: o container cuida via touch/mouse handlers
        }}
        onClick={(e) => {
          // Em lockMode o pointerDown já cuidou — bloqueia o click para não duplicar
          if (lockMode) { e.stopPropagation(); return }
          // No mouse o container (onMouseDown → handleMouseUp) já cuidou de abrir o viewer.
          // Este onClick é no-op para não duplicar a abertura.
        }}
        onTouchStart={() => {}}  // toque é gerenciado pelo container
        onTouchMove={() => {}}
        onTouchEnd={() => {}}
      />
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

      <div
        className={styles.scroll}
        ref={scrollRef}
        style={selectMode ? { touchAction: 'none' } : undefined}
      >

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
              <FolderGrid onOpenFolder={handleOpenFolder} memoryCounts={memoryCounts} folderCovers={folderCovers} />
            ) : (
              <div className={styles.folderView}>
                <button className={styles.folderBackBtn} onClick={() => setOpenFolder(null)}>
                  ← Voltar para pastas
                </button>
                <h3 className={styles.folderViewTitle}>
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

        {/* ── Barra de seleção múltipla ── */}
        {selectMode && (
          <div className={styles.selectionBar}>
            <span className={styles.selectionCount}>{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
            <div className={styles.selectionActions}>
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
                    await updateMemory(id, {
                      privacyLevel: 'private',
                      folderId: lockedFolder.id,
                      isLocked: true, // ← sincroniza entre dispositivos via Firestore
                    })
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
        {true && (
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
                {/* Toda a lógica de toque (tap, long-press, drag-to-select)
                    é gerenciada pelo container, não pelas fotos individuais.
                    Mais robusto: um único ponto controla tudo via elementFromPoint. */}
                <div
                  className={styles.yearGrid}
                  onMouseDown={onContainerMouseDown}
                  style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                >
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
          ref={viewerRef}
          className={styles.viewer}
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de memória"
          style={{ touchAction: vZoom > 1 ? 'none' : 'pan-y' }}
        >
          {/* Fundo escuro para fechar — só fecha se não estiver com zoom */}
          <div className={styles.viewerBackdrop} onClick={vZoom <= 1 ? closeViewer : undefined} />

          {/* Imagem / Vídeo / Áudio */}
          <div
            className={styles.viewerMedia}
            onMouseDown={onViewerMouseDown}
            style={{
              transform: `scale(${vZoom}) translate(${vPan.x / vZoom}px, ${vPan.y / vZoom}px)`,
              transformOrigin: 'center center',
              transition: zg.current.pinching || zg.current.panning || zg.current.mousePanning ? 'none' : 'transform 0.15s ease',
              cursor: vZoom > 1 ? 'grab' : 'default',
              willChange: 'transform',
            }}
          >
            {currentMemory.type === 'photo' && (() => {
              // Tenta resolver URL: thumbUrls (cache) → fileUrl → _objectUrl → fileBlob local
              let imgSrc = thumbUrls[currentMemory.id]
                || currentMemory.fileUrl
                || currentMemory._objectUrl
                || null

              if (!imgSrc && currentMemory.fileBlob) {
                try {
                  const blob = currentMemory.fileBlob instanceof Blob
                    ? currentMemory.fileBlob
                    : new Blob([currentMemory.fileBlob], { type: 'image/jpeg' })
                  imgSrc = URL.createObjectURL(blob)
                  // Cachear para não recriar em cada render
                  setThumbUrls(prev => ({ ...prev, [currentMemory.id]: imgSrc }))
                } catch { /* sem blob */ }
              }

              return imgSrc ? (
                <img
                  key={currentMemory.id}
                  src={imgSrc}
                  alt={currentMemory.title || ''}
                  className={styles.viewerImg}
                  onError={async e => {
                    // URL expirada — tentar renovar via filePath
                    if (currentMemory.filePath) {
                      try {
                        const { getDownloadURL, ref } = await import('firebase/storage')
                        const { storage } = await import('../../firebase.js')
                        const freshUrl = await getDownloadURL(ref(storage, currentMemory.filePath))
                        e.target.src = freshUrl
                        // Atualizar thumbUrls com URL fresca
                        setThumbUrls(prev => ({ ...prev, [currentMemory.id]: freshUrl }))
                      } catch {}
                    }
                  }}
                />
              ) : (
                <div className={styles.thumbPlaceholder}>
                  <span style={{ fontSize: 48 }}>📷</span>
                  <p style={{ color: '#fff', fontSize: 13, marginTop: 8 }}>Foto indisponível</p>
                </div>
              )
            })()}
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
            {currentMemory.type === 'audio' && (() => {
              const audioSrc = thumbUrls[currentMemory.id] || currentMemory.fileUrl ||
                (currentMemory.fileBlob instanceof Blob ? URL.createObjectURL(currentMemory.fileBlob) : null)
              return (
                <div className={styles.viewerAudio}>
                  <img src={FILTER_ICONS.audio} alt="" width={64} height={64} aria-hidden="true" />
                  <p style={{ color: '#fff', fontSize: 14, margin: '8px 0', textAlign: 'center', opacity: 0.8 }}>
                    {currentMemory.title || 'Áudio'}
                  </p>
                  {audioSrc ? (
                    <audio
                      key={currentMemory.id}
                      src={audioSrc}
                      controls
                      autoPlay
                      className={styles.audioPlayer}
                      style={{ width: '100%', marginTop: 8 }}
                    />
                  ) : (
                    <p style={{ color: '#f88', fontSize: 13, marginTop: 8 }}>Arquivo de áudio não encontrado</p>
                  )}
                </div>
              )
            })()}
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
              {/* ── Destaque ── */}
              <button
                className={styles.viewerIconBtn}
                onClick={() => toggleHighlight(currentMemory)}
                aria-label={currentMemory.isHighlight ? 'Remover dos Destaques' : 'Adicionar aos Destaques'}
                title={currentMemory.isHighlight ? 'Remover dos Destaques' : 'Adicionar aos Destaques'}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22" height="22"
                  fill={currentMemory.isHighlight ? '#FFD700' : 'none'}
                  stroke={currentMemory.isHighlight ? '#FFD700' : 'white'}
                  strokeWidth="2"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
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
              {/* ── Lixeira ── */}
              <button
                className={styles.viewerIconBtn}
                onClick={() => setViewerDeleteConfirm(true)}
                aria-label="Mover para lixeira"
                title="Mover para lixeira"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="22" height="22">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>

            {/* Modal de confirmação de exclusão no viewer */}
            {viewerDeleteConfirm && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setViewerDeleteConfirm(false)}>
                <div style={{ background: 'var(--bege-claro)', borderRadius: 16, padding: 24, width: 300, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                  <p style={{ fontSize: 32, marginBottom: 8 }}>🗑️</p>
                  <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Mover para lixeira?</p>
                  <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>A memória ficará na lixeira por 90 dias antes de ser apagada definitivamente.</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setViewerDeleteConfirm(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 99, border: '1.5px solid #ddd', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={() => handleViewerDelete(currentMemory.id, { knownData: currentMemory })} style={{ flex: 1, padding: '10px 0', borderRadius: 99, border: 'none', background: '#e53935', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Excluir</button>
                  </div>
                </div>
              </div>
            )}
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
              <div className={styles.viewerTopActions}>
                {/* Botão de destaque visível no viewer de qualquer pasta */}
                {(() => {
                  const mem = folderMemories[folderViewerIndex]
                  if (!mem) return null
                  return (
                    <button
                      className={styles.viewerIconBtn}
                      onClick={async () => {
                        const next = !mem.isHighlight
                        try {
                          await updateMemory(mem.id, { isHighlight: next })
                          // Atualiza folderMemories local
                          setFolderMemories(prev => {
                            const updated = prev.map(m =>
                              m.id === mem.id ? { ...m, isHighlight: next } : m
                            )
                            // Se estamos na pasta Destaques e removeu o destaque, tira da lista
                            if (!next && openFolder?.autoRule === 'isHighlight:true') {
                              const filtered = updated.filter(m => m.isHighlight === true)
                              if (folderViewerIndex >= filtered.length) {
                                setFolderViewerIndex(Math.max(0, filtered.length - 1))
                              }
                              if (filtered.length === 0) setFolderViewerOpen(false)
                              return filtered
                            }
                            return updated
                          })
                          // Atualiza também o estado principal
                          setMemories(prev => prev.map(m =>
                            m.id === mem.id ? { ...m, isHighlight: next } : m
                          ))
                          toast.success(next ? '⭐ Adicionado aos Destaques!' : 'Removido dos Destaques')
                        } catch {
                          toast.error('Erro ao atualizar destaque')
                        }
                      }}
                      aria-label={mem.isHighlight ? 'Remover dos Destaques' : 'Adicionar aos Destaques'}
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22"
                        fill={mem.isHighlight ? '#FFD700' : 'none'}
                        stroke={mem.isHighlight ? '#FFD700' : 'white'}
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  )
                })()}
                {/* ── Lixeira no viewer de pasta ── */}
                <button
                  className={styles.viewerIconBtn}
                  onClick={() => setViewerDeleteConfirm(true)}
                  aria-label="Mover para lixeira"
                  title="Mover para lixeira"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="22" height="22">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>

              {/* Modal de confirmação de exclusão no viewer de pasta */}
              {viewerDeleteConfirm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setViewerDeleteConfirm(false)}>
                  <div style={{ background: 'var(--bege-claro)', borderRadius: 16, padding: 24, width: 300, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>🗑️</p>
                    <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Mover para lixeira?</p>
                    <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>A memória ficará na lixeira por 90 dias antes de ser apagada definitivamente.</p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setViewerDeleteConfirm(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 99, border: '1.5px solid #ddd', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
                      <button onClick={() => handleViewerDelete(mem.id, { fromFolder: true, knownData: mem })} style={{ flex: 1, padding: '10px 0', borderRadius: 99, border: 'none', background: '#e53935', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Excluir</button>
                    </div>
                  </div>
                </div>
              )}
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
            <h3 className={styles.moveModalTitle}>Adicionar à pasta</h3>
            <div className={styles.moveModalList}>
              {folders.map(f => (
                <button
                  key={f.id}
                  className={styles.moveModalItem}
                  onClick={() => batchMoveToFolder(f)}
                >
                  <img src={f.emoji || '/icons/pasta-generica.svg'} alt="" width={24} height={24} aria-hidden="true" />
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