/**
 * AutoSyncModal — Upload automático estilo Google Photos / Play Store
 *
 * Layout responsivo:
 *  - Header sticky no topo (sempre visível)
 *  - Body com scroll vertical (conteúdo grande não corta)
 *  - Footer sticky no fundo com o botão de ação (SEMPRE visível, mesmo em iPhone SE)
 *
 * Fluxo:
 *  1. init   → carregando contagem
 *  2. idle   → tela informativa + botão "Permitir e começar"
 *  3. asking → modal nativo do iOS pedindo permissão
 *  4. syncing→ spinner azul + barra de progresso + métricas
 *  5. done   → check verde + estatísticas
 *  6. denied → instrução pra ir nas Configurações do iOS
 *  7. error  → plugin nativo não detectado (build problemático)
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  isNativePhotoLibrary,
  waitForNativePlugin,
  getPlatform,
  checkPhotoPermission,
  getGalleryStats,
  runAutoSyncNative,
  runAutoSync,
  countSynced,
  getPluginDiagnostics,
  getAutoSyncLogs,
  subscribeToAutoSyncLogs,
} from '../../services/autoSyncService.js'

const C = {
  bg:        '#fafaf7',
  white:     '#ffffff',
  text:      '#2c2c2c',
  textMuted: '#6b6b6b',
  bege:      '#e8e3d8',
  verde:     '#4F7C52',
  terra:     '#D37E65',
  blue:      '#3B82F6',
  blueLight: '#DBEAFE',
  red:       '#e53935',
}

export default function AutoSyncModal({ onClose, onDone }) {
  const [phase, setPhase] = useState('init')
  const [stats, setStats] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null, failed: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showDiag, setShowDiag] = useState(false)
  const [diag, setDiag] = useState(null)
  const [logs, setLogs] = useState(getAutoSyncLogs())
  const fileInputRef = useRef(null)
  const signalRef = useRef({ cancelled: false })

  const [isNative, setIsNative] = useState(isNativePhotoLibrary())
  const platform = getPlatform()
  const alreadySynced = countSynced()

  // Subscreve aos logs em tempo real
  useEffect(() => {
    const unsub = subscribeToAutoSyncLogs(() => setLogs(getAutoSyncLogs()))
    return () => unsub()
  }, [])

  // Init: aguarda plugin nativo (até 3s) e carrega estatísticas
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        // No iOS, o plugin pode demorar 1-2s pra aparecer após o WebView carregar
        if (platform === 'ios' && !isNativePhotoLibrary()) {
          await waitForNativePlugin(3000)
        }
        if (cancelled) return

        const native = isNativePhotoLibrary()
        setIsNative(native)

        if (platform === 'ios' && !native) {
          // É iOS mas o plugin não foi detectado — provável problema de build
          setDiag(getPluginDiagnostics())
          setPhase('error')
          return
        }

        if (native) {
          try {
            const status = await checkPhotoPermission()
            if (cancelled) return
            if (status === 'denied' || status === 'restricted') {
              setPhase('denied')
              return
            }
            if (status === 'authorized' || status === 'limited') {
              const s = await getGalleryStats()
              if (!cancelled) setStats(s)
            }
          } catch (e) {
            if (!cancelled) { setError(e.message); }
          }
        }
        setPhase('idle')
      } catch (e) {
        if (!cancelled) {
          setError(e.message)
          setPhase('idle')
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [platform])

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

  const handleCancel = () => { signalRef.current.cancelled = true }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const remaining = Math.max(0, progress.total - progress.done - progress.failed)
  const isInteractionLocked = phase === 'syncing' || phase === 'asking' || phase === 'init'

  // ─── Estilos ──────────────────────────────────────────────────────────────

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  }
  const modal = {
    background: C.bg,
    width: '100%', maxWidth: 520,
    height: 'auto', maxHeight: '92vh',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
    position: 'relative',
  }
  const handle = {
    width: 38, height: 4, background: '#d4d0c5',
    borderRadius: 99, margin: '10px auto 0',
    flexShrink: 0,
  }
  const closeBtn = {
    position: 'absolute', top: 14, right: 16, zIndex: 2,
    background: 'transparent', border: 'none', color: C.textMuted,
    fontSize: 22, cursor: 'pointer', padding: 6, lineHeight: 1,
  }
  const scrollBody = {
    flex: '1 1 auto',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '14px 22px 16px',
    minHeight: 0, // permite encolher
  }
  const footer = {
    flex: '0 0 auto',
    padding: '12px 22px calc(16px + env(safe-area-inset-bottom, 0px))',
    background: C.bg,
    borderTop: `1px solid ${C.bege}`,
  }
  const heroIconWrap = {
    width: 72, height: 72, margin: '4px auto 14px',
    background: C.blueLight, borderRadius: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const h1 = {
    fontSize: 20, fontWeight: 800, color: C.text,
    textAlign: 'center', margin: '0 0 6px',
  }
  const subtitle = {
    fontSize: 13.5, color: C.textMuted,
    textAlign: 'center', margin: '0 0 16px',
    lineHeight: 1.45,
  }
  const statCardRow = { display: 'flex', gap: 8, margin: '0 0 14px' }
  const statCard = {
    flex: 1, background: C.white,
    border: `1px solid ${C.bege}`, borderRadius: 12,
    padding: '12px 8px', textAlign: 'center',
  }
  const statNumber = (color) => ({ fontSize: 18, fontWeight: 800, color, margin: 0 })
  const statLabel = { fontSize: 11, color: C.textMuted, margin: '2px 0 0' }
  const bulletList = { listStyle: 'none', padding: 0, margin: '0 0 8px' }
  const bulletItem = {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '7px 0', fontSize: 13, color: C.text, lineHeight: 1.45,
  }
  const checkDot = {
    width: 20, height: 20, borderRadius: '50%',
    background: C.blueLight, color: C.blue,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, flexShrink: 0, marginTop: 1,
  }
  const primaryBtn = {
    width: '100%', background: C.blue, color: '#fff',
    border: 'none', borderRadius: 14, padding: '14px',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
  }
  const secondaryBtn = {
    width: '100%', background: 'transparent', color: C.textMuted,
    border: 'none', padding: '10px', fontSize: 13, cursor: 'pointer',
  }
  const dangerBtn = { ...secondaryBtn, color: C.red }

  const spinnerCSS = `
    @keyframes recordar-spin { to { transform: rotate(360deg) } }
    .recordar-spinner { animation: recordar-spin 1s linear infinite; transform-origin: center }
  `
  const SpinnerSVG = (
    <svg viewBox="0 0 50 50" width="56" height="56">
      <circle cx="25" cy="25" r="20" fill="none" stroke={C.blueLight} strokeWidth="5"/>
      <circle cx="25" cy="25" r="20" fill="none"
        stroke={C.blue} strokeWidth="5" strokeLinecap="round"
        strokeDasharray="80 50" className="recordar-spinner"/>
    </svg>
  )

  // Botão do footer muda conforme a fase
  const renderFooter = () => {
    if (phase === 'init' || phase === 'asking') return null
    if (phase === 'syncing') {
      return (
        <div style={footer}>
          <button style={dangerBtn} onClick={handleCancel}>
            Pausar sincronização
          </button>
        </div>
      )
    }
    if (phase === 'done' || phase === 'denied' || phase === 'error') {
      return (
        <div style={footer}>
          <button style={primaryBtn} onClick={onClose}>
            {phase === 'done' ? 'Concluir' : 'Entendi'}
          </button>
        </div>
      )
    }
    // idle
    return (
      <div style={footer}>
        <button style={primaryBtn} onClick={handleStart}>
          {isNative ? 'Permitir e começar' : (platform === 'ios' ? 'Tentar novamente' : 'Selecionar arquivos')}
        </button>
        {!isNative && (
          <input
            ref={fileInputRef}
            type="file" accept="image/*,video/*" multiple
            style={{ display: 'none' }}
            onChange={handleWebFilesSelected}
          />
        )}
      </div>
    )
  }

  return (
    <div style={overlay} onClick={() => !isInteractionLocked && onClose()}>
      <style>{spinnerCSS}</style>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={handle} />
        {!isInteractionLocked && (
          <button style={closeBtn} onClick={onClose}>✕</button>
        )}

        <div style={scrollBody}>

          {/* INIT */}
          {phase === 'init' && (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              {SpinnerSVG}
              <p style={{ ...subtitle, marginTop: 12 }}>Preparando...</p>
            </div>
          )}

          {/* IDLE */}
          {phase === 'idle' && (
            <>
              <div style={heroIconWrap}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.7" width="38" height="38">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>

              <h1 style={h1}>Backup automático</h1>
              <p style={subtitle}>
                {isNative
                  ? 'Suas fotos e vídeos do iPhone serão salvos na nuvem automaticamente, igual ao Google Photos.'
                  : platform === 'ios'
                    ? 'Plugin de galeria indisponível neste build. Toque em "Tentar novamente" ou veja diagnóstico abaixo.'
                    : 'No navegador, é necessário selecionar manualmente. Pelo app no iPhone funciona automático.'}
              </p>

              {stats && (
                <div style={statCardRow}>
                  <div style={statCard}>
                    <p style={statNumber(C.blue)}>{stats.photos.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>fotos</p>
                  </div>
                  <div style={statCard}>
                    <p style={statNumber(C.terra)}>{stats.videos.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>vídeos</p>
                  </div>
                  <div style={statCard}>
                    <p style={statNumber(C.verde)}>{stats.total.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>total</p>
                  </div>
                </div>
              )}

              <ul style={bulletList}>
                <li style={bulletItem}>
                  <span style={checkDot}>✓</span>
                  <span>{isNative
                    ? 'Sincronização automática de TODA a galeria — sem precisar escolher'
                    : 'Selecione fotos e vídeos pra importar'}</span>
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
                <p style={{ color: C.red, fontSize: 12.5, textAlign: 'center', margin: '8px 0' }}>
                  {error}
                </p>
              )}

              {/* Botão diagnóstico — sempre acessível */}
              <button
                onClick={() => { setDiag(getPluginDiagnostics()); setShowDiag(!showDiag) }}
                style={{
                  display: 'block', margin: '8px auto 0',
                  background: 'transparent', border: 'none',
                  color: C.textMuted, fontSize: 11.5,
                  textDecoration: 'underline', cursor: 'pointer',
                }}
              >
                {showDiag ? 'Ocultar' : 'Ver'} diagnóstico técnico
              </button>

              {showDiag && diag && (
                <pre style={{
                  background: '#1e1e1e', color: '#d4d4d4',
                  padding: 10, borderRadius: 8, fontSize: 10.5,
                  overflowX: 'auto', margin: '8px 0 0',
                  fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
                  lineHeight: 1.4,
                }}>
{JSON.stringify(diag, null, 2)}
                </pre>
              )}
            </>
          )}

          {/* ASKING */}
          {phase === 'asking' && (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              {SpinnerSVG}
              <p style={{ ...subtitle, marginTop: 14 }}>
                Aguardando sua permissão...
              </p>
              <p style={{ ...subtitle, fontSize: 11.5, marginTop: 0 }}>
                Toque em "Permitir acesso a todas as fotos" na janela do iOS
              </p>
            </div>
          )}

          {/* SYNCING */}
          {phase === 'syncing' && (
            <div style={{ textAlign: 'center', paddingTop: 6 }}>
              <div style={{ marginBottom: 14 }}>{SpinnerSVG}</div>

              <h1 style={{ ...h1, fontSize: 17 }}>Sincronizando suas memórias</h1>
              <p style={{ ...subtitle, marginBottom: 14 }}>
                {progress.current ? `Enviando: ${truncateName(progress.current)}` : 'Preparando...'}
              </p>

              <div style={{
                background: C.bege, borderRadius: 99,
                height: 8, overflow: 'hidden', marginBottom: 10,
              }}>
                <div style={{
                  width: pct + '%', height: '100%',
                  background: `linear-gradient(90deg, ${C.blue}, ${C.verde})`,
                  borderRadius: 99, transition: 'width 0.3s ease',
                }} />
              </div>

              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
                {progress.done} de {progress.total} ({pct}%)
              </p>
              <p style={{ fontSize: 11.5, color: C.textMuted, margin: '0 0 10px' }}>
                {remaining > 0 ? `${remaining} restante(s)` : 'Quase lá...'}
                {progress.failed > 0 && (
                  <span style={{ color: C.red }}>  •  {progress.failed} falha(s)</span>
                )}
              </p>
            </div>
          )}

          {/* DONE */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', paddingTop: 14 }}>
              <div style={{
                width: 72, height: 72, margin: '0 auto 14px',
                background: '#E8F5E9', borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.verde} strokeWidth="2.5" width="38" height="38">
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
            </div>
          )}

          {/* DENIED */}
          {phase === 'denied' && (
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <div style={{
                width: 72, height: 72, margin: '0 auto 14px',
                background: '#FEE2E2', borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" width="36" height="36">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
              </div>
              <h1 style={h1}>Acesso negado</h1>
              <p style={subtitle}>
                Para sincronizar suas memórias, libere o acesso às fotos em:<br/>
                <strong>Ajustes &gt; Recordar &gt; Fotos &gt; Todas as Fotos</strong>
              </p>
            </div>
          )}

          {/* ERROR — plugin nativo missing */}
          {phase === 'error' && (
            <div style={{ paddingTop: 8 }}>
              <div style={{
                width: 72, height: 72, margin: '0 auto 14px',
                background: '#FEF3C7', borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" width="38" height="38">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h1 style={h1}>Plugin não detectado</h1>
              <p style={subtitle}>
                O plugin nativo de galeria não foi encontrado neste build do app.
                Isso significa que o arquivo Swift não foi compilado corretamente.
                Veja o diagnóstico abaixo:
              </p>
              {diag && (
                <pre style={{
                  background: '#1e1e1e', color: '#d4d4d4',
                  padding: 12, borderRadius: 8, fontSize: 10.5,
                  overflowX: 'auto',
                  fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
                  lineHeight: 1.4,
                }}>
{JSON.stringify(diag, null, 2)}
                </pre>
              )}
              {logs.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: C.textMuted, cursor: 'pointer' }}>
                    Ver logs ({logs.length})
                  </summary>
                  <pre style={{
                    background: '#1e1e1e', color: '#d4d4d4',
                    padding: 10, borderRadius: 8, fontSize: 10.5,
                    overflowX: 'auto', marginTop: 6,
                    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
                    lineHeight: 1.4,
                  }}>
{logs.map(l => `[${l.ts}] ${l.msg}`).join('\n')}
                  </pre>
                </details>
              )}
            </div>
          )}

        </div>

        {renderFooter()}
      </div>
    </div>
  )
}

function truncateName(name) {
  if (!name) return ''
  if (name.length <= 32) return name
  return name.substring(0, 14) + '...' + name.substring(name.length - 14)
}
