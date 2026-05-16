/**
 * imageCompressor.js — Compressão de imagens com timeouts defensivos
 *
 * Importante: no WKWebView do iOS, canvas.toBlob pode TRAVAR indefinidamente
 * com fotos grandes. Por isso TODA operação aqui tem timeout.
 * Se a compressão falhar/expirar, retornamos o blob ORIGINAL — nunca trava o upload.
 */

const DEFAULT_MAX_DIMENSION = 2048
const DEFAULT_QUALITY = 0.85
const DEFAULT_OUTPUT_TYPE = 'image/jpeg'

// Timeouts máximos pra evitar travar uploads no iOS
const LOAD_TIMEOUT_MS    = 8_000
const TOBLOB_TIMEOUT_MS  = 8_000

const SKIP_COMPRESSION = ['image/gif', 'image/svg+xml']

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    ),
  ])
}

export function shouldCompress(blob) {
  if (!blob || !blob.type) return false
  if (!blob.type.startsWith('image/')) return false
  if (SKIP_COMPRESSION.includes(blob.type)) return false
  if (blob.type === 'image/png' && blob.size < 500 * 1024) return false
  if (blob.size < 200 * 1024) return false
  return true
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    let url = null
    try {
      url = URL.createObjectURL(blob)
    } catch (e) {
      reject(new Error('createObjectURL falhou: ' + e.message))
      return
    }
    const img = new Image()
    img.onload = () => { try { URL.revokeObjectURL(url) } catch {}; resolve(img) }
    img.onerror = () => { try { URL.revokeObjectURL(url) } catch {}; reject(new Error('Falha ao decodificar imagem')) }
    img.src = url
  })
}

function calcDimensions(width, height, maxDim) {
  if (width <= maxDim && height <= maxDim) return { width, height }
  const ratio = width / height
  if (width > height) {
    return { width: maxDim, height: Math.round(maxDim / ratio) }
  }
  return { width: Math.round(maxDim * ratio), height: maxDim }
}

export async function compressImage(blob, opts = {}) {
  const maxDim = opts.maxDimension || DEFAULT_MAX_DIMENSION
  const quality = opts.quality ?? DEFAULT_QUALITY
  const outputType = opts.outputType || DEFAULT_OUTPUT_TYPE

  if (!shouldCompress(blob)) return blob

  try {
    // 1) Carrega imagem (com timeout)
    const img = await withTimeout(loadImage(blob), LOAD_TIMEOUT_MS, 'loadImage')
    const { width, height } = calcDimensions(img.naturalWidth, img.naturalHeight, maxDim)

    // 2) Desenha no canvas
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)

    // 3) Encoda com timeout (canvas.toBlob trava no iOS às vezes)
    const compressed = await withTimeout(
      new Promise((resolve, reject) => {
        try {
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob retornou null')), outputType, quality)
        } catch (e) { reject(e) }
      }),
      TOBLOB_TIMEOUT_MS,
      'toBlob'
    )

    if (!compressed) return blob
    if (compressed.size >= blob.size * 0.9) return blob
    return compressed
  } catch (e) {
    console.warn('[compress] falhou, usando original:', e.message)
    return blob
  }
}

/**
 * smartCompress — wrapper SEGURO. Nunca trava (timeout global de 12s).
 * Se algo der errado, retorna o blob original.
 */
export async function smartCompress(blob) {
  if (!blob) return blob
  if (blob.type?.startsWith('video/')) return blob
  if (blob.type?.startsWith('audio/')) return blob

  const sizeMB = blob.size / (1024 * 1024)

  // Wrap GERAL — mesmo se a chamada interna travar, sai em 12s com blob original
  try {
    const compress = (opts) => withTimeout(compressImage(blob, opts), 12_000, 'compressImage')
    if (sizeMB > 10) return await compress({ maxDimension: 2048, quality: 0.82 })
    if (sizeMB > 3)  return await compress({ maxDimension: 2048, quality: 0.85 })
    if (sizeMB > 1)  return await compress({ maxDimension: 2560, quality: 0.88 })
    return blob
  } catch (e) {
    console.warn('[smartCompress] falhou:', e.message)
    return blob
  }
}
