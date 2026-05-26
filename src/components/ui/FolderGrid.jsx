/**
 * FolderGrid — Grade de pastas (fixas, IA e sistema)
 *
 * Pastas fixas (DB):   Família, Viagens, Amigos, Trabalho + custom
 * Pastas IA (código):  Comida, Pets, Festa, Natureza, Selfies
 * Sistema (código):    Favoritos, Trancados
 *
 * Nenhuma foto é duplicada — todas as pastas são filtros por metadados.
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import toast from 'react-hot-toast'
import db, { SYSTEM_FOLDERS, AI_FOLDERS } from '../../db/database.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import styles from './FolderGrid.module.css'

export default function FolderGrid({ onOpenFolder, memoryCounts = {} }) {
  const { user } = useAuth()
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')

  // Pastas do usuário salvas no IndexedDB
  const userFolders = useLiveQuery(() => {
    if (!user?.uid) return []
    return db.folders
      .where('uid').equals(user.uid)
      .sortBy('order')
  }, [user?.uid]) || []

  const handleNewFolder = async () => {
    if (!showInput) { setShowInput(true); return }
    if (!newName.trim()) { toast.error('Digite um nome para a pasta'); return }
    try {
      const maxOrder = userFolders.reduce((m, f) => Math.max(m, f.order || 0), 0)
      await db.folders.add({
        name: newName.trim(),
        emoji: '/icons/pasta-generica.svg',
        folderType: 'user',
        isAuto: false,
        autoRule: null,
        uid: user?.uid || '',
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
      })
      toast.success(`Pasta "${newName.trim()}" criada!`)
      setNewName('')
      setShowInput(false)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao criar pasta')
    }
  }

  return (
    <div className={styles.sections}>

      {/* ── Minhas Pastas ── */}
      <p className={styles.sectionLabel}>Minhas Pastas</p>
      <div className={styles.grid}>
        {userFolders.map(f => (
          <FolderItem
            key={f.id}
            name={f.name}
            icon={<img src={f.emoji || '/icons/pasta-generica.svg'} alt="" width={28} height={28} />}
            count={memoryCounts[f.id] || 0}
            onClick={() => onOpenFolder?.({ ...f, folderType: 'user' })}
          />
        ))}

        {/* Botão nova pasta */}
        <div className={`${styles.item} ${styles.addItem}`} onClick={handleNewFolder}>
          <span className={styles.addIcon}>＋</span>
          <p className={`${styles.name} ${styles.addName}`}>Nova Pasta</p>
          <p className={styles.count}>criar</p>
        </div>
      </div>

      {/* Input inline para nome */}
      {showInput && (
        <div className={styles.newFolderOverlay} onClick={() => setShowInput(false)}>
          <div className={styles.newFolderModal} onClick={e => e.stopPropagation()}>
            <p className={styles.newFolderTitle}>Nova Pasta</p>
            <input
              className={styles.newFolderInput}
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nome da pasta"
              autoFocus
              maxLength={40}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNewFolder()
                if (e.key === 'Escape') setShowInput(false)
              }}
            />
            <div className={styles.newFolderActions}>
              <button className={styles.newFolderCancel} onClick={() => setShowInput(false)}>Cancelar</button>
              <button className={styles.newFolderConfirm} onClick={handleNewFolder}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pastas IA ── */}
      <p className={styles.sectionLabel}>
        Automáticas <span className={styles.sectionBadge}>IA</span>
      </p>
      <div className={styles.grid}>
        {AI_FOLDERS.map(f => (
          <FolderItem
            key={f.id}
            name={f.name}
            icon={<span className={styles.emojiIcon}>{f.icon}</span>}
            count={memoryCounts[f.id] || 0}
            onClick={() => onOpenFolder?.({ ...f })}
            badge="IA"
          />
        ))}
      </div>

      {/* ── Sistema ── */}
      <p className={styles.sectionLabel}>Especiais</p>
      <div className={styles.grid}>
        {SYSTEM_FOLDERS.map(f => (
          <FolderItem
            key={f.id}
            name={f.name}
            icon={<span className={styles.emojiIcon}>{f.icon}</span>}
            count={f.rule === 'isLocked' ? '🔒' : (memoryCounts[f.id] || 0)}
            onClick={() => onOpenFolder?.({ ...f })}
          />
        ))}
      </div>

    </div>
  )
}

function FolderItem({ name, icon, count, onClick, badge }) {
  return (
    <div className={styles.item} onClick={onClick}>
      <div className={styles.iconWrap}>{icon}</div>
      <p className={styles.name}>{name}</p>
      <p className={styles.count}>
        {typeof count === 'string' ? count : `${count} itens`}
      </p>
      {badge && <span className={styles.aiBadge}>{badge}</span>}
    </div>
  )
}
