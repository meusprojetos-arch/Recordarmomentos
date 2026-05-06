/**
 * PrivacyRow — Linha de configuração de privacidade
 * iconUrl: caminho da imagem PNG/SVG (22x22px recomendado)
 */

import React from 'react'
import styles from './PrivacyRow.module.css'

export default function PrivacyRow({ iconUrl, iconBg, label, sub, type, value, onChange, onClick }) {
  return (
    <div
      className={styles.row}
      onClick={type === 'toggle' ? onChange : onClick}
      role={type === 'toggle' ? 'switch' : 'button'}
      aria-checked={type === 'toggle' ? value : undefined}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && (type === 'toggle' ? onChange?.() : onClick?.())}
    >
      <div className={styles.iconWrap} style={{ background: iconBg }}>
        <img src={iconUrl} alt="" aria-hidden="true" width={22} height={22} />
      </div>
      <div className={styles.text}>
        <p className={styles.label}>{label}</p>
        <p className={styles.sub}>{sub}</p>
      </div>
      {type === 'toggle' && (
        <div className={`${styles.toggle} ${value ? '' : styles.off}`} aria-hidden="true" />
      )}
      {type === 'chevron' && (
        <span className={styles.chevron} aria-hidden="true">›</span>
      )}
    </div>
  )
}
