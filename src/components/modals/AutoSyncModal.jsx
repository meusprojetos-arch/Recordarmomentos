/**
 * AutoSyncModal — Modal de upload automático estilo Google Fotos
 */
import React, { useState, useRef, useEffect } from 'react'
import { runAutoSync, isAutoSyncEnabled, countSynced } from '../../services/autoSyncService.js'
import styles from './AutoSyncModal.module.css'

export default function AutoSyncModal({ onClose, onDone }) {
  const [phase, setPhase] = useState('idle') // idle | selecting | syncing | done | cancelled | offline
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null, failed: 0 })
  const [result, setResult] = useState(null)
  const fileInputRef = useRef(null)
  const signalRef = useRef({ cancelled: false })

  const handleSelectFiles = () => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    signalRef.current = { cancelled: false }
    setPhase('syncing')
    setProgress({ done: 0, total: files.length, current: null, failed: 0 })

    const res = await runAutoSync(files, (p) => {
      setProgress(p)
      if (p.status === 'offline') setPhase('offline')
      else if (p.status === 'uploading' || p.status === 'starting') setPhase('syncing')
    }, signalRef.current)

    setResult(res)
    if (res.cancelled) setPhase('cancelled')
    else setPhase('done')
    onDone?.()
  }

  const handleCancel = () => {
    signalRef.current.cancelled = true
    setPhase('cancelled')
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const alreadySynced = countSynced()

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Upload Automático</h2>
          {phase === 'idle' && (
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          )}
        </div>

        {/* FASE: Idle — explicação inicial */}
        {phase === 'idle' && (
          <div className={styles.body}>
            <div className={styles.iconWrap}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#D37E65" strokeWidth="1.5" width="56" height="56">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className={styles.desc}>
              Selecione fotos e vídeos da sua galeria para importar automaticamente para o Recordar.
            </p>
            {alreadySynced > 0 && (
              <p className={styles.hint}>✅ {alreadySynced} arquivo(s) já sincronizado(s) serão ignorados</p>
            )}
            <p className={styles.hint}>📱 Selecione quantos arquivos quiser de uma vez</p>
            <button className={styles.btnPrimary} onClick={handleSelectFiles}>
              Selecionar da galeria
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFilesSelected}
            />
          </div>
        )}

        {/* FASE: Syncing — progresso */}
        {(phase === 'syncing' || phase === 'offline') && (
          <div className={styles.body}>
            <div className={styles.spinnerWrap}>
              <svg className={styles.spinner} viewBox="0 0 50 50" width="56" height="56">
                <circle cx="25" cy="25" r="20" fill="none" stroke="#D37E65" strokeWidth="4" strokeDasharray="80 40" strokeLinecap="round"/>
              </svg>
            </div>

            {phase === 'offline' && (
              <p className={styles.offlineTag}>📶 Sem internet — aguardando conexão...</p>
            )}

            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: pct + '%' }} />
            </div>

            <p className={styles.progressText}>
              {progress.done} de {progress.total} arquivo(s) — {pct}%
            </p>

            {progress.current && (
              <p className={styles.currentFile} title={progress.current}>
                📄 {progress.current.length > 30 ? '...' + progress.current.slice(-28) : progress.current}
              </p>
            )}

            {progress.failed > 0 && (
              <p className={styles.failedText}>⚠️ {progress.failed} falha(s)</p>
            )}

            <button className={styles.btnCancel} onClick={handleCancel}>
              Pausar / Cancelar
            </button>
          </div>
        )}

        {/* FASE: Done */}
        {phase === 'done' && (
          <div className={styles.body}>
            <div className={styles.iconWrap}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#4F7C52" strokeWidth="2" width="56" height="56">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <p className={styles.doneTitle}>Sincronização concluída!</p>
            <p className={styles.doneDesc}>
              {result?.done} foto(s)/vídeo(s) importado(s)
              {result?.failed > 0 ? ` • ${result.failed} falha(s)` : ''}
            </p>
            {result?.total > result?.done + (result?.failed || 0) && (
              <p className={styles.hint}>
                ✅ {result.total - result.done - (result.failed || 0)} arquivo(s) já estavam sincronizados
              </p>
            )}
            <button className={styles.btnPrimary} onClick={onClose}>Fechar</button>
          </div>
        )}

        {/* FASE: Cancelled */}
        {phase === 'cancelled' && (
          <div className={styles.body}>
            <div className={styles.iconWrap}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" width="56" height="56">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <p className={styles.doneTitle}>Pausado</p>
            <p className={styles.doneDesc}>
              {progress.done} de {progress.total} arquivo(s) importado(s).
              Próxima vez continuará de onde parou.
            </p>
            <button className={styles.btnPrimary} onClick={handleSelectFiles}>
              Continuar de onde parou
            </button>
            <button className={styles.btnSecondary} onClick={onClose}>Fechar</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFilesSelected}
            />
          </div>
        )}
      </div>
    </div>
  )
}