/**
 * GalleryImportCard — Card compacto inline de importação da galeria.
 * Mesmo tamanho do botão original. Nunca abre modal separado.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  getPluginDiagnostics,
  getAutoSyncLogs,
  subscribeToAutoSyncLogs,
  hasPendingImport,
  getPendingImportSummary,
} from '../../services/autoSyncService.js'

const spinCSS = `@keyframes _gis{to{transform:rotate(360deg)}}._gis{animation:_gis .8s linear infinite;transform-origin:center}`

const GalleryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" width="20" height="20">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)

const Spinner = ({ size = 20 }) => (
  <svg viewBox="0 0 50 50" width={size} height={size}>
    <circle cx="25" cy="25" r="20" fill="none" stroke="#e8e3d8" strokeWidth="5"/>
    <circle cx="25" cy="25" r="20" fill="none" stroke="#3B82F6" strokeWidth="5"
      strokeLinecap="round" strokeDasharray="80 50" className="_gis"/>
  </svg>
)

export default function GalleryImportCard() {
  // idle | loading | ready | asking | syncing | paused | done | denied | error
  const [phase, setPhase] = useState('idle')
  const [isNative, setIsNative] = useState(false)
  const [stats, setStats] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 })
  const [result, setResult] = useState(null)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState([])
  const [showDiag, setShowDiag] = useState(false)
  const [diag, setDiag] = useState(null)
  const signalRef = useRef({ cancelled: false })
  const fileInputRef = useRef(null)
  const platform = getPlatform()

  useEffect(() => {
    const unsub = subscribeToAutoSyncLogs(() => setLogs(getAutoSyncLogs()))
    return () => unsub()
  }, [])

  // ─── Clicou no botão ──────────────────────────────────────────
  const handleTap = async () => {
    if (phase === 'syncing' || phase === 'asking' || phase === 'loading') return

    // Se já está em algum estado expandido, colapsa
    if (phase !== 'idle') { setPhase('idle'); return }

    setPhase('loading')
    try {
      if ((platform === 'ios' || platform === 'android') && !isNativePhotoLibrary()) {
        await waitForNativePlugin(3000)
      }
      let native = isNativePhotoLibrary()
      if (native) native = await isNativePhotoLibraryReady()
      setIsNative(native)

      if ((platform === 'ios' || platform === 'android') && !native) {
        setDiag(getPluginDiagnostics())
        setPhase('error')
        return
      }

      if (native) {
        const st = await checkPhotoPermission()
        if (st === 'denied' || st === 'restricted') { setPhase('denied'); return }
        if (st === 'authorized' || st === 'limited') setStats(await getGalleryStats())
      }

      // Importação pendente?
      if (hasPendingImport()) {
        const summary = getPendingImportSummary()
        setProgress({ done: summary.done, total: summary.totalGallery, failed: summary.failed })
        setPhase('paused')
        return
      }

      setPhase('ready')
    } catch (e) {
      setPhase('idle')
    }
  }

  // ─── Iniciar / Retomar ────────────────────────────────────────
  const handleStart = useCallback(async () => {
    signalRef.current = { cancelled: false }

    if (isNative) {
      setPhase('asking')
      try {
        // Pré-carregar contagem já importada para o progress não começar do zero
        const alreadyDone = await countSyncedAssets().catch(() => 0)

        const res = await runAutoSyncNative((p) => {
          if (p.status === 'denied') { setPhase('denied'); return }
          setProgress({ done: p.done, total: p.total, failed: p.failed })
          if (p.status === 'starting' || p.status === 'uploading' || p.status === 'offline') {
            setPhase('syncing')
          }
        }, signalRef.current)

        if (res.denied) { setPhase('denied'); return }
        setResult(res)
        if (res.cancelled) {
          setProgress({ done: res.done, total: res.total, failed: res.failed })
          setPhase('paused')
        } else {
          setPhase('done')
        }
      } catch (e) {
        setPhase('idle')
      }
    } else {
      fileInputRef.current?.click()
    }
  }, [isNative, stats])

  const handleWebFiles = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    signalRef.current = { cancelled: false }
    setPhase('syncing')
    setProgress({ done: 0, total: files.length, failed: 0 })
    const res = await runAutoSync(files, (p) => {
      setProgress({ done: p.done, total: p.total, failed: p.failed })
    }, signalRef.current)
    setResult(res)
    setPhase(res.cancelled ? 'paused' : 'done')
  }

  const handlePause = useCallback(() => {
    signalRef.current.cancelled = true
  }, [])

  // Métricas
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const remaining = Math.max(0, progress.total - progress.done - progress.failed)
  const fmt = (n) => (n || 0).toLocaleString('pt-BR')

  // ═══════════════════════════════════════════════════════════════
  // IDLE — Botão normal
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'idle') {
    return (
      <button style={S.card} onClick={handleTap}>
        <div style={S.icon}><GalleryIcon /></div>
        <div style={S.textWrap}>
          <p style={S.label}>Importar da galeria</p>
          <p style={S.sub}>Importa fotos e vídeos automaticamente</p>
        </div>
        <span style={S.arrow}>{'\u203A'}</span>
      </button>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'loading') {
    return (
      <div style={S.card}>
        <style>{spinCSS}</style>
        <div style={S.icon}><Spinner /></div>
        <div style={S.textWrap}>
          <p style={S.label}>Preparando...</p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ASKING — aguardando permissão
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'asking') {
    return (
      <div style={S.card}>
        <style>{spinCSS}</style>
        <div style={S.icon}><Spinner /></div>
        <div style={S.textWrap}>
          <p style={S.label}>Aguardando permissão...</p>
          <p style={S.sub}>{platform === 'ios' ? 'Permita acesso às fotos' : 'Permita acesso à galeria'}</p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // SYNCING — progresso compacto
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'syncing') {
    return (
      <div style={S.cardCol}>
        <style>{spinCSS}</style>

        {/* Linha principal: spinner + contagem + pausar */}
        <div style={S.row}>
          <div style={S.icon}><Spinner /></div>
          <div style={{ flex: 1 }}>
            <p style={S.label}>
              {fmt(progress.done)} de {fmt(progress.total)} <span style={{ color: '#3B82F6', fontWeight: 700 }}>({pct}%)</span>
            </p>
            <p style={S.sub}>
              {remaining > 0 ? `${fmt(remaining)} restante(s)` : 'Finalizando...'}
              {progress.failed > 0 && <span style={{ color: '#e53935' }}> · {progress.failed} falha(s)</span>}
            </p>
          </div>
          <button onClick={handlePause} style={S.pauseLink}>Pausar</button>
        </div>

        {/* Barra de progresso fina */}
        <div style={S.barBg}>
          <div style={{ ...S.barFill, width: `${pct}%` }} />
        </div>

        {/* Logs (debug) */}
        <LogsInline show={showLogs} setShow={setShowLogs} logs={logs} />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // PAUSED — retomar
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'paused') {
    return (
      <div style={S.cardCol}>
        <div style={S.row}>
          <div style={{ ...S.icon, background: '#FEF3C7' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" width="18" height="18">
              <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={S.label}>Pausado — {fmt(progress.done)} de {fmt(progress.total)}</p>
            <p style={S.sub}>{fmt(remaining)} restante(s)</p>
          </div>
          <button onClick={handleStart} style={S.resumeLink}>Retomar</button>
        </div>
        <button onClick={() => setPhase('idle')} style={S.dimLink}>Fechar</button>
        <LogsInline show={showLogs} setShow={setShowLogs} logs={logs} />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // READY — iniciar
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'ready') {
    return (
      <div style={S.cardCol}>
        <div style={S.row}>
          <div style={S.icon}><GalleryIcon /></div>
          <div style={{ flex: 1 }}>
            <p style={S.label}>
              {stats ? `${fmt(stats.total)} arquivos na galeria` : 'Pronto para importar'}
            </p>
            <p style={S.sub}>Importação automática completa</p>
          </div>
        </div>
        <button style={S.startBtn} onClick={handleStart}>
          {isNative ? 'Iniciar' : 'Selecionar arquivos'}
        </button>
        {!isNative && (
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple
            style={{ display: 'none' }} onChange={handleWebFiles} />
        )}
        <button onClick={() => setPhase('idle')} style={S.dimLink}>Cancelar</button>
        <LogsInline show={showLogs} setShow={setShowLogs} logs={logs} />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'done') {
    return (
      <div style={S.cardCol}>
        <div style={S.row}>
          <div style={{ ...S.icon, background: '#E8F5E9' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#4F7C52" strokeWidth="2.5" width="18" height="18">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={S.label}>{fmt(result?.done || 0)} importada(s)</p>
            <p style={S.sub}>
              {(result?.failed || 0) > 0 && `${result.failed} falha(s) · `}
              Concluído
            </p>
          </div>
        </div>
        <button onClick={() => setPhase('idle')} style={S.dimLink}>Fechar</button>
        <LogsInline show={showLogs} setShow={setShowLogs} logs={logs} />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // DENIED
  // ═══════════════════════════════════════════════════════════════
  if (phase === 'denied') {
    return (
      <div style={S.cardCol}>
        <div style={S.row}>
          <div style={{ ...S.icon, background: '#FEE2E2' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#e53935" strokeWidth="2" width="18" height="18">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={S.label}>Acesso negado</p>
            <p style={S.sub}>{platform === 'ios' ? 'Ajustes > Recordar > Fotos' : 'Configurações > Permissões'}</p>
          </div>
        </div>
        <button onClick={() => setPhase('idle')} style={S.dimLink}>Fechar</button>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ERROR
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={S.cardCol}>
      <div style={S.row}>
        <div style={{ ...S.icon, background: '#FEF3C7' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" width="18" height="18">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={S.label}>Plugin indisponível</p>
          <p style={S.sub}>Galeria nativa não detectada</p>
        </div>
      </div>
      <button onClick={() => { setDiag(getPluginDiagnostics()); setShowDiag(!showDiag) }} style={S.dimLink}>
        {showDiag ? 'Ocultar' : 'Ver'} diagnóstico
      </button>
      {showDiag && diag && <pre style={S.logsBox}>{JSON.stringify(diag, null, 2)}</pre>}
      <button onClick={() => setPhase('idle')} style={S.dimLink}>Fechar</button>
      <LogsInline show={showLogs} setShow={setShowLogs} logs={logs} />
    </div>
  )
}

// ─── Logs compactos ──────────────────────────────────────────────────────────

function LogsInline({ show, setShow, logs }) {
  const endRef = useRef(null)
  useEffect(() => {
    if (show && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [logs, show])

  return (
    <>
      <button onClick={() => setShow(!show)} style={S.dimLink}>
        {show ? 'Ocultar' : 'Ver'} logs ({logs.length})
      </button>
      {show && (
        <pre style={S.logsBox}>
          {logs.map((l, i) => (
            <span key={i} style={{ color: l.level === 'error' ? '#EF4444' : l.level === 'warn' ? '#F59E0B' : '#d4d4d4' }}>
              {`[${l.ts}] ${l.msg}\n`}
            </span>
          ))}
          <span ref={endRef} />
        </pre>
      )}
    </>
  )
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const S = {
  // Card base (mesmo tamanho do exportBtn)
  card: {
    background: 'var(--bege-claro)',
    borderRadius: 'var(--radius-md, 14px)',
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
    marginBottom: 10,
    border: 'none',
    width: '100%',
    fontFamily: 'var(--font-sans, -apple-system, sans-serif)',
    textAlign: 'left',
  },
  // Card coluna (para estados com conteúdo extra abaixo)
  cardCol: {
    background: 'var(--bege-claro)',
    borderRadius: 'var(--radius-md, 14px)',
    padding: '14px 16px',
    boxShadow: 'var(--shadow-sm)',
    marginBottom: 10,
    fontFamily: 'var(--font-sans, -apple-system, sans-serif)',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  icon: {
    width: 36, height: 36, borderRadius: 10,
    background: '#DBEAFE',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: { flex: 1 },
  label: { fontSize: 14, fontWeight: 700, color: 'var(--cinza)', margin: 0 },
  sub: { fontSize: 12, color: 'var(--cinza-suave, #888)', margin: '2px 0 0' },
  arrow: { fontSize: 22, color: 'var(--verde)', fontWeight: 600 },

  // Barra de progresso
  barBg: {
    background: '#e8e3d8', borderRadius: 99,
    height: 4, overflow: 'hidden',
    margin: '10px 0 4px',
  },
  barFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #4F7C52)',
    borderRadius: 99, transition: 'width 0.3s ease',
  },

  // Botões inline
  pauseLink: {
    background: 'none', border: 'none',
    color: '#e53935', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', padding: '4px 8px',
    flexShrink: 0,
  },
  resumeLink: {
    background: 'none', border: 'none',
    color: '#3B82F6', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', padding: '4px 8px',
    flexShrink: 0,
  },
  startBtn: {
    width: '100%', background: '#3B82F6', color: '#fff',
    border: 'none', borderRadius: 10, padding: '10px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    marginTop: 10,
  },
  dimLink: {
    display: 'block', margin: '6px auto 0',
    background: 'transparent', border: 'none',
    color: '#aaa', fontSize: 11, cursor: 'pointer',
    textDecoration: 'underline',
  },

  // Logs
  logsBox: {
    background: '#1e1e1e', color: '#d4d4d4',
    padding: 8, borderRadius: 8, fontSize: 10,
    overflowX: 'auto', overflowY: 'auto',
    maxHeight: 120, margin: '6px 0 0',
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
    lineHeight: 1.3,
  },
}
