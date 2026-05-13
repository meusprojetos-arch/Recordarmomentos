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
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

  const handleNameChange = (val) => {
    setName(val)
  }

  const handleUsernameChange = (val) => {
    // Só permite letras minúsculas, números e ponto
    const clean = val.toLowerCase().replace(/[^a-z0-9.]/g, '')
    setUsername(clean)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name || !username || !email || !password || !birthDate) {
      toast.error('Preencha todos os campos')
      return
    }
    if (!acceptedTerms) {
      toast.error('Aceite os termos para continuar')
      return
    }
    if (password.length < 6) {
      toast.error('A senha precisa ter pelo menos 6 caracteres')
      return
    }
    if (!/^[a-z0-9.]{3,30}$/.test(username)) {
      toast.error('Username deve ter 3-30 caracteres (letras, números e .)')
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
        toast.error(err.message || 'Erro ao criar conta. Tente novamente.')
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
              placeholder="ex: ana.1954"
              value={username}
              onChange={e => handleUsernameChange(e.target.value)}
              autoComplete="username"
            />
            <span className={styles.hint}>Letras minúsculas, números e . permitidos</span>
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
          <button type="submit" className={styles.btnSubmit} disabled={loading || !acceptedTerms}>
            {loading ? 'Criando...' : 'Criar minha conta'}
          </button>

          <div className={styles.termsRow}>
            <input
              type="checkbox"
              id="acceptTerms"
              checked={acceptedTerms}
              onChange={e => setAcceptedTerms(e.target.checked)}
              className={styles.termsCheckbox}
            />
            <label htmlFor="acceptTerms" className={styles.termsLabel}>
              Li e aceito os{' '}
              <span className={styles.termsLink} onClick={e => { e.preventDefault(); setShowTerms(true) }}>Termos de Uso</span>
              {' '}e a{' '}
              <span className={styles.termsLink} onClick={e => { e.preventDefault(); setShowPrivacy(true) }}>Política de Privacidade</span>
            </label>
          </div>
        </form>

        <p className={styles.switchText}>
          Ja tem conta?{' '}
          <button className={styles.switchBtn} onClick={onGoLogin}>Entrar</button>
        </p>
      </div>

      {/* Modal Termos de Uso */}
      {showTerms && (
        <div className={styles.modalOverlay} onClick={() => setShowTerms(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Termos de Uso</h2>
            <div className={styles.modalBody}>
              <p>Bem-vindo ao Recordar! Ao criar uma conta e utilizar nosso aplicativo, você concorda com os seguintes termos:</p>
              <p><strong>1. Uso do Serviço</strong><br/>O Recordar é um aplicativo de memórias pessoais. Você é responsável pelo conteúdo que armazena.</p>
              <p><strong>2. Conta</strong><br/>Você deve fornecer informações verdadeiras ao criar sua conta. Cada pessoa deve ter apenas uma conta.</p>
              <p><strong>3. Conteúdo</strong><br/>Suas memórias são privadas por padrão. Não armazene conteúdo ilegal ou que viole direitos de terceiros.</p>
              <p><strong>4. Armazenamento</strong><br/>Oferecemos armazenamento local e na nuvem conforme seu plano. Não garantimos recuperação de dados perdidos no armazenamento local.</p>
              <p><strong>5. Cancelamento</strong><br/>Você pode excluir sua conta a qualquer momento. Dados na nuvem serão removidos em até 30 dias.</p>
              <p><strong>6. Alterações</strong><br/>Podemos atualizar estes termos. Você será notificado sobre mudanças significativas.</p>
            </div>
            <button className={styles.modalCloseBtn} onClick={() => setShowTerms(false)}>Fechar</button>
          </div>
        </div>
      )}

      {/* Modal Política de Privacidade */}
      {showPrivacy && (
        <div className={styles.modalOverlay} onClick={() => setShowPrivacy(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Política de Privacidade</h2>
            <div className={styles.modalBody}>
              <p>Sua privacidade é importante para nós. Veja como tratamos seus dados:</p>
              <p><strong>1. Dados coletados</strong><br/>Coletamos nome, email, data de nascimento e as memórias que você escolhe salvar (fotos, vídeos, áudios e textos).</p>
              <p><strong>2. Uso dos dados</strong><br/>Seus dados são usados exclusivamente para fornecer o serviço do aplicativo. Não vendemos nem compartilhamos suas informações com terceiros.</p>
              <p><strong>3. Armazenamento</strong><br/>Dados são armazenados localmente no seu dispositivo e, opcionalmente, no Firebase (Google Cloud) com criptografia em trânsito.</p>
              <p><strong>4. Privacidade do perfil</strong><br/>Por padrão seu perfil é privado. Você controla o que é visível para outros usuários.</p>
              <p><strong>5. Exclusão</strong><br/>Você pode solicitar a exclusão completa dos seus dados a qualquer momento entrando em contato conosco.</p>
              <p><strong>6. Contato</strong><br/>Para dúvidas sobre privacidade: suporte@recordar.com</p>
            </div>
            <button className={styles.modalCloseBtn} onClick={() => setShowPrivacy(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}
