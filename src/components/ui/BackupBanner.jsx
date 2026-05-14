/**
 * BackupBanner — Avisos e incentivos de backup
 * Exibido para usuarios gratuitos em varias partes do app
 */
import React, { useState, useEffect } from 'react'
import { isPremium } from '../../services/planService.js'
import styles from './BackupBanner.module.css'

const MESSAGES = [
  { icon: '⚠️', text: 'Suas memorias estao apenas neste dispositivo.' },
  { icon: '☁️', text: 'Faca backup para nao perder tudo.' },
  { icon: '🔒', text: 'Guarde suas memorias com seguranca na nuvem.' },
  { icon: '💎', text: 'Proteja sua historia para sempre.' },
  { icon: '📱', text: 'Trocando de celular? Ative o backup.' },
]

export default function BackupBanner({ onUpgrade, variant = 'default' }) {
  const [show, setShow] = useState(false)
  const [message, setMessage] = useState(MESSAGES[0])

  useEffect(() => {
    checkShow()
  }, [])

  const checkShow = async () => {
    const premium = await isPremium()
    if (premium) return

    // Mostrar apenas 1 vez por dia
    const today = new Date().toISOString().substring(0, 10)
    const lastShown = localStorage.getItem('recordar_backup_banner_date')
    if (lastShown === today) return

    localStorage.setItem('recordar_backup_banner_date', today)
    setShow(true)
    setMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)])
  }

  if (!show) return null

  if (variant === 'minimal') {
    return (
      <div className={styles.minimal} onClick={onUpgrade}>
        <span>{message.icon}</span>
        <span className={styles.minimalText}>{message.text}</span>
        <span className={styles.minimalArrow}>›</span>
      </div>
    )
  }

  return (
    <div className={styles.banner}>
      <div className={styles.bannerContent}>
        <span className={styles.bannerIcon}>{message.icon}</span>
        <div className={styles.bannerText}>
          <p className={styles.bannerTitle}>{message.text}</p>
          <p className={styles.bannerSub}>Assine um plano e proteja suas memorias na nuvem</p>
        </div>
      </div>
      <button className={styles.bannerBtn} onClick={onUpgrade}>
        Ver planos
      </button>
      <button className={styles.dismissBtn} onClick={() => setShow(false)}>
        Depois
      </button>
    </div>
  )
}