/** Deliberately fixed: browser tests cannot target a cloud project or a dev server. */
export const TEST_ENV = {
  projectId: 'demo-clash-of-jams-ui',
  authHost: '127.0.0.1:9199',
  firestoreHost: '127.0.0.1:8180',
  baseURL: 'http://127.0.0.1:5190',
  apiURL: 'http://127.0.0.1:8190',
} as const

export const browserFirebaseEnv = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: TEST_ENV.projectId + '.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: TEST_ENV.projectId,
  VITE_FIREBASE_APP_ID: 'demo-ui-tests',
  VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://' + TEST_ENV.authHost,
  VITE_FIRESTORE_EMULATOR_HOST: TEST_ENV.firestoreHost,
  VITE_API_BASE_URL: TEST_ENV.apiURL,
} as const
