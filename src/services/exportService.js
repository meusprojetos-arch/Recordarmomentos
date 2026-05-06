/**
 * exportService.js — Exportar todas as memorias como ZIP
 */
import JSZip from 'jszip'
import { getMemories } from './memoriesService.js'

/**
 * Exporta todas as memorias em um arquivo ZIP organizado por ano/mes
 * e faz download automatico no navegador
 */
export async function exportAllAsZip() {
  const memories = await getMemories()
  if (memories.length === 0) throw new Error('Nenhuma memoria para exportar')

  const zip = new JSZip()

  // Indice em texto
  let indexText = 'RECORDAR — Exportacao de Memorias\n'
  indexText += `Data: ${new Date().toLocaleDateString('pt-BR')}\n`
  indexText += `Total: ${memories.length} memorias\n\n`

  for (const mem of memories) {
    const year = mem.date?.substring(0, 4) || 'sem-data'
    const month = mem.date?.substring(5, 7) || '00'
    const folder = `${year}/${month}`

    // Texto da memoria
    let content = `Titulo: ${mem.title || 'Sem titulo'}\n`
    content += `Data: ${mem.date || 'N/A'}\n`
    content += `Tipo: ${mem.type}\n`
    if (mem.description) content += `Descricao: ${mem.description}\n`
    if (mem.tags?.length) content += `Tags: ${mem.tags.join(', ')}\n`
    content += '\n'

    zip.file(`${folder}/${mem.id}_info.txt`, content)

    // Se tem arquivo, tenta baixar e incluir
    if (mem.fileUrl) {
      try {
        const response = await fetch(mem.fileUrl)
        if (response.ok) {
          const blob = await response.blob()
          const ext = getExtension(mem.type, blob.type)
          zip.file(`${folder}/${mem.id}.${ext}`, blob)
        }
      } catch (err) {
        // Se nao consegue baixar, apenas pula
        console.warn(`Nao conseguiu baixar arquivo da memoria ${mem.id}`)
      }
    }

    indexText += `- [${year}/${month}] ${mem.title || 'Sem titulo'} (${mem.type})\n`
  }

  zip.file('_indice.txt', indexText)

  // Gera o ZIP e faz download
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  downloadBlob(blob, `Recordar_Backup_${new Date().toISOString().substring(0,10)}.zip`)
}

function getExtension(type, mimeType) {
  if (type === 'photo') return 'jpg'
  if (type === 'video') return 'mp4'
  if (type === 'audio') return 'webm'
  if (mimeType?.includes('png')) return 'png'
  if (mimeType?.includes('webp')) return 'webp'
  return 'bin'
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
