/**
 * A stand-in for the FastAPI backend in component tests.
 *
 * Stubs the global fetch that apiFetch uses. Each route maps a path under
 * /api/v1 to the response it should get; a path with no route gets a 404 like
 * FastAPI's own, so a test only lists the calls it cares about.
 */
import { vi } from 'vitest'

type Route = { status?: number; body: unknown }

export function stubApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/api\/v1/, '')
    const route = routes[path]
    // A fresh Response per call: a body can only be read once.
    return route
      ? Response.json(route.body, { status: route.status ?? 200 })
      : Response.json({ detail: 'Not Found' }, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The query string of every call made to `path`, in order. */
export function callsTo(fetchMock: ReturnType<typeof stubApi>, path: string): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === `/api/v1${path}`)
    .map((url) => url.searchParams)
}
