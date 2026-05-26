/**
 * App.jsx — Shell principal do Recordar
 */

import React, { useState, useEffect, createContext, useContext } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import LoadingScreen   from './components/screens/LoadingScreen.jsx'
import WelcomeScreen   from './components/screens/WelcomeScreen.jsx'
import LoginScreen     from './components/screens/LoginScreen.jsx'
import SignupScreen    from './components/screens/SignupScreen.jsx'
import HojeScreen      from './components/screens/HojeScreen.jsx'
import FeedScreen      from './components/screens/FeedScreen.jsx'
import TempoScreen     from './components/screens/TempoScreen.jsx'
import PerfilScreen    from './components/screens/PerfilScreen.jsx'
import ConfigScreen    from './components/screens/ConfigScreen.jsx'
import PlansScreen     from './components/screens/PlansScreen.jsx'
import Navbar          from './components/layout/Navbar.jsx'
import AddMemoryModal  from './components/modals/AddMemoryModal.jsx'
import RestoreModal    from './components/modals/RestoreModal.jsx'
import { checkCloudData } from './services/backupService.js'
import styles from './App.module.css'

// ─── Context global ──────────────────────────────────────────────────
export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

function AppContent() {
  const { user, loading } = useAuth()
  const [authScreen, setAuthScreen] = useState('welcome')
  const [showSplash, setShowSplash]       = useState(true)
  const [tabSplash, setTabSplash]         = useState(false)
  const [authSplash, setAuthSplash]       = useState(false)
  const [activeTab, setActiveTab]         = useState('hoje')
  // Controla quais abas já foram visitadas (lazy-mount: monta só na 1ª visita)
  const [mountedTabs, setMountedTabs]     = useState({ hoje: true, feed: false, tempo: false, perfil: false })
  const pendingMemories = React.useRef([]) // memórias salvas aguardando tela
  const [showAddModal, setShowAddModal]   = useState(false) // false ou string do tipo ('photo','text','audio','location')
  const [showPlans, setShowPlans]         = useState(false)
  const [showConfig, setShowConfig]       = useState(false)
  const [showRestore, setShowRestore]     = useState(false)
  const [restoreCount, setRestoreCount]   = useState(0)
  const [refreshKey, setRefreshKey]       = useState(0)

  const triggerRefresh = () => setRefreshKey(k => k + 1)

  // Marca a aba como "já visitada" para mantê-la montada
  // Mostra splash breve ao entrar no Feed ou Memórias
  const handleTabChange = (tab) => {
    if (tab === activeTab) return
    const needsSplash = !mountedTabs[tab] && (tab === 'feed' || tab === 'tempo')
    if (needsSplash) setTabSplash(true)
    setActiveTab(tab)
    setMountedTabs(prev => prev[tab] ? prev : { ...prev, [tab]: true })
  }

  // Verifica se tem dados na nuvem ao logar (troca de dispositivo)
  useEffect(() => {
    if (user) {
      checkCloudData().then(({ hasData, count }) => {
        if (hasData && count > 0) {
          // Verifica se ja restaurou neste dispositivo
          const restored = localStorage.getItem('recordar_restored_' + user.uid)
          if (!restored) {
            setRestoreCount(count)
            setShowRestore(true)
          }
        }
      }).catch(() => {})
    }
  }, [user])

  const ctx = {
    activeTab,
    setActiveTab,
    showAddModal,
    setShowAddModal,
    showPlans,
    setShowPlans,
    showConfig,
    setShowConfig,
    refreshKey,
    triggerRefresh,
  }


  // Splash inicial cobre TUDO durante 1.5s — independente do Firebase
  if (showSplash) return <LoadingScreen onDone={() => setShowSplash(false)} />

  // Splash após login bem-sucedido (cobre a transição para o app)
  if (authSplash) return <LoadingScreen duration={800} onDone={() => setAuthSplash(false)} />

  // Após o splash: se Firebase ainda estiver carregando, fundo escuro
  if (loading) return <div style={{ width:'100%', height:'100dvh', background:'#0e0e0e' }} />

  if (!user) {
    if (authScreen === 'login') {
      return <LoginScreen
        onGoSignup={() => setAuthScreen('signup')}
        onGoWelcome={() => setAuthScreen('welcome')}
        onSuccess={() => setAuthSplash(true)}
      />
    }
    if (authScreen === 'signup') {
      return <SignupScreen onGoLogin={() => setAuthScreen('login')} onGoWelcome={() => setAuthScreen('welcome')} />
    }
    return <WelcomeScreen onGoLogin={() => setAuthScreen('login')} onGoSignup={() => setAuthScreen('signup')} />
  }

  // Tela de planos
  if (showPlans) {
    return <PlansScreen onClose={() => setShowPlans(false)} />
  }

  // Tela de configurações
  if (showConfig) {
    return <ConfigScreen onClose={() => setShowConfig(false)} onShowPlans={() => { setShowConfig(false); setShowPlans(true) }} />
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className={styles.appShell}>
        {/* Splash ao trocar para Feed/Memórias pela primeira vez */}
        {tabSplash && (
          <LoadingScreen duration={800} onDone={() => setTabSplash(false)} />
        )}
        <main className={styles.main}>
          {/* Cada tela monta na 1ª visita e fica oculta (não desmontada) nas demais */}
          <div className={styles.tabPane} hidden={activeTab !== 'hoje'}>
            {mountedTabs.hoje && <HojeScreen key={refreshKey} />}
          </div>
          <div className={styles.tabPane} hidden={activeTab !== 'feed'}>
            {mountedTabs.feed && <FeedScreen />}
          </div>
          <div className={styles.tabPane} hidden={activeTab !== 'tempo'}>
            {mountedTabs.tempo && <TempoScreen key={refreshKey} pendingMemories={pendingMemories} />}
          </div>
          <div className={styles.tabPane} hidden={activeTab !== 'perfil'}>
            {mountedTabs.perfil && <PerfilScreen />}
          </div>
        </main>

        <Navbar
          active={activeTab}
          onChange={handleTabChange}
          onAdd={() => setShowAddModal(true)}
        />

        {showAddModal && (
          <AddMemoryModal
            initialType={typeof showAddModal === 'string' ? showAddModal : null}
            onClose={() => setShowAddModal(false)}
            onSaved={(newMemory) => {
              setShowAddModal(false)
              if (newMemory) {
                // Disparar evento — se a tela estiver montada recebe na hora
                window.dispatchEvent(new CustomEvent('memory-added', { detail: newMemory }))
                // Guardar também na fila para quando a tela montar
                pendingMemories.current.push(newMemory)
              }
            }}
          />
        )}

        {showRestore && (
          <RestoreModal
            count={restoreCount}
            onClose={() => {
              setShowRestore(false)
              localStorage.setItem('recordar_restored_' + user.uid, 'true')
            }}
            onRestored={() => {
              localStorage.setItem('recordar_restored_' + user.uid, 'true')
              triggerRefresh()
            }}
          />
        )}
      </div>
    </AppContext.Provider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}