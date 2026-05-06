/**
 * RECORDAR — Banco de Dados Local (Dexie.js / IndexedDB)
 * 
 * Schemas:
 *  - memories:  fotos, vídeos, áudios e textos
 *  - folders:   pastas (automáticas e manuais)
 *  - profile:   perfil do usuário principal
 *  - family:    círculo familiar (membros convidados)
 *  - settings:  configurações do app
 *  - reminders: lembretes automáticos
 */

import Dexie from 'dexie';

export const db = new Dexie('RecordarDB');

db.version(1).stores({
  // Memórias — núcleo do app
  memories: [
    '++id',          // PK auto-increment
    'type',          // 'photo' | 'video' | 'audio' | 'text'
    'date',          // data da memória (ISO string)
    'createdAt',     // data de criação no app
    'folderId',      // FK → folders.id (pode ser null)
    'title',         // título curto
    'description',   // texto descritivo
    'filePath',      // caminho/blob URL do arquivo
    'fileBlob',      // Blob do arquivo (armazenado localmente)
    'thumbnail',     // Blob da miniatura (para fotos/vídeos)
    'duration',      // duração em segundos (áudio/vídeo)
    'location',      // { lat, lng, name }
    'tags',          // array de tags ["família","natal"]
    'isHighlight',   // boolean — destaque do ano
    'isFavorite',    // boolean
    'isShared',      // boolean — compartilhado no círculo familiar
    'shareWith',     // array de user IDs
    'privacyLevel',  // 'private' | 'family' | 'public'
    '*tags',         // índice para busca por tags
  ].join(', '),

  // Pastas — organização
  folders: [
    '++id',
    'name',          // "Natal", "Viagens", etc.
    'emoji',         // ícone
    'isAuto',        // criada automaticamente pelo app
    'autoRule',      // regra de classificação automática
    'color',         // cor hex opcional
    'createdAt',
    'order',         // posição na lista
  ].join(', '),

  // Perfil do usuário
  profile: [
    '++id',
    'name',
    'bio',
    'avatarBlob',    // Blob da foto de perfil
    'username',
    'email',
    'birthDate',
    'privacyLevel',  // 'private' | 'public'
    'biometricEnabled',
    'pinHash',       // hash do PIN de bloqueio
    'createdAt',
    'updatedAt',
  ].join(', '),

  // Círculo Familiar
  family: [
    '++id',
    'name',
    'username',
    'avatarBlob',
    'role',          // "admin" | "member"
    'joinedAt',
    'isActive',
  ].join(', '),

  // Configurações gerais
  settings: [
    '&key',          // PK única por chave
    'value',
    'updatedAt',
  ].join(', '),

  // Lembretes automáticos
  reminders: [
    '++id',
    'memoryId',      // FK → memories.id
    'message',
    'triggerDate',   // data de disparo
    'type',          // 'anniversary' | 'highlight'
    'isRead',
  ].join(', '),
});

// Versão 2: tabela dedicada para blobs de arquivos
db.version(2).stores({
  memories: '++id, type, date, createdAt, folderId, title, description, filePath, fileBlob, thumbnail, duration, location, tags, isHighlight, isFavorite, isShared, shareWith, privacyLevel, *tags',
  folders: '++id, name, emoji, isAuto, autoRule, color, createdAt, order',
  profile: '++id, name, bio, avatarBlob, username, email, birthDate, privacyLevel, biometricEnabled, pinHash, createdAt, updatedAt',
  family: '++id, name, username, avatarBlob, role, joinedAt, isActive',
  settings: '&key, value, updatedAt',
  reminders: '++id, memoryId, message, triggerDate, type, isRead',
  fileBlobs: '++id, firestoreId, title, type, date',
});

// ─── Helpers de Configurações ─────────────────────────────────────────

export async function getSetting(key, defaultValue = null) {
  const row = await db.settings.get(key);
  return row ? row.value : defaultValue;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value, updatedAt: new Date().toISOString() });
}

// ─── Helpers de Memórias ──────────────────────────────────────────────

/**
 * Adiciona uma nova memória ao banco.
 * @param {Object} memoryData - dados da memória
 * @returns {number} ID da memória criada
 */
export async function addMemory(memoryData) {
  return db.memories.add({
    ...memoryData,
    createdAt: new Date().toISOString(),
    isFavorite: false,
    isHighlight: false,
    isShared: false,
    privacyLevel: 'private',
  });
}

/**
 * Busca memórias por ano e mês.
 */
export async function getMemoriesByYearMonth(year, month) {
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end   = `${year}-${String(month).padStart(2,'0')}-31`;
  return db.memories
    .where('date').between(start, end, true, true)
    .sortBy('date');
}

/**
 * Busca memórias de um determinado ano.
 */
export async function getMemoriesByYear(year) {
  return db.memories
    .where('date').between(`${year}-01-01`, `${year}-12-31`, true, true)
    .sortBy('date');
}

/**
 * Retorna anos únicos com contagem de memórias.
 */
export async function getYearSummary() {
  const all = await db.memories.toArray();
  const map = {};
  for (const m of all) {
    const y = m.date?.substring(0, 4);
    if (y) { map[y] = (map[y] || 0) + 1; }
  }
  return Object.entries(map)
    .sort(([a],[b]) => Number(b) - Number(a))
    .map(([year, count]) => ({ year, count }));
}

/**
 * Busca memórias por texto livre (título + descrição).
 */
export async function searchMemories(query) {
  const q = query.toLowerCase();
  return db.memories.filter(m =>
    m.title?.toLowerCase().includes(q) ||
    m.description?.toLowerCase().includes(q) ||
    m.tags?.some(t => t.toLowerCase().includes(q))
  ).toArray();
}

// ─── Inicialização: pastas padrão ─────────────────────────────────────

export async function initDefaultFolders() {
  const count = await db.folders.count();
  if (count > 0) return; // já inicializadas

  const defaults = [
    { name: 'Família',      emoji: '/icons/pasta-familia.svg',      isAuto: true,  autoRule: 'tag:família',    order: 1 },
    { name: 'Aniversários', emoji: '/icons/pasta-aniversarios.svg', isAuto: true,  autoRule: 'tag:aniversário',order: 2 },
    { name: 'Natal',        emoji: '/icons/pasta-natal.svg',        isAuto: true,  autoRule: 'tag:natal',      order: 3 },
    { name: 'Ano Novo',     emoji: '/icons/pasta-anonovo.svg',      isAuto: true,  autoRule: 'tag:ano novo',   order: 4 },
    { name: 'Viagens',      emoji: '/icons/pasta-viagens.svg',      isAuto: true,  autoRule: 'tag:viagem',     order: 5 },
    { name: 'Histórias',    emoji: '/icons/pasta-historias.svg',    isAuto: false, autoRule: null,             order: 6 },
    { name: 'Destaques',    emoji: '/icons/pasta-destaques.svg',    isAuto: true,  autoRule: 'isHighlight:true',order: 7 },
  ];

  await db.folders.bulkAdd(
    defaults.map(f => ({ ...f, createdAt: new Date().toISOString() }))
  );
}

export default db;
