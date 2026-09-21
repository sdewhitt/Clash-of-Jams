/**
 * Browser-side Firebase singletons.
 *
 * The init script builds its own config from process.env (see
 * scripts/firebase-config.ts) because import.meta.env does not exist in Node.
 * Both read the same VITE_FIREBASE_* names.
 */
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const REQUIRED_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const

const missing = Object.entries(REQUIRED_KEYS)
  .filter(([key]) => !firebaseConfig[key as keyof typeof REQUIRED_KEYS])
  .map(([, envName]) => envName)

if (missing.length > 0) {
  throw new Error(
    `Missing Firebase config: ${missing.join(', ')}. ` +
      'Copy .env.example to .env.local and fill it in.',
  )
}

// getApps() guards against a second init under Vite's hot module replacement.
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
