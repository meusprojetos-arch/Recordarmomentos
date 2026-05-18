/**
 * AutoSyncModal — Importação automática da galeria (estilo Google Photos)
 *
 * Layout responsivo:
 *  - Header sticky no topo (sempre visível)
 *  - Body com scroll vertical (conteúdo grande não corta)
 *  - Footer sticky no fundo com o botão de ação (SEMPRE visível)
 *
 * Fluxo:
 *  1. init    → carregando contagem + verificando importação pendente
 *  2. idle    → tela informativa + botão "Iniciar importação automática"
 *  3. resume  → importação pendente detectada + botão "Retomar"
 *  4. asking  → modal nativo pedindo permissão
 *  5. syncing → spinner + barra de progresso + métricas detalhadas
 *  6. done    → check verde + estatísticas finais
 *  7. denied  → instrução para ir nas Configurações
 *  8. error   → plugin nativo não detectado
 */
import React, { useState, useEffect, useRef } from 'react'
import {
  isNativePhotoLibrary,
  isNativePhotoLibraryReady,
  waitForNativePlugin,
  getPlatform,
  checkPhotoPermission,
  getGalleryStats,
  runAutoSyncNative,
  runAutoSync,
  countSyncedAssets,
  countSynced,
  getPluginDiagnostics,
  getAutoSyncLogs,
  subscribeToAutoSyncLogs,
  clearAutoSyncLogs,
  hasPendingImport,
  getPendingImportSummary,
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
  orange:    '#F59E0B',
  orangeLight: '#FEF3C7',
}

export default function AutoSyncModal({ onClose, onDone }) {
  const [phase, setPhase] = useState('init')
  const [stats, setStats] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null, failed: 0, skipped: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showDiag, setShowDiag] = useState(false)
  const [diag, setDiag] = useState(null)
  const [logs, setLogs] = useState(getAutoSyncLogs())
  const [showLogs, setShowLogs] = useState(false)
  const [alreadySynced, setAlreadySynced] = useState(0)
  const [pendingSummary, setPendingSummary] = useState(null)
  const [startTime, setStartTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const fileInputRef = useRef(null)
  const signalRef = useRef({ cancelled: false })
  const logsEndRef = useRef(null)

  const [isNative, setIsNative] = useState(isNativePhotoLibrary())
  const platform = getPlatform()

  // Subscreve aos logs em tempo real
  useEffect(() => {
    const unsub = subscribeToAutoSyncLogs(() => setLogs(getAutoSyncLogs()))
    return () => unsub()
  }, [])

  // Auto-scroll dos logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  // Timer de tempo decorrido
  useEffect(() => {
    if (phase !== 'syncing' || !startTime) return
    const iv = setInterval(() => setElapsed(Date.now() - startTime), 1000)
    return () => clearInterval(iv)
  }, [phase, startTime])

  // Init: aguarda plugin + carrega estatísticas + verifica importação pendente
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        // Aguardar plugin nativo se necessário
        if ((platform === 'ios' || platform === 'android') && !isNativePhotoLibrary()) {
          await waitForNativePlugin(3000)
        }
        if (cancelled) return

        // Verificar se o plugin nativo REALMENTE funciona (não apenas stub JS)
        let native = isNativePhotoLibrary()
        if (native) {
          native = await isNativePhotoLibraryReady()
        }
        setIsNative(native)

        if ((platform === 'ios' || platform === 'android') && !native) {
          setDiag(getPluginDiagnostics())
          setPhase('error')
          return
        }

        // Contar já sincronizados
        const syncedCount = await countSyncedAssets().catch(() => countSynced())
        if (!cancelled) setAlreadySynced(syncedCount)

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
            if (!cancelled) setError(e.message)
          }
        }

        // Verificar importação pendente
        if (hasPendingImport()) {
          const summary = getPendingImportSummary()
          if (!cancelled) {
            setPendingSummary(summary)
            setPhase('resume')
            return
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
    setStartTime(Date.now())

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
        setPhase(res.cancelled ? 'idle' : 'done')
        if (!res.cancelled) onDone?.()
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
    setStartTime(Date.now())
    setPhase('syncing')
    setProgress({ done: 0, total: files.length, current: null, failed: 0, skipped: 0 })
    const res = await runAutoSync(files, (p) => setProgress(p), signalRef.current)
    setResult(res)
    setPhase('done')
    onDone?.()
  }

  const handleCancel = () => {
    signalRef.current.cancelled = true
    // Drena fila imediatamente pra não pegar próximos itens
    signalRef.current._drainQueue?.()
    setPhase('pausing') // UI mostra "Pausando..." enquanto workers terminam
  }

  // Métricas
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const remaining = Math.max(0, progress.total - progress.done - progress.failed)
  const isInteractionLocked = phase === 'syncing' || phase === 'asking' || phase === 'init' || phase === 'pausing'

  // Estimativa de tempo restante
  const imported = progress.done - (progress.skipped || 0)
  const speed = imported > 0 && elapsed > 0 ? (imported / (elapsed / 1000)) : 0
  const etaSeconds = speed > 0 && remaining > 0 ? Math.round(remaining / speed) : 0

  function formatTime(ms) {
    if (ms < 1000) return '< 1s'
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    return `${m}m ${s % 60}s`
  }

  function formatEta(seconds) {
    if (seconds <= 0) return 'calculando...'
    if (seconds < 60) return `~${seconds}s`
    const m = Math.floor(seconds / 60)
    return `~${m}m ${seconds % 60}s`
  }

  // ─── Estilos ──────────────────────────────────────────────────────────────

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  }
  const modal = {
    background: C.bg,
    width: '100%', maxWidth: 460,
    height: 'auto',
    maxHeight: 'calc(100vh - 40px)',
    borderRadius: 20,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
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
    minHeight: 0,
  }
  const footer = {
    flex: '0 0 auto',
    padding: '14px 22px 18px',
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
  const resumeBtn = {
    ...primaryBtn, background: C.orange,
    boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
  }
  const secondaryBtn = {
    width: '100%', background: 'transparent', color: C.textMuted,
    border: 'none', padding: '10px', fontSize: 13, cursor: 'pointer',
  }
  const dangerBtn = { ...secondaryBtn, color: C.red }
  const logsBtnStyle = {
    display: 'block', margin: '8px auto 0',
    background: 'transparent', border: 'none',
    color: C.textMuted, fontSize: 11.5,
    textDecoration: 'underline', cursor: 'pointer',
  }
  const logsContainer = {
    background: '#1e1e1e', color: '#d4d4d4',
    padding: 10, borderRadius: 8, fontSize: 10.5,
    overflowX: 'auto', overflowY: 'auto',
    maxHeight: 180, margin: '8px 0 0',
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
    lineHeight: 1.4,
  }
  const metricRow = {
    display: 'flex', justifyContent: 'space-between',
    padding: '4px 0', fontSize: 12, color: C.textMuted,
    borderBottom: `1px solid ${C.bege}`,
  }

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

  // Componente de logs
  const LogsSection = () => (
    <>
      <button onClick={() => setShowLogs(!showLogs)} style={logsBtnStyle}>
        {showLogs ? 'Ocultar' : 'Ver'} logs de importação ({logs.length})
      </button>
      {showLogs && (
        <div style={{ position: 'relative' }}>
          <pre style={logsContainer}>
            {logs.length > 0
              ? logs.map((l, i) => (
                  <span key={i} style={{ color: l.level === 'error' ? '#EF4444' : l.level === 'warn' ? '#F59E0B' : '#d4d4d4' }}>
                    {`[${l.ts}] ${l.msg}\n`}
                  </span>
                ))
              : 'Nenhum log ainda'}
            <span ref={logsEndRef} />
          </pre>
          <button
            onClick={() => { clearAutoSyncLogs(); setLogs([]) }}
            style={{
              position: 'absolute', top: 4, right: 4,
              background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#888', fontSize: 10, cursor: 'pointer', padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            Limpar
          </button>
        </div>
      )}
    </>
  )

  // Footer muda conforme a fase
  const renderFooter = () => {
    if (phase === 'init' || phase === 'asking') return null
    if (phase === 'syncing') {
      return (
        <div style={footer}>
          <button style={dangerBtn} onClick={handleCancel}>
            Pausar importação
          </button>
          <p style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', margin: '6px 0 0' }}>
            A importação pode ser retomada a qualquer momento
          </p>
        </div>
      )
    }
    if (phase === 'pausing') {
      return (
        <div style={footer}>
          <button style={{ ...dangerBtn, opacity: 0.5, cursor: 'wait' }} disabled>
            Pausando...
          </button>
          <p style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', margin: '6px 0 0' }}>
            Finalizando uploads em andamento...
          </p>
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
    if (phase === 'resume') {
      return (
        <div style={footer}>
          <button style={resumeBtn} onClick={handleStart}>
            Retomar importação
          </button>
          <button style={secondaryBtn} onClick={() => setPhase('idle')}>
            Iniciar do zero
          </button>
        </div>
      )
    }
    // idle
    return (
      <div style={footer}>
        <button style={primaryBtn} onClick={handleStart}>
          {isNative
            ? 'Iniciar importação automática'
            : (platform === 'ios' || platform === 'android')
              ? 'Tentar novamente'
              : 'Selecionar arquivos'}
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
        {!isInteractionLocked && (
          <button style={closeBtn} onClick={onClose}>&#10005;</button>
        )}

        <div style={scrollBody}>

          {/* INIT */}
          {phase === 'init' && (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              {SpinnerSVG}
              <p style={{ ...subtitle, marginTop: 12 }}>Preparando importação...</p>
            </div>
          )}

          {/* IDLE */}
          {phase === 'idle' && (
            <>
              <div style={heroIconWrap}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.7" width="38" height="38">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>

              <h1 style={h1}>Importação automática da galeria</h1>
              <p style={subtitle}>
                {isNative
                  ? `Todas as fotos e vídeos do seu ${platform === 'ios' ? 'iPhone' : 'celular'} serão importados automaticamente para o Recordar. Nenhuma seleção manual necessária.`
                  : (platform === 'ios' || platform === 'android')
                    ? 'Plugin de galeria indisponível neste build. Toque em "Tentar novamente" ou veja o diagnóstico abaixo.'
                    : 'No navegador, é necessário selecionar os arquivos manualmente. Pelo app nativo a importação é automática.'}
              </p>

              {stats && (
                <div style={statCardRow}>
                  <div style={statCard}>
                    <p style={statNumber(C.blue)}>{stats.photos.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>fotos na galeria</p>
                  </div>
                  <div style={statCard}>
                    <p style={statNumber(C.terra)}>{stats.videos.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>vídeos na galeria</p>
                  </div>
                  <div style={statCard}>
                    <p style={statNumber(C.verde)}>{stats.total.toLocaleString('pt-BR')}</p>
                    <p style={statLabel}>total</p>
                  </div>
                </div>
              )}

              <ul style={bulletList}>
                <li style={bulletItem}>
                  <span style={checkDot}>&#10003;</span>
                  <span>{isNative
                    ? 'Importa TODA a galeria automaticamente — sem escolher arquivos'
                    : 'Selecione fotos e vídeos para importar'}</span>
                </li>
                <li style={bulletItem}>
                  <span style={checkDot}>&#10003;</span>
                  <span>Compressão inteligente para economizar espaço</span>
                </li>
                <li style={bulletItem}>
                  <span style={checkDot}>&#10003;</span>
                  <span>Pode pausar e retomar a qualquer momento</span>
                </li>
                <li style={bulletItem}>
                  <span style={checkDot}>&#10003;</span>
                  <span>Se o app fechar, a importação continua de onde parou</span>
                </li>
                {alreadySynced > 0 && (
                  <li style={bulletItem}>
                    <span style={{ ...checkDot, background: '#E8F5E9', color: C.verde }}>&#8635;</span>
                    <span>{alreadySynced.toLocaleString('pt-BR')} arquivo(s) já importado(s) — não serão reenviados</span>
                  </li>
                )}
              </ul>

              {error && (
                <p style={{ color: C.red, fontSize: 12.5, textAlign: 'center', margin: '8px 0' }}>
                  {error}
                </p>
              )}

              {/* Diagnóstico técnico */}
              <button
                onClick={() => { setDiag(getPluginDiagnostics()); setShowDiag(!showDiag) }}
                style={logsBtnStyle}
              >
                {showDiag ? 'Ocultar' : 'Ver'} diagnóstico técnico
              </button>

              {showDiag && diag && (
                <pre style={logsContainer}>
{JSON.stringify(diag, null, 2)}
                </pre>
              )}

              <LogsSection />
            </>
          )}

          {/* RESUME — importação pendente */}
          {phase === 'resume' && pendingSummary && (
            <>
              <div style={{ ...heroIconWrap, background: C.orangeLight }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" width="38" height="38">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </div>

              <h1 style={h1}>Importação pendente</h1>
              <p style={subtitle}>
                A importação anterior foi interrompida. Deseja retomar de onde parou?
              </p>

              <div style={statCardRow}>
                <div style={statCard}>
                  <p style={statNumber(C.verde)}>{pendingSummary.done.toLocaleString('pt-BR')}</p>
                  <p style={statLabel}>já importados</p>
                </div>
                <div style={statCard}>
                  <p style={statNumber(C.blue)}>{pendingSummary.remaining.toLocaleString('pt-BR')}</p>
                  <p style={statLabel}>restantes</p>
                </div>
                {pendingSummary.failed > 0 && (
                  <div style={statCard}>
                    <p style={statNumber(C.red)}>{pendingSummary.failed}</p>
                    <p style={statLabel}>falha(s)</p>
                  </div>
                )}
              </div>

              <LogsSection />
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
                {platform === 'ios'
                  ? 'Toque em "Permitir acesso a todas as fotos" na janela do iOS'
                  : 'Permita o acesso à galeria na janela que apareceu'}
              </p>
            </div>
          )}

          {/* SYNCING */}
          {phase === 'syncing' && (
            <div style={{ textAlign: 'center', paddingTop: 6 }}>
              <div style={{ marginBottom: 14 }}>{SpinnerSVG}</div>

              <h1 style={{ ...h1, fontSize: 17 }}>Importando galeria automaticamente</h1>
              <p style={{ ...subtitle, marginBottom: 14 }}>
                {progress.current ? `Importando: ${truncateName(progress.current)}` : 'Preparando...'}
              </p>

              {/* Barra de progresso */}
              <div style={{
                background: C.bege, borderRadius: 99,
                height: 10, overflow: 'hidden', marginBottom: 10,
              }}>
                <div style={{
                  width: pct + '%', height: '100%',
                  background: `linear-gradient(90deg, ${C.blue}, ${C.verde})`,
                  borderRadius: 99, transition: 'width 0.3s ease',
                }} />
              </div>

              {/* Progresso principal */}
              <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>
                {progress.done.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} ({pct}%)
              </p>

              {/* Métricas detalhadas */}
              <div style={{
                background: C.white, border: `1px solid ${C.bege}`,
                borderRadius: 12, padding: '10px 14px', margin: '10px 0',
                textAlign: 'left',
              }}>
                <div style={metricRow}>
                  <span>Importados</span>
                  <span style={{ fontWeight: 700, color: C.verde }}>{progress.done.toLocaleString('pt-BR')}</span>
                </div>
                <div style={metricRow}>
                  <span>Restantes</span>
                  <span style={{ fontWeight: 700, color: C.blue }}>{remaining.toLocaleString('pt-BR')}</span>
                </div>
                {(progress.skipped || 0) > 0 && (
                  <div style={metricRow}>
                    <span>Já existiam</span>
                    <span style={{ fontWeight: 700, color: C.textMuted }}>{progress.skipped.toLocaleString('pt-BR')}</span>
                  </div>
                )}
                {progress.failed > 0 && (
                  <div style={metricRow}>
                    <span>Falhas</span>
                    <span style={{ fontWeight: 700, color: C.red }}>{progress.failed}</span>
                  </div>
                )}
                <div style={metricRow}>
                  <span>Tempo decorrido</span>
                  <span style={{ fontWeight: 700 }}>{formatTime(elapsed)}</span>
                </div>
                {etaSeconds > 0 && (
                  <div style={{ ...metricRow, borderBottom: 'none' }}>
                    <span>Tempo estimado restante</span>
                    <span style={{ fontWeight: 700 }}>{formatEta(etaSeconds)}</span>
                  </div>
                )}
                {speed > 0 && (
                  <div style={{ ...metricRow, borderBottom: 'none' }}>
                    <span>Velocidade</span>
                    <span style={{ fontWeight: 700 }}>{speed.toFixed(1)} arquivos/s</span>
                  </div>
                )}
              </div>

              {/* Status da conexão */}
              {progress.status === 'offline' && (
                <div style={{
                  background: C.orangeLight, color: C.orange,
                  padding: '8px 14px', borderRadius: 10,
                  fontSize: 13, fontWeight: 600, margin: '8px 0',
                }}>
                  Sem conexão — aguardando rede para continuar...
                </div>
              )}

              <LogsSection />
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
              <h1 style={h1}>Importação concluída!</h1>
              <p style={subtitle}>
                {result?.done || 0} memória(s) importada(s) da galeria.
                {(result?.skipped || 0) > 0 && (
                  <><br/><span style={{ color: C.textMuted }}>{result.skipped} já existiam e foram pulados.</span></>
                )}
                {(result?.failed || 0) > 0 && (
                  <><br/><span style={{ color: C.red }}>{result.failed} falha(s) — tente novamente depois.</span></>
                )}
              </p>

              {elapsed > 0 && (
                <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 12px' }}>
                  Tempo total: {formatTime(elapsed)}
                </p>
              )}

              <LogsSection />
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
                Para importar automaticamente suas fotos e vídeos, libere o acesso à galeria em:<br/>
                {platform === 'ios'
                  ? <strong>Ajustes &gt; Recordar &gt; Fotos &gt; Todas as Fotos</strong>
                  : <strong>Configurações &gt; Apps &gt; Recordar &gt; Permissões &gt; Fotos e vídeos</strong>}
              </p>
            </div>
          )}

          {/* ERROR — plugin nativo missing */}
          {phase === 'error' && (
            <div style={{ paddingTop: 8 }}>
              <div style={{
                width: 72, height: 72, margin: '0 auto 14px',
                background: C.orangeLight, borderRadius: 20,
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
                O plugin de acesso à galeria não foi registrado pelo Capacitor.
                Isso pode indicar um problema de build.
                Veja o diagnóstico abaixo:
              </p>
              {diag && (
                <pre style={logsContainer}>
{JSON.stringify(diag, null, 2)}
                </pre>
              )}
              <LogsSection />
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
