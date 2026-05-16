/**
 * imageCompressor.js — Compressão de imagens no browser via canvas
 * - Reduz dimensão máxima preservando proporção
 * - Encoda em JPEG com qualidade configurável
 * - Tipicamente reduz 70-90% do tamanho sem perda visível
 * - Vídeos passam direto (não comprimimos vídeo no browser)
 */

const DEFAULT_MAX_DIMENSION = 2048
const DEFAULT_QUALITY = 0.85
const DEFAULT_OUTPUT_TYPE = 'image/jpeg'

// Tipos que NÃO devem ser comprimidos (PNG com transparência, GIF, vídeos, áudios)
const SKIP_COMPRESSION = ['image/gif', 'image/svg+xml']

/**
 * Verifica se o blob é uma imagem que vale a pena comprimir.
 */
export function shouldCompress(blob) {
  if (!blob || !blob.type) return false
  if (!blob.type.startsWith('image/')) return false
  if (SKIP_COMPRESSION.includes(blob.type)) return false
  // PNG só vale a pena comprimir se for grande (> 500KB)
  if (blob.type === 'image/png' && blob.size < 500 * 1024) return false
  // Imagens já pequenas (< 200KB) não compensa comprimir
  if (blob.size < 200 * 1024) return false
  return true
}

/**
 * Carrega blob como HTMLImageElement
 */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Falha ao decodificar imagem'))
    }
    img.src = url
  })
}

/**
 * Calcula novas dimensões respeitando o máximo
 */
function calcDimensions(width, height, maxDim) {
  if (width <= maxDim && height <= maxDim) return { width, height }
  const ratio = width / height
  if (width > height) {
    return { width: maxDim, height: Math.round(maxDim / ratio) }
  }
  return { width: Math.round(maxDim * ratio), height: maxDim }
}

/**
 * Comprime uma imagem (Blob) retornando outro Blob menor.
 * Se não compensar comprimir, retorna o blob original.
 *
 * @param {Blob} blob - imagem original
 * @param {Object} opts - { maxDimension, quality, outputType }
 * @returns {Promise<Blob>}
 */
export async function compressImage(blob, opts = {}) {
  const maxDim = opts.maxDimension || DEFAULT_MAX_DIMENSION
  const quality = opts.quality ?? DEFAULT_QUALITY
  const outputType = opts.outputType || DEFAULT_OUTPUT_TYPE

  if (!shouldCompress(blob)) return blob

  try {
    const img = await loadImage(blob)
    const { width, height } = calcDimensions(img.naturalWidth, img.naturalHeight, maxDim)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // Qualidade de scaling melhor
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)

    const compressed = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        outputType,
        quality
      )
    })

    if (!compressed) return blob
    // Só usa a versão comprimida se realmente ficou menor (10%+ menor)
    if (compressed.size >= blob.size * 0.9) return blob
    return compressed
  } catch (e) {
    console.warn('compressImage falhou, usando original:', e.message)
    return blob
  }
}

/**
 * Versão "smart" — escolhe parâmetros baseado no tamanho do blob.
 */
export async function smartCompress(blob) {
  if (!blob) return blob
  // Vídeo: passa direto (compressão de vídeo no browser é cara demais)
  if (blob.type?.startsWith('video/')) return blob
  // Áudio: passa direto
  if (blob.type?.startsWith('audio/')) return blob

  const sizeMB = blob.size / (1024 * 1024)
  // Imagens muito grandes (>10MB): comprime agressivo
  if (sizeMB > 10) return compressImage(blob, { maxDimension: 2048, quality: 0.82 })
  // Imagens grandes (3-10MB): compressão padrão
  if (sizeMB > 3) return compressImage(blob, { maxDimension: 2048, quality: 0.85 })
  // Imagens médias (1-3MB): compressão leve
  if (sizeMB > 1) return compressImage(blob, { maxDimension: 2560, quality: 0.88 })
  // Pequenas: passa direto
  return blob
}
