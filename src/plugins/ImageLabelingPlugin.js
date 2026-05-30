/**
 * ImageLabelingPlugin — bridge Capacitor para classificação de imagens
 *
 * Android: ML Kit Image Labeling (com.google.mlkit:image-labeling)
 * iOS:     Vision framework (VNClassifyImageRequest)
 * Web:     não disponível — retorna [] silenciosamente
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

// Registra o plugin nativo. O nome deve coincidir com o jsName
// declarado no Swift e com o CAP_PLUGIN() no .m / @CapacitorPlugin no Java.
const ImageLabeling = registerPlugin('ImageLabeling')

// ─── Mapeamento: labels nativos → tags do app ─────────────────────────────────
//
// As strings aqui são substrings case-insensitive dos labels retornados
// pelo ML Kit (Android) e pelo VNClassifyImageRequest (iOS).
// Um label basta para acionar a tag correspondente.
const TAG_KEYWORDS = {
  comida: [
    'food', 'dish', 'cuisine', 'meal', 'drink', 'beverage',
    'fruit', 'vegetable', 'bread', 'cake', 'dessert', 'pizza',
    'burger', 'hamburger', 'ice cream', 'coffee', 'tea', 'wine',
    'beer', 'cheese', 'snack', 'restaurant', 'cooking', 'baking',
    'ingredient', 'produce',
  ],
  pets: [
    'dog', 'cat', 'bird', 'rabbit', 'hamster', 'guinea pig',
    'puppy', 'kitten', 'parrot', 'goldfish', 'pet',
  ],
  natureza: [
    'nature', 'sky', 'tree', 'plant', 'mountain', 'forest',
    'grass', 'flower', 'beach', 'ocean', 'lake', 'river',
    'landscape', 'outdoor', 'sunset', 'cloud', 'field',
    'rock', 'geology', 'trail', 'waterfall', 'jungle',
    'plant life', 'nature and outdoor',
  ],
  selfie: [
    'selfie', 'face', 'portrait', 'people', 'person', 'smile',
    'people and selfie',
  ],
  festa: [
    'party', 'balloon', 'birthday', 'celebration', 'confetti',
    'firework', 'event', 'festival', 'carnival',
  ],
}

/**
 * Converte labels brutos (strings) nas tags do app.
 * Uma foto pode ter várias tags.
 */
function labelsToTags(labels) {
  const result = new Set()
  for (const label of labels) {
    const lc = label.toLowerCase()
    for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
      if (keywords.some(kw => lc.includes(kw))) {
        result.add(tag)
      }
    }
  }
  return [...result]
}

/** Converte Blob → base64 (sem prefixo data:…) */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Classifica um Blob de imagem e retorna tags do app.
 * Retorna [] em caso de erro ou plataforma web.
 *
 * @param {Blob} blob
 * @returns {Promise<string[]>}
 */
export async function classifyImageBlob(blob) {
  try {
    if (!Capacitor.isNativePlatform()) return []

    const plugin = window?.Capacitor?.Plugins?.ImageLabeling || ImageLabeling
    if (!plugin?.classifyImage) return []

    const base64 = await blobToBase64(blob)
    const mimeType = blob.type || 'image/jpeg'

    const { labels = [] } = await plugin.classifyImage({ base64, mimeType })
    const tags = labelsToTags(labels)
    if (tags.length) console.log('[ImageLabeling] tags geradas:', tags, '| labels:', labels)
    return tags
  } catch (e) {
    console.warn('[ImageLabeling] falha na classificação:', e.message)
    return []
  }
}
