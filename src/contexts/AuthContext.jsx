/**
 * AuthContext — Gerencia estado de autenticacao do usuario
 */
import React, { createContext, useContext, useState, useEffect } from 'react'
import { auth, firestore } from '../firebase.js'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { initDefaultFolders } from '../db/database.js'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Safety timeout: se onAuthStateChanged nao disparar em 5s, desbloqueia
    const timeout = setTimeout(() => {
      setLoading(false)
    }, 5000)

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout)
      if (firebaseUser) {
        // Seta user imediatamente com dados do Auth
        const basicUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        }
        setUser(basicUser)
        setLoading(false)
        // Busca dados extras do Firestore em background (não bloqueia)
        getDoc(doc(firestore, 'users', firebaseUser.uid)).then(profileDoc => {
          if (profileDoc?.exists()) {
            setUser(prev => ({ ...prev, ...profileDoc.data() }))
          }
        }).catch(() => {})
        // Inicializa pastas padrão isoladas por uid
        initDefaultFolders(firebaseUser.uid).catch(() => {})
      } else {
        setUser(null)
        setLoading(false)
      }
    })
    return () => { clearTimeout(timeout); unsub() }
  }, [])

  const signup = async (email, password, name, username, birthDate) => {
    // Timeout de 15s para não ficar travado
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    )
    const authPromise = createUserWithEmailAndPassword(auth, email, password)
    const cred = await Promise.race([authPromise, timeoutPromise])
    updateProfile(cred.user, { displayName: name }).catch(() => {})
    // Cria documento do usuario no Firestore
    const userData = {
      name,
      email,
      username: username || email.split('@')[0].toLowerCase(),
      birthDate: birthDate || '',
      bio: '',
      photoURL: '',
      privacyLevel: 'private',
      createdAt: new Date().toISOString()
    }
    // Salva no Firestore sem bloquear (não trava se offline)
    setDoc(doc(firestore, 'users', cred.user.uid), userData).catch(() => {})
    // Atualiza o estado imediatamente sem esperar Firestore
    setUser({
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: name,
      photoURL: '',
      ...userData
    })
    return cred.user
  }

  const login = async (email, password) => {
    // Timeout de 15s para não ficar travado
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    )
    const authPromise = signInWithEmailAndPassword(auth, email, password)
    const cred = await Promise.race([authPromise, timeoutPromise])
    // Seta user imediatamente com dados básicos sem esperar Firestore
    setUser({
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName,
      photoURL: cred.user.photoURL,
    })
    // Busca dados extras do Firestore em background
    getDoc(doc(firestore, 'users', cred.user.uid)).then(profileDoc => {
      if (profileDoc?.exists()) {
        setUser(prev => ({ ...prev, ...profileDoc.data() }))
      }
    }).catch(() => {})
    return cred.user
  }

  const logout = () => signOut(auth)

  const changePassword = async (currentPassword, newPassword) => {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword)
    await reauthenticateWithCredential(auth.currentUser, credential)
    await updatePassword(auth.currentUser, newPassword)
  }

  const value = { user, loading, signup, login, logout, changePassword }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
