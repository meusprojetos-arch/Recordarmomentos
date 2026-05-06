/**
 * YearBlock — Bloco de fotos de um ano na Linha do Tempo
 * Exibe grade 3x2 com overflow "+N" no último slot
 */

import React, { useState, useEffect } from 'react'
import db from '../../db/database.js'
import styles from './YearBlock.module.css'

const FILTER_MAP = {
  all:       null,
  photo:     'photo',
  video:     'video',
  audio:     'audio',
  text:      'text',
  highlight: null, // tratado separado
}

export default function YearBlock({ year, count, filter }) {
  const [memories, setMemories] = useState([])

  useEffect(() => {
    const load = async () => {
      let col = db.memories
        .where('date')
        .between(`${year}-01-01`, `${year}-12-31`, true, true)

      if (filter && filter !== 'all') {
        if (filter === 'highlight') {
          const all = await col.toArray()
          setMemories(all.filter(m => m.isHighlight).slice(0, 6))
          return
        }
        const all = await col.toArray()
        setMemories(all.filter(m => m.type === FILTER_MAP[filter]).slice(0, 6))
        return
      }

      const items = await col.limit(6).toArray()
      setMemories(items)
    }
    load()
  }, [year, filter])

  if (memories.length === 0 && filter !== 'all') return null

  return (
    <div className={styles.block}>
      <div className={styles.header}>
        <span className={styles.year}>{year}</span>
        <span className={styles.countBadge}>{count} memórias</span>
      </div>

      <div className={styles.grid}>
        {memories.slice(0, 5).map((m, i) => (
          <GridItem key={m.id} memory={m} big={i === 0} />
        ))}

        {/* Slot de overflow "+N" */}
        {count > 6 && (
          <div className={`${styles.cell} ${styles.overflow}`}>
            <span className={styles.overflowNum}>+{count - 5}</span>
            <span className={styles.overflowSub}>fotos</span>
          </div>
        )}
      </div>
    </div>
  )
}

function GridItem({ memory, big }) {
  const [thumbUrl, setThumbUrl] = useState(null)

  useEffect(() => {
    if (memory.thumbnail) {
      setThumbUrl(URL.createObjectURL(memory.thumbnail))
    } else if (memory.fileBlob && memory.type === 'photo') {
      setThumbUrl(URL.createObjectURL(memory.fileBlob))
    }
    return () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl) }
  }, [memory.id])

  // Ícones por tipo de memória — substitua pela sua imagem
  // Tamanho: 40x40px (exibidos na grade quando não há thumbnail)
  const TYPE_ICONS = {
    photo: '/icons/tipo-foto.svg',   // 40x40
    video: '/icons/tipo-video.svg',  // 40x40
    audio: '/icons/tipo-audio.svg',  // 40x40
    text:  '/icons/tipo-texto.svg',  // 40x40
  }

  return (
    <div className={`${styles.cell} ${big ? styles.big : ''}`}>
      {thumbUrl
        ? <img src={thumbUrl} alt={memory.title || ''} />
        : <img src={TYPE_ICONS[memory.type] || TYPE_ICONS.photo} alt="" aria-hidden="true" width={40} height={40} />
      }
      {big && memory.title && (
        <div className={styles.cellOverlay}>{memory.title}</div>
      )}
    </div>
  )
}
