/**
 * Builds the Firebase web config for Node scripts.
 *
 * Node has no import.meta.env, so we read the same values out of process.env
 * after loading whichever dotenv file the repo happens to have. Both the
 * VITE_FIREBASE_* names (what the browser app uses) and bare FIREBASE_* names
 * are accepted.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Checked in order; earlier files win, and real env vars win over all of them. */
const ENV_FILES = ['.env.local', '.env', '.local.env']

/** Minimal dotenv reader — enough for KEY=value files, no interpolation. */
function parseEnvFile(contents: string) {
  const parsed: Record<string, string> = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

/** Loads the dotenv files into process.env without clobbering existing vars. */
export function loadEnvFiles() {
  const loaded: string[] = []
  for (const name of ENV_FILES) {
    const path = resolve(frontendRoot, name)
    if (!existsSync(path)) continue
    loaded.push(name)
    for (const [key, value] of Object.entries(parseEnvFile(readFileSync(path, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
  return loaded
}

const read = (suffix: string) =>
  process.env[`VITE_FIREBASE_${suffix}`] ?? process.env[`FIREBASE_${suffix}`]

export function readFirebaseConfig() {
  const config = {
    apiKey: read('API_KEY'),
    authDomain: read('AUTH_DOMAIN'),
    projectId: read('PROJECT_ID'),
    storageBucket: read('STORAGE_BUCKET'),
    messagingSenderId: read('MESSAGING_SENDER_ID'),
    appId: read('APP_ID'),
    measurementId: read('MEASUREMENT_ID'),
  }

  const missing = (['apiKey', 'projectId', 'appId'] as const).filter((key) => !config[key])
  if (missing.length > 0) {
    const names = missing.map((key) => `VITE_FIREBASE_${camelToEnv(key)}`).join(', ')
    throw new Error(
      `Missing Firebase config: ${names}.\n` +
        `Looked in process.env and ${ENV_FILES.join(', ')} under ${frontendRoot}.`,
    )
  }

  return config as { [K in keyof typeof config]: string }
}

function camelToEnv(key: string) {
  return key.replace(/([A-Z])/g, '_$1').toUpperCase()
}
