import { act, renderHook } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ApiError, apiFetch } from '@/lib/api'
import { auth } from '@/lib/firebase'
import type { SessionSnapshot } from '@/lib/multiplayer/types'
import { sessionSnapshot } from '@/test/multiplayer'
import { sessionSocketUrl, useSession } from './useSession'

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn(),
}))

class TestSocket {
  static OPEN = 1
  static instances: TestSocket[] = []
  readyState = 0
  sent: Record<string, unknown>[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  readonly url: string
  constructor(url: string) {
    this.url = url
    TestSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  close(code = 1000) {
    this.readyState = 3
    this.onclose?.({ code })
  }
  receive(snapshot = sessionSnapshot(), eventId: string | null = null) {
    this.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        disposition: 'snapshot',
        error: null,
        eventId,
        snapshot,
      }),
    })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(apiFetch)
    .mockReset()
    .mockReturnValue(new Promise(() => {}))
  TestSocket.instances = []
  vi.stubGlobal('WebSocket', TestSocket)
  Object.assign(auth, {
    currentUser: {
      uid: 'user-1',
      getIdToken: vi.fn().mockResolvedValue('token'),
    } as unknown as User,
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.assign(auth, { currentUser: null })
})

it('authenticates once under StrictMode and closes on unmount without retrying', async () => {
  const hook = renderHook(() => useSession('match-1', 'user-1'), { wrapper: StrictMode })
  await act(async () => {})
  expect(TestSocket.instances).toHaveLength(1)
  const socket = TestSocket.instances[0]!
  act(() => socket.open())
  expect(socket.sent).toEqual([{ token: 'token' }])
  act(() => socket.receive())
  expect(hook.result.current.connection).toBe('connected')
  hook.unmount()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  expect(socket.readyState).toBe(3)
  expect(TestSocket.instances).toHaveLength(1)
})

it('replays unacknowledged IDs after reconnect and continues the authoritative sequence', async () => {
  const hook = renderHook(() => useSession('match-1', 'user-1'))
  await act(async () => {})
  const first = TestSocket.instances[0]!
  act(() => {
    first.open()
    first.receive(sessionSnapshot({ yourLastSequence: 7 }))
  })
  act(() => hook.result.current.send('ready'))
  const sent = first.sent[1]!
  expect(sent.sequence).toBe(8)
  act(() => first.close())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  const second = TestSocket.instances[1]!
  act(() => {
    second.open()
    second.receive(sessionSnapshot({ yourLastSequence: 8 }))
  })
  expect(second.sent[1]).toEqual(sent)
  act(() => second.receive(sessionSnapshot({ yourLastSequence: 8 }), sent.eventId as string))
  act(() => hook.result.current.send('emote', 'thanks'))
  expect(second.sent[2]!.sequence).toBe(9)
  act(() => second.close(4009))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  expect(TestSocket.instances).toHaveLength(2)
  expect(hook.result.current.error).toContain('another tab')
})

it('ignores older state but accepts its acknowledgement', async () => {
  const hook = renderHook(() => useSession('match-1', 'user-1'))
  await act(async () => {})
  const socket = TestSocket.instances[0]!
  act(() => {
    socket.open()
    socket.receive(sessionSnapshot({ serverSequence: 10 }))
  })
  const stale = sessionSnapshot({ serverSequence: 2, state: 'in_progress' })
  stale.participants[0]!.connected = false
  act(() => socket.receive(stale))
  expect(hook.result.current.snapshot?.state).toBe('lobby')
  expect(socket.readyState).toBe(1)
  expect(hook.result.current.connection).toBe('connected')
})

it('loads match details over HTTP even when the socket cannot connect', async () => {
  vi.mocked(apiFetch).mockResolvedValue(sessionSnapshot())
  const hook = renderHook(() => useSession('match-1', 'user-1'))
  await act(async () => {})
  act(() => TestSocket.instances[0]!.close(1006))
  expect(hook.result.current.connection).toBe('disconnected')
  expect(hook.result.current.snapshot?.scenarioTitle).toBe('Shared riff')
  expect(hook.result.current.snapshot?.participants[1]?.displayName).toBe('Player Two')
  act(() => hook.result.current.send('ready'))
  expect(TestSocket.instances[0]!.sent).toHaveLength(0)
  expect(apiFetch).toHaveBeenCalledWith('/multiplayer/match-1', {
    signal: expect.any(AbortSignal),
  })
})

it('explains when a stale backend is missing the multiplayer router', async () => {
  vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, 'Not Found'))
  const hook = renderHook(() => useSession('match-1', 'user-1'))
  await act(async () => {})
  act(() => TestSocket.instances[0]!.close(1006))
  expect(hook.result.current.error).toContain('Restart the backend and reconnect')
})

it('keeps the live snapshot when a slower HTTP lookup finishes after reconnect', async () => {
  let resolve!: (snapshot: SessionSnapshot) => void
  vi.mocked(apiFetch).mockReturnValue(
    new Promise<SessionSnapshot>((done) => {
      resolve = done
    }),
  )
  const hook = renderHook(() => useSession('match-1', 'user-1'))
  await act(async () => {})
  act(() => {
    TestSocket.instances[0]!.open()
    TestSocket.instances[0]!.receive(sessionSnapshot({ state: 'in_progress', serverSequence: 10 }))
  })
  await act(async () => resolve(sessionSnapshot()))
  expect(hook.result.current.snapshot?.state).toBe('in_progress')
  expect(hook.result.current.connection).toBe('connected')
})

it('accepts a fresh sequence after the server restarts', async () => {
  const hook = renderHook(() => useSession('match-1', 'user-1'))
  await act(async () => {})
  act(() => {
    TestSocket.instances[0]!.open()
    TestSocket.instances[0]!.receive(sessionSnapshot({ state: 'in_progress', serverSequence: 50 }))
    TestSocket.instances[0]!.close(1006)
  })
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  act(() => {
    TestSocket.instances[1]!.open()
    TestSocket.instances[1]!.receive(
      sessionSnapshot({
        state: 'abandoned',
        serverSequence: 1,
        completionReason: 'server_restarted',
      }),
    )
  })
  expect(hook.result.current.snapshot?.completionReason).toBe('server_restarted')
  expect(hook.result.current.connection).toBe('connected')
})

it('aborts HTTP lookups and ignores their results when the account changes', async () => {
  let resolve!: (snapshot: SessionSnapshot) => void
  vi.mocked(apiFetch).mockReturnValueOnce(
    new Promise<SessionSnapshot>((done) => {
      resolve = done
    }),
  )
  const hook = renderHook(({ uid }) => useSession('match-1', uid), {
    initialProps: { uid: 'user-1' },
  })
  await act(async () => {})
  const options = vi.mocked(apiFetch).mock.calls[0]![1]
  Object.assign(auth, {
    currentUser: {
      uid: 'user-2',
      getIdToken: vi.fn().mockResolvedValue('second-token'),
    } as unknown as User,
  })
  hook.rerender({ uid: 'user-2' })
  await act(async () => resolve(sessionSnapshot()))
  expect(options?.signal?.aborted).toBe(true)
  expect(hook.result.current.snapshot).toBeNull()
})

it('does not expose the previous account match during account changes', async () => {
  const hook = renderHook(({ uid }) => useSession('match-1', uid), {
    initialProps: { uid: 'user-1' },
  })
  await act(async () => {})
  const socket = TestSocket.instances[0]!
  act(() => {
    socket.open()
    socket.receive()
  })
  Object.assign(auth, {
    currentUser: {
      uid: 'user-2',
      getIdToken: vi.fn().mockResolvedValue('second-token'),
    } as unknown as User,
  })
  hook.rerender({ uid: 'user-2' })
  expect(hook.result.current.snapshot).toBeNull()
  await act(async () => {})
  expect(socket.readyState).toBe(3)
  const second = TestSocket.instances[1]!
  act(() => {
    second.open()
    second.receive(sessionSnapshot())
  })
  expect(second.sent[0]).toEqual({ token: 'second-token' })
})

it('uses a same-origin socket URL with no credentials in it', () => {
  expect(sessionSocketUrl('match-1')).toContain('/api/v1/multiplayer/match-1/socket')
  expect(sessionSocketUrl('match-1')).not.toContain('token')
})
