/**
 * User story #67: the client half of the backend handshake. A signed-in call
 * carries the ID token; once signed out, calls go without one and the
 * backend's 401 surfaces as an ApiError.
 */
import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch } from '@/lib/api'
import { auth } from '@/lib/firebase'

const fetchMock = vi.fn<typeof fetch>()
const mutableAuth = auth as { currentUser: User | null }

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue(Response.json([]))
})

afterEach(() => {
  mutableAuth.currentUser = null
  vi.unstubAllGlobals()
})

function sentHeaders() {
  return new Headers(fetchMock.mock.calls[0][1]?.headers)
}

describe('apiFetch', () => {
  it('sends the current ID token as a bearer token', async () => {
    mutableAuth.currentUser = { getIdToken: async () => 'id-token-abc' } as User

    await apiFetch('/scenarios')

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/scenarios$/)
    expect(sentHeaders().get('Authorization')).toBe('Bearer id-token-abc')
  })

  it('sends no token after sign-out, and the rejection surfaces as a 401', async () => {
    fetchMock.mockResolvedValue(Response.json({ detail: 'Missing bearer token' }, { status: 401 }))

    const call = apiFetch('/scenarios')

    await expect(call).rejects.toBeInstanceOf(ApiError)
    await expect(call).rejects.toMatchObject({ status: 401, message: 'Missing bearer token' })
    expect(sentHeaders().has('Authorization')).toBe(false)
  })

  it('uses the frontend proxy instead of the browser computer’s localhost backend', async () => {
    await apiFetch('/matchmaking/queue')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/matchmaking/queue')
  })

  it('turns browser network failures into an actionable error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Load failed'))
    await expect(apiFetch('/matchmaking/queue')).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the server. Please try again.',
    })
  })

  it('explains an unavailable proxy backend without losing API error details', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    await expect(apiFetch('/matchmaking/queue')).rejects.toMatchObject({
      status: 503,
      message: 'The server is unavailable. Please try again.',
    })
  })
})
