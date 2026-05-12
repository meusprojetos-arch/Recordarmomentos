/**
 * exportService.js — Exportar todas as memorias como ZIP
 * Inclui fotos, videos, audios e textos organizados por pasta
 */
import JSZip from 'jszip'
import { getMemories } from './memoriesService.js'
import { db } from '../db/database.js'
import { auth } from '../firebase.js'

/**
 * Exporta todas as memorias em um arquivo ZIP organizado por pastas
 * e faz download automatico no navegador
 */
export async function exportAllAsZip() {
  const memories = await getMemories()
  if (memories.length === 0) throw new Error('Nenhuma memoria para exportar')

  // Buscar pastas do IndexedDB (filtradas por uid)
  let folders = []
  try {
    const uid = auth.currentUser?.uid
    folders = uid
      ? await db.folders.where('uid').equals(uid).toArray()
      : await db.folders.toArray()
  } catch { /* ignore */ }

  const folderMap = {}
  for (const f of folders) {
    folderMap[f.id] = f.name
  }

  const zip = new JSZip()

  // Criar estrutura de pastas no ZIP
  const zipFolders = {
    'Fotos': zip.folder('Fotos'),
    'Videos': zip.folder('Videos'),
    'Audios': zip.folder('Audios'),
    'Frases': zip.folder('Frases'),
    'Destaques': zip.folder('Destaques'),
  }

  // Criar pastas do usuario
  for (const f of folders) {
    if (!zipFolders[f.name]) {
      zipFolders[f.name] = zip.folder(f.name)
    }
  }

  let indexText = 'RECORDAR — Exportação de Memórias\n'
  indexText += `Data: ${new Date().toLocaleDateString('pt-BR')}\n`
  indexText += `Total: ${memories.length} memórias\n\n`

  let count = 0

  for (const mem of memories) {
    const date = mem.date || 'sem-data'
    const safeDate = date.replace(/[/\\:]/g, '-')
    const safeDesc = (mem.description || '').substring(0, 30).replace(/[^a-zA-Z0-9À-ÿ\s_-]/g, '').trim()
    const baseName = safeDesc || `memoria_${count + 1}`

    // Determinar pasta destino
    let targetFolder = null

    // Se é destaque
    if (mem.isHighlight) {
      targetFolder = zipFolders['Destaques']
    }

    // Se pertence a uma pasta do usuario
    if (mem.folderId && folderMap[mem.folderId]) {
      const pastaName = folderMap[mem.folderId]
      if (!zipFolders[pastaName]) {
        zipFolders[pastaName] = zip.folder(pastaName)
      }
      targetFolder = zipFolders[pastaName]
    }

    // Se nao tem pasta especifica, usa pasta por tipo
    if (!targetFolder) {
      if (mem.type === 'photo') targetFolder = zipFolders['Fotos']
      else if (mem.type === 'video') targetFolder = zipFolders['Videos']
      else if (mem.type === 'audio') targetFolder = zipFolders['Audios']
      else targetFolder = zipFolders['Frases']
    }

    // Obter o blob do arquivo
    let fileBlob = null

    // 1. Blob ja enriquecido pelo getMemories
    if (mem.fileBlob && mem.fileBlob instanceof Blob) {
      fileBlob = mem.fileBlob
    } else if (mem.fileBlob && !(mem.fileBlob instanceof Blob)) {
      fileBlob = new Blob([mem.fileBlob], { type: getMimeType(mem.type) })
    }

    // 2. Se tem fileUrl (premium/cloud), buscar via fetch
    if (!fileBlob && mem.fileUrl && !mem.fileUrl.startsWith('blob:')) {
      try {
        const response = await fetch(mem.fileUrl)
        if (response.ok) {
          fileBlob = await response.blob()
        }
      } catch { /* skip */ }
    }

    // 3. Buscar no IndexedDB fileBlobs table
    if (!fileBlob) {
      try {
        let match = null
        if (mem.localBlobId) {
          match = await db.fileBlobs.where('localBlobId').equals(mem.localBlobId).first()
        }
        if (!match) {
          match = await db.fileBlobs.where('firestoreId').equals(mem.id).first()
        }
        if (match?.blob) {
          fileBlob = match.blob
        }
      } catch { /* skip */ }
    }

    // Adicionar arquivo ao ZIP
    if (fileBlob) {
      const ext = getExtension(mem.type, fileBlob.type)
      targetFolder.file(`${safeDate}_${baseName}.${ext}`, fileBlob)
    }

    // Adicionar texto/descricao
    if (mem.type === 'text' || (mem.description && !fileBlob)) {
      const textContent = [
        `Data: ${mem.date || 'N/A'}`,
        '',
        mem.description || mem.title || '',
      ].join('\n')
      targetFolder.file(`${safeDate}_${baseName}.txt`, textContent)
    }

    // Se tem arquivo E descricao, adicionar nota separada
    if (fileBlob && mem.description) {
      targetFolder.file(`${safeDate}_${baseName}_desc.txt`, mem.description)
    }

    indexText += `- [${mem.type}] ${date} — ${mem.description?.substring(0, 50) || 'Sem descrição'}\n`
    count++
  }

  zip.file('_indice.txt', indexText)

  // Gera o ZIP e faz download
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  downloadBlob(blob, `Recordar_Backup_${new Date().toISOString().substring(0, 10)}.zip`)
}

function getExtension(type, mimeType) {
  if (mimeType?.includes('png')) return 'png'
  if (mimeType?.includes('webp')) return 'webp'
  if (mimeType?.includes('gif')) return 'gif'
  if (mimeType?.includes('mp4')) return 'mp4'
  if (mimeType?.includes('webm')) return 'webm'
  if (mimeType?.includes('ogg')) return 'ogg'
  if (type === 'photo') return 'jpg'
  if (type === 'video') return 'mp4'
  if (type === 'audio') return 'webm'
  return 'bin'
}

function getMimeType(type) {
  if (type === 'photo') return 'image/jpeg'
  if (type === 'video') return 'video/mp4'
  if (type === 'audio') return 'audio/webm'
  return 'application/octet-stream'
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
