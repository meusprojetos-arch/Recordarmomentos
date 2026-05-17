// src/hooks/useMemories.js
// ─────────────────────────────────────────────────────────────────────────────
// CORREÇÃO APLICADA:
//   Substituído PhotoLibraryPlugin (plugin customizado sem implementação nativa)
//   por @capacitor/camera v6 (oficial).
//
//   API usada (compatível com @capacitor/camera ^6 instalado no projeto):
//     • getPhoto()   → câmera ou galeria, 1 item, funciona na WEB também
//     • pickImages() → galeria múltipla (backup), funciona na WEB via <input>
//
//   Na WEB o Capacitor faz fallback automático para <input type="file"> —
//   não é necessário nenhum código extra. Por isso o teste no PC funciona.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';

// ─── helpers internos ────────────────────────────────────────────────────────

/** webPath/dataUrl → Blob para salvar no IndexedDB */
async function uriParaBlob(uri) {
  const res = await fetch(uri);
  return res.blob();
}

/** Thumbnail 200×200 recortado ao centro de uma imagem */
async function thumbImagem(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 200;
      const ctx = c.getContext('2d');
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, 200, 200);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Thumbnail 200×200 do primeiro frame de um vídeo */
async function thumbVideo(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true;
    v.onloadeddata = () => { v.currentTime = 0; };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 200;
      const ctx = c.getContext('2d');
      const min = Math.min(v.videoWidth, v.videoHeight);
      ctx.drawImage(v, (v.videoWidth - min) / 2, (v.videoHeight - min) / 2, min, min, 0, 0, 200, 200);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });
}

/** Detecta se é vídeo pelo mimeType ou extensão do nome de arquivo */
function ehVideo(blob, nome) {
  return (
    blob?.type?.startsWith('video/') ||
    /\.(mp4|mov|avi|mkv|m4v|3gp|webm)$/i.test(nome || '')
  );
}

// ─── permissões (só relevante em nativo) ─────────────────────────────────────

async function pedirPermissoes() {
  if (!Capacitor.isNativePlatform()) return true; // web não precisa
  try {
    const status = await Camera.checkPermissions();
    const falta = status.photos !== 'granted' && status.photos !== 'limited';
    if (falta) {
      const r = await Camera.requestPermissions({ permissions: ['photos', 'camera'] });
      return r.photos === 'granted' || r.photos === 'limited';
    }
    return true;
  } catch {
    return true; // se falhar a checagem, tenta de qualquer forma
  }
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useMemories() {
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [erro, setErro] = useState(null);

  // ── salvar uma memória individual no Dexie ──────────────────────────────
  const salvarMemoria = useCallback(async ({
    tipo,          // 'foto' | 'video' | 'audio' | 'texto'
    blob,
    nomeArquivo,
    titulo = '',
    descricao = '',
    data = new Date(),
    pasta = null,
    thumbnail = null,
  }) => {
    const id = uuidv4();

    let thumb = thumbnail;
    if (!thumb) {
      if (tipo === 'foto')  thumb = await thumbImagem(blob);
      if (tipo === 'video') thumb = await thumbVideo(blob);
    }

    await db.memories.add({
      id,
      tipo,
      titulo: titulo || nomeArquivo || `${tipo} ${new Date(data).toLocaleDateString('pt-BR')}`,
      descricao,
      data: new Date(data).getTime(),
      pasta,
      arquivo: blob,
      nomeArquivo: nomeArquivo || `${id}.${tipo === 'foto' ? 'jpg' : 'mp4'}`,
      mimeType: blob.type || (tipo === 'foto' ? 'image/jpeg' : 'video/mp4'),
      thumbnail: thumb,
      destaque: false,
      criadoEm: Date.now(),
    });

    return id;
  }, []);

  // ── capturar foto com câmera ────────────────────────────────────────────
  const capturarFoto = useCallback(async () => {
    try {
      const foto = await Camera.getPhoto({
        quality: 85,
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        saveToGallery: false,
      });
      const blob = await uriParaBlob(foto.webPath);
      return await salvarMemoria({ tipo: 'foto', blob, nomeArquivo: `foto_${Date.now()}.jpg` });
    } catch (e) {
      if (/cancel/i.test(e?.message)) return null;
      console.error('[useMemories] capturarFoto:', e);
      setErro('Não foi possível abrir a câmera.');
      return null;
    }
  }, [salvarMemoria]);

  // ── selecionar 1 item da galeria (usado no modal de nova memória) ───────
  const selecionarDaGaleria = useCallback(async () => {
    try {
      const ok = await pedirPermissoes();
      if (!ok) { setErro('Permissão de galeria negada.'); return null; }

      const foto = await Camera.getPhoto({
        quality: 85,
        source: CameraSource.Photos,   // abre galeria
        resultType: CameraResultType.Uri,
      });
      const blob = await uriParaBlob(foto.webPath);
      const nome = `galeria_${Date.now()}.${foto.format || 'jpg'}`;
      return await salvarMemoria({ tipo: 'foto', blob, nomeArquivo: nome });
    } catch (e) {
      if (/cancel/i.test(e?.message)) return null;
      console.error('[useMemories] selecionarDaGaleria:', e);
      setErro('Não foi possível acessar a galeria.');
      return null;
    }
  }, [salvarMemoria]);

  // ── BACKUP AUTOMÁTICO — importar múltiplos itens da galeria ────────────
  //
  //  Camera.pickImages() com limit:0  →  seletor nativo múltiplo
  //  • iOS/Android : PHPickerViewController / Android Photo Picker (nativo)
  //  • WEB (PC)    : <input type="file" multiple accept="image/*"> automático
  //                  via fallback do Capacitor — sem código extra necessário
  //
  //  Retorna { importadas, erros }
  //
  const importarGaleria = useCallback(async ({ onProgresso } = {}) => {
    setErro(null);
    setImportando(true);
    setProgresso({ atual: 0, total: 0 });

    try {
      const ok = await pedirPermissoes();
      if (!ok) {
        setErro('Permissão de galeria negada. Habilite nas configurações.');
        return { importadas: 0, erros: 0 };
      }

      // Abre seletor múltiplo — pickImages é a API correta para Capacitor 6
      let galeria;
      try {
        galeria = await Camera.pickImages({
          quality: 80,
          limit: 0, // 0 = sem limite
        });
      } catch (e) {
        if (/cancel/i.test(e?.message)) return { importadas: 0, erros: 0 };
        throw e;
      }

      const lista = galeria.photos ?? [];
      const total = lista.length;
      setProgresso({ atual: 0, total });

      // Evitar duplicatas: checa nomes já salvos
      const nomesExistentes = new Set(
        (await db.memories.toArray()).map((m) => m.nomeArquivo)
      );

      let importadas = 0;
      let erros = 0;

      for (let i = 0; i < lista.length; i++) {
        const item = lista[i];
        try {
          const blob = await uriParaBlob(item.webPath);
          const nome = item.webPath.split('/').pop() || `import_${Date.now()}_${i}.jpg`;

          if (!nomesExistentes.has(nome)) {
            const tipo = ehVideo(blob, nome) ? 'video' : 'foto';
            await salvarMemoria({ tipo, blob, nomeArquivo: nome });
            nomesExistentes.add(nome);
            importadas++;
          }
        } catch (itemErr) {
          console.warn(`[useMemories] item ${i} falhou:`, itemErr);
          erros++;
        }

        setProgresso({ atual: i + 1, total });
        onProgresso?.(i + 1, total);

        // Pausa a cada 10 itens para não travar a UI
        if ((i + 1) % 10 === 0) await new Promise((r) => setTimeout(r, 20));
      }

      return { importadas, erros };
    } catch (e) {
      console.error('[useMemories] importarGaleria:', e);
      setErro('Erro ao acessar a galeria. Tente novamente.');
      return { importadas: 0, erros: 0 };
    } finally {
      setImportando(false);
    }
  }, [salvarMemoria]);

  // ── CRUD (preservado do original) ──────────────────────────────────────

  const listarMemórias = useCallback(async (filtros = {}) => {
    let q = db.memories.orderBy('data').reverse();
    if (filtros.tipo)  q = q.filter((m) => m.tipo === filtros.tipo);
    if (filtros.pasta) q = q.filter((m) => m.pasta === filtros.pasta);
    if (filtros.busca) {
      const t = filtros.busca.toLowerCase();
      q = q.filter((m) =>
        m.titulo?.toLowerCase().includes(t) || m.descricao?.toLowerCase().includes(t)
      );
    }
    return q.toArray();
  }, []);

  const atualizarMemória = useCallback(async (id, dados) => {
    await db.memories.update(id, { ...dados, atualizadoEm: Date.now() });
  }, []);

  const excluirMemória = useCallback(async (id) => {
    await db.memories.delete(id);
  }, []);

  const toggleDestaque = useCallback(async (id) => {
    const m = await db.memories.get(id);
    if (m) await db.memories.update(id, { destaque: !m.destaque });
  }, []);

  // ── retorno do hook ─────────────────────────────────────────────────────
  return {
    // estado do backup
    importando,
    progresso,
    erro,
    // ações de mídia
    capturarFoto,
    selecionarDaGaleria,
    importarGaleria,       // ← backup automático (corrigido)
    // CRUD
    salvarMemoria,
    listarMemórias,
    atualizarMemória,
    excluirMemória,
    toggleDestaque,
  };
}