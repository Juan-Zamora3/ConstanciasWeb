// src/servicios/firebaseConfig.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"
import { getStorage, type FirebaseStorage } from "firebase/storage"

// Config de tu proyecto
const firebaseConfig = {
  apiKey: "AIzaSyA9wYfjjjjp6w8<QhslmOu72idKolgsXXCo",
  authDomain: "proyectointeg-e37de.firebaseapp.com",
  projectId: "proyectointeg-e37de",
  storageBucket: "proyectointeg-e37de.appspot.com",
  messagingSenderId: "1073149596999",
  appId: "1:1073149596999:web:1c3753054380b74332a862",
  measurementId: "G-8QZ7R79ZLR",
} as const

// Evita re-inicializar en hot-reload
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

// Servicios
export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)
export const storage: FirebaseStorage = getStorage(app)

// Export default por si lo necesitas
export default app
