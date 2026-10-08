import { afterEach, describe, expect, it, vi } from 'vitest'

import { callsTo, stubApi } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('component API stub', () => {
  it.each([
    ['relative path', '/api/v1/leaderboards/elo?instrument=piano'],
    ['absolute URL', 'https://backend.example.test/api/v1/leaderboards/elo?instrument=piano'],
    [
      'URL object',
      new URL('https://backend.example.test/api/v1/leaderboards/elo?instrument=piano'),
    ],
    [
      'Request object',
      new Request('https://backend.example.test/api/v1/leaderboards/elo?instrument=piano'),
    ],
  ])(
    'returns the registered response and records query parameters for a %s',
    async (_label, input) => {
      const body = { entries: [], totalPlayers: 0 }
      const mock = stubApi({ '/leaderboards/elo': { body } })

      const response = await fetch(input)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(body)
      expect(callsTo(mock, '/leaderboards/elo').map((query) => query.get('instrument'))).toEqual([
        'piano',
      ])
    },
  )

  it('preserves request order and filters unrelated calls when inspecting query parameters', async () => {
    const mock = stubApi({
      '/leaderboards/elo': { body: [] },
      '/scenarios/scenario_with_author': { body: [] },
    })
    await fetch('/api/v1/leaderboards/elo?instrument=piano')
    await fetch('/api/v1/scenarios/scenario_with_author')
    await fetch('/api/v1/leaderboards/elo?instrument=vocals')

    expect(callsTo(mock, '/leaderboards/elo').map((query) => query.get('instrument'))).toEqual([
      'piano',
      'vocals',
    ])
  })

  it('returns an actual 404 response for an unregistered relative route', async () => {
    stubApi({})

    const response = await fetch('/api/v1/missing')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: 'Not Found' })
  })

  it('creates independently readable response bodies on repeated calls', async () => {
    const body = [{ scenario: { id: 'a', title: 'AAAAA' }, authorName: 'Creator A' }]
    stubApi({ '/scenarios/scenario_with_author': { body } })

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch('/api/v1/scenarios/scenario_with_author')
      expect(await response.json()).toEqual(body)
    }
  })
})
