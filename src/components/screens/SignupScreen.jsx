/**
 * SignupScreen — Tela de criar conta
 */
import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import toast from 'react-hot-toast'
import styles from './AuthScreen.module.css'

function generateUsername(name) {
  const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
  const num = Math.floor(Math.random() * 9000) + 1000
  return `${base}.${num}`
}

export default function SignupScreen({ onGoLogin, onGoWelcome }) {
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleNameChange = (val) => {
    setName(val)
    if (val.trim() && !username) {
      setUsername(generateUsername(val.trim()))
    }
  }

  const handleUsernameChange = (val) => {
    // Só permite letras minúsculas, números, ponto e underline
    const clean = val.toLowerCase().replace(/[^a-z0-9._]/g, '')
    setUsername(clean)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name || !username || !email || !password || !birthDate) {
      toast.error('Preencha todos os campos')
      return
    }
    if (password.length < 6) {
      toast.error('A senha precisa ter pelo menos 6 caracteres')
      return
    }
    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
      toast.error('Username deve ter 3-30 caracteres (letras, números, . ou _)')
      return
    }
    setLoading(true)
    try {
      await signup(email, password, name, username, birthDate)
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
              onChange={e => handleNameChange(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Nome de usuário</label>
            <input
              type="text"
              className={styles.input}
              placeholder="ex: raphael.637 ou maria_123"
              value={username}
              onChange={e => handleUsernameChange(e.target.value)}
              autoComplete="username"
            />
            <span className={styles.hint}>Letras minúsculas, números, . e _ permitidos</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Data de nascimento</label>
            <input
              type="date"
              className={styles.input}
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
            />
            <span className={styles.hint}>Usamos para lembrar aniversários e datas especiais</span>
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
