/**
 * Thin client for the FastAPI backend.
 *
 * Every call carries the current user's Firebase ID token as a bearer token;
 * backend/app/dependencies.py verifies it with the Admin SDK. getIdToken()
 * refreshes on its own when the hour-long token has expired.
 */
import { auth } from '@/lib/firebase'

// Local development forwards /api through Vite to the shared backend. An
// explicit origin remains available for separately hosted frontends.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const API_PREFIX = '/api/v1'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** `path` is relative to /api/v1, e.g. apiFetch('/scenarios'). */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  const user = auth.currentUser
  if (user) {
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`)
  }
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${API_PREFIX}${path}`, { ...init, headers })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Could not reach the server. Please try again.')
  }

  if (!response.ok) {
    // FastAPI puts the reason in `detail`; fall back to the status text.
    const body = await response.json().catch(() => null)
    const detail =
      body && typeof body.detail === 'string'
        ? body.detail
        : response.status >= 500
          ? 'The server is unavailable. Please try again.'
          : response.statusText
    throw new ApiError(response.status, detail)
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}
