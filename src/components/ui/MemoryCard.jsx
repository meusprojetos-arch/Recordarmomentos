/**
 * MemoryCard — Card de memória no feed
 * Exibe thumbnail, título, data, descrição e tag de pasta
 */

import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import db from '../../db/database.js'
import styles from './MemoryCard.module.css'

// Ícones por tipo de memória — substitua pela sua imagem (40x40px)
const TYPE_ICONS = {
  photo: '/icons/tipo-foto.svg',   // 40x40 — câmera
  video: '/icons/tipo-video.svg',  // 40x40 — filmadora
  audio: '/icons/tipo-audio.svg',  // 40x40 — microfone
  text:  '/icons/tipo-texto.svg',  // 40x40 — lápis / folha
}

export default function MemoryCard({ memory }) {
  const [folder, setFolder] = useState(null)
  const [thumbUrl, setThumbUrl] = useState(null)

  useEffect(() => {
    if (memory.folderId) {
      db.folders.get(memory.folderId).then(setFolder)
    }
    if (memory.thumbnail) {
      setThumbUrl(URL.createObjectURL(memory.thumbnail))
    } else if (memory.fileBlob && memory.type === 'photo') {
      setThumbUrl(URL.createObjectURL(memory.fileBlob))
    }
    return () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl) }
  }, [memory.id])

  const dateLabel = memory.date
    ? format(new Date(memory.date + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : ''

  return (
    <div className={styles.item}>
      {/* Thumbnail */}
      <div className={styles.thumb}>
        {thumbUrl
          ? <img src={thumbUrl} alt={memory.title || 'Memória'} />
          : <img src={TYPE_ICONS[memory.type] || TYPE_ICONS.photo} alt="" aria-hidden="true" width={40} height={40} />
        }
      </div>

      {/* Conteúdo */}
      <div className={styles.info}>
        <p className={styles.title}>{memory.title || 'Sem título'}</p>
        <p className={styles.date}>{dateLabel}</p>
        {memory.description && (
          <p className={styles.desc}>{memory.description}</p>
        )}
        {folder && (
          <span className={styles.tag}>{folder.emoji} {folder.name}</span>
        )}
      </div>
    </div>
  )
}
