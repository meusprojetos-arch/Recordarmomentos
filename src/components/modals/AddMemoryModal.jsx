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
import { format } from 'date-fns'
import { addMemory } from '../../services/memoriesService.js'
import { isPremium } from '../../services/planService.js'
import styles from './AddMemoryModal.module.css'

const MODAL_ICONS = {
  photo: '/icons/modal-foto.svg',
  video: '/icons/modal-video.svg',
  audio: '/icons/modal-audio.svg',
  text:  '/icons/modal-texto.svg',
}

const TIPOS = [
  { id: 'photo', label: 'Foto',  sub: 'Camera ou galeria' },
  { id: 'video', label: 'Video', sub: 'Camera ou galeria' },
  { id: 'audio', label: 'Audio', sub: 'Gravar voz' },
  { id: 'text',  label: 'Texto', sub: 'Escrever reflexao' },
]

export default function AddMemoryModal({ onClose, onSaved }) {
  const [step, setStep]         = useState('type')
  const [selectedType, setType] = useState(null)
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Detalhes
  const [title, setTitle]       = useState('')
  const [description, setDesc]  = useState('')
  const [date, setDate]         = useState(format(new Date(), 'yyyy-MM-dd'))
  const [textContent, setText]  = useState('')

  // Audio
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob]     = useState(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const timerRef         = useRef(null)

  const fileInputRef  = useRef(null)
  const cameraInputRef = useRef(null)

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

  // ── Arquivo selecionado ──
  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setStep('details')
  }

  // ── Gravacao de audio ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current)
      }

      mediaRecorder.start()
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

  // ── Salvar ──
  const handleSave = async () => {
    if (!title.trim() && !textContent.trim() && !file && !audioBlob) {
      toast.error('Adicione um titulo ou conteudo')
      return
    }

    setIsSaving(true)
    try {
      const memData = {
        type:        selectedType?.id || 'text',
        title:       title || (selectedType?.id === 'text' ? textContent.substring(0, 60) : 'Sem titulo'),
        description: description,
        date:        date,
        tags:        [],
      }

      if (selectedType?.id === 'text') {
        memData.description = textContent
      }

      let fileToUpload = file
      if (audioBlob) {
        fileToUpload = new File([audioBlob], `audio_${Date.now()}.webm`, { type: 'audio/webm' })
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
        capture="environment"
        className={styles.hiddenInput}
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={selectedType?.id === 'video' ? 'video/*' : 'image/*'}
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
              <label className={styles.fieldLabel}>Titulo</label>
              <input
                className={styles.fieldInput}
                placeholder="Ex: Aniversario da Ana, Viagem a Gramado..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Data da memoria</label>
              <input
                className={styles.fieldInput}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Descricao (opcional)</label>
              <textarea
                className={styles.fieldTextarea}
                placeholder="Conte mais sobre este momento..."
                value={description}
                onChange={e => setDesc(e.target.value)}
                rows={3}
              />
            </div>

            <button
              className={`${styles.saveBtn} ${isSaving ? styles.savingBtn : ''}`}
              onClick={handleSave}
              disabled={isSaving}
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
