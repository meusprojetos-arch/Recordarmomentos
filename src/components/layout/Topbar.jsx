/**
 * Topbar — Barra superior reutilizável
 * rightIconUrl: caminho para imagem PNG/SVG (24x24px)
 */

import React from 'react'
import styles from './Topbar.module.css'

export default function Topbar({ title, subtitle, leftIconUrl, leftIconSize = 32, rightIconUrl, rightIconSize = 24, onRight }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.row}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>
            {leftIconUrl && (
              <img src={leftIconUrl} alt="" aria-hidden="true" width={leftIconSize} height={leftIconSize} style={{ borderRadius: 10, marginRight: 10, verticalAlign: 'middle', objectFit: 'cover' }} />
            )}
            {title}
          </h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {rightIconUrl && (
          <button
            className={styles.iconBtn}
            onClick={onRight}
            aria-label="Ação"
          >
            <img src={rightIconUrl} alt="" aria-hidden="true" width={rightIconSize} height={rightIconSize} />
          </button>
        )}
      </div>
    </header>
  )
}