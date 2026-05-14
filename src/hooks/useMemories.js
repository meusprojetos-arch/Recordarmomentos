/**
 * useMemories — Hook para operações com memórias
 * Centraliza lógica de CRUD e importação em massa
 */

import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import db, { addMemory } from '../db/database.js'
import { format } from 'date-fns'

export function useMemories() {
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)

  /**
   * Importa múltiplos arquivos (fotos/vídeos) de uma vez.
   * Organiza automaticamente por data EXIF ou data do arquivo.
   */
  const importFiles = useCallback(async (files) => {
    if (!files?.length) return
    setIsImporting(true)
    setImportProgress(0)

    const total = files.length
    let done = 0

    for (const file of files) {
      try {
        const type = file.type.startsWith('video/') ? 'video' : 'photo'
        const date = extractDate(file)

        // Gera thumbnail para fotos e vídeos
        let thumbnail = null
        if (type === 'photo') {
          thumbnail = await generateThumbnail(file)
        } else if (type === 'video') {
          thumbnail = await generateVideoThumbnail(file)
        }

        await addMemory({
          type,
          title:    file.name.replace(/\.[^.]+$/, ''),
          date:     date,
          fileBlob: file,
          filePath: file.name,
          thumbnail,
          tags:     autoTags(date),
        })
      } catch (err) {
        console.warn('Erro ao importar:', file.name, err)
      }

      done++
      setImportProgress(Math.round((done / total) * 100))
    }

    setIsImporting(false)
    toast.success(`✅ ${total} memórias importadas!`)
  }, [])

  /**
   * Deleta uma memória por ID.
   */
  const deleteMemory = useCallback(async (id) => {
    await db.memories.delete(id)
    toast('🗑️ Memória removida')
  }, [])

  /**
   * Alterna favorito.
   */
  const toggleFavorite = useCallback(async (id, current) => {
    await db.memories.update(id, { isFavorite: !current })
  }, [])

  /**
   * Alterna destaque.
   */
  const toggleHighlight = useCallback(async (id, current) => {
    await db.memories.update(id, { isHighlight: !current })
  }, [])

  return {
    isImporting,
    importProgress,
    importFiles,
    deleteMemory,
    toggleFavorite,
    toggleHighlight,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extrai data do arquivo (lastModified como fallback) */
function extractDate(file) {
  if (file.lastModified) {
    return format(new Date(file.lastModified), 'yyyy-MM-dd')
  }
  return format(new Date(), 'yyyy-MM-dd')
}

/** Gera tags automáticas baseadas na data */
function autoTags(dateStr) {
  const tags = []
  if (!dateStr) return tags
  const date = new Date(dateStr + 'T12:00:00')
  const month = date.getMonth() + 1
  if (month === 12) tags.push('natal', 'dezembro', 'fim de ano')
  if (month === 1)  tags.push('ano novo', 'janeiro')
  return tags
}

/** Gera thumbnail do primeiro frame de um vídeo */
export async function generateVideoThumbnail(file, size = 400) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadeddata = () => {
      video.currentTime = 1.0
    }
    video.onseeked = () => {
      const ratio = Math.min(size / video.videoWidth, size / video.videoHeight)
      const canvas = document.createElement('canvas')
      canvas.width  = video.videoWidth  * ratio
      canvas.height = video.videoHeight * ratio
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.72)
    }
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    video.src = url
  })
}

/** Gera thumbnail JPEG reduzida */
export async function generateThumbnail(file, size = 400) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const ratio = Math.min(size / img.width, size / img.height)
      const canvas = document.createElement('canvas')
      canvas.width  = img.width  * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.72)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}