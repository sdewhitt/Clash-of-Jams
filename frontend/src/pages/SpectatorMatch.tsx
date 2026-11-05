import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import { auth } from '@/lib/firebase'
import { useAuth } from '@/lib/auth/useAuth'
import { sessionSocketUrl } from '@/lib/multiplayer/useSession'

const reactions = [
  { symbol: '👍', label: 'Thumbs up' },
  { symbol: '👏', label: 'Applause' },
  { symbol: '🎵', label: 'Music note' },
]

interface SpectatorSnapshot {
  state: 'in_progress' | 'complete' | 'abandoned'
  scenarioTitle: string
  elapsedMs: number
  durationMs: number
  totalBeats: number
  players: { name: string; score: number; beatsHit: number; outcome: string | null }[]
  messages: { id: number; author: string | null; text: string; reactions: Record<string, number> }[]
}

export function SpectatorMatch() {
  const { matchId } = useParams()
  const uid = useAuth().user?.uid
  const [view, setView] = useState<{ matchId: string; uid: string; snapshot: SpectatorSnapshot }>()
  const [status, setStatus] = useState('Connecting to match…')
  const socket = useRef<WebSocket | null>(null)
  const snapshot = view && view.matchId === matchId && view.uid === uid ? view.snapshot : null

  useEffect(() => {
    if (!matchId || !uid) return
    const visit = crypto.randomUUID()
    let active = true
    let terminal = false
    let timer: ReturnType<typeof setTimeout>

    async function connect() {
      try {
        const user = auth.currentUser
        if (!user || user.uid !== uid) throw new Error('Sign in to watch this match.')
        const token = await user.getIdToken()
        if (!active) return
        const current = new WebSocket(sessionSocketUrl(matchId!, 'spectate'))
        socket.current = current
        current.onopen = () => current.send(JSON.stringify({ token, visit }))
        current.onmessage = (event) => {
          if (!active) return
          const next: SpectatorSnapshot = JSON.parse(event.data)
          terminal = next.state !== 'in_progress'
          setView({ matchId: matchId!, uid: uid!, snapshot: next })
          setStatus('')
        }
        current.onclose = (event) => {
          if (!active || terminal) return
          socket.current = null
          if ([4009, 4401, 4403, 4410, 1008].includes(event.code)) {
            setView(undefined)
            setStatus(
              event.code === 4410
                ? 'Spectating was turned off.'
                : event.code === 4009
                  ? 'This match was opened in another tab.'
                  : 'This match is no longer available to spectate.',
            )
            return
          }
          setStatus('Connection lost. Reconnecting…')
          timer = setTimeout(connect, 1000)
        }
      } catch {
        if (!active) return
        setStatus('Could not connect to this match. Reconnecting…')
        timer = setTimeout(connect, 2000)
      }
    }

    void connect()
    return () => {
      active = false
      clearTimeout(timer)
      socket.current?.close()
      socket.current = null
    }
  }, [matchId, uid])

  function react(messageId: number, reaction: string) {
    const current = socket.current
    if (current?.readyState !== WebSocket.OPEN) return
    current.send(JSON.stringify({ type: 'reaction', messageId, reaction }))
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Link className="font-bold underline" to="/home">
        Back to Home
      </Link>
      <h1 className="text-3xl font-bold">{snapshot?.scenarioTitle ?? 'Spectate match'}</h1>
      {status && <p role="status">{status}</p>}
      {snapshot && (
        <>
          <p className="tabular-nums">
            {snapshot.state === 'in_progress'
              ? `${Math.floor(snapshot.elapsedMs / 1000)}s / ${Math.ceil(snapshot.durationMs / 1000)}s`
              : snapshot.state === 'complete'
                ? 'Final results'
                : 'Match abandoned'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {snapshot.players.map((player, index) => (
              <section key={index} className="min-w-0 rounded-lg border-2 border-accent-start p-3">
                <h2 className="break-words text-xl font-bold">{player.name}</h2>
                <p className="tabular-nums">Score {Math.round(player.score * 100)}%</p>
                <progress
                  className="max-w-full"
                  aria-label={`${player.name} beats hit`}
                  value={player.beatsHit}
                  max={snapshot.totalBeats}
                />
                <p>
                  {player.beatsHit} / {snapshot.totalBeats} beats hit
                </p>
                {player.outcome && <p className="font-bold capitalize">{player.outcome}</p>}
              </section>
            ))}
          </div>
          <section aria-label="Match chat" className="rounded-lg border-2 border-accent-start p-4">
            <h2 className="font-bold">Match chat</h2>
            <ul className="space-y-3">
              {snapshot.messages.map((message) => (
                <li key={message.id}>
                  <p>
                    {message.author && `${message.author}: `}
                    {message.text}
                  </p>
                  <div className="flex gap-2">
                    {reactions.map(({ symbol, label }) => (
                      <button
                        key={symbol}
                        type="button"
                        className="rounded border border-accent-start px-2 py-1 disabled:opacity-50"
                        disabled={snapshot.state !== 'in_progress' || Boolean(status)}
                        aria-label={`${label} reaction, ${message.reactions[symbol] ?? 0}`}
                        onClick={() => react(message.id, symbol)}
                      >
                        {symbol} {message.reactions[symbol] ?? 0}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  )
}
