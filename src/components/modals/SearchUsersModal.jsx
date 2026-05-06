/**
 * SearchUsersModal — Buscar pessoas pelo nome e compartilhar
 */
import React, { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { searchUsers } from '../../services/usersService.js'
import styles from './SearchUsersModal.module.css'

export default function SearchUsersModal({ onClose, onSelectUser }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = useCallback(async (text) => {
    setQuery(text)
    if (text.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const users = await searchUsers(text)
      setResults(users)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [])

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.sheet}>
        <div className={styles.handle} />
        <h2 className={styles.title}>Buscar Pessoas</h2>
        
        <div className={styles.searchBox}>
          <input
            className={styles.searchInput}
            placeholder="Digite o nome da pessoa..."
            value={query}
            onChange={e => handleSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.results}>
          {loading && <p className={styles.loadingText}>Buscando...</p>}
          
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className={styles.emptyText}>Nenhuma pessoa encontrada</p>
          )}

          {results.map(user => (
            <button
              key={user.uid}
              className={styles.userRow}
              onClick={() => {
                onSelectUser?.(user)
                toast.success(`${user.name} selecionado!`)
                onClose()
              }}
            >
              <div className={styles.userAvatar}>
                {user.photoURL
                  ? <img src={user.photoURL} alt="" className={styles.userAvatarImg} />
                  : <span>{user.name?.charAt(0)?.toUpperCase()}</span>
                }
              </div>
              <div className={styles.userInfo}>
                <p className={styles.userName}>{user.name}</p>
                <p className={styles.userUsername}>@{user.username}</p>
              </div>
            </button>
          ))}
        </div>

        <button className={styles.cancelBtn} onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}
