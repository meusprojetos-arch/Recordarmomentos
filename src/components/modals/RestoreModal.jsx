/**
 * RestoreModal — Pergunta se o usuario quer restaurar dados da nuvem
 */
import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { restoreFromCloud } from '../../services/backupService.js'
import styles from '../screens/AuthScreen.module.css'

export default function RestoreModal({ count, onClose, onRestored }) {
  const [loading, setLoading] = useState(false)

  const handleRestore = async () => {
    setLoading(true)
    try {
      const result = await restoreFromCloud()
      toast.success(`${result.restored} memorias restauradas!`)
      onRestored?.()
    } catch (err) {
      toast.error('Erro ao restaurar')
    }
    setLoading(false)
    onClose()
  }

  return (
    <div className={styles.container} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)' }}>
      <div className={styles.content} style={{ background: 'var(--bege-claro)', borderRadius: 20, padding: 28 }}>
        <h1 className={styles.title} style={{ fontSize: 22 }}>Memorias encontradas!</h1>
        <p className={styles.subtitle} style={{ marginTop: 8 }}>
          Encontramos {count} memorias salvas na sua conta. Deseja restaurar?
        </p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className={styles.btnSubmit} onClick={handleRestore} disabled={loading}>
            {loading ? 'Restaurando...' : 'Sim, restaurar tudo'}
          </button>
          <button className={styles.switchBtn} onClick={onClose} style={{ padding: 12 }}>
            Nao, comecar do zero
          </button>
        </div>
      </div>
    </div>
  )
}
