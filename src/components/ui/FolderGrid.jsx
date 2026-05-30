/**
 * FolderGrid — Grade de pastas com capa de foto
 *
 * Cada pasta tenta carregar /icons/capa-{slug}.jpg
 * Se não existir, cai no ícone SVG como fallback.
 * Nome e contagem ficam ACIMA da imagem de capa.
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import toast from 'react-hot-toast'
import db, { SYSTEM_FOLDERS, AI_FOLDERS } from '../../db/database.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import styles from './FolderGrid.module.css'

// Mapeia nome da pasta → slug do arquivo de capa
const NAME_TO_SLUG = {
  'Família':  'familia',
  'Viagens':  'viagens',
  'Amigos':   'amigos',
  'Trabalho': 'trabalho',
}

function getCoverSlug(folder) {
  const id = String(folder.id ?? '')
  if (id === 'favoritos') return 'favoritos'
  if (id === 'trancados') return 'trancados'
  if (id.startsWith('ai_')) return id.replace('ai_', '')
  return NAME_TO_SLUG[folder.name] || null
}

export default function FolderGrid({ onOpenFolder, memoryCounts = {}, folderCovers = {} }) {
  const { user } = useAuth()
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')

  const userFolders = useLiveQuery(() => {
    if (!user?.uid) return []
    return db.folders.where('uid').equals(user.uid).sortBy('order')
  }, [user?.uid]) || []

  const LEGACY_FOLDERS = [
    'Aniversários', 'Natal', 'Ano Novo', 'Dia das Mães', 'Dia dos Pais',
    'Dia dos Namorados', 'Páscoa', 'Histórias', 'Destaques',
  ]
  const visibleUserFolders = userFolders.filter(f => !LEGACY_FOLDERS.includes(f.name))

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

  const favoritos = SYSTEM_FOLDERS.find(f => f.id === 'favoritos')
  const trancados = SYSTEM_FOLDERS.find(f => f.id === 'trancados')

  return (
    <div className={styles.sections}>
      <div className={styles.grid}>

        {/* 1. Favoritos */}
        <FolderItem folder={favoritos} count={memoryCounts['favoritos'] || 0}
          onClick={() => onOpenFolder?.({ ...favoritos })}
          dynamicCover={folderCovers['favoritos']} />

        {/* 2. Família, Viagens, Amigos, Trabalho + custom */}
        {visibleUserFolders.map(f => (
          <FolderItem key={f.id} folder={{ ...f, folderType: 'user' }}
            count={memoryCounts[f.id] || 0}
            onClick={() => onOpenFolder?.({ ...f, folderType: 'user' })}
            dynamicCover={folderCovers[f.id]} />
        ))}

        {/* 3. Comida, Pets, Festa, Natureza, Selfies */}
        {AI_FOLDERS.map(f => (
          <FolderItem key={f.id} folder={f}
            count={memoryCounts[f.id] || 0}
            onClick={() => onOpenFolder?.({ ...f })}
            dynamicCover={folderCovers[f.id]} />
        ))}

        {/* 4. Trancados */}
        <FolderItem folder={trancados} count={memoryCounts['trancados'] || 0}
          onClick={() => onOpenFolder?.({ ...trancados })}
          dynamicCover={folderCovers['trancados']} />

        {/* 5. Nova Pasta */}
        <div className={`${styles.item} ${styles.addItem}`} onClick={handleNewFolder}>
          <div className={styles.itemHeader}>
            <p className={`${styles.name} ${styles.addName}`}>Nova Pasta</p>
            <p className={styles.count}>criar</p>
          </div>
          <div className={styles.coverWrap}>
            <span className={styles.addIcon}>＋</span>
          </div>
        </div>

      </div>

      {/* Modal nova pasta */}
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

function FolderItem({ folder, count, onClick, dynamicCover }) {
  const slug = getCoverSlug(folder)
  const staticCover = slug ? `/icons/capa-${slug}.png` : null
  const fallbackIcon = folder.icon || folder.emoji || '/icons/pasta-generica.svg'

  // Prioridade: foto real da memória → PNG estático → ícone SVG
  const effectiveCover = dynamicCover || staticCover

  const coverStyle = effectiveCover
    ? { backgroundImage: `url(${effectiveCover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {}

  return (
    <div className={styles.item} onClick={onClick}>
      <div className={styles.itemHeader}>
        <p className={styles.name}>{folder.name}</p>
        <p className={styles.count}>{count} itens</p>
      </div>
      <div
        className={styles.coverWrap}
        style={coverStyle}
      >
        {!effectiveCover && (
          <img src={fallbackIcon} alt="" width={32} height={32} />
        )}
      </div>
    </div>
  )
}
