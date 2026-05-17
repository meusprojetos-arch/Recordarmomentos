/**
 * MemoryCard — Card de memória no feed
 * Usa LazyImage pra carregar thumbs só quando entram no viewport (estilo Google Photos).
 */

import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import db from '../../db/database.js'
import LazyImage from './LazyImage.jsx'
import styles from './MemoryCard.module.css'

const TYPE_ICONS = {
  photo: '/icons/tipo-foto.svg',
  video: '/icons/tipo-video.svg',
  audio: '/icons/tipo-audio.svg',
  text:  '/icons/tipo-texto.svg',
}

export default function MemoryCard({ memory }) {
  const [folder, setFolder] = useState(null)

  useEffect(() => {
    if (memory.folderId) {
      db.folders.get(memory.folderId).then(setFolder).catch(() => {})
    }
  }, [memory.folderId])

  // Resolve a URL da imagem somente quando a LazyImage decidir carregar
  const resolveSrc = async () => {
    // 1) Já tem URL do Firebase (sincronizada na nuvem) — usa direto, mais leve
    if (memory.fileUrl) return memory.fileUrl
    // 2) Já veio um objectUrl externo
    if (memory._objectUrl) return memory._objectUrl
    // 3) Tem blob local (offline ou ainda não subiu) — cria objectURL só agora
    if (memory.thumbnail instanceof Blob) return URL.createObjectURL(memory.thumbnail)
    if (memory.fileBlob instanceof Blob) return URL.createObjectURL(memory.fileBlob)
    return null
  }

  const dateLabel = memory.date
    ? format(new Date(memory.date + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : ''

  const isMedia = memory.type === 'photo' || memory.type === 'video'

  return (
    <div className={styles.item}>
      <div className={styles.thumb}>
        {isMedia ? (
          <LazyImage
            src={resolveSrc}
            alt={memory.title || 'Memória'}
            placeholder={
              <img
                src={TYPE_ICONS[memory.type] || TYPE_ICONS.photo}
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
              />
            }
          />
        ) : (
          <img
            src={TYPE_ICONS[memory.type] || TYPE_ICONS.photo}
            alt=""
            aria-hidden="true"
            width={40}
            height={40}
          />
        )}
      </div>

      <div className={styles.info}>
        <p className={styles.date}>{dateLabel}</p>
        {memory.description && (
          <p className={styles.desc}>{memory.description}</p>
        )}
        {folder && folder.name !== 'Trancadas' && (
          <span className={styles.tag}>
            <img src={folder.emoji} alt="" width={14} height={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {folder.name}
          </span>
        )}
      </div>
    </div>
  )
}
