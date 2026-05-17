/**
 * SignupScreen — Tela de criar conta
 */
import React, { useState, useEffect } from 'react'
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('auth-screen')
    return () => document.documentElement.classList.remove('auth-screen')
  }, [])

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
    if (!name || !username || !email || !password) {
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
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem')
      return
    }
    if (!/^[a-z0-9.]{3,30}$/.test(username)) {
      toast.error('Username deve ter 3-30 caracteres (letras, números e .)')
      return
    }
    setLoading(true)
    try {
      await signup(email, password, name, username, '')
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
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Confirmar senha</label>
            <input
              type="password"
              className={styles.input}
              placeholder="Repita a senha"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
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
              <span className={styles.termsLink} onClick={e => { e.preventDefault(); window.open('https://recordarmomentos.vercel.app/privacidade.html', '_blank') }}>Política de Privacidade</span>
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
              <p><strong>Última atualização: 13 de maio de 2026</strong></p>
              <p>Ao criar uma conta e utilizar o Recordar, você concorda com os seguintes termos:</p>
              <p><strong>1. Sobre o Serviço</strong><br/>O Recordar é um aplicativo de memórias pessoais e legado familiar. Nosso objetivo é ajudar você a guardar e organizar momentos importantes da sua vida.</p>
              <p><strong>2. Sua Conta</strong><br/>• Você deve fornecer informações verdadeiras ao criar sua conta.<br/>• Cada pessoa deve ter apenas uma conta pessoal.<br/>• Você é responsável por manter sua senha e PIN seguros.<br/>• Menores de 13 anos não podem criar conta.</p>
              <p><strong>3. Seu Conteúdo</strong><br/>• Suas memórias são privadas por padrão.<br/>• Você mantém todos os direitos sobre o conteúdo que armazena.<br/>• Não armazene conteúdo ilegal ou que viole direitos de terceiros.</p>
              <p><strong>4. Armazenamento</strong><br/>• Oferecemos armazenamento local e na nuvem conforme seu plano.<br/>• Não garantimos recuperação de dados perdidos no armazenamento local.<br/>• Dados na nuvem são protegidos com criptografia em trânsito.</p>
              <p><strong>5. Cancelamento e Exclusão</strong><br/>• Você pode excluir sua conta a qualquer momento.<br/>• Dados na nuvem serão removidos em até 30 dias.</p>
              <p><strong>6. Alterações</strong><br/>• Podemos atualizar estes termos. Você será notificado sobre mudanças significativas.</p>
              <p><strong>Contato:</strong> suporte@recordar.com</p>
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
              <p><strong>Última atualização: 13 de maio de 2026</strong></p>
              <p>Sua privacidade é fundamental para nós. Esta política explica como coletamos, usamos e protegemos seus dados.</p>
              <p><strong>1. Dados que Coletamos</strong><br/>• Informações de conta: nome, email, data de nascimento, nome de usuário.<br/>• Conteúdo: fotos, vídeos, áudios e textos que você escolhe salvar.<br/>• Dados técnicos: tipo de dispositivo, versão do app.<br/>• Não coletamos localização, contatos ou histórico de navegação.</p>
              <p><strong>2. Como Usamos seus Dados</strong><br/>• Para fornecer e manter o serviço.<br/>• Para backup e sincronização na nuvem (se ativado).<br/>• Nunca vendemos ou compartilhamos seus dados com terceiros.</p>
              <p><strong>3. Armazenamento e Segurança</strong><br/>• Dados na nuvem são armazenados no Firebase (Google Cloud) com criptografia.<br/>• Sua senha é armazenada com hash seguro.<br/>• O PIN da pasta Trancadas é armazenado apenas localmente.</p>
              <p><strong>4. Seus Direitos</strong><br/>• Acesso: pode ver todos os dados que temos sobre você.<br/>• Exclusão: pode apagar sua conta e todos os dados.<br/>• Exportação: pode exportar todas as suas memórias em ZIP.</p>
              <p><strong>5. Menores de Idade</strong><br/>• O Recordar não é destinado a menores de 13 anos.</p>
              <p><strong>Contato:</strong> suporte@recordar.com | WhatsApp: (13) 99663-6898</p>
            </div>
            <button className={styles.modalCloseBtn} onClick={() => setShowPrivacy(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}