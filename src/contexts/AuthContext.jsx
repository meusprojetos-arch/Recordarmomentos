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
  updateProfile
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Busca dados extras do Firestore
        const profileDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid)).catch(() => null)
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          ...profileDoc?.data()
        })
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const signup = async (email, password, name, username, birthDate) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    // Cria documento do usuario no Firestore
    await setDoc(doc(firestore, 'users', cred.user.uid), {
      name,
      email,
      username: username || email.split('@')[0].toLowerCase(),
      birthDate: birthDate || '',
      bio: '',
      photoURL: '',
      privacyLevel: 'private',
      createdAt: new Date().toISOString()
    })
    return cred.user
  }

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return cred.user
  }

  const logout = () => signOut(auth)

  const value = { user, loading, signup, login, logout }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
