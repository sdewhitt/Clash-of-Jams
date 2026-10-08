import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

import { browserFirebaseEnv, TEST_ENV } from './tests/e2e/support/environment.js'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: 0, // A failing run stays visible; do not hide it behind retries.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: TEST_ENV.baseURL,
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5190 --strictPort',
      url: TEST_ENV.baseURL,
      env: browserFirebaseEnv,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command:
        process.platform === 'win32'
          ? '.venv\\Scripts\\python.exe scripts/serve_ui_tests.py'
          : '.venv/bin/python scripts/serve_ui_tests.py',
      cwd: resolve('../backend'),
      url: TEST_ENV.apiURL + '/health',
      env: {
        FIRESTORE_EMULATOR_HOST: TEST_ENV.firestoreHost,
        FIREBASE_AUTH_EMULATOR_HOST: TEST_ENV.authHost,
        FIREBASE_PROJECT_ID: TEST_ENV.projectId,
        GCLOUD_PROJECT: TEST_ENV.projectId,
        AUTH_DISABLED: 'false',
        CORS_ORIGINS: JSON.stringify([TEST_ENV.baseURL]),
      },
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
})
