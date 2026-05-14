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
  const [activeTab, setActiveTab]         = useState('hoje')
  const [showAddModal, setShowAddModal]   = useState(false) // false ou string do tipo ('photo','text','audio','location')
  const [showPlans, setShowPlans]         = useState(false)
  const [showConfig, setShowConfig]       = useState(false)
  const [showRestore, setShowRestore]     = useState(false)
  const [restoreCount, setRestoreCount]   = useState(0)
  const [refreshKey, setRefreshKey]       = useState(0)

  const triggerRefresh = () => setRefreshKey(k => k + 1)

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

  // Só mostra loading se não tiver usuário cacheado (primeira vez ou logout)
  if (loading && !user) return <LoadingScreen />

  if (!user) {
    if (authScreen === 'login') {
      return <LoginScreen onGoSignup={() => setAuthScreen('signup')} onGoWelcome={() => setAuthScreen('welcome')} />
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
    return <ConfigScreen onClose={() => setShowConfig(false)} />
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className={styles.appShell}>
        <main className={styles.main}>
          {activeTab === 'hoje'   && <HojeScreen  key={refreshKey} />}
          {activeTab === 'feed'   && <FeedScreen  key={refreshKey} />}
          {activeTab === 'tempo'  && <TempoScreen key={refreshKey} />}
          {activeTab === 'perfil' && <PerfilScreen />}
        </main>

        <Navbar
          active={activeTab}
          onChange={setActiveTab}
          onAdd={() => setShowAddModal(true)}
        />

        {showAddModal && (
          <AddMemoryModal
            initialType={typeof showAddModal === 'string' ? showAddModal : null}
            onClose={() => setShowAddModal(false)}
            onSaved={() => { setShowAddModal(false); triggerRefresh() }}
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