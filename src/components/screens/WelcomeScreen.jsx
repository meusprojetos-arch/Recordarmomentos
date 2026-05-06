/**
 * WelcomeScreen — Tela de apresentacao do app (antes do login)
 */
import React from 'react'
import styles from './WelcomeScreen.module.css'

export default function WelcomeScreen({ onGoLogin, onGoSignup }) {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.logoArea}>
          <span className={styles.icon}>✨</span>
          <h1 className={styles.title}>Recordar</h1>
          <p className={styles.subtitle}>Seus melhores momentos, sempre com voce.</p>
        </div>

        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📸</span>
            <p>Guarde fotos, videos e audios de forma segura</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>👨‍👩‍👧‍👦</span>
            <p>Compartilhe momentos com sua familia</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🔒</span>
            <p>Privacidade total — so voce decide quem ve</p>
          </div>
        </div>

        <div className={styles.buttons}>
          <button className={styles.btnPrimary} onClick={onGoSignup}>
            Criar minha conta
          </button>
          <button className={styles.btnSecondary} onClick={onGoLogin}>
            Ja tenho conta
          </button>
        </div>
      </div>
    </div>
  )
}
