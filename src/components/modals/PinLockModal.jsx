/**
 * PinLockModal — Configurar/Verificar PIN de bloqueio
 */
import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import styles from '../screens/AuthScreen.module.css'

function getPinKey(uid) {
  return `recordar_pin_hash_${uid || ''}`
}

function hashPin(pin) {
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i)
    hash |= 0
  }
  return hash.toString()
}

export default function PinLockModal({ onClose, onUnlock, uid, mode }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState('check')
  const [hasPin, setHasPin] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(getPinKey(uid))
    if (stored) {
      setHasPin(true)
      // Se mode=manage, mostrar opções de gerenciar
      setStep(mode === 'manage' ? 'manage' : 'verify')
    } else {
      setStep('create')
    }
  }, [uid, mode])

  const handleCreate = () => {
    if (pin.length < 4) {
      toast.error('O PIN precisa ter pelo menos 4 dígitos')
      return
    }
    setStep('confirm')
  }

  const handleConfirm = () => {
    if (confirmPin !== pin) {
      toast.error('Os PINs não coincidem')
      setConfirmPin('')
      return
    }
    localStorage.setItem(getPinKey(uid), hashPin(pin))
    toast.success('PIN configurado com sucesso!')
    onClose()
  }

  const handleVerify = () => {
    const stored = localStorage.getItem(getPinKey(uid))
    if (hashPin(pin) === stored) {
      toast.success('Desbloqueado!')
      onUnlock?.()
    } else {
      toast.error('PIN incorreto')
      setPin('')
    }
  }

  const handleRemove = () => {
    localStorage.removeItem(getPinKey(uid))
    toast.success('PIN removido')
    onClose()
  }

  return (
    <div className={styles.modalOverlay} style={{ zIndex: 9999 }}>
      <div className={styles.modalBox}>
        <button className={styles.switchBtn} onClick={onClose} style={{ alignSelf: 'flex-start', marginBottom: 12 }}>← Voltar</button>

        {step === 'create' && (
          <>
            <h2 className={styles.modalTitle}>Criar PIN</h2>
            <p style={{ fontSize: 13, color: 'var(--cinza-suave)', textAlign: 'center', marginBottom: 16 }}>
              Escolha um PIN de 4-6 dígitos para proteger a pasta Trancadas
            </p>
            <div className={styles.form}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={styles.input}
                placeholder="Digite seu PIN"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <button className={styles.btnSubmit} onClick={handleCreate}>
                Continuar
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2 className={styles.modalTitle}>Confirmar PIN</h2>
            <p style={{ fontSize: 13, color: 'var(--cinza-suave)', textAlign: 'center', marginBottom: 16 }}>
              Digite o PIN novamente para confirmar
            </p>
            <div className={styles.form}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={styles.input}
                placeholder="Confirme seu PIN"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <button className={styles.btnSubmit} onClick={handleConfirm}>
                Salvar PIN
              </button>
            </div>
          </>
        )}

        {step === 'verify' && (
          <>
            <h2 className={styles.modalTitle}>Digite seu PIN</h2>
            <p style={{ fontSize: 13, color: 'var(--cinza-suave)', textAlign: 'center', marginBottom: 16 }}>
              Insira o PIN para desbloquear a pasta
            </p>
            <div className={styles.form}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={styles.input}
                placeholder="Seu PIN"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <button className={styles.btnSubmit} onClick={handleVerify}>
                Desbloquear
              </button>
            </div>
          </>
        )}

        {step === 'manage' && (
          <>
            <h2 className={styles.modalTitle}>PIN de Bloqueio</h2>
            <p style={{ fontSize: 13, color: 'var(--cinza-suave)', textAlign: 'center', marginBottom: 16 }}>
              Você já tem um PIN configurado para a pasta Trancadas.
            </p>
            <div className={styles.form}>
              <button className={styles.btnSubmit} onClick={() => { setStep('create'); setPin(''); setConfirmPin('') }}>
                Alterar PIN
              </button>
              <button className={styles.btnSubmit} onClick={handleRemove} style={{ background: '#FF3D57', marginTop: 10 }}>
                Remover PIN
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Verifica se existe PIN configurado para um uid
 */
export function hasPinLock(uid) {
  return !!localStorage.getItem(getPinKey(uid))
}
