/**
 * Shared setup for the jsdom unit suite.
 *
 * @/lib/firebase throws at import time without VITE_FIREBASE_* values and would
 * open real connections with them, so every test gets inert stand-ins. Tests
 * that exercise Firebase calls mock the SDK functions themselves.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ app: {}, auth: { currentUser: null }, db: {} }))

afterEach(() => {
  cleanup()
})
