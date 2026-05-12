import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './styles/globals.css'

// Ignora erros cross-origin e promise rejections sem travar o app
window.onerror = function(msg, src, line) {
  if (msg === 'Script error.' || line === 0) return true
  return false
}
window.onunhandledrejection = function() {}

// IndexedDB: abre de forma lazy (não bloqueia render)
import { db } from './db/database.js'
try {
  db.on('versionchange', () => { db.close(); window.location.reload() })
  db.open().catch(() => {})
} catch(e) {}

// Tema
try {
  const t = localStorage.getItem('recordar_theme')
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light')
} catch(e) {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-center"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#5C574D',
          color: '#FAF7F2',
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 600,
          fontSize: '14px',
          borderRadius: '30px',
          padding: '12px 22px',
          marginBottom: '80px',
        },
        success: { iconTheme: { primary: '#4F7C52', secondary: '#FAF7F2' } },
        error:   { iconTheme: { primary: '#C15B5B', secondary: '#FAF7F2' } },
      }}
    />
  </React.StrictMode>
)