/**
 * BackupLogsModal — Visualizador de logs do backup dentro do app.
 * Útil pra debug sem precisar de DevTools externo (Mac/Safari).
 */
import React, { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  getBackupLogs, subscribeToBackupLogs, clearBackupLogs,
} from '../../services/cloudBackupService.js'

export default function BackupLogsModal({ onClose }) {
  const [logs, setLogs] = useState(getBackupLogs())
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('all') // all | info | warn
  const listRef = useRef(null)

  useEffect(() => {
    const unsub = subscribeToBackupLogs(() => {
      setLogs(getBackupLogs())
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter)

  const copyAll = async () => {
    const text = logs.map(l => `[${l.ts}] ${l.level.toUpperCase()}: ${l.msg}`).join('\n')
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback: textarea + execCommand
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.top = '0'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success('Logs copiados!')
    } catch (e) {
      toast.error('Não foi possível copiar')
    }
  }

  const clearLogs = () => {
    clearBackupLogs()
    setLogs([])
    toast('Logs limpos')
  }

  const overlay = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'flex-end',
    zIndex: 9999,
  }
  const modal = {
    background: '#fff',
    width: '100%',
    maxHeight: '85vh',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }
  const header = {
    padding: '14px 16px',
    borderBottom: '1px solid #eee',
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fafafa',
  }
  const title = {
    fontSize: 16, fontWeight: 700, color: '#333',
    flex: 1,
  }
  const btnBase = {
    background: 'none', border: '1px solid #ddd',
    borderRadius: 8, padding: '6px 10px',
    fontSize: 12, cursor: 'pointer', color: '#555',
  }
  const closeBtn = {
    ...btnBase,
    border: 'none', fontSize: 20, padding: '4px 10px',
  }
  const toolbar = {
    padding: '8px 12px',
    display: 'flex', gap: 8, alignItems: 'center',
    borderBottom: '1px solid #eee',
    background: '#f5f5f5',
    flexWrap: 'wrap',
  }
  const list = {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
    background: '#1e1e1e',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
    fontSize: 11,
    lineHeight: 1.45,
    color: '#d4d4d4',
  }
  const row = (level) => ({
    padding: '4px 8px',
    borderRadius: 4,
    marginBottom: 2,
    color: level === 'warn' ? '#ffb86b' : '#9cdcfe',
    background: level === 'warn' ? 'rgba(255,184,107,0.08)' : 'transparent',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  })
  const tsStyle = { color: '#666', marginRight: 8 }
  const empty = {
    padding: 32, textAlign: 'center', color: '#888', fontSize: 13,
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div style={title}>📋 Logs do Backup ({filtered.length})</div>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={toolbar}>
          <button style={btnBase} onClick={copyAll}>📋 Copiar tudo</button>
          <button style={btnBase} onClick={clearLogs}>🗑️ Limpar</button>
          <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ ...btnBase, padding: '5px 8px' }}
          >
            <option value="all">Todos</option>
            <option value="info">Info</option>
            <option value="warn">Avisos</option>
          </select>
        </div>

        <div ref={listRef} style={list}>
          {filtered.length === 0 ? (
            <div style={empty}>Sem logs ainda. Ative o backup pra começar.</div>
          ) : (
            filtered.map((l, i) => (
              <div key={i} style={row(l.level)}>
                <span style={tsStyle}>{l.ts}</span>{l.msg}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
