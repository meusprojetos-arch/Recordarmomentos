/**
 * LoadingScreen — Splash screen estilo Instagram/Facebook
 * Fundo escuro + logo centralizada, tempo mínimo garantido
 */

import React, { useState, useEffect } from 'react'
import styles from './LoadingScreen.module.css'

export default function LoadingScreen({ onDone, duration = 1500 }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true)
      setTimeout(() => onDone?.(), 400)
    }, duration)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className={`${styles.container} ${fading ? styles.fadeOut : ''}`} aria-label="Carregando">
      <div className={styles.logo} />
    </div>
  )
}
