import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './styles/globals.css'
import { initDefaultFolders } from './db/database.js'

// Inicializa pastas padrão na primeira execução
initDefaultFolders().catch(console.error)

// Aplica tema salvo
const savedTheme = localStorage.getItem('recordar_theme') || 'dark'
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light')
}

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
