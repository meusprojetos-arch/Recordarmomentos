/**
 * Navbar — Barra de navegação inferior
 * 
 * 4 botões: Hoje | Memórias | [FAB central] | Perfil | Config
 * FAB gigante para "Adicionar Memória" (padrão de acessibilidade para idosos)
 */

import React from 'react'
import styles from './Navbar.module.css'

// ÍCONES — substitua cada URL pela sua imagem personalizada
// Tamanho recomendado: 24x24px (PNG ou SVG transparente)
const NAV_ICONS = {
  hoje:   '/icons/nav-hoje.svg',
  feed:   '/icons/nav-config.svg',   // Reusa icone por enquanto
  tempo:  '/icons/nav-tempo.svg',
  perfil: '/icons/nav-perfil.svg',
}

const TABS = [
  { id: 'hoje',   label: 'Hoje'     },
  { id: 'feed',   label: 'Feed'     },
  // FAB ocupa posicao central
  { id: 'tempo',  label: 'Memorias' },
  { id: 'perfil', label: 'Perfil'   },
]

export default function Navbar({ active, onChange, onAdd }) {
  return (
    <nav className={styles.navbar} role="navigation" aria-label="Navegação principal">
      {/* Dois botões esquerda */}
      {TABS.slice(0, 2).map(tab => (
        <button
          key={tab.id}
          className={`${styles.navBtn} ${active === tab.id ? styles.active : ''}`}
          onClick={() => onChange(tab.id)}
          aria-label={tab.label}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <img src={NAV_ICONS[tab.id]} alt="" aria-hidden="true" className={styles.navIcon} width={24} height={24} />
          <span className={styles.navLabel}>{tab.label}</span>
          <span className={styles.navDot} aria-hidden="true" />
        </button>
      ))}

      {/* FAB central — o botão mais importante */}
      <div className={styles.fabWrap}>
        <button
          className={styles.fab}
          onClick={onAdd}
          aria-label="Adicionar nova memória"
          title="Adicionar Memória"
        >
          <img src="/icons/fab-mais.svg" alt="" aria-hidden="true" width={28} height={28} />
        </button>
      </div>

      {/* Dois botões direita */}
      {TABS.slice(2).map(tab => (
        <button
          key={tab.id}
          className={`${styles.navBtn} ${active === tab.id ? styles.active : ''}`}
          onClick={() => onChange(tab.id)}
          aria-label={tab.label}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <img src={NAV_ICONS[tab.id]} alt="" aria-hidden="true" className={styles.navIcon} width={24} height={24} />
          <span className={styles.navLabel}>{tab.label}</span>
          <span className={styles.navDot} aria-hidden="true" />
        </button>
      ))}
    </nav>
  )
}
