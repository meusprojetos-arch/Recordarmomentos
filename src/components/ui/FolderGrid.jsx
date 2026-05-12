/**
 * FolderGrid — Grade de pastas do usuário
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import toast from 'react-hot-toast'
import db from '../../db/database.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import styles from './FolderGrid.module.css'

export default function FolderGrid({ onOpenFolder, memoryCounts }) {
  const { user } = useAuth()
  const folders = useLiveQuery(() => {
    if (!user?.uid) return []
    return db.folders.where('uid').equals(user.uid).sortBy('order')
  }, [user?.uid])
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')

  const handleNewFolder = async () => {
    if (!showInput) {
      setShowInput(true)
      return
    }
    if (!newName.trim()) {
      toast.error('Digite um nome para a pasta')
      return
    }
    try {
      await db.folders.add({
        name: newName.trim(),
        emoji: '/icons/pasta-generica.svg',
        isAuto: false,
        autoRule: null,
        uid: user?.uid || '',
        order: (folders?.length || 0) + 1,
        createdAt: new Date().toISOString(),
      })
      toast.success(`Pasta "${newName.trim()}" criada!`)
      setNewName('')
      setShowInput(false)
    } catch (err) {
      console.error('Erro ao criar pasta:', err)
      toast.error('Erro ao criar pasta')
    }
  }

  return (
    <div className={styles.grid}>
      {folders?.map(f => (
        <div
          key={f.id}
          className={styles.item}
          onClick={() => onOpenFolder ? onOpenFolder(f) : null}
        >
          <img src={f.emoji} alt="" aria-hidden="true" className={styles.emoji} width={30} height={30} />
          <p className={styles.name}>{f.name}</p>
          <p className={styles.count}>{memoryCounts?.[f.id] || 0} itens</p>
        </div>
      ))}

      {/* Botão criar nova pasta */}
      <div className={`${styles.item} ${styles.addItem}`} onClick={handleNewFolder}>
        <img src="/icons/adicionar.svg" alt="" aria-hidden="true" width={30} height={30} className={styles.emoji} />
        <p className={`${styles.name} ${styles.addName}`}>Nova Pasta</p>
        <p className={styles.count}>criar</p>
      </div>

      {/* Input inline para nome da nova pasta */}
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
    </div>
  )
}
