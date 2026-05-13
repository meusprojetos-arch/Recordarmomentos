/**
 * RECORDAR — Firebase Config
 */
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyC4ZEzj4SbtJkt-q-5MrFxsW-EeB1nSd3g",
  authDomain: "recordar-686a9.firebaseapp.com",
  projectId: "recordar-686a9",
  storageBucket: "recordar-686a9.firebasestorage.app",
  messagingSenderId: "751399633285",
  appId: "1:751399633285:web:249afd1b7c8bb00bf2c4ec",
  measurementId: "G-FEWH9R97KM"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const firestore = getFirestore(app)
export const storage = getStorage(app)

export default app
