/**
 * LoginScreen — Tela de entrar na conta
 */
import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import toast from 'react-hot-toast'
import styles from './AuthScreen.module.css'

export default function LoginScreen({ onGoSignup, onGoWelcome }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Preencha todos os campos')
      return
    }
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Bem-vindo de volta!')
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Email ou senha incorretos')
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Muitas tentativas. Tente mais tarde.')
      } else {
        toast.error('Erro ao entrar. Tente novamente.')
      }
    }
    setLoading(false)
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <button className={styles.backBtn} onClick={onGoWelcome}>← Voltar</button>
        <h1 className={styles.title}>Entrar</h1>
        <p className={styles.subtitle}>Acesse suas memorias</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              className={styles.input}
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Senha</label>
            <input
              type="password"
              className={styles.input}
              placeholder="Sua senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className={styles.btnSubmit} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.switchText}>
          Nao tem conta?{' '}
          <button className={styles.switchBtn} onClick={onGoSignup}>Criar conta</button>
        </p>

        <button className={styles.helpBtn} onClick={() => setShowHelp(true)}>
          Preciso de ajuda
        </button>
      </div>

      {/* Modal Ajuda */}
      {showHelp && (
        <div className={styles.modalOverlay} onClick={() => setShowHelp(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Precisa de ajuda?</h2>
            <div className={styles.modalBody}>
              <p>Entre em contato conosco por um dos canais abaixo:</p>
              <a href="mailto:suporte@recordar.com" className={styles.helpItem}>
                <span className={styles.helpIcon}>✉</span>
                <span>suporte@recordar.com</span>
              </a>
              <a href="https://wa.me/5513996636898" target="_blank" rel="noopener noreferrer" className={styles.helpItem}>
                <span className={styles.helpIcon}>📱</span>
                <span>(13) 99663-6898</span>
              </a>
            </div>
            <button className={styles.modalCloseBtn} onClick={() => setShowHelp(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}
