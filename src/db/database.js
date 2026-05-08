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
  memories: '++id, type, date, createdAt, folderId, *tags',

  // Pastas — organização
  folders: '++id, name, isAuto, order',

  // Perfil do usuário
  profile: '++id, username, email',

  // Círculo Familiar
  family: '++id, name, username',

  // Configurações gerais
  settings: '&key',

  // Lembretes automáticos
  reminders: '++id, memoryId, triggerDate, type',
});

// Versão 2: tabela dedicada para blobs de arquivos
db.version(2).stores({
  memories: '++id, type, date, createdAt, folderId, *tags',
  folders: '++id, name, isAuto, order',
  profile: '++id, username, email',
  family: '++id, name, username',
  settings: '&key',
  reminders: '++id, memoryId, triggerDate, type',
  fileBlobs: '++id, firestoreId, title, type, date',
});

// Versão 3: adiciona localBlobId como índice em fileBlobs
db.version(3).stores({
  memories: '++id, type, date, createdAt, folderId, *tags',
  folders: '++id, name, isAuto, order',
  profile: '++id, username, email',
  family: '++id, name, username',
  settings: '&key',
  reminders: '++id, memoryId, triggerDate, type',
  fileBlobs: '++id, localBlobId, firestoreId, title, type, date',
});

// Versão 4: fix ConstraintError - schema limpo sem índices duplicados
db.version(4).stores({
  memories: '++id, type, date, createdAt, folderId, *tags',
  folders: '++id, name, isAuto, order',
  profile: '++id, username, email',
  family: '++id, name, username',
  settings: '&key',
  reminders: '++id, memoryId, triggerDate, type',
  fileBlobs: '++id, localBlobId, firestoreId, title, type, date',
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
  // Auto-classificar em pasta se não tiver pasta definida
  let folderId = memoryData.folderId || null
  if (!folderId) {
    folderId = await autoClassifyMemory(memoryData)
  }

  return db.memories.add({
    ...memoryData,
    folderId,
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
  const defaults = [
    { name: 'Família',        emoji: '/icons/pasta-familia.svg',        isAuto: true,  autoRule: 'tag:família',      order: 1 },
    { name: 'Aniversários',   emoji: '/icons/pasta-aniversarios.svg',   isAuto: true,  autoRule: 'date:birthday',    order: 2 },
    { name: 'Natal',          emoji: '/icons/pasta-natal.svg',          isAuto: true,  autoRule: 'date:12-25',       order: 3 },
    { name: 'Ano Novo',       emoji: '/icons/pasta-anonovo.svg',        isAuto: true,  autoRule: 'date:01-01',       order: 4 },
    { name: 'Dia das Mães',   emoji: '/icons/pasta-maes.svg',           isAuto: true,  autoRule: 'date:05-second-sun', order: 5 },
    { name: 'Dia dos Pais',   emoji: '/icons/pasta-pais.svg',           isAuto: true,  autoRule: 'date:08-second-sun', order: 6 },
    { name: 'Dia dos Namorados', emoji: '/icons/pasta-namorados.svg',   isAuto: true,  autoRule: 'date:06-12',       order: 7 },
    { name: 'Páscoa',         emoji: '/icons/pasta-pascoa.svg',         isAuto: true,  autoRule: 'date:easter',      order: 8 },
    { name: 'São João',       emoji: '/icons/pasta-saojoao.svg',        isAuto: true,  autoRule: 'date:06-24',       order: 9 },
    { name: 'Viagens',        emoji: '/icons/pasta-viagens.svg',        isAuto: true,  autoRule: 'tag:viagem',       order: 10 },
    { name: 'Histórias',      emoji: '/icons/pasta-historias.svg',      isAuto: false, autoRule: null,               order: 11 },
    { name: 'Destaques',      emoji: '/icons/pasta-destaques.svg',      isAuto: true,  autoRule: 'isHighlight:true', order: 12 },
  ];

  // Adicionar apenas pastas que ainda não existem (por nome)
  const existing = await db.folders.toArray();
  const existingNames = existing.map(f => f.name);
  const toAdd = defaults.filter(f => !existingNames.includes(f.name));

  if (toAdd.length > 0) {
    await db.folders.bulkAdd(
      toAdd.map(f => ({ ...f, createdAt: new Date().toISOString() }))
    );
  }
}

export default db;

// ─── Auto-classificação de memórias em pastas por data ────────────────

/**
 * Verifica se uma data (ISO string) corresponde a uma regra de pasta automática.
 * Regras suportadas:
 *  - 'date:MM-DD'         → data fixa (ex: 12-25 para Natal)
 *  - 'date:01-01'         → Ano Novo (inclui 31/12 também)
 *  - 'date:birthday'      → baseado na data de aniversário do usuário
 *  - 'date:easter'        → Páscoa (sexta santa a domingo)
 *  - 'date:MM-second-sun' → segundo domingo do mês
 *  - 'tag:xxx'            → memória tem a tag
 *  - 'isHighlight:true'   → memória é destaque
 */
function getEasterDate(year) {
  // Algoritmo de Meeus/Jones/Butcher
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function getSecondSunday(year, month) {
  const first = new Date(year, month - 1, 1)
  const dayOfWeek = first.getDay()
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  return firstSunday + 7
}

export function matchesAutoRule(rule, memoryDate, memory = {}) {
  if (!rule || !memoryDate) return false

  // Tag-based rules
  if (rule.startsWith('tag:')) {
    const tag = rule.slice(4).toLowerCase()
    return memory.tags?.some(t => t.toLowerCase().includes(tag)) || false
  }

  // Highlight rule
  if (rule === 'isHighlight:true') {
    return memory.isHighlight === true
  }

  // Date-based rules
  if (rule.startsWith('date:')) {
    const dateRule = rule.slice(5)
    const d = new Date(memoryDate)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const year = d.getFullYear()

    // Fixed date: MM-DD
    if (/^\d{2}-\d{2}$/.test(dateRule)) {
      const [rMonth, rDay] = dateRule.split('-').map(Number)
      // Para Ano Novo, incluir também 31/12
      if (rMonth === 1 && rDay === 1) {
        return (month === 1 && day === 1) || (month === 12 && day === 31)
      }
      return month === rMonth && day === rDay
    }

    // Easter (sexta santa até domingo de páscoa = 3 dias)
    if (dateRule === 'easter') {
      const easter = getEasterDate(year)
      const easterDate = new Date(year, easter.month - 1, easter.day)
      const memDate = new Date(year, month - 1, day)
      const diff = (easterDate - memDate) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff <= 2 // sexta, sábado, domingo
    }

    // Second Sunday: MM-second-sun
    if (dateRule.endsWith('-second-sun')) {
      const rMonth = parseInt(dateRule.split('-')[0])
      if (month !== rMonth) return false
      const secondSun = getSecondSunday(year, rMonth)
      // Considerar o fim de semana inteiro (sáb-dom)
      return day >= secondSun - 1 && day <= secondSun
    }

    // Birthday (precisa da data de nascimento do usuário no localStorage)
    if (dateRule === 'birthday') {
      return memory.tags?.some(t => t.toLowerCase().includes('aniversário') || t.toLowerCase().includes('aniversario')) || false
    }
  }

  return false
}

/**
 * Classifica automaticamente uma memória nas pastas automáticas.
 * Retorna o ID da primeira pasta que corresponder, ou null.
 */
export async function autoClassifyMemory(memory) {
  const folders = await db.folders.filter(f => f.isAuto === true).toArray()
  for (const folder of folders) {
    if (matchesAutoRule(folder.autoRule, memory.date, memory)) {
      return folder.id
    }
  }
  return null
}
