import { useEffect, useRef, useState } from 'react'

import { cancelQueue, getQueueStatus, joinQueue, type QueueStatus } from './api'

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Could not connect to multiplayer.'
}

interface Entry {
  uid: string
  status: QueueStatus | null
  error: string | null
  receivedAt: number
}

/** Ticket-scoped cancellation and heartbeat; refresh preserves an assigned lobby. */
export function useMatchmaking(uid: string | undefined) {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const current = useRef<{
    uid?: string
    ticket: string | null
    joining: Promise<QueueStatus> | null
    cancelling: boolean
  }>({ ticket: null, joining: null, cancelling: false })
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!uid) return
    // StrictMode remounts immediately; it must not cancel its own second setup.
    if (cleanupTimer.current !== null) clearTimeout(cleanupTimer.current)
    if (current.current.uid !== uid) {
      current.current = { uid, ticket: null, joining: null, cancelling: false }
    }
    const state = current.current
    state.cancelling = false
    let active = true
    let pollTimer: ReturnType<typeof setTimeout> | undefined

    function publish(status: QueueStatus) {
      if (!active || state.cancelling) return
      state.ticket = status.queueId
      setEntry({ uid: uid!, status, error: null, receivedAt: performance.now() })
    }
    async function poll() {
      if (!active || state.cancelling) return
      try {
        const status = await getQueueStatus()
        if (!active || state.cancelling) return
        if (status.state === 'idle') {
          state.ticket = null
          state.joining = joinQueue()
          publish(await state.joining)
        } else publish(status)
      } catch (error) {
        if (active && !state.cancelling)
          setEntry((previous) => ({
            uid: uid!,
            status: previous && previous.uid === uid ? previous.status : null,
            error: message(error),
            receivedAt: previous && previous.uid === uid ? previous.receivedAt : performance.now(),
          }))
      } finally {
        if (active && !state.cancelling) pollTimer = setTimeout(poll, 1500)
      }
    }
    const joining = joinQueue()
    state.joining = joining
    void joining
      .then((status) => {
        publish(status)
        if (active && !state.cancelling) pollTimer = setTimeout(poll, 1500)
      })
      .catch((error) => {
        if (active && !state.cancelling)
          setEntry({
            uid: uid!,
            status: null,
            error: message(error),
            receivedAt: performance.now(),
          })
      })

    function release() {
      state.cancelling = true
      void (state.joining ?? Promise.resolve(null))
        .then((status) => {
          const ticket = status?.queueId ?? state.ticket
          // Navigation/reload releases an unmatched queue, but preserves a lobby for rejoin.
          if (ticket) return cancelQueue(ticket, true, false)
        })
        .catch(() => {
          /* The server lease also expires without heartbeats. */
        })
    }
    const resume = () => setAttempt((value) => value + 1)
    window.addEventListener('pagehide', release)
    window.addEventListener('pageshow', resume)
    return () => {
      active = false
      if (pollTimer) clearTimeout(pollTimer)
      window.removeEventListener('pagehide', release)
      window.removeEventListener('pageshow', resume)
      cleanupTimer.current = setTimeout(release, 0)
    }
  }, [uid, attempt])

  async function cancel() {
    const state = current.current
    state.cancelling = true
    setLeaving(true)
    try {
      const joined = await state.joining?.catch(() => null)
      const ticket = joined?.queueId ?? state.ticket
      if (ticket) await cancelQueue(ticket)
      state.ticket = null
      state.joining = null
    } catch (error) {
      state.cancelling = false
      setEntry((previous) => ({
        uid: uid!,
        status: previous?.status ?? null,
        error: message(error),
        receivedAt: previous?.receivedAt ?? performance.now(),
      }))
      setAttempt((value) => value + 1)
      throw error
    } finally {
      setLeaving(false)
    }
  }

  const owned = entry?.uid === uid ? entry : null
  return {
    status: owned?.status ?? null,
    receivedAt: owned?.receivedAt ?? 0,
    error: owned?.error ?? null,
    leaving,
    cancel,
    retry: () => setAttempt((value) => value + 1),
  }
}

/** Home looks up an existing assignment; it never joins the queue. */
export function useActiveMatch(uid: string | undefined) {
  const [entry, setEntry] = useState<Entry | null>(null)
  useEffect(() => {
    if (!uid) return
    let active = true
    const load = () => {
      void getQueueStatus()
        .then((status) => {
          if (active) setEntry({ uid, status, error: null, receivedAt: performance.now() })
        })
        .catch(() => {
          if (active)
            setEntry({
              uid,
              status: null,
              error: 'Multiplayer unavailable',
              receivedAt: performance.now(),
            })
        })
    }
    load()
    window.addEventListener('focus', load)
    return () => {
      active = false
      window.removeEventListener('focus', load)
    }
  }, [uid])
  return entry && entry.uid === uid && entry.status?.state === 'matched' ? entry.status.match : null
}
