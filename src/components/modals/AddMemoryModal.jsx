/**
 * AddMemoryModal — Bottom sheet para adicionar nova memoria
 * 
 * Suporta:
 *  - Foto da camera ou galeria
 *  - Video da camera ou galeria
 *  - Gravacao de audio (longo)
 *  - Texto/reflexao
 *  - Salva no Firebase (Firestore + Storage)
 */

import React, { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { addMemory } from '../../services/memoriesService.js'
import { generateVideoThumbnail, generateThumbnail } from '../../hooks/useMemories.js'
import { isPremium } from '../../services/planService.js'
import styles from './AddMemoryModal.module.css'

const MODAL_ICONS = {
  photo: '/icons/modal-foto.svg',
  video: '/icons/modal-video.svg',
  audio: '/icons/modal-audio.svg',
  text:  '/icons/modal-texto.svg',
}

const TIPOS = [
  { id: 'photo', label: 'Foto',   sub: 'Da câmera ou galeria' },
  { id: 'video', label: 'Vídeo',  sub: 'Da câmera ou galeria' },
  { id: 'audio', label: 'Áudio',  sub: 'Gravar voz' },
  { id: 'text',  label: 'Frase',  sub: 'Reflexão ou história' },
]

export default function AddMemoryModal({ onClose, onSaved, initialType }) {
  const [step, setStep]         = useState('type')
  const [selectedType, setType] = useState(null)
  const [file, setFile]         = useState(null)
  const [files, setFiles]       = useState([])
  const [preview, setPreview]   = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Detalhes
  const [description, setDesc]  = useState('')
  const [textContent, setText]  = useState('')
  const [privacy, setPrivacy]   = useState(null) // obrigatório: 'private' ou 'public'

  // Audio
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob]     = useState(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const timerRef         = useRef(null)

  const fileInputRef  = useRef(null)
  const cameraInputRef = useRef(null)

  // Se initialType definido, pula direto para o step correto
  useState(() => {
    if (initialType) {
      const tipo = TIPOS.find(t => t.id === initialType)
      if (tipo) {
        setType(tipo)
        if (tipo.id === 'audio') setStep('audio')
        else if (tipo.id === 'text') setStep('details')
        else setStep('source')
      }
    }
  })

  // ── Selecionar tipo ──
  const handleSelectType = (tipo) => {
    setType(tipo)
    if (tipo.id === 'audio') {
      setStep('audio')
    } else if (tipo.id === 'text') {
      setStep('details')
    } else {
      setStep('source')
    }
  }

  // ── Abrir camera ──
  const openCamera = () => {
    cameraInputRef.current.click()
  }

  // ── Abrir galeria ──
  const openGallery = () => {
    fileInputRef.current.click()
  }

  // ── Arquivo(s) selecionado(s) ──
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    
    if (selectedFiles.length === 1) {
      // Um arquivo: fluxo normal com preview
      setFile(selectedFiles[0])
      setFiles([])
      setPreview(URL.createObjectURL(selectedFiles[0]))
      setStep('details')
    } else {
      // Múltiplos: salva direto sem pedir detalhes
      setFiles(selectedFiles)
      setFile(null)
      setPreview(null)
      setStep('multiple')
    }
  }

  // ── Gravacao de audio ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Detectar formato suportado
      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg'
      }
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current)
      }

      mediaRecorder.start(1000) // chunks a cada 1s para melhor compatibilidade
      setIsRecording(true)
      setAudioDuration(0)
      timerRef.current = setInterval(() => {
        setAudioDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      toast.error('Nao foi possivel acessar o microfone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // ── Salvar múltiplos ──
  const handleSaveMultiple = async () => {
    setIsSaving(true)
    let saved = 0
    try {
      for (const f of files) {
        const type = f.type.startsWith('video') ? 'video' : 'photo'
        const cleanName = f.name.replace(/\.[^.]+$/, '').replace(/^(IMG|VID|WA\d*)[_-]?/i, '').replace(/[_-]/g, ' ').trim() || 'Sem titulo'
        const fileDate = new Date(f.lastModified || Date.now()).toISOString().substring(0, 10)
        let thumbnail = null
        if (type === 'video') thumbnail = await generateVideoThumbnail(f)
        else if (type === 'photo') thumbnail = await generateThumbnail(f)
        await addMemory({
          type,
          title: cleanName,
          description: '',
          date: fileDate,
          tags: [],
          thumbnail,
        }, f)
        saved++
      }
      toast.success(`${saved} memória(s) salva(s)!`)
      window.dispatchEvent(new Event('memories-updated'))
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error(`Erro: ${saved} de ${files.length} salvos`)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Salvar ──
  const handleSave = async () => {
    if (!description.trim() && !textContent.trim() && !file && !audioBlob) {
      toast.error('Adicione uma descricao ou conteudo')
      return
    }
    if (!privacy) {
      toast.error('Escolha a privacidade da publicação')
      return
    }

    setIsSaving(true)
    try {
      const memData = {
        type:        selectedType?.id || 'text',
        title:       description.trim().substring(0, 60) || (selectedType?.id === 'text' ? textContent.substring(0, 60) : 'Sem titulo'),
        description: description,
        date:        new Date().toISOString().substring(0, 10),
        tags:        [],
        privacyLevel: privacy,
      }

      if (selectedType?.id === 'text') {
        memData.description = textContent
      }

      // Gera thumbnail para vídeo (com timeout para não travar)
      if (file && selectedType?.id === 'video') {
        try {
          const thumb = await Promise.race([
            generateVideoThumbnail(file),
            new Promise(resolve => setTimeout(() => resolve(null), 5000))
          ])
          if (thumb) memData.thumbnail = thumb
        } catch { /* sem thumbnail, segue salvando */ }
      }

      let fileToUpload = file
      if (audioBlob) {
        const audioExt = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
        fileToUpload = new File([audioBlob], `audio_${Date.now()}.${audioExt}`, { type: audioBlob.type })
        memData.duration = audioDuration
      }

      await addMemory(memData, fileToUpload)
      toast.success('Memoria salva com carinho!')
      
      // Aviso para usuarios gratuitos
      const premium = await isPremium()
      if (!premium && fileToUpload) {
        setTimeout(() => {
          toast('⚠️ Essa memoria esta apenas neste dispositivo. Faca backup!', { duration: 4000 })
        }, 1500)
      }
      
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Inputs ocultos */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={selectedType?.id === 'video' ? 'video/*' : 'image/*'}
        capture
        className={styles.hiddenInput}
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={selectedType?.id === 'video' ? 'video/*' : 'image/*'}
        multiple
        className={styles.hiddenInput}
        onChange={handleFileChange}
      />

      <div className={`${styles.sheet} animate-slideUp`}>
        <div className={styles.handle} />

        {/* ── STEP: Escolher tipo ── */}
        {step === 'type' && (
          <>
            <h2 className={styles.sheetTitle}>Nova Memoria</h2>
            <div className={styles.typeGrid}>
              {TIPOS.map(t => (
                <button key={t.id} className={styles.typeBtn} onClick={() => handleSelectType(t)}>
                  <img src={MODAL_ICONS[t.id]} alt="" aria-hidden="true" className={styles.typeIcon} width={48} height={48} />
                  <span className={styles.typeLabel}>{t.label}</span>
                  <span className={styles.typeSub}>{t.sub}</span>
                </button>
              ))}
            </div>
            <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          </>
        )}

        {/* ── STEP: Escolher fonte (camera ou galeria) ── */}
        {step === 'source' && (
          <>
            <div className={styles.detailsHeader}>
              <button className={styles.backBtn} onClick={() => setStep('type')}>← Voltar</button>
              <h2 className={styles.sheetTitle}>{selectedType?.label}</h2>
            </div>
            <div className={styles.sourceGrid}>
              <button className={styles.sourceBtn} onClick={openCamera}>
                <span className={styles.sourceIcon}>📷</span>
                <span className={styles.sourceLabel}>Abrir Camera</span>
                <span className={styles.sourceSub}>Tirar {selectedType?.id === 'video' ? 'video' : 'foto'} agora</span>
              </button>
              <button className={styles.sourceBtn} onClick={openGallery}>
                <span className={styles.sourceIcon}>🖼️</span>
                <span className={styles.sourceLabel}>Galeria</span>
                <span className={styles.sourceSub}>Escolher do celular</span>
              </button>
            </div>
            <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          </>
        )}

        {/* ── STEP: Gravacao de audio ── */}
        {step === 'audio' && (
          <>
            <div className={styles.detailsHeader}>
              <button className={styles.backBtn} onClick={() => { stopRecording(); setStep('type') }}>← Voltar</button>
              <h2 className={styles.sheetTitle}>Gravar Audio</h2>
            </div>
            <div className={styles.audioArea}>
              <div className={styles.audioTimer}>
                <span className={`${styles.recDot} ${isRecording ? styles.recDotActive : ''}`} />
                {formatDuration(audioDuration)}
              </div>
              {!audioBlob && !isRecording && (
                <button className={styles.recBtn} onClick={startRecording}>
                  Iniciar Gravacao
                </button>
              )}
              {isRecording && (
                <button className={`${styles.recBtn} ${styles.recBtnStop}`} onClick={stopRecording}>
                  Parar Gravacao
                </button>
              )}
              {audioBlob && !isRecording && (
                <div className={styles.audioPreview}>
                  <audio controls src={URL.createObjectURL(audioBlob)} className={styles.audioPlayer} />
                  <div className={styles.audioActions}>
                    <button className={styles.recBtnSmall} onClick={() => { setAudioBlob(null); setAudioDuration(0) }}>
                      Gravar novamente
                    </button>
                    <button className={styles.recBtnSmall} onClick={() => setStep('details')}>
                      Usar este audio
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          </>
        )}

        {/* ── STEP: Múltiplos arquivos ── */}
        {step === 'multiple' && (
          <>
            <div className={styles.detailsHeader}>
              <button className={styles.backBtn} onClick={() => setStep('type')}>← Voltar</button>
              <h2 className={styles.sheetTitle}>Importar {files.length} arquivo(s)</h2>
            </div>
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'var(--cinza-suave)', marginBottom: 16 }}>
                {files.length} foto(s)/vídeo(s) selecionado(s). Serão salvos com data e título automáticos.
              </p>
              <button
                className={`${styles.saveBtn} ${isSaving ? styles.savingBtn : ''}`}
                onClick={handleSaveMultiple}
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : `Salvar ${files.length} arquivo(s)`}
              </button>
              <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}

        {/* ── STEP: Detalhes ── */}
        {step === 'details' && (
          <div className={styles.detailsForm}>
            <div className={styles.detailsHeader}>
              <button className={styles.backBtn} onClick={() => setStep('type')}>← Voltar</button>
              <h2 className={styles.sheetTitle}>Detalhes</h2>
            </div>

            {preview && selectedType?.id === 'photo' && (
              <div className={styles.previewWrap}>
                <img src={preview} alt="Previa" className={styles.previewImg} />
              </div>
            )}
            {preview && selectedType?.id === 'video' && (
              <div className={styles.previewWrap}>
                <video src={preview} controls className={styles.previewImg} />
              </div>
            )}

            {selectedType?.id === 'text' && (
              <textarea
                className={styles.textArea}
                placeholder="Escreva sua reflexao, historia ou pensamento..."
                value={textContent}
                onChange={e => setText(e.target.value)}
                rows={5}
                autoFocus
              />
            )}

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Descricao</label>
              <textarea
                className={styles.fieldTextarea}
                placeholder="Conte mais sobre este momento..."
                value={description}
                onChange={e => setDesc(e.target.value)}
                rows={3}
              />
            </div>

            {/* Privacidade obrigatória */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Quem pode ver *</label>
              <div className={styles.privacyRow}>
                <button
                  type="button"
                  className={`${styles.privacyBtn} ${privacy === 'private' ? styles.privacyBtnActive : ''}`}
                  onClick={() => setPrivacy('private')}
                >
                  🔒 Somente eu
                </button>
                <button
                  type="button"
                  className={`${styles.privacyBtn} ${privacy === 'public' ? styles.privacyBtnActive : ''}`}
                  onClick={() => setPrivacy('public')}
                >
                  🌐 Público
                </button>
              </div>
            </div>

            <button
              className={`${styles.saveBtn} ${isSaving ? styles.savingBtn : ''}`}
              onClick={handleSave}
              disabled={isSaving || !privacy}
            >
              {isSaving ? 'Salvando...' : 'Salvar Memoria'}
            </button>
            <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  )
}