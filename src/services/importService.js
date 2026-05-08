/**
 * importService.js — Importar multiplas fotos/videos da galeria
 * Organiza automaticamente por ano/mes baseado na data do arquivo
 */
import { addMemory } from './memoriesService.js'

/**
 * Importa multiplos arquivos de uma vez
 * Abre o seletor de arquivos e salva cada um como memoria
 */
export function openGalleryImport(onProgress, onComplete) {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'image/*,video/*'
  
  input.onchange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    let imported = 0
    for (const file of files) {
      try {
        const date = getFileDate(file)
        const type = file.type.startsWith('video') ? 'video' : 'photo'
        
        await addMemory({
          type,
          title: cleanFileName(file.name),
          description: '',
          date,
          tags: [],
        }, file)

        imported++
        onProgress?.(imported, files.length)
      } catch (err) {
        console.warn(`Erro ao importar ${file.name}:`, err)
      }
    }
    onComplete?.(imported, files.length)
    // Dispara evento para que a galeria recarregue
    window.dispatchEvent(new Event('memories-updated'))
  }

  input.click()
}

/**
 * Extrai data do arquivo (usa lastModified como fallback)
 */
function getFileDate(file) {
  const d = new Date(file.lastModified || Date.now())
  return d.toISOString().substring(0, 10)
}

/**
 * Limpa nome do arquivo para usar como titulo (mantendo unicidade)
 */
function cleanFileName(name) {
  const noExt = name.replace(/\.[^.]+$/, '')
  // Só remove prefixos conhecidos, mantém o resto para garantir unicidade
  const cleaned = noExt
    .replace(/^(IMG|VID|WA\d*)[_-]?/i, '')
    .replace(/[_-]/g, ' ')
    .trim()
  return cleaned || noExt || 'Sem titulo'
}
