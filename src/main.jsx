import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './styles/globals.css'
import { db } from './db/database.js'

window.onerror = function(msg, src, line, col, err) {
  document.body.innerHTML = '<div style="padding:40px;color:red;font-size:14px;"><b>Erro:</b> ' + msg + '<br>Line: ' + line + '</div>';
};

// Handler para evitar bloqueio de versão entre abas
db.on('versionchange', () => { db.close(); window.location.reload() })
db.on('blocked', () => { console.warn('IndexedDB upgrade bloqueado') })

// Força abertura e migração do banco
db.open().catch(e => console.error('Erro ao abrir IndexedDB:', e))

// Aplica tema salvo
try {
  const savedTheme = localStorage.getItem('recordar_theme') || 'dark'
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  }
} catch (e) { /* localStorage pode falhar em modo privado */ }

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