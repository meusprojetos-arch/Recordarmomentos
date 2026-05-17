// useMemories.js — Recordar
// CORREÇÃO: substituído PhotoLibraryPlugin (sem implementação nativa iOS)
// por @capacitor/camera oficial — funciona em iOS, Android e web sem alterações.
// Toda a lógica existente de CRUD, Dexie, exportação etc. foi preservada.

import { useState, useCallback } from 'react';
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Converte um webPath/dataUrl em Blob para persistir no IndexedDB */
async function uriToBlob(uri) {
  const response = await fetch(uri);
  return response.blob();
}

/** Gera thumbnail 200×200 a partir de um Blob de imagem */
async function gerarThumbnailImagem(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      // crop centralizado
      const menor = Math.min(img.width, img.height);
      const sx = (img.width - menor) / 2;
      const sy = (img.height - menor) / 2;
      ctx.drawImage(img, sx, sy, menor, menor, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Gera thumbnail de vídeo a partir do primeiro frame */
async function gerarThumbnailVideo(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      video.currentTime = 0;
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      const menor = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - menor) / 2;
      const sy = (video.videoHeight - menor) / 2;
      ctx.drawImage(video, sx, sy, menor, menor, 0, 0, 200, 200);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });
}

// ─── permissões ─────────────────────────────────────────────────────────────

/**
 * Solicita permissão de galeria/câmera ao usuário.
 * Retorna true se concedida, false caso contrário.
 */
async function solicitarPermissoes() {
  try {
    // Em plataformas nativas (iOS/Android) verifica e solicita
    if (Capacitor.isNativePlatform()) {
      const permissao = await Camera.checkPermissions();

      // 'photos' cobre iOS; 'camera' + 'photos' cobre Android
      const precisaSolicitar =
        permissao.photos !== 'granted' ||
        permissao.camera !== 'granted';

      if (precisaSolicitar) {
        const resultado = await Camera.requestPermissions({
          permissions: ['photos', 'camera'],
        });
        return (
          resultado.photos === 'granted' ||
          resultado.photos === 'limited' // iOS permite acesso limitado
        );
      }
      return true;
    }
    // Web: permissão é solicitada automaticamente pelo browser
    return true;
  } catch (err) {
    console.warn('[useMemories] Erro ao solicitar permissões:', err);
    return false;
  }
}

// ─── hook principal ──────────────────────────────────────────────────────────

export function useMemories() {
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [erro, setErro] = useState(null);

  // ── salvar uma memória individual ──────────────────────────────────────────
  const salvarMemoria = useCallback(async ({
    tipo,       // 'foto' | 'video' | 'audio' | 'texto'
    blob,       // Blob do arquivo
    nomeArquivo,
    titulo = '',
    descricao = '',
    data = new Date(),
    pasta = null,
    thumbnail = null,
  }) => {
    const id = uuidv4();
    const mimeType = blob.type || (tipo === 'foto' ? 'image/jpeg' : 'video/mp4');

    // Gera thumbnail se não foi fornecido
    let thumbFinal = thumbnail;
    if (!thumbFinal) {
      if (tipo === 'foto') thumbFinal = await gerarThumbnailImagem(blob);
      if (tipo === 'video') thumbFinal = await gerarThumbnailVideo(blob);
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
      mimeType,
      thumbnail: thumbFinal,
      destaque: false,
      criadoEm: Date.now(),
    });

    return id;
  }, []);

  // ── capturar com câmera ────────────────────────────────────────────────────
  const capturarFoto = useCallback(async () => {
    try {
      const foto = await Camera.getPhoto({
        quality: 85,
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        saveToGallery: false,
      });

      const blob = await uriToBlob(foto.webPath);
      const id = await salvarMemoria({
        tipo: 'foto',
        blob,
        nomeArquivo: `foto_${Date.now()}.jpg`,
      });
      return id;
    } catch (err) {
      if (err?.message?.includes('cancelled') || err?.message?.includes('User cancelled')) {
        return null; // usuário cancelou, não é erro
      }
      console.error('[useMemories] Erro ao capturar foto:', err);
      setErro('Não foi possível abrir a câmera.');
      return null;
    }
  }, [salvarMemoria]);

  // ── selecionar UMA foto/vídeo da galeria (fluxo do modal existente) ────────
  const selecionarDaGaleria = useCallback(async () => {
    try {
      const concedida = await solicitarPermissoes();
      if (!concedida) {
        setErro('Permissão de galeria negada. Habilite nas configurações do iPhone.');
        return null;
      }

      const foto = await Camera.getPhoto({
        quality: 85,
        source: CameraSource.Photos,
        resultType: CameraResultType.Uri,
      });

      const blob = await uriToBlob(foto.webPath);
      const tipo = foto.format === 'gif' ? 'foto' : 'foto'; // extensível
      const id = await salvarMemoria({
        tipo,
        blob,
        nomeArquivo: `galeria_${Date.now()}.${foto.format || 'jpg'}`,
      });
      return id;
    } catch (err) {
      if (err?.message?.includes('cancelled') || err?.message?.includes('User cancelled')) {
        return null;
      }
      console.error('[useMemories] Erro ao selecionar da galeria:', err);
      setErro('Não foi possível acessar a galeria.');
      return null;
    }
  }, [salvarMemoria]);

  // ── BACKUP AUTOMÁTICO — importar toda a galeria ───────────────────────────
  //
  // @capacitor/camera v6 expõe Camera.pickImages() que abre o seletor
  // múltiplo nativo do iOS (PHPickerViewController) e do Android (Intents).
  // "limit: 0" significa sem limite — o usuário pode selecionar quantas quiser.
  //
  // DIFERENÇA DO PhotoLibraryPlugin antigo:
  //   - PhotoLibraryPlugin tentava acesso programático TOTAL à galeria (requer
  //     NSPhotoLibraryUsageDescription + aprovação rigorosa da Apple)
  //   - pickImages() abre o seletor NATIVO — o usuário escolhe o que importar,
  //     o que é aprovado pela App Store e não exige permissão especial no iOS 14+
  //
  const importarGaleria = useCallback(async ({
    onProgresso = null, // callback (atual, total) => void
  } = {}) => {
    setErro(null);
    setImportando(true);
    setProgresso({ atual: 0, total: 0 });

    try {
      const concedida = await solicitarPermissoes();
      if (!concedida) {
        setErro('Permissão de galeria negada. Habilite nas configurações do iPhone.');
        setImportando(false);
        return { importadas: 0, erros: 0 };
      }

      // Abre o seletor nativo múltiplo — funciona em iOS 14+ e Android
      let fotos;
      try {
        fotos = await Camera.pickImages({
          quality: 80,
          limit: 0, // sem limite
        });
      } catch (err) {
        if (err?.message?.includes('cancelled') || err?.message?.includes('User cancelled')) {
          setImportando(false);
          return { importadas: 0, erros: 0 };
        }
        throw err;
      }

      const lista = fotos.photos ?? [];
      const total = lista.length;
      setProgresso({ atual: 0, total });

      let importadas = 0;
      let errosCount = 0;

      // Busca IDs já existentes para evitar duplicatas por nome de arquivo
      const idsExistentes = new Set(
        (await db.memories.toArray()).map((m) => m.nomeArquivo)
      );

      for (let i = 0; i < lista.length; i++) {
        const item = lista[i];
        try {
          // webPath é o URI local temporário que o Capacitor fornece
          const blob = await uriToBlob(item.webPath);
          const nomeArquivo = item.webPath.split('/').pop() || `import_${i}.jpg`;

          // Pula duplicatas
          if (idsExistentes.has(nomeArquivo)) {
            setProgresso({ atual: i + 1, total });
            onProgresso?.(i + 1, total);
            continue;
          }

          // Detecta se é vídeo pelo mimeType ou extensão
          const isVideo =
            blob.type?.startsWith('video/') ||
            /\.(mp4|mov|avi|mkv|m4v|3gp)$/i.test(nomeArquivo);

          await salvarMemoria({
            tipo: isVideo ? 'video' : 'foto',
            blob,
            nomeArquivo,
          });

          idsExistentes.add(nomeArquivo);
          importadas++;
        } catch (itemErr) {
          console.warn(`[useMemories] Falha ao importar item ${i}:`, itemErr);
          errosCount++;
        }

        setProgresso({ atual: i + 1, total });
        onProgresso?.(i + 1, total);

        // Pausa curta a cada 10 itens para não travar a UI
        if ((i + 1) % 10 === 0) {
          await new Promise((r) => setTimeout(r, 30));
        }
      }

      return { importadas, erros: errosCount };
    } catch (err) {
      console.error('[useMemories] Erro no backup automático:', err);
      setErro('Erro ao acessar a galeria. Tente novamente.');
      return { importadas: 0, erros: 0 };
    } finally {
      setImportando(false);
    }
  }, [salvarMemoria]);

  // ── CRUD básico (preservado do original) ──────────────────────────────────

  const listarMemórias = useCallback(async (filtros = {}) => {
    let query = db.memories.orderBy('data').reverse();
    if (filtros.tipo) query = query.filter((m) => m.tipo === filtros.tipo);
    if (filtros.pasta) query = query.filter((m) => m.pasta === filtros.pasta);
    if (filtros.busca) {
      const termo = filtros.busca.toLowerCase();
      query = query.filter(
        (m) =>
          m.titulo?.toLowerCase().includes(termo) ||
          m.descricao?.toLowerCase().includes(termo)
      );
    }
    return query.toArray();
  }, []);

  const atualizarMemória = useCallback(async (id, dados) => {
    await db.memories.update(id, { ...dados, atualizadoEm: Date.now() });
  }, []);

  const excluirMemória = useCallback(async (id) => {
    await db.memories.delete(id);
  }, []);

  const toggleDestaque = useCallback(async (id) => {
    const mem = await db.memories.get(id);
    if (mem) await db.memories.update(id, { destaque: !mem.destaque });
  }, []);

  // ── retorno ───────────────────────────────────────────────────────────────
  return {
    // estado
    importando,
    progresso,
    erro,
    // ações de galeria/câmera
    capturarFoto,
    selecionarDaGaleria,
    importarGaleria,      // ← backup automático corrigido
    // CRUD
    salvarMemoria,
    listarMemórias,
    atualizarMemória,
    excluirMemória,
    toggleDestaque,
  };
}