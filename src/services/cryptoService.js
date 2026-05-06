/**
 * cryptoService.js — Criptografia local de arquivos usando Web Crypto API
 * 
 * Usa AES-GCM 256-bit para encriptar/decriptar blobs localmente.
 * A chave e derivada do PIN do usuario via PBKDF2.
 */

const SALT = new Uint8Array([82,101,99,111,114,100,97,114,83,97,108,116,50,48,50,52])

/**
 * Deriva uma chave AES a partir de uma senha/PIN
 */
async function deriveKey(password) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encripta um ArrayBuffer
 */
export async function encryptData(data, password) {
  const key = await deriveKey(password)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )
  // Retorna iv + dados encriptados juntos
  const result = new Uint8Array(iv.length + encrypted.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(encrypted), iv.length)
  return result.buffer
}

/**
 * Decripta um ArrayBuffer
 */
export async function decryptData(encryptedData, password) {
  const key = await deriveKey(password)
  const data = new Uint8Array(encryptedData)
  const iv = data.slice(0, 12)
  const ciphertext = data.slice(12)
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
}

/**
 * Encripta um File/Blob
 */
export async function encryptFile(file, password) {
  const buffer = await file.arrayBuffer()
  const encrypted = await encryptData(buffer, password)
  return new Blob([encrypted], { type: 'application/encrypted' })
}

/**
 * Decripta um Blob encriptado de volta ao tipo original
 */
export async function decryptFile(encryptedBlob, password, originalType = 'application/octet-stream') {
  const buffer = await encryptedBlob.arrayBuffer()
  const decrypted = await decryptData(buffer, password)
  return new Blob([decrypted], { type: originalType })
}
