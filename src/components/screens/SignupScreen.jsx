/**
 * SignupScreen — Tela de criar conta
 */
import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import toast from 'react-hot-toast'
import styles from './AuthScreen.module.css'

export default function SignupScreen({ onGoLogin, onGoWelcome }) {
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name || !email || !password) {
      toast.error('Preencha todos os campos')
      return
    }
    if (password.length < 6) {
      toast.error('A senha precisa ter pelo menos 6 caracteres')
      return
    }
    setLoading(true)
    try {
      await signup(email, password, name)
      toast.success('Conta criada com sucesso!')
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        toast.error('Esse email ja esta em uso')
      } else if (err.code === 'auth/weak-password') {
        toast.error('Senha muito fraca')
      } else if (err.code === 'auth/invalid-email') {
        toast.error('Email invalido')
      } else {
        toast.error('Erro ao criar conta. Tente novamente.')
      }
    }
    setLoading(false)
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <button className={styles.backBtn} onClick={onGoWelcome}>← Voltar</button>
        <h1 className={styles.title}>Criar Conta</h1>
        <p className={styles.subtitle}>Comece a guardar seus momentos</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Seu nome</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Como quer ser chamado?"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
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
              placeholder="Minimo 6 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className={styles.btnSubmit} disabled={loading}>
            {loading ? 'Criando...' : 'Criar minha conta'}
          </button>
        </form>

        <p className={styles.switchText}>
          Ja tem conta?{' '}
          <button className={styles.switchBtn} onClick={onGoLogin}>Entrar</button>
        </p>
      </div>
    </div>
  )
}
