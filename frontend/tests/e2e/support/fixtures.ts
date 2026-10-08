import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { test as base, expect } from '@playwright/test'

import { TestData, type TestPlayer } from './data.js'
import { TEST_ENV } from './environment.js'

type Fixtures = {
  data: TestData
  player: TestPlayer
  opponent: TestPlayer
  browserErrors: void
}

export const test = base.extend<Fixtures, { database: RulesTestEnvironment }>({
  // Context teardown precedes fixture deletion, so active listeners never observe cleanup.
  context: async ({ context, data: _data }, provide) => {
    try {
      await provide(context)
    } finally {
      await context.close()
    }
  },
  database: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
    async ({}, provide) => {
      const database = await initializeTestEnvironment({
        projectId: TEST_ENV.projectId,
        firestore: { host: '127.0.0.1', port: 8180 },
      })
      try {
        await provide(database)
      } finally {
        await database.cleanup()
      }
    },
    { scope: 'worker' },
  ],
  data: async ({ database }, provide) => {
    const data = new TestData(database)
    try {
      await provide(data)
    } finally {
      await data.cleanup()
    }
  },
  player: async ({ data }, provide) => {
    await provide(await data.createPlayer('Player One'))
  },
  opponent: async ({ data }, provide) => {
    await provide(await data.createPlayer('Player Two'))
  },
  browserErrors: [
    async ({ page, context, browserName }, provide, testInfo) => {
      const errors: string[] = []
      const transportWarnings: string[] = []
      const observe = (target: typeof page) =>
        target.on('pageerror', (error) => {
          const message = error.message
          // WebKit reports canceled emulator Listen/Write WebChannels as page errors
          // during reload/navigation, even after the write succeeds and persists.
          // Keep this narrow and visible; actual app errors and UI assertions still fail.
          const canceledEmulatorChannel =
            browserName === 'webkit' &&
            ['Listen', 'Write'].some((channel) =>
              message.startsWith(
                '/' +
                  TEST_ENV.firestoreHost +
                  '/google.firestore.v1.Firestore/' +
                  channel +
                  '/channel?',
              ),
            ) &&
            message.includes(
              'database=projects%2F' + TEST_ENV.projectId + '%2Fdatabases%2F(default)',
            ) &&
            message.endsWith('due to access control checks.')
          if (canceledEmulatorChannel) transportWarnings.push(message)
          else errors.push(message)
        })
      context.pages().forEach(observe)
      context.on('page', observe)
      await provide()
      if (transportWarnings.length > 0) {
        await testInfo.attach('emulator-transport-warnings', {
          body: transportWarnings.join('\n'),
          contentType: 'text/plain',
        })
      }
      expect(errors, 'Unexpected browser JavaScript exceptions').toEqual([])
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
