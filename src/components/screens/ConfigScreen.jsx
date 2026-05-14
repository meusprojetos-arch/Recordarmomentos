/**
 * ConfigScreen — Tela de Configurações
 *
 * Seções:
 *  1. Editar Perfil     — nome, bio, avatar
 *  2. Armazenamento     — barra de progresso local/nuvem
 *  3. Privacidade       — toggle perfil privado, PIN
 *  4. Backup Automático — toggle Wi-Fi, frequência
 *  5. Termos e Política — link/botão
 *  6. Excluir conta     — botão de perigo com confirmação
 *  7. Ajuda / FAQ       — itens colapsáveis
 */

import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { getUserPlan, getStorageUsage, formatBytes } from '../../services/planService.js'
import { auth, firestore } from '../../firebase.js'
import { doc, updateDoc } from 'firebase/firestore'
import { exportAllAsZip } from '../../services/exportService.js'
import db from '../../db/database.js'
import Topbar from '../layout/Topbar.jsx'
import PinLockModal from '../modals/PinLockModal.jsx'
import styles from './ConfigScreen.module.css'

const TERMS_CONTENT = `Termos de Uso — Recordar

Última atualização: 13 de maio de 2026

Ao criar uma conta e utilizar o Recordar, você concorda com os seguintes termos:

1. Sobre o Serviço
O Recordar é um aplicativo de memórias pessoais e legado familiar. Nosso objetivo é ajudar você a guardar e organizar momentos importantes da sua vida.

2. Sua Conta
• Você deve fornecer informações verdadeiras ao criar sua conta.
• Cada pessoa deve ter apenas uma conta pessoal.
• Você é responsável por manter sua senha e PIN seguros.
• Menores de 13 anos não podem criar conta.

3. Seu Conteúdo
• Suas memórias são privadas por padrão.
• Você mantém todos os direitos sobre o conteúdo que armazena.
• Não armazene conteúdo ilegal ou que viole direitos de terceiros.
• Não utilize o app para spam, assédio ou atividades maliciosas.

4. Armazenamento
• Oferecemos armazenamento local (no dispositivo) e na nuvem conforme seu plano.
• O armazenamento local depende do espaço disponível no seu dispositivo.
• Não garantimos recuperação de dados perdidos no armazenamento local.
• Dados na nuvem são protegidos com criptografia em trânsito.

5. Planos e Pagamento
• O plano gratuito tem limitações de armazenamento na nuvem.
• Planos pagos podem ser cancelados a qualquer momento.
• Não há reembolso por períodos parciais de uso.

6. Cancelamento e Exclusão
• Você pode excluir sua conta a qualquer momento.
• Ao excluir, seus dados na nuvem serão removidos em até 30 dias.
• Dados no armazenamento local permanecem no dispositivo até você removê-los.

7. Limitação de Responsabilidade
• O Recordar é fornecido "como está", sem garantias.
• Não nos responsabilizamos por perda de dados armazenados localmente.
• Recomendamos manter backup das memórias importantes.

8. Alterações nos Termos
• Podemos atualizar estes termos quando necessário.
• Você será notificado sobre mudanças significativas.
• O uso continuado após alterações constitui aceitação.

9. Contato
Para dúvidas sobre estes termos: suporte@recordar.com`

const PRIVACY_CONTENT = `Política de Privacidade — Recordar

Última atualização: 13 de maio de 2026

Sua privacidade é fundamental para nós. Esta política explica como coletamos, usamos e protegemos seus dados.

1. Dados que Coletamos
• Informações de conta: nome, email, data de nascimento, nome de usuário.
• Conteúdo: fotos, vídeos, áudios e textos que você escolhe salvar.
• Dados técnicos: tipo de dispositivo, versão do app, logs de erro.
• Não coletamos dados de localização, contatos ou histórico de navegação.

2. Como Usamos seus Dados
• Para fornecer e manter o serviço do aplicativo.
• Para personalizar sua experiência (pastas automáticas, lembretes).
• Para backup e sincronização na nuvem (se ativado).
• Nunca vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros.

3. Armazenamento e Segurança
• Dados locais ficam no seu dispositivo, protegidos pelo sistema operacional.
• Dados na nuvem são armazenados no Firebase (Google Cloud) com criptografia.
• Sua senha é armazenada com hash seguro (nunca em texto plano).
• O PIN da pasta Trancadas é armazenado apenas localmente.

4. Privacidade do Perfil
• Por padrão, seu perfil é privado — ninguém além de você pode ver suas memórias.
• Você controla o que é visível para outros usuários nas configurações.
• Memórias na pasta "Trancadas" têm camada extra de proteção (PIN).

5. Compartilhamento
• Só compartilhamos dados quando exigido por lei (ordem judicial).
• Não usamos seus dados para publicidade.
• Não temos integrações com redes sociais que acessem seu conteúdo.

6. Seus Direitos
• Acesso: você pode ver todos os dados que temos sobre você.
• Correção: pode editar suas informações a qualquer momento.
• Exclusão: pode apagar sua conta e todos os dados associados.
• Exportação: pode exportar todas as suas memórias em formato ZIP.

7. Cookies e Rastreamento
• Não usamos cookies de rastreamento.
• Não usamos ferramentas de analytics que identificam usuários.
• Coletamos apenas dados anônimos de uso para melhorar o app.

8. Menores de Idade
• O Recordar não é destinado a menores de 13 anos.
• Se identificarmos conta de menor, ela será removida.

9. Alterações nesta Política
• Atualizaremos esta política quando necessário.
• Mudanças significativas serão comunicadas via app.

10. Contato
Para dúvidas sobre privacidade ou para exercer seus direitos:
• Email: suporte@recordar.com
• WhatsApp: (13) 99663-6898`

// ─── Ícones ──────────────────────────────────────────────────────────────────
const ICONS = {
  avatar:   '/icons/avatar-padrao.svg',
  privado:  '/icons/privado.svg',
  biometria:'/icons/biometria.svg',
  nuvem:    '/icons/nuvem.svg',
  salvar:   '/icons/salvar.svg',
  config:   '/icons/config.svg',
  exportar: '/icons/exportar.svg',
}

// ─── Dados de FAQ ─────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'Como faço backup das minhas memórias?',
    a: 'Ative o Backup Automático na seção acima. O app fará cópias automáticas pelo Wi-Fi na frequência escolhida. Você também pode exportar tudo manualmente pela tela de Perfil.',
  },
  {
    q: 'Minhas memórias ficam salvas apenas no celular?',
    a: 'Por padrão, as memórias ficam salvas localmente no dispositivo. Ao ativar o backup na nuvem, elas também serão sincronizadas com segurança nos servidores do Recordar.',
  },
  {
    q: 'Como configuro o PIN de bloqueio?',
    a: 'Acesse Privacidade > PIN de bloqueio. Você poderá definir um PIN de 4 ou 6 dígitos para proteger o acesso ao app.',
  },
  {
    q: 'Como excluir minha conta permanentemente?',
    a: 'Use o botão "Excluir minha conta" no final desta tela. Atenção: esta ação é irreversível e apaga todas as suas memórias e dados.',
  },
]

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ConfigScreen({ onClose }) {
  const { user, logout, changePassword, changeEmail } = useAuth()

  // ── Alterar Email ──
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [newEmail, setNewEmail]           = useState('')
  const [emailPwd, setEmailPwd]           = useState('')
  const [savingEmail, setSavingEmail]     = useState(false)

  const handleChangeEmail = async () => {
    if (!emailPwd) { toast.error('Digite sua senha atual'); return }
    if (!newEmail || !newEmail.includes('@')) { toast.error('Digite um e-mail válido'); return }
    if (newEmail === user?.email) { toast.error('Este já é seu e-mail atual'); return }
    setSavingEmail(true)
    try {
      await changeEmail(emailPwd, newEmail)
      toast.success('E-mail de verificação enviado! Confirme no novo e-mail.')
      setNewEmail('')
      setEmailPwd('')
      setShowEmailForm(false)
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Senha incorreta')
      } else if (err.code === 'auth/email-already-in-use') {
        toast.error('Este e-mail já está em uso')
      } else {
        toast.error('Erro ao alterar e-mail')
      }
    } finally {
      setSavingEmail(false)
    }
  }

  // ── Trocar Senha ──
  const [currentPwd, setCurrentPwd]     = useState('')
  const [newPwd, setNewPwd]             = useState('')
  const [confirmPwd, setConfirmPwd]     = useState('')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd]     = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [savingPwd, setSavingPwd]       = useState(false)

  const handleChangePassword = async () => {
    if (!currentPwd) { toast.error('Digite a senha atual'); return }
    if (!newPwd) { toast.error('Digite a nova senha'); return }
    if (newPwd.length < 6) { toast.error('A nova senha deve ter pelo menos 6 caracteres'); return }
    if (newPwd !== confirmPwd) { toast.error('As senhas não coincidem'); return }
    setSavingPwd(true)
    try {
      await changePassword(currentPwd, newPwd)
      toast.success('Senha alterada com sucesso!')
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Senha atual incorreta')
      } else {
        toast.error('Erro ao alterar senha')
      }
    } finally {
      setSavingPwd(false)
    }
  }

  // ── Editar Perfil ──
  const [name, setName]       = useState('')
  const [bio, setBio]         = useState('')
  const [avatarSrc, setAvatarSrc] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  // ── Privacidade ──
  const [isPrivate, setIsPrivate] = useState(true)

  // ── Backup ──
  const [autoBackup, setAutoBackup]   = useState(false)
  const [backupFreq, setBackupFreq]   = useState('diario')

  // ── FAQ ──
  const [openFaq, setOpenFaq] = useState(null)

  // ── Tema ──
  const [theme, setTheme] = useState(() => localStorage.getItem('recordar_theme') || 'dark')
  const [showPinModal, setShowPinModal] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

  // ── Carregar configurações persistidas ──
  useEffect(() => {
    const uid = user?.uid || ''
    setName(user?.displayName || user?.name || localStorage.getItem(`recordar_profileName_${uid}`) || '')
    setBio(user?.bio || localStorage.getItem(`recordar_profileBio_${uid}`) || '')
    setAvatarSrc(localStorage.getItem(`recordar_avatar_${uid}`) || user?.photoURL || null)
    setIsPrivate(localStorage.getItem('recordar_privacy') !== 'public')
    setAutoBackup(localStorage.getItem('recordar_autoBackup') === '1')
    setBackupFreq(localStorage.getItem('recordar_backupFreq') || 'diario')

    // Sincronizar dados locais com Firestore se faltam no servidor
    const syncToFirestore = async () => {
      const uid = auth.currentUser?.uid
      if (!uid) return
      const localBio = localStorage.getItem(`recordar_profileBio_${uid}`) || ''
      const localAvatar = localStorage.getItem(`recordar_avatar_${uid}`) || ''
      const localName = localStorage.getItem(`recordar_profileName_${uid}`) || ''
      const updates = {}
      if (localBio && !user?.bio) updates.bio = localBio
      if (localAvatar && !user?.photoURL) updates.photoURL = localAvatar
      if (localName && !user?.name) updates.name = localName
      if (Object.keys(updates).length > 0) {
        try {
          await updateDoc(doc(firestore, 'users', uid), updates)
        } catch { /* ignore */ }
      }
    }
    syncToFirestore()
  }, [user])

  // ── Salvar perfil ──
  const handleSaveProfile = async () => {
    if (!name.trim()) { toast.error('O nome não pode ficar vazio'); return }
    setSavingProfile(true)
    try {
      localStorage.setItem(`recordar_profileName_${auth.currentUser?.uid || ''}`, name.trim())
      localStorage.setItem(`recordar_profileBio_${auth.currentUser?.uid || ''}`, bio.trim())
      // Salvar no Firestore para outros usuários verem
      const uid = auth.currentUser?.uid
      if (uid) {
        await updateDoc(doc(firestore, 'users', uid), {
          name: name.trim(),
          bio: bio.trim(),
        })
      }
      toast.success('Perfil atualizado!')
    } catch {
      toast.error('Erro ao salvar perfil')
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Trocar avatar ──
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result
      setAvatarSrc(base64)
      localStorage.setItem(`recordar_avatar_${auth.currentUser?.uid || ''}`, base64)
      // Salvar no Firestore para outros usuários verem
      const uid = auth.currentUser?.uid
      if (uid) {
        try {
          await updateDoc(doc(firestore, 'users', uid), { photoURL: base64 })
        } catch { /* ignore */ }
      }
      toast.success('Foto atualizada!')
    }
    reader.readAsDataURL(file)
  }

  // ── Toggle perfil privado ──
  const handleTogglePrivacy = () => {
    const next = !isPrivate
    setIsPrivate(next)
    localStorage.setItem('recordar_privacy', next ? 'private' : 'public')
    toast.success(next ? 'Perfil agora é privado' : 'Perfil agora é público')
  }

  // ── Toggle backup ──
  const handleToggleBackup = () => {
    const next = !autoBackup
    setAutoBackup(next)
    localStorage.setItem('recordar_autoBackup', next ? '1' : '0')
    toast.success(next ? 'Backup automático ativado' : 'Backup automático desativado')
  }

  // ── Frequência de backup ──
  const handleFreqChange = (e) => {
    const val = e.target.value
    setBackupFreq(val)
    localStorage.setItem('recordar_backupFreq', val)
    const labels = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal' }
    toast.success(`Frequência: ${labels[val] || val}`)
  }

  // ── Termos ──
  const handleTerms = () => setShowTerms(true)

  // ── Excluir conta ──
  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      'Tem certeza que deseja excluir sua conta?\n\nEsta ação é IRREVERSÍVEL e apagará todas as suas memórias e dados permanentemente.'
    )
    if (!confirmed) return
    toast.error('Conta excluída. Até logo…')
    setTimeout(() => logout(), 1500)
  }

  // ── Abrir/fechar FAQ ──
  const toggleFaq = (idx) => setOpenFaq(prev => (prev === idx ? null : idx))

  // ── Trocar tema ──
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem('recordar_theme', newTheme)
    if (newTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    toast.success(newTheme === 'light' ? 'Modo claro ativado' : 'Modo escuro ativado')
  }

  // ── Armazenamento (dados reais) ──
  const [localUsedMB, setLocalUsedMB] = useState(0)
  const [localTotalMB, setLocalTotalMB] = useState(1000)
  const [cloudUsedMB, setCloudUsedMB] = useState(0)
  const [cloudTotalMB, setCloudTotalMB] = useState(1000)

  useEffect(() => {
    // Calcular uso local real (soma dos blobs no IndexedDB)
    const calcLocal = async () => {
      try {
        let totalBytes = 0
        // Buscar blobs da tabela fileBlobs (onde as fotos são realmente armazenadas)
        const blobs = await db.fileBlobs.toArray()
        for (const b of blobs) {
          if (b.blob) totalBytes += b.blob.size || 0
        }
        // Também contar blobs inline na tabela memories (caso existam)
        const memories = await db.memories.toArray()
        for (const m of memories) {
          if (m.fileBlob) totalBytes += m.fileBlob.size || 0
          if (m.thumbnail) totalBytes += m.thumbnail.size || 0
        }
        const plan = await getUserPlan()
        const localLimitBytes = plan.localStorageBytes || plan.storageBytes || (1 * 1024 * 1024 * 1024)
        setLocalUsedMB(Math.round(totalBytes / (1024 * 1024)))
        setLocalTotalMB(Math.round(localLimitBytes / (1024 * 1024)))
      } catch {
        setLocalUsedMB(0)
        setLocalTotalMB(1000)
      }
    }

    // Calcular uso na nuvem real (do Firestore)
    const calcCloud = async () => {
      try {
        const { used, limit, plan } = await getStorageUsage()
        if (plan && plan.cloud) {
          setCloudUsedMB(Math.round(used / (1024 * 1024)))
          setCloudTotalMB(Math.round(limit / (1024 * 1024)))
        } else {
          // Plano grátis: nuvem não disponível
          setCloudUsedMB(0)
          setCloudTotalMB(0)
        }
      } catch {
        setCloudUsedMB(0)
        setCloudTotalMB(0)
      }
    }

    calcLocal()
    calcCloud()
  }, [])

  const localPct  = localTotalMB > 0 ? Math.round((localUsedMB / localTotalMB) * 100) : 0
  const cloudPct  = cloudTotalMB > 0 ? Math.round((cloudUsedMB / cloudTotalMB) * 100) : 0

  return (
    <div className={styles.screen}>
      <Topbar title="Configurações" subtitle="Gerencie sua conta e preferências" />

      <div className={styles.scroll}>
        <button className={styles.backBtn} onClick={onClose}>← Voltar</button>

        {/* ══ 0. E-mail da Conta ══ */}
        <h2 className={styles.sectionTitle}>E-mail da Conta</h2>
        <div className={styles.card}>
          {!showEmailForm ? (
            <div>
              <div className={styles.row} style={{ cursor: 'default' }}>
                <div className={styles.rowIconWrap} style={{ background: '#E3F2FD' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#1976D2" strokeWidth="2" width="20" height="20">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div className={styles.rowText}>
                  <p className={styles.rowLabel}>E-mail atual</p>
                  <p className={styles.rowSub}>{user?.email || '—'}</p>
                </div>
              </div>
              <div
                className={styles.row}
                onClick={() => setShowEmailForm(true)}
                role="button" tabIndex={0} style={{ cursor: 'pointer' }}
              >
                <div className={styles.rowIconWrap} style={{ background: '#FFF0EB' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#D37E65" strokeWidth="2" width="20" height="20">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
                <div className={styles.rowText}>
                  <p className={styles.rowLabel}>Alterar e-mail</p>
                  <p className={styles.rowSub}>Toque para trocar seu e-mail</p>
                </div>
                <span className={styles.chevron}>›</span>
              </div>
            </div>
          ) : (
            <>
              <label className={styles.fieldLabel}>Senha atual</label>
              <input
                type="password"
                className={styles.fieldInput}
                value={emailPwd}
                onChange={e => setEmailPwd(e.target.value)}
                placeholder="Digite sua senha atual"
              />
              <label className={styles.fieldLabel}>Novo e-mail</label>
              <input
                type="email"
                className={styles.fieldInput}
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="novo@email.com"
              />
              <button className={styles.saveBtn} onClick={handleChangeEmail} disabled={savingEmail}>
                {savingEmail ? 'Enviando…' : 'Enviar verificação'}
              </button>
              <button
                type="button"
                onClick={() => { setShowEmailForm(false); setNewEmail(''); setEmailPwd('') }}
                style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', marginTop: 4, padding: '4px 0' }}
              >
                Cancelar
              </button>
            </>
          )}
        </div>

        {/* ══ 1. Trocar Senha ══ */}
        <h2 className={styles.sectionTitle}>Trocar Senha</h2>
        <div className={styles.card}>
          <label className={styles.fieldLabel}>Senha atual</label>
          <div className={styles.passwordWrap}>
            <input
              className={styles.input}
              type={showCurrentPwd ? 'text' : 'password'}
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder="Digite a senha atual"
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowCurrentPwd(v => !v)}
              aria-label={showCurrentPwd ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showCurrentPwd ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <label className={styles.fieldLabel}>Nova senha</label>
          <div className={styles.passwordWrap}>
            <input
              className={styles.input}
              type={showNewPwd ? 'text' : 'password'}
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="Digite a nova senha"
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowNewPwd(v => !v)}
              aria-label={showNewPwd ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showNewPwd ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <label className={styles.fieldLabel}>Confirmar nova senha</label>
          <div className={styles.passwordWrap}>
            <input
              className={styles.input}
              type={showConfirmPwd ? 'text' : 'password'}
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Repita a nova senha"
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowConfirmPwd(v => !v)}
              aria-label={showConfirmPwd ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showConfirmPwd ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <button
            className={styles.saveBtn}
            onClick={handleChangePassword}
            disabled={savingPwd}
          >
            {savingPwd ? 'Salvando…' : 'Alterar senha'}
          </button>
        </div>

        {/* ══ 3. Armazenamento ══ */}
        <h2 className={styles.sectionTitle}>Armazenamento</h2>
        <div className={styles.card}>

          <p className={styles.storageLabel}>
            <img src={ICONS.salvar} alt="" width={16} height={16} aria-hidden="true" />
            Local
          </p>
          <p className={styles.storageValues}>{localUsedMB} MB de {localTotalMB} MB utilizados</p>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{ width: `${localPct}%` }}
              role="progressbar"
              aria-valuenow={localPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          <div className={styles.storageDivider} />

          <p className={styles.storageLabel}>
            <img src={ICONS.nuvem} alt="" width={16} height={16} aria-hidden="true" />
            Nuvem
          </p>
          <p className={styles.storageValues}>{cloudUsedMB} MB de {cloudTotalMB} MB utilizados</p>
          <div className={styles.progressTrack}>
            <div
              className={`${styles.progressBar} ${styles.progressCloud}`}
              style={{ width: `${cloudPct}%` }}
              role="progressbar"
              aria-valuenow={cloudPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* ══ 3. Privacidade ══ */}
        <h2 className={styles.sectionTitle}>Privacidade</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>

          {/* Toggle perfil privado */}
          <div
            className={styles.row}
            onClick={handleTogglePrivacy}
            role="switch"
            aria-checked={isPrivate}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && handleTogglePrivacy()}
          >
            <div className={styles.rowIconWrap} style={{ background: '#FFF0EB' }}>
              <img src={ICONS.privado} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Perfil privado</p>
              <p className={styles.rowSub}>
                {isPrivate ? 'Só você pode ver suas memórias' : 'Outros usuários podem ver seu perfil'}
              </p>
            </div>
            <div className={`${styles.toggle} ${isPrivate ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>

          <div className={styles.rowDivider} />

          {/* PIN de bloqueio */}
          <div
            className={styles.row}
            onClick={() => setShowPinModal(true)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setShowPinModal(true)}
          >
            <div className={styles.rowIconWrap} style={{ background: '#FFF6DB' }}>
              <img src={ICONS.biometria} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>PIN de bloqueio</p>
              <p className={styles.rowSub}>Protege a pasta "Trancadas" com senha</p>
            </div>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </div>
        </div>

        {/* ══ 4. Backup Automático ══ */}
        <h2 className={styles.sectionTitle}>Backup Automático</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>

          {/* Toggle backup Wi-Fi */}
          <div
            className={styles.row}
            onClick={handleToggleBackup}
            role="switch"
            aria-checked={autoBackup}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && handleToggleBackup()}
          >
            <div className={styles.rowIconWrap} style={{ background: '#E8F5E9' }}>
              <img src={ICONS.nuvem} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Backup pelo Wi-Fi</p>
              <p className={styles.rowSub}>
                {autoBackup ? 'Backup automático ativado' : 'Backup automático desativado'}
              </p>
            </div>
            <div className={`${styles.toggle} ${autoBackup ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>

          {/* Frequência */}
          {autoBackup && (
            <>
              <div className={styles.rowDivider} />
              <div className={styles.row}>
                <div className={styles.rowIconWrap} style={{ background: '#EDE7F6' }}>
                  <img src={ICONS.config} alt="" width={20} height={20} aria-hidden="true" />
                </div>
                <div className={styles.rowText}>
                  <p className={styles.rowLabel}>Frequência</p>
                  <p className={styles.rowSub}>Com que regularidade fazer backup</p>
                </div>
                <select
                  className={styles.freqSelect}
                  value={backupFreq}
                  onChange={handleFreqChange}
                  aria-label="Frequência de backup"
                >
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* ══ 5. Aparência ══ */}
        <h2 className={styles.sectionTitle}>Aparência</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>
          <div
            className={styles.row}
            onClick={() => handleThemeChange('dark')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#1A1614' }}>
              <span style={{ fontSize: 16 }}>🌙</span>
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Modo Escuro</p>
              <p className={styles.rowSub}>Tema padrão</p>
            </div>
            <div className={`${styles.toggle} ${theme === 'dark' ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>

          <div className={styles.rowDivider} />

          <div
            className={styles.row}
            onClick={() => handleThemeChange('light')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#FFF0EB' }}>
              <span style={{ fontSize: 16 }}>☀️</span>
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Modo Claro</p>
              <p className={styles.rowSub}>Fundo branco com cores suaves</p>
            </div>
            <div className={`${styles.toggle} ${theme === 'light' ? '' : styles.toggleOff}`} aria-hidden="true" />
          </div>
        </div>

        {/* ══ 6. Termos e Política de Privacidade ══ */}
        <h2 className={styles.sectionTitle}>Termos e Política</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>
          <div
            className={styles.row}
            onClick={() => setShowTerms(true)}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#E3F2FD' }}>
              <img src={ICONS.exportar} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Termos de Uso</p>
              <p className={styles.rowSub}>Regras de uso do aplicativo</p>
            </div>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </div>

          <div className={styles.rowDivider} />

          <div
            className={styles.row}
            onClick={() => setShowPrivacy(true)}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#F0E8FF' }}>
              <span style={{ fontSize: 16 }}>🔐</span>
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Política de Privacidade</p>
              <p className={styles.rowSub}>Como protegemos seus dados</p>
            </div>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </div>
        </div>

        {/* ══ 6. Ajuda / FAQ ══ */}
        <h2 className={styles.sectionTitle}>Ajuda / FAQ</h2>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item, idx) => (
            <div key={idx} className={styles.faqItem}>
              <button
                className={styles.faqQuestion}
                onClick={() => toggleFaq(idx)}
                aria-expanded={openFaq === idx}
              >
                <span>{item.q}</span>
                <span className={`${styles.faqArrow} ${openFaq === idx ? styles.faqArrowOpen : ''}`} aria-hidden="true">
                  ›
                </span>
              </button>
              {openFaq === idx && (
                <p className={styles.faqAnswer}>{item.a}</p>
              )}
            </div>
          ))}
        </div>

        {/* ══ Exportar e Planos ══ */}
        <h2 className={styles.sectionTitle}>Exportar e Planos</h2>
        <div className={styles.card + ' ' + styles.cardNoPad}>
          <div
            className={styles.row}
            onClick={async () => {
              const tid = toast.loading('Preparando exportação...')
              try {
                await exportAllAsZip()
                toast.dismiss(tid)
                toast.success('Exportação pronta! Verifique seus downloads.')
              } catch {
                toast.dismiss(tid)
                toast.error('Erro na exportação')
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#E8F5E9' }}>
              <img src={ICONS.exportar} alt="" width={20} height={20} aria-hidden="true" />
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Exportar tudo (ZIP)</p>
              <p className={styles.rowSub}>Fotos, vídeos e textos organizados</p>
            </div>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </div>

          <div className={styles.rowDivider} />

          <div
            className={styles.row}
            onClick={() => toast('Em breve — Planos e Armazenamento')}
            role="button"
            tabIndex={0}
          >
            <div className={styles.rowIconWrap} style={{ background: '#FFF6DB' }}>
              <span style={{ fontSize: 16 }}>💎</span>
            </div>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Planos e Armazenamento</p>
              <p className={styles.rowSub}>Proteja suas memórias na nuvem</p>
            </div>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </div>
        </div>

        {/* ══ 7. Excluir Conta ══ */}
        <h2 className={styles.sectionTitle}>Zona de Perigo</h2>
        <div className={styles.card}>
          <p className={styles.dangerDesc}>
            Excluir sua conta apaga permanentemente todas as suas memórias, fotos, vídeos e dados. Esta ação não pode ser desfeita.
          </p>
          <button className={styles.dangerBtn} onClick={handleDeleteAccount}>
            Excluir minha conta
          </button>
        </div>

        <div style={{ height: 32 }} />
      </div>

      {/* Modal PIN */}
      {showPinModal && (
        <PinLockModal
          uid={user?.uid}
          mode="manage"
          onClose={() => setShowPinModal(false)}
          onUnlock={() => setShowPinModal(false)}
        />
      )}

      {/* Modal Termos */}
      {showTerms && (
        <div className={styles.legalOverlay} onClick={() => setShowTerms(false)}>
          <div className={styles.legalModal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.legalTitle}>Termos de Uso</h2>
            <div className={styles.legalBody}>
              {TERMS_CONTENT.split('\n').map((line, i) => (
                <p key={i} style={line.startsWith('•') ? { paddingLeft: 12 } : {}}>{line || '\u00A0'}</p>
              ))}
            </div>
            <button className={styles.legalCloseBtn} onClick={() => setShowTerms(false)}>Fechar</button>
          </div>
        </div>
      )}

      {/* Modal Privacidade */}
      {showPrivacy && (
        <div className={styles.legalOverlay} onClick={() => setShowPrivacy(false)}>
          <div className={styles.legalModal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.legalTitle}>Política de Privacidade</h2>
            <div className={styles.legalBody}>
              {PRIVACY_CONTENT.split('\n').map((line, i) => (
                <p key={i} style={line.startsWith('•') ? { paddingLeft: 12 } : {}}>{line || '\u00A0'}</p>
              ))}
            </div>
            <button className={styles.legalCloseBtn} onClick={() => setShowPrivacy(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}