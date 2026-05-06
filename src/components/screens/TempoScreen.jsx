/**
 * TempoScreen — Galeria de Fotos e Vídeos
 *
 * Exibe memórias de mídia (foto, vídeo, áudio) em grid de 3 colunas,
 * com visualizador fullscreen, navegação por swipe, seleção múltipla,
 * filtros por tipo e filtro por data (ano/mês).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getMemories, searchMemories } from '../../services/memoriesService.js'
import { db as localDb } from '../../db/database.js'
import Topbar from '../layout/Topbar.jsx'
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
  const [memories, setMemories]         = useState([])
  const [thumbUrls, setThumbUrls]       = useState({})
  const [filter, setFilter]             = useState('all')
  const [query, setQuery]               = useState('')
  const [searchResults, setSearchResults] = useState(null)

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

  // Swipe no viewer
  const touchStartX = useRef(null)
  const longPressTimer = useRef(null)

  // ── Carregamento de memórias ───────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const mems = await getMemories()
        
        // Também buscar blobs direto da tabela fileBlobs
        const localBlobs = await localDb.fileBlobs.toArray().catch(() => [])
        const blobByFsId = {}
        const blobByTitle = {}
        for (const lb of localBlobs) {
          if (lb.firestoreId) blobByFsId[lb.firestoreId] = lb.blob
          if (lb.title) blobByTitle[lb.title] = lb.blob
        }
        for (const mem of mems) {
          if (!mem.fileBlob && !mem.fileUrl) {
            mem.fileBlob = blobByFsId[mem.id] || blobByTitle[mem.title] || null
          }
        }
        
        setMemories(mems)
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [])

  // ── Geração de URLs de blob ────────────────────────────────────────────────

  useEffect(() => {
    const urls = {}
    for (const m of memories) {
      if (m.thumbnail) {
        urls[m.id] = URL.createObjectURL(m.thumbnail)
      } else if (m.fileBlob && (m.type === 'photo' || m.type === 'video')) {
        urls[m.id] = URL.createObjectURL(m.fileBlob)
      }
    }
    setThumbUrls(urls)
    return () => { Object.values(urls).forEach(u => URL.revokeObjectURL(u)) }
  }, [memories])

  // ── Busca ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!query.trim()) { setSearchResults(null); return }
    searchMemories(query).then(setSearchResults).catch(() => {})
  }, [query])

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
  }

  function handleThumbClick(memory) {
    if (selectMode) {
      toggleSelect(memory.id)
    } else {
      // Só abre viewer se tem mídia disponível
      const src = thumbUrls[memory.id] || memory.fileUrl
      if (src) {
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

  async function batchShare() {
    const items = Array.from(selectedIds)
    toast(`${items.length} item(s) prontos para partilhar`)
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

  // ── Renders auxiliares ─────────────────────────────────────────────────────

  function getThumbSrc(m) {
    return thumbUrls[m.id] || m.fileUrl || null
  }

  function GridItem({ memory }) {
    const src = getThumbSrc(memory)
    const isSelected = selectedIds.has(memory.id)

    return (
      <div
        className={`${styles.memThumb} ${isSelected ? styles.memThumbSelected : ''}`}
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
          <img src={src} alt={memory.title || ''} className={styles.thumbImg} loading="lazy" />
        )}
        {src && memory.type === 'video' && (
          <>
            <video src={src} className={styles.thumbImg} muted playsInline preload="metadata" />
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
        title="Galeria"
        subtitle={`${mediaMemories.length} memória${mediaMemories.length !== 1 ? 's' : ''}`}
      />

      <div className={styles.scroll}>

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
        </div>

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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Partilhar
              </button>
              <button className={styles.selectionBtn} onClick={batchDownload} disabled={selectedIds.size === 0}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Guardar
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
            {(thumbUrls[currentMemory.id] || currentMemory.fileUrl) && currentMemory.type === 'video' && (
              <video
                src={thumbUrls[currentMemory.id] || currentMemory.fileUrl}
                controls
                autoPlay
                className={styles.viewerImg}
              />
            )}
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
    </div>
  )
}
