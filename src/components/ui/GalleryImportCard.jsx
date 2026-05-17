/**
 * GalleryImportCard — Card inline de importação automática da galeria
 *
 * Fica embutido no PerfilScreen. Sem modal overlay.
 * Estados:
 *  idle     → botão compacto "Importar da galeria automaticamente"
 *  loading  → preparando (detectando plugin, contando galeria)
 *  ready    → mostra total da galeria + botão iniciar
 *  asking   → aguardando permissão do usuário
 *  syncing  → spinner + barra + métricas compactas + pausar
 *  paused   → resumo + botão retomar
 *  done     → resultado final compacto
 *  denied   → instrução de permissão
 *  error    → diagnóstico
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

export default function GalleryImportCard() {
  const [phase, setPhase] = useState('idle')
  const [isNative, setIsNative] = useState(false)
  const [stats, setStats] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null, failed: 0, skipped: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [alreadySynced, setAlreadySynced] = useState(0)
  const [pendingSummary, setPendingSummary] = useState(null)
  const [startTime, setStartTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState(getAutoSyncLogs())
  const [showDiag, setShowDiag] = useState(false)
  const [diag, setDiag] = useState(null)
  const signalRef = useRef({ cancelled: false })
  const fileInputRef = useRef(null)
  const logsEndRef = useRef(null)
  const platform = getPlatform()

  // Logs em tempo real
  useEffect(() => {
    const unsub = subscribeToAutoSyncLogs(() => setLogs(getAutoSyncLogs()))
    return () => unsub()
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  // Timer
  useEffect(() => {
    if (phase !== 'syncing' || !startTime) return
    const iv = setInterval(() => setElapsed(Date.now() - startTime), 1000)
    return () => clearInterval(iv)
  }, [phase, startTime])

  // Ao abrir o card (clicar), carrega info da galeria
  const handleOpen = async () => {
    if (phase !== 'idle') return
    setPhase('loading')
    setError(null)

    try {
      if ((platform === 'ios' || platform === 'android') && !isNativePhotoLibrary()) {
        await waitForNativePlugin(3000)
      }

      let native = isNativePhotoLibrary()
      if (native) native = await isNativePhotoLibraryReady()
      setIsNative(native)

      // Contar já sincronizados
      const synced = await countSyncedAssets().catch(() => countSynced())
      setAlreadySynced(synced)

      if ((platform === 'ios' || platform === 'android') && !native) {
        setDiag(getPluginDiagnostics())
        setPhase('error')
        return
      }

      if (native) {
        const status = await checkPhotoPermission()
        if (status === 'denied' || status === 'restricted') {
          setPhase('denied')
          return
        }
        if (status === 'authorized' || status === 'limited') {
          const s = await getGalleryStats()
          setStats(s)
        }
      }

      // Importação pendente?
      if (hasPendingImport()) {
        setPendingSummary(getPendingImportSummary())
        setPhase('paused')
        return
      }

      setPhase('ready')
    } catch (e) {
      setError(e.message)
      setPhase('ready')
    }
  }

  const handleStart = async () => {
    setError(null)
    signalRef.current = { cancelled: false }
    setStartTime(Date.now())
    setElapsed(0)

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
        setPhase(res.cancelled ? 'paused' : 'done')
        if (res.cancelled) setPendingSummary(getPendingImportSummary())
      } catch (e) {
        setError(e.message || 'Erro inesperado')
        setPhase('ready')
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleWebFiles = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    signalRef.current = { cancelled: false }
    setStartTime(Date.now())
    setElapsed(0)
    setPhase('syncing')
    setProgress({ done: 0, total: files.length, current: null, failed: 0, skipped: 0 })
    const res = await runAutoSync(files, (p) => setProgress(p), signalRef.current)
    setResult(res)
    setPhase('done')
  }

  const handlePause = () => { signalRef.current.cancelled = true }
  const handleCollapse = () => { setPhase('idle'); setShowLogs(false); setShowDiag(false) }

  // Métricas
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const remaining = Math.max(0, progress.total - progress.done - progress.failed)
  const imported = progress.done - (progress.skipped || 0)
  const speed = imported > 0 && elapsed > 0 ? (imported / (elapsed / 1000)) : 0
  const etaSec = speed > 0 && remaining > 0 ? Math.round(remaining / speed) : 0

  const fmtTime = (ms) => {
    if (ms < 1000) return '< 1s'
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    return `${m}m ${s % 60}s`
  }
  const fmtEta = (sec) => {
    if (sec <= 0) return 'calculando...'
    if (sec < 60) return `~${sec}s`
    const m = Math.floor(sec / 60)
    return `~${m}m ${sec % 60}s`
  }
  const fmtNum = (n) => (n || 0).toLocaleString('pt-BR')

  // ─── Spinner mini ──────
  const spinnerCSS = `@keyframes gi-spin{to{transform:rotate(360deg)}}.gi-spin{animation:gi-spin .9s linear infinite;transform-origin:center}`
  const MiniSpinner = ({ size = 28, color = '#3B82F6' }) => (
    <svg viewBox="0 0 50 50" width={size} height={size} style={{ display: 'block' }}>
      <circle cx="25" cy="25" r="20" fill="none" stroke="#e8e3d8" strokeWidth="5"/>
      <circle cx="25" cy="25" r="20" fill="none"
        stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray="80 50" className="gi-spin"/>
    </svg>
  )

  // ─── Logs inline ──────
  const LogsSection = () => (
    <>
      <button onClick={() => setShowLogs(!showLogs)} style={S.linkBtn}>
        {showLogs ? 'Ocultar' : 'Ver'} logs ({logs.length})
      </button>
      {showLogs && (
        <pre style={S.logsBox}>
          {logs.length > 0
            ? logs.map((l, i) => (
                <span key={i} style={{ color: l.level === 'error' ? '#EF4444' : l.level === 'warn' ? '#F59E0B' : '#d4d4d4' }}>
                  {`[${l.ts}] ${l.msg}\n`}
                </span>
              ))
            : 'Nenhum log'}
          <span ref={logsEndRef} />
        </pre>
      )}
    </>
  )

  // ═══════════════════════════════════════════════════════════════
  // IDLE — Botão compacto padrão (igual exportBtn do perfil)
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'idle') {
    return (
      <button style={S.cardBtn} onClick={handleOpen}>
        <div style={S.iconWrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" width="20" height="20">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
        <div style={S.btnTextWrap}>
          <p style={S.btnLabel}>Importar da galeria automaticamente</p>
          <p style={S.btnSub}>Importa todas as fotos e vídeos do celular</p>
        </div>
        <span style={S.arrow}>{'\u203A'}</span>
      </button>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Card expandido — todos os outros estados
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={S.card}>
      <style>{spinnerCSS}</style>

      {/* Header do card com título e botão fechar (quando não está sincronizando) */}
      <div style={S.cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={S.iconWrapSmall}>
            {phase === 'syncing' || phase === 'asking'
              ? <MiniSpinner size={18} />
              : <svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" width="16" height="16">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
            }
          </div>
          <span style={S.cardTitle}>
            {phase === 'syncing' ? 'Importando galeria...'
              : phase === 'asking' ? 'Aguardando permissão...'
              : phase === 'done' ? 'Importação concluída'
              : phase === 'paused' ? 'Importação pausada'
              : phase === 'denied' ? 'Acesso negado'
              : phase === 'error' ? 'Erro no plugin'
              : 'Importação da galeria'}
          </span>
        </div>
        {phase !== 'syncing' && phase !== 'asking' && phase !== 'loading' && (
          <button onClick={handleCollapse} style={S.closeBtn}>{'\u2715'}</button>
        )}
      </div>

      {/* ── LOADING ── */}
      {phase === 'loading' && (
        <div style={S.center}>
          <MiniSpinner size={24} />
          <p style={S.mutedText}>Preparando...</p>
        </div>
      )}

      {/* ── READY ── */}
      {phase === 'ready' && (
        <>
          {stats && (
            <div style={S.statsRow}>
              <div style={S.statChip}>
                <span style={S.statVal}>{fmtNum(stats.photos)}</span>
                <span style={S.statLbl}>fotos</span>
              </div>
              <div style={S.statChip}>
                <span style={{ ...S.statVal, color: '#D37E65' }}>{fmtNum(stats.videos)}</span>
                <span style={S.statLbl}>vídeos</span>
              </div>
              <div style={S.statChip}>
                <span style={{ ...S.statVal, color: '#4F7C52' }}>{fmtNum(stats.total)}</span>
                <span style={S.statLbl}>total</span>
              </div>
            </div>
          )}
          {alreadySynced > 0 && (
            <p style={{ ...S.mutedText, margin: '0 0 8px' }}>
              {fmtNum(alreadySynced)} já importado(s) — não serão reenviados
            </p>
          )}
          {error && <p style={S.errorText}>{error}</p>}
          <button style={S.primaryBtn} onClick={handleStart}>
            {isNative ? 'Iniciar importação automática' : 'Selecionar arquivos'}
          </button>
          {!isNative && (
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple
              style={{ display: 'none' }} onChange={handleWebFiles} />
          )}
          <LogsSection />
        </>
      )}

      {/* ── ASKING ── */}
      {phase === 'asking' && (
        <div style={S.center}>
          <p style={S.mutedText}>
            {platform === 'ios'
              ? 'Permita o acesso a todas as fotos no popup do iOS'
              : 'Permita o acesso à galeria'}
          </p>
        </div>
      )}

      {/* ── SYNCING ── */}
      {phase === 'syncing' && (
        <>
          {/* Barra de progresso */}
          <div style={S.progressBarBg}>
            <div style={{ ...S.progressBarFill, width: `${pct}%` }} />
          </div>

          {/* Contadores principais */}
          <div style={S.mainCount}>
            <span style={S.mainCountNumber}>{fmtNum(progress.done)}</span>
            <span style={S.mainCountOf}> de </span>
            <span style={S.mainCountNumber}>{fmtNum(progress.total)}</span>
            <span style={S.mainCountPct}> ({pct}%)</span>
          </div>

          {/* Arquivo atual */}
          {progress.current && (
            <p style={S.currentFile}>{truncate(progress.current, 40)}</p>
          )}

          {/* Métricas compactas */}
          <div style={S.metricsGrid}>
            <div style={S.metricItem}>
              <span style={S.metricLabel}>Restantes</span>
              <span style={{ ...S.metricValue, color: '#3B82F6' }}>{fmtNum(remaining)}</span>
            </div>
            <div style={S.metricItem}>
              <span style={S.metricLabel}>Velocidade</span>
              <span style={S.metricValue}>{speed > 0 ? `${speed.toFixed(1)}/s` : '...'}</span>
            </div>
            <div style={S.metricItem}>
              <span style={S.metricLabel}>Tempo</span>
              <span style={S.metricValue}>{fmtTime(elapsed)}</span>
            </div>
            <div style={S.metricItem}>
              <span style={S.metricLabel}>ETA</span>
              <span style={S.metricValue}>{fmtEta(etaSec)}</span>
            </div>
          </div>

          {progress.failed > 0 && (
            <p style={{ ...S.mutedText, color: '#e53935', margin: '4px 0 0' }}>
              {progress.failed} falha(s)
            </p>
          )}

          {/* Status offline */}
          {progress.status === 'offline' && (
            <div style={S.offlineTag}>Sem conexão — aguardando rede...</div>
          )}

          {/* Pausar */}
          <button style={S.pauseBtn} onClick={handlePause}>
            Pausar importação
          </button>
          <p style={{ ...S.mutedText, fontSize: 10, margin: '2px 0 0' }}>
            Pode ser retomada a qualquer momento
          </p>

          <LogsSection />
        </>
      )}

      {/* ── PAUSED ── */}
      {phase === 'paused' && (
        <>
          {pendingSummary && (
            <div style={S.statsRow}>
              <div style={S.statChip}>
                <span style={{ ...S.statVal, color: '#4F7C52' }}>{fmtNum(pendingSummary.done)}</span>
                <span style={S.statLbl}>importados</span>
              </div>
              <div style={S.statChip}>
                <span style={{ ...S.statVal, color: '#3B82F6' }}>{fmtNum(pendingSummary.remaining)}</span>
                <span style={S.statLbl}>restantes</span>
              </div>
              {pendingSummary.failed > 0 && (
                <div style={S.statChip}>
                  <span style={{ ...S.statVal, color: '#e53935' }}>{pendingSummary.failed}</span>
                  <span style={S.statLbl}>falhas</span>
                </div>
              )}
            </div>
          )}
          <button style={{ ...S.primaryBtn, background: '#F59E0B' }} onClick={handleStart}>
            Retomar importação
          </button>
          <LogsSection />
        </>
      )}

      {/* ── DONE ── */}
      {phase === 'done' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 8px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#4F7C52" strokeWidth="2.5" width="20" height="20">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#4F7C52' }}>
              {fmtNum(result?.done || 0)} memória(s) importada(s)
            </span>
          </div>
          {(result?.skipped || 0) > 0 && (
            <p style={S.mutedText}>{fmtNum(result.skipped)} já existiam</p>
          )}
          {(result?.failed || 0) > 0 && (
            <p style={{ ...S.mutedText, color: '#e53935' }}>{result.failed} falha(s)</p>
          )}
          {elapsed > 0 && (
            <p style={S.mutedText}>Tempo total: {fmtTime(elapsed)}</p>
          )}
          <LogsSection />
        </>
      )}

      {/* ── DENIED ── */}
      {phase === 'denied' && (
        <>
          <p style={{ fontSize: 12.5, color: '#6b6b6b', lineHeight: 1.45, margin: '0 0 8px' }}>
            Libere o acesso à galeria em:{' '}
            {platform === 'ios'
              ? <strong>Ajustes &gt; Recordar &gt; Fotos &gt; Todas as Fotos</strong>
              : <strong>Configurações &gt; Apps &gt; Recordar &gt; Permissões</strong>}
          </p>
        </>
      )}

      {/* ── ERROR ── */}
      {phase === 'error' && (
        <>
          <p style={{ fontSize: 12, color: '#6b6b6b', margin: '0 0 6px' }}>
            Plugin de galeria não detectado.
          </p>
          <button onClick={() => { setDiag(getPluginDiagnostics()); setShowDiag(!showDiag) }} style={S.linkBtn}>
            {showDiag ? 'Ocultar' : 'Ver'} diagnóstico
          </button>
          {showDiag && diag && (
            <pre style={S.logsBox}>{JSON.stringify(diag, null, 2)}</pre>
          )}
          <LogsSection />
        </>
      )}
    </div>
  )
}

function truncate(str, max) {
  if (!str) return ''
  if (str.length <= max) return str
  return str.substring(0, max - 3) + '...'
}

// ─── Estilos inline (segue o design system do app) ──────────────────────────

const S = {
  // Botão idle (mesmo estilo do exportBtn do perfil)
  cardBtn: {
    background: 'var(--bege-claro)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
    marginBottom: 10,
    border: 'none',
    width: '100%',
    fontFamily: 'var(--font-sans)',
    textAlign: 'left',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    background: '#DBEAFE',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  btnTextWrap: { flex: 1 },
  btnLabel: { fontSize: 14, fontWeight: 700, color: 'var(--cinza)', margin: 0 },
  btnSub: { fontSize: 12, color: 'var(--cinza-suave)', margin: '2px 0 0' },
  arrow: { fontSize: 22, color: 'var(--verde)', fontWeight: 600 },

  // Card expandido
  card: {
    background: 'var(--bege-claro)',
    borderRadius: 'var(--radius-md, 14px)',
    padding: '14px 16px',
    boxShadow: 'var(--shadow-sm)',
    marginBottom: 10,
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconWrapSmall: {
    width: 28, height: 28, borderRadius: 8,
    background: '#DBEAFE',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 14, fontWeight: 700, color: 'var(--cinza)',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#999',
    fontSize: 16, cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
  },

  // Centro
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 6, padding: '8px 0',
  },

  // Stats chips
  statsRow: { display: 'flex', gap: 6, marginBottom: 10 },
  statChip: {
    flex: 1, background: 'rgba(0,0,0,0.03)',
    borderRadius: 10, padding: '8px 4px',
    textAlign: 'center',
  },
  statVal: { display: 'block', fontSize: 15, fontWeight: 800, color: '#3B82F6' },
  statLbl: { fontSize: 10, color: '#888' },

  // Barra de progresso
  progressBarBg: {
    background: '#e8e3d8', borderRadius: 99,
    height: 6, overflow: 'hidden', marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #4F7C52)',
    borderRadius: 99, transition: 'width 0.3s ease',
  },

  // Contagem principal
  mainCount: {
    textAlign: 'center', marginBottom: 4, lineHeight: 1,
  },
  mainCountNumber: { fontSize: 18, fontWeight: 800, color: 'var(--cinza)' },
  mainCountOf: { fontSize: 13, color: '#888' },
  mainCountPct: { fontSize: 13, fontWeight: 700, color: '#3B82F6' },

  // Arquivo atual
  currentFile: {
    fontSize: 11, color: '#888', textAlign: 'center',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    margin: '2px 0 8px',
  },

  // Grid de métricas compactas (2x2)
  metricsGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '4px 12px', marginBottom: 8,
    padding: '8px 10px',
    background: 'rgba(0,0,0,0.02)', borderRadius: 10,
  },
  metricItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0',
  },
  metricLabel: { fontSize: 11, color: '#888' },
  metricValue: { fontSize: 11, fontWeight: 700, color: 'var(--cinza)' },

  // Offline
  offlineTag: {
    background: '#FEF3C7', color: '#D97706',
    padding: '6px 10px', borderRadius: 8,
    fontSize: 11, fontWeight: 600, textAlign: 'center',
    margin: '6px 0',
  },

  // Botões
  primaryBtn: {
    width: '100%', background: '#3B82F6', color: '#fff',
    border: 'none', borderRadius: 12, padding: '12px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(59,130,246,0.2)',
    marginTop: 4,
  },
  pauseBtn: {
    width: '100%', background: 'transparent', color: '#e53935',
    border: 'none', padding: '8px',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    marginTop: 6,
  },
  linkBtn: {
    display: 'block', margin: '8px auto 0',
    background: 'transparent', border: 'none',
    color: '#999', fontSize: 11,
    textDecoration: 'underline', cursor: 'pointer',
  },
  logsBox: {
    background: '#1e1e1e', color: '#d4d4d4',
    padding: 8, borderRadius: 8, fontSize: 10,
    overflowX: 'auto', overflowY: 'auto',
    maxHeight: 140, margin: '6px 0 0',
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
    lineHeight: 1.35,
  },

  // Textos
  mutedText: { fontSize: 11.5, color: '#888', margin: '2px 0', textAlign: 'center' },
  errorText: { fontSize: 12, color: '#e53935', textAlign: 'center', margin: '4px 0' },
}
