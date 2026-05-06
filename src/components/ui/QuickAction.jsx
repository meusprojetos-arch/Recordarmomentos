/**
 * QuickAction — Botão de ação rápida na tela Hoje
 * Botões grandes, ideais para idosos
 * iconUrl: caminho para imagem PNG/SVG (32x32px recomendado)
 */

import React from 'react'
import styles from './QuickAction.module.css'

const COLOR_MAP = {
  green: styles.green,
  gold:  styles.gold,
  blue:  styles.blue,
  rose:  styles.rose,
}

export default function QuickAction({ iconUrl, label, sub, color, onClick }) {
  return (
    <button className={styles.btn} onClick={onClick} aria-label={label}>
      <div className={`${styles.iconWrap} ${COLOR_MAP[color] || ''}`}>
        <img src={iconUrl} alt="" aria-hidden="true" width={32} height={32} />
      </div>
      <div className={styles.textWrap}>
        <span className={styles.label}>{label}</span>
        <span className={styles.sub}>{sub}</span>
      </div>
    </button>
  )
}
