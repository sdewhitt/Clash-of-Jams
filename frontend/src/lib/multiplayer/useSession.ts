import { useEffect, useRef, useState } from 'react'

import { auth } from '@/lib/firebase'
import { ApiError, apiFetch } from '@/lib/api'

import type { SessionEvent, SessionReply, SessionSnapshot } from './types'

interface Entry {
  uid: string
  matchId: string
  snapshot: SessionSnapshot
  receivedAt: number
}

export function sessionSocketUrl(matchId: string) {
  const origin = (import.meta.env.VITE_API_BASE_URL ?? '').trim() || window.location.origin
  const url = new URL('/api/v1/multiplayer/' + encodeURIComponent(matchId) + '/socket', origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

/** One subscription; retry pending IDs after reconnect and use the server's sequence. */
export function useSession(matchId: string | undefined, uid: string | undefined) {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting',
  )
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const channel = useRef<WebSocket | null>(null)
  const protocol = useRef({ owner: '', sequence: 0, pending: new Map<string, SessionEvent>() })

  useEffect(() => {
    if (!uid || !matchId) return
    const owner = uid + ':' + matchId
    if (protocol.current.owner !== owner) {
      protocol.current = { owner, sequence: 0, pending: new Map() }
    }
    const state = protocol.current
    let active = true
    let socket: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let lastMessage = performance.now()
    let terminal = false
    let lastSequence = -1
    let lookup: AbortController | undefined

    function publish(snapshot: SessionSnapshot) {
      if (snapshot.id !== matchId || snapshot.serverSequence < lastSequence) return
      lastSequence = snapshot.serverSequence
      setEntry({ uid: uid!, matchId: matchId!, snapshot, receivedAt: performance.now() })
    }

    async function connect() {
      if (!active) return
      setConnection('connecting')
      try {
        const user = auth.currentUser
        if (!user || user.uid !== uid) throw new Error('Sign in again to rejoin this match.')
        const token = await user.getIdToken()
        if (!active) return
        socket = new WebSocket(sessionSocketUrl(matchId!))
        channel.current = socket
        const current = socket
        lastMessage = performance.now()
        lastSequence = -1
        let lookupError: string | null = null
        let resumed = false
        lookup?.abort()
        lookup = new AbortController()
        // Match details remain available even if the WebSocket cannot open.
        void apiFetch<SessionSnapshot>('/multiplayer/' + encodeURIComponent(matchId!), {
          signal: lookup.signal,
        })
          .then((snapshot) => {
            if (active && socket === current && !resumed) publish(snapshot)
          })
          .catch((failure) => {
            if (!active || socket !== current || resumed || failure?.name === 'AbortError') return
            lookupError =
              failure instanceof ApiError &&
              failure.status === 404 &&
              failure.message === 'Not Found'
                ? 'The running backend does not support multiplayer yet. Restart the backend and reconnect.'
                : failure instanceof Error
                  ? failure.message
                  : 'Could not load match details.'
            setError(lookupError)
          })
        current.onopen = () => {
          if (active) current.send(JSON.stringify({ token }))
        }
        current.onmessage = (message) => {
          if (!active || channel.current !== current) return
          try {
            const reply: SessionReply = JSON.parse(message.data)
            if (reply.type !== 'snapshot' || reply.snapshot.id !== matchId) return
            lastMessage = performance.now()
            const snapshot = reply.snapshot
            state.sequence = Math.max(state.sequence, snapshot.yourLastSequence)
            if (reply.eventId) state.pending.delete(reply.eventId)
            if (snapshot.serverSequence < lastSequence) return
            terminal = snapshot.state === 'complete' || snapshot.state === 'abandoned'
            if (
              !terminal &&
              snapshot.participants.find((player) => player.uid === uid)?.connected === false
            ) {
              current.close()
              return
            }
            publish(snapshot)
            setConnection('connected')
            setError(reply.error)
            if (!resumed) {
              resumed = true
              if (terminal) state.pending.clear()
              else for (const event of state.pending.values()) current.send(JSON.stringify(event))
            }
          } catch {
            setError('Received an invalid session response. Reconnect to recover.')
            current.close()
          }
        }
        current.onclose = (event) => {
          if (!active || channel.current !== current) return
          channel.current = null
          setConnection('disconnected')
          if (
            event.code === 4009 ||
            event.code === 4401 ||
            event.code === 4403 ||
            event.code === 1008
          ) {
            setError(
              event.code === 4009
                ? 'This match was opened in another tab.'
                : 'Could not join this match. Return Home or sign in again.',
            )
          } else if (!terminal) {
            setError(lookupError ?? 'Connection lost. Reconnecting…')
            retryTimer = setTimeout(() => {
              void connect()
            }, 1000)
          }
        }
        current.onerror = () => {
          /* onclose handles recovery. */
        }
      } catch (failure) {
        if (!active) return
        setConnection('disconnected')
        setError(failure instanceof Error ? failure.message : 'Could not connect to the match.')
        retryTimer = setTimeout(() => {
          void connect()
        }, 2000)
      }
    }
    void connect()
    heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        if (performance.now() - lastMessage > 12_000) socket.close()
        else socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, 3000)
    const close = () => socket?.close()
    const resume = () => setAttempt((value) => value + 1)
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) resume()
    }
    window.addEventListener('pagehide', close)
    window.addEventListener('pageshow', show)
    window.addEventListener('offline', close)
    window.addEventListener('online', resume)
    return () => {
      active = false
      clearTimeout(retryTimer)
      clearInterval(heartbeat)
      lookup?.abort()
      window.removeEventListener('pagehide', close)
      window.removeEventListener('pageshow', show)
      window.removeEventListener('offline', close)
      window.removeEventListener('online', resume)
      if (channel.current === socket) channel.current = null
      socket?.close()
    }
  }, [matchId, uid, attempt])

  function send(kind: SessionEvent['kind'], phrase?: SessionEvent['phrase']) {
    const socket = channel.current
    if (!socket || socket.readyState !== WebSocket.OPEN || connection !== 'connected') return
    const event: SessionEvent = {
      eventId: crypto.randomUUID(),
      sequence: ++protocol.current.sequence,
      kind,
    }
    if (phrase) event.phrase = phrase
    protocol.current.pending.set(event.eventId, event)
    socket.send(JSON.stringify(event))
    setError(null)
  }

  const owned = entry && entry.uid === uid && entry.matchId === matchId ? entry : null
  return {
    snapshot: owned?.snapshot ?? null,
    receivedAt: owned?.receivedAt ?? 0,
    connection,
    error,
    send,
    retry: () => setAttempt((value) => value + 1),
  }
}
