/**
 * PinLockModal — Configurar/Verificar PIN de bloqueio
 */
import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import styles from '../screens/AuthScreen.module.css'

const PIN_KEY = 'recordar_pin_hash'

function hashPin(pin) {
  // Hash simples para PIN local (nao precisa ser crypto-grade)
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i)
    hash |= 0
  }
  return hash.toString()
}

export default function PinLockModal({ onClose, onUnlock }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState('check') // 'check' | 'create' | 'confirm'
  const [hasPin, setHasPin] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(PIN_KEY)
    if (stored) {
      setHasPin(true)
      setStep('verify')
    } else {
      setStep('create')
    }
  }, [])

  const handleCreate = () => {
    if (pin.length < 4) {
      toast.error('O PIN precisa ter pelo menos 4 digitos')
      return
    }
    setStep('confirm')
  }

  const handleConfirm = () => {
    if (confirmPin !== pin) {
      toast.error('Os PINs nao coincidem')
      setConfirmPin('')
      return
    }
    localStorage.setItem(PIN_KEY, hashPin(pin))
    toast.success('PIN configurado com sucesso!')
    onClose()
  }

  const handleVerify = () => {
    const stored = localStorage.getItem(PIN_KEY)
    if (hashPin(pin) === stored) {
      toast.success('Desbloqueado!')
      onUnlock?.()
      onClose()
    } else {
      toast.error('PIN incorreto')
      setPin('')
    }
  }

  const handleRemove = () => {
    localStorage.removeItem(PIN_KEY)
    toast.success('PIN removido')
    onClose()
  }

  return (
    <div className={styles.container} style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
      <div className={styles.content}>
        <button className={styles.backBtn} onClick={onClose}>← Voltar</button>

        {step === 'create' && (
          <>
            <h1 className={styles.title}>Criar PIN</h1>
            <p className={styles.subtitle}>Escolha um PIN de 4-6 digitos para proteger o app</p>
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
            <h1 className={styles.title}>Confirmar PIN</h1>
            <p className={styles.subtitle}>Digite o PIN novamente para confirmar</p>
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
            <h1 className={styles.title}>Digite seu PIN</h1>
            <p className={styles.subtitle}>Insira o PIN para desbloquear</p>
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
              <button className={styles.switchBtn} onClick={handleRemove} style={{marginTop: 16}}>
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
 * Verifica se existe PIN configurado
 */
export function hasPinLock() {
  return !!localStorage.getItem(PIN_KEY)
}
