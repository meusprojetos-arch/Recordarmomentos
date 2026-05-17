/**
 * AutoSyncModal — Upload automático estilo Google Photos / Play Store
 *
 * Fluxo:
 *  1. idle    → tela informativa com contagem da galeria + botão "Permitir e sincronizar"
 *  2. asking  → modal nativo do iOS (NSPhotoLibraryUsageDescription)
 *  3. syncing → spinner azul + progress bar + métricas
 *  4. done    → check verde + estatísticas
 *  5. denied  → instrução pra ir nas Configurações do iOS
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  isNativePhotoLibrary,
  checkPhotoPermission,
  getGalleryStats,
  runAutoSyncNative,
  runAutoSync,
  countSynced,
} from '../../services/autoSyncService.js'

const C = {
  bg:        '#fafaf7',
  white:     '#ffffff',
  text:      '#2c2c2c',
  textMuted: '#6b6b6b',
  bege:      '#e8e3d8',
  verde:     '#4F7C52',
  terra:     '#D37E65',
  blue:      '#3B82F6',  // azul "carregando"
  blueLight: '#DBEAFE',
  red:       '#e53935',
}

export default function AutoSyncModal({ onClose, onDone }) {
  const [phase, setPhase] = useState('init')    // init | idle | asking | syncing | done | denied
  const [stats, setStats] = useState(null)      // { photos, videos, total }
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null, failed: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const signalRef = useRef({ cancelled: false })

  const isNative = isNativePhotoLibrary()
  const alreadySynced = countSynced()

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      if (isNative) {
        try {
          const status = await checkPhotoPermission()
          if (cancelled) return
          if (status === 'denied' || status === 'restricted') {
            setPhase('denied')
            return
          }
          // Se já autorizado, mostra estatísticas
          if (status === 'authorized' || status === 'limited') {
            const s = await getGalleryStats()
            if (!cancelled) setStats(s)
          }
          setPhase('idle')
        } catch (e) {
          if (!cancelled) { setError(e.message); setPhase('idle') }
        }
      } else {
        setPhase('idle')
      }
    }
    init()
    return () => { cancelled = true }
  }, [isNative])

  const handleStart = async () => {
    setError(null)
    signalRef.current = { cancelled: false }

    if (isNative) {
      setPhase('asking')
      try {
        const res = await runAutoSyncNative((p) => {
          if (p.status === 'denied') { setPhase('denied'); return }
          setProgress(p)
          if (p.status === 'starting' || p.status === 'uploading' || p.status === 'offline') {
            setPhase('syncing')
            if (p.photos != null && !stats) setStats({ photos: p.photos, videos: p.videos, total: p.total })
          } else if (p.status === 'done' || p.status === 'cancelled') {
            // tratado abaixo no return
          }
        }, signalRef.current)

        if (res.denied) { setPhase('denied'); return }
        setResult(res)
        setPhase('done')
        onDone?.()
      } catch (e) {
        setError(e.message || 'Erro inesperado')
        setPhase('idle')
      }
    } else {
      // Web: usuário precisa selecionar arquivos
      fileInputRef.current?.click()
    }
  }

  const handleWebFilesSelected = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    signalRef.current = { cancelled: false }
    setPhase('syncing')
    setProgress({ done: 0, total: files.length, current: null, failed: 0 })
    const res = await runAutoSync(files, (p) => setProgress(p), signalRef.current)
    setResult(res)
    setPhase('done')
    onDone?.()
  }

  const handleCancel = () => {
    signalRef.current.cancelled = true
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const remaining = Math.max(0, progress.total - progress.done - progress.failed)

  // ─── Estilos ──────────────────────────────────────────────────────────────

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'flex-end',
    justifyContent: 'center',
  }
  const modal = {
    background: C.bg,
    width: '100%', maxWidth: 520,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    maxHeight: '92vh',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
  }
  const handle = {
    width: 38, height: 4, background: '#d4d0c5',
    borderRadius: 99, margin: '10px auto 0',
  }
  const closeBtn = {
    position: 'absolute', top: 14, right: 16,
    background: 'transparent', border: 'none', color: C.textMuted,
    fontSize: 22, cursor: 'pointer', padding: 6, lineHeight: 1,
  }
  const body = {
    padding: '20px 22px 28px',
    overflowY: 'auto',
    flex: 1,
  }
  const heroIconWrap = {
    width: 84, height: 84, margin: '8px auto 18px',
    background: C.blueLight, borderRadius: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const h1 = {
    fontSize: 22, fontWeight: 800, color: C.text,
    textAlign: 'center', margin: '0 0 8px',
  }
  const subtitle = {
    fontSize: 14, color: C.textMuted,
    textAlign: 'center', margin: '0 0 22px',
    lineHeight: 1.5,
  }
  const statCardRow = {
    display: 'flex', gap: 10,
    margin: '0 0 20px',
  }
  const statCard = (color) => ({
    flex: 1,
    background: C.white,
    border: `1px solid ${C.bege}`,
    borderRadius: 14,
    padding: '14px 12px',
    textAlign: 'center',
  })
  const statNumber = (color) => ({
    fontSize: 22, fontWeight: 800, color, margin: 0,
  })
  const statLabel = {
    fontSize: 12, color: C.textMuted, margin: '4px 0 0',
  }
  const bulletList = {
    listStyle: 'none', padding: 0, margin: '0 0 22px',
  }
  const bulletItem = {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '8px 0', fontSize: 13.5, color: C.text, lineHeight: 1.5,
  }
  const checkDot = {
    width: 20, height: 20, borderRadius: '50%',
    background: C.blueLight, color: C.blue,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 800, flexShrink: 0, marginTop: 1,
  }
  const primaryBtn = {
    width: '100%',
    background: C.blue, color: '#fff',
    border: 'none', borderRadius: 14,
    padding: '15px',
    fontSize: 15.5, fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
  }
  const secondaryBtn = {
    width: '100%',
    background: 'transparent', color: C.textMuted,
    border: 'none', padding: '12px',
    fontSize: 13.5, cursor: 'pointer',
    marginTop: 8,
  }
  const dangerBtn = {
    ...secondaryBtn,
    color: C.red,
  }

  // Spinner azul SVG (puro CSS via animação inline)
  const spinnerCSS = `
    @keyframes recordar-spin { to { transform: rotate(360deg) } }
    .recordar-spinner { animation: recordar-spin 1s linear infinite; transform-origin: center }
  `
  const SpinnerSVG = (
    <svg viewBox="0 0 50 50" width="64" height="64">
      <circle cx="25" cy="25" r="20" fill="none" stroke={C.blueLight} strokeWidth="5"/>
      <circle
        cx="25" cy="25" r="20" fill="none"
        stroke={C.blue} strokeWidth="5" strokeLinecap="round"
        strokeDasharray="80 50"
        className="recordar-spinner"
      />
    </svg>
  )

  return (
    <div style={overlay} onClick={() => phase !== 'syncing' && phase !== 'asking' && onClose()}>
      <style>{spinnerCSS}</style>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={handle} />
        {(phase === 'idle' || phase === 'done' || phase === 'denied') && (
          <button style={closeBtn} onClick={onClose}>✕</button>
        )}

        <div style={body}>

          {/* ── INIT (carregando contagem) ── */}
          {phase === 'init' && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              {SpinnerSVG}
              <p style={{ ...subtitle, marginTop: 16 }}>Preparando...</p>
            </div>
          )}

          {/* ── IDLE — tela informativa ── */}
          {phase === 'idle' && (
            <>
              <div style={heroIconWrap}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.7" width="42" height="42">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>

              <h1 style={h1}>Backup automático</h1>
              <p style={subtitle}>
                Suas fotos e vídeos ficam salvos na nuvem com segurança.
                {isNative ? ' Continua mesmo se você trocar de celular.' : ''}
              </p>

              {stats && (
                <div style={statCardRow}>
                  <div style={statCard(C.blue)}>
                    <p style={statNumber(C.blue)}>{stats.photos.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>fotos</p>
                  </div>
                  <div style={statCard(C.terra)}>
                    <p style={statNumber(C.terra)}>{stats.videos.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>vídeos</p>
                  </div>
                  <div style={statCard(C.verde)}>
                    <p style={statNumber(C.verde)}>{stats.total.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>total</p>
                  </div>
                </div>
              )}

              <ul style={bulletList}>
                <li style={bulletItem}>
                  <span style={checkDot}>✓</span>
                  <span>{isNative ? 'Sincronização automática de toda a galeria' : 'Selecione fotos e vídeos pra importar'}</span>
                </li>
                <li style={bulletItem}>
                  <span style={checkDot}>✓</span>
                  <span>Compressão inteligente economiza dados</span>
                </li>
                <li style={bulletItem}>
                  <span style={checkDot}>✓</span>
                  <span>Pode pausar a qualquer momento</span>
                </li>
                {alreadySynced > 0 && (
                  <li style={bulletItem}>
                    <span style={checkDot}>↻</span>
                    <span>{alreadySynced} arquivo(s) já sincronizado(s) — não serão reenviados</span>
                  </li>
                )}
              </ul>

              {error && (
                <p style={{ color: C.red, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                  {error}
                </p>
              )}

              <button style={primaryBtn} onClick={handleStart}>
                {isNative ? 'Permitir e começar' : 'Selecionar arquivos'}
              </button>

              {!isNative && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleWebFilesSelected}
                />
              )}
            </>
          )}

          {/* ── ASKING (modal nativo do iOS) ── */}
          {phase === 'asking' && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              {SpinnerSVG}
              <p style={{ ...subtitle, marginTop: 16 }}>
                Aguardando sua permissão...
              </p>
              <p style={{ ...subtitle, fontSize: 12, marginTop: 0 }}>
                (toque em "Permitir acesso a todas as fotos" na janela do iOS)
              </p>
            </div>
          )}

          {/* ── SYNCING — barra + métricas + spinner ── */}
          {phase === 'syncing' && (
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <div style={{ marginBottom: 18 }}>{SpinnerSVG}</div>

              <h1 style={{ ...h1, fontSize: 18 }}>Sincronizando suas memórias</h1>
              <p style={{ ...subtitle, marginBottom: 18 }}>
                {progress.current ? `Enviando: ${truncateName(progress.current)}` : 'Preparando...'}
              </p>

              {/* Progress bar */}
              <div style={{
                background: C.bege, borderRadius: 99,
                height: 8, overflow: 'hidden',
                marginBottom: 12,
              }}>
                <div style={{
                  width: pct + '%', height: '100%',
                  background: `linear-gradient(90deg, ${C.blue}, ${C.verde})`,
                  borderRadius: 99,
                  transition: 'width 0.3s ease',
                }} />
              </div>

              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
                {progress.done} de {progress.total} ({pct}%)
              </p>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 22px' }}>
                {remaining > 0 ? `${remaining} restante(s)` : 'Quase lá...'}
                {progress.failed > 0 && (
                  <span style={{ color: C.red }}>  •  {progress.failed} falha(s)</span>
                )}
              </p>

              <button style={dangerBtn} onClick={handleCancel}>
                Pausar sincronização
              </button>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', paddingTop: 20 }}>
              <div style={{
                width: 84, height: 84, margin: '0 auto 18px',
                background: '#E8F5E9', borderRadius: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.verde} strokeWidth="2.5" width="46" height="46">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>

              <h1 style={h1}>Tudo certo!</h1>
              <p style={subtitle}>
                {result?.done || 0} memória(s) sincronizada(s) na nuvem.
                {result?.failed > 0 && (
                  <> <br/><span style={{ color: C.red }}>{result.failed} falha(s) — tente novamente depois.</span></>
                )}
              </p>

              <button style={primaryBtn} onClick={onClose}>Concluir</button>
            </div>
          )}

          {/* ── DENIED ── */}
          {phase === 'denied' && (
            <div style={{ textAlign: 'center', paddingTop: 16 }}>
              <div style={{
                width: 84, height: 84, margin: '0 auto 18px',
                background: '#FEE2E2', borderRadius: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" width="42" height="42">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
              </div>

              <h1 style={h1}>Acesso negado</h1>
              <p style={subtitle}>
                Para sincronizar suas memórias, libere o acesso às fotos em:<br/>
                <strong>Ajustes &gt; Recordar &gt; Fotos &gt; Todas as Fotos</strong>
              </p>

              <button style={primaryBtn} onClick={onClose}>Entendi</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function truncateName(name) {
  if (!name) return ''
  if (name.length <= 32) return name
  return name.substring(0, 14) + '...' + name.substring(name.length - 14)
}
