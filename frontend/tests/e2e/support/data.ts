import { randomUUID } from 'node:crypto'

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type WithFieldValue,
} from 'firebase/firestore'

import {
  newSkillRating,
  newUserProfile,
  newUserSettings,
  newUsernameReservation,
  skillRatingsPath,
} from '../../../src/lib/schema/collections.js'
import { INSTRUMENTS } from '../../../src/lib/schema/types.js'
import { TEST_ENV } from './environment.js'

export interface TestPlayer {
  uid: string
  email: string
  password: string
  displayName: string
}

type SeedDocument = readonly [string, WithFieldValue<DocumentData>]

async function authRequest(operation: string, body: Record<string, unknown>) {
  const response = await fetch(
    'http://' +
      TEST_ENV.authHost +
      '/identitytoolkit.googleapis.com/v1/accounts:' +
      operation +
      '?key=demo-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) throw new Error('Local Auth fixture failed: ' + response.status)
  return (await response.json()) as Record<string, unknown>
}

/** Per-test ownership and cleanup. Never clears the entire emulator database. */
export class TestData {
  readonly namespace = 'e2e-' + randomUUID().replaceAll('-', '')
  private paths = new Set<string>()
  private accounts: string[] = []

  private readonly database: RulesTestEnvironment

  constructor(database: RulesTestEnvironment) {
    this.database = database
  }

  id(label: string) {
    return this.namespace + '-' + label + '-' + randomUUID().slice(0, 8)
  }

  track(paths: string[]) {
    paths.forEach((path) => this.paths.add(path))
  }

  async seed(documents: readonly SeedDocument[]) {
    this.track(documents.map(([path]) => path))
    await this.database.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as Firestore
      const batch = writeBatch(db)
      for (const [path, value] of documents) batch.set(doc(db, path), value)
      await batch.commit()
    })
  }

  async read(path: string): Promise<DocumentData | undefined> {
    let value: DocumentData | undefined
    await this.database.withSecurityRulesDisabled(async (context) => {
      value = (await getDoc(doc(context.firestore() as unknown as Firestore, path))).data()
    })
    return value
  }

  async update(path: string, value: DocumentData) {
    await this.database.withSecurityRulesDisabled(async (context) =>
      updateDoc(doc(context.firestore() as unknown as Firestore, path), value),
    )
  }

  async remove(path: string) {
    await this.database.withSecurityRulesDisabled(async (context) =>
      deleteDoc(doc(context.firestore() as unknown as Firestore, path)),
    )
  }

  async createPlayer(displayName: string): Promise<TestPlayer> {
    const suffix = randomUUID().replaceAll('-', '')
    const email = this.namespace + '-' + suffix.slice(0, 8) + '@example.test'
    const password = 'UiFixture123!'
    const account = await authRequest('signUp', { email, password, returnSecureToken: true })
    if (typeof account.idToken !== 'string' || typeof account.localId !== 'string') {
      throw new Error('Local Auth fixture returned an invalid account')
    }
    this.accounts.push(account.idToken)
    const uid: string = account.localId
    const username = 'e2e_' + suffix.slice(0, 12)
    await this.seed([
      ['users/' + uid, newUserProfile({ uid, username, displayName })],
      ['usernames/' + username, newUsernameReservation({ uid, username })],
      ['userSettings/' + uid, newUserSettings({ uid })],
      ...INSTRUMENTS.map(
        (instrument) =>
          [skillRatingsPath(uid) + '/' + instrument, newSkillRating({ uid, instrument })] as const,
      ),
    ])
    return { uid, email, password, displayName }
  }

  async cleanup() {
    try {
      await this.database.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore() as unknown as Firestore
        // Child documents first; only documents owned/tracked by this test.
        const paths = [...this.paths]
          .reverse()
          .sort((a, b) => b.split('/').length - a.split('/').length)
        for (const path of paths) await deleteDoc(doc(db, path))
      })
    } finally {
      for (const idToken of this.accounts) await authRequest('delete', { idToken })
    }
  }
}
