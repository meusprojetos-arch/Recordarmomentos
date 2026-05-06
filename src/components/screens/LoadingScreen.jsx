/**
 * LoadingScreen — Tela de abertura do Recordar
 * Design: fundo verde com logo e tagline
 */

import React from 'react'
import styles from './LoadingScreen.module.css'

export default function LoadingScreen() {
  return (
    <div className={styles.container} role="status" aria-label="Carregando o Recordar">
      <div className={styles.inner}>
        <div className={styles.leaf}>✨</div>
        <h1 className={styles.logo}>Recordar</h1>
        <p className={styles.tagline}>Seus melhores momentos</p>
        <div className={styles.spinner} aria-hidden="true" />
      </div>
    </div>
  )
}
