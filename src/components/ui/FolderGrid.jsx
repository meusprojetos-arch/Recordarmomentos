/**
 * FolderGrid — Grade de pastas do usuário
 */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import toast from 'react-hot-toast'
import db from '../../db/database.js'
import styles from './FolderGrid.module.css'

export default function FolderGrid() {
  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray(), [])

  // Contagem de memórias por pasta
  const counts = useLiveQuery(async () => {
    const all = await db.memories.toArray()
    const map = {}
    for (const m of all) {
      if (m.folderId) map[m.folderId] = (map[m.folderId] || 0) + 1
    }
    return map
  }, [])

  const handleNewFolder = async () => {
    const name = prompt('Nome da nova pasta:')
    if (!name?.trim()) return
    await db.folders.add({
      name: name.trim(),
      emoji: '/icons/pasta-generica.svg',  // URL do ícone padrão de nova pasta (28x28)
      isAuto: false,
      autoRule: null,
      order: (folders?.length || 0) + 1,
      createdAt: new Date().toISOString(),
    })
    toast.success(`📁 Pasta "${name}" criada!`)
  }

  return (
    <div className={styles.grid}>
      {folders?.map(f => (
        <div
          key={f.id}
          className={styles.item}
          onClick={() => toast(`📁 ${f.name} — ${counts?.[f.id] || 0} itens`)}
        >
          <img src={f.emoji} alt="" aria-hidden="true" className={styles.emoji} width={30} height={30} />
          <p className={styles.name}>{f.name}</p>
          <p className={styles.count}>{counts?.[f.id] || 0} itens</p>
        </div>
      ))}

      {/* Botão criar nova pasta */}
      <div className={`${styles.item} ${styles.addItem}`} onClick={handleNewFolder}>
        <img src="/icons/adicionar.svg" alt="" aria-hidden="true" width={30} height={30} className={styles.emoji} />
        <p className={`${styles.name} ${styles.addName}`}>Nova Pasta</p>
        <p className={styles.count}>criar</p>
      </div>
    </div>
  )
}
