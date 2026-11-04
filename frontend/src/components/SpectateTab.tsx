import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { apiFetch } from '@/lib/api'

interface WatchableMatch {
  id: string
  friends: string[]
}

export function SpectateTab({
  uid,
  onJoin,
  joining = false,
}: {
  uid?: string
  onJoin?: (path: string) => void
  joining?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ uid: string; matches: WatchableMatch[] | null }>()
  const owned = result?.uid === uid ? result : undefined

  useEffect(() => {
    if (!uid) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>

    async function refresh() {
      try {
        const matches = await apiFetch<WatchableMatch[]>('/multiplayer/spectating', {
          signal: controller.signal,
        })
        if (!controller.signal.aborted) setResult({ uid: uid!, matches })
      } catch {
        if (!controller.signal.aborted) setResult({ uid: uid!, matches: null })
      }
      if (open && !controller.signal.aborted) timer = setTimeout(refresh, 10_000)
    }

    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [uid, open])

  return (
    <aside aria-label="Spectate friends" className="w-fit max-w-full">
      <button
        type="button"
        aria-expanded={open}
        className="rounded-lg border-2 border-accent-start px-4 py-2 font-bold"
        onClick={() => setOpen(!open)}
      >
        Spectate{owned?.matches?.length ? ` (${owned.matches.length})` : ''}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border-2 border-accent-start p-3">
          {!owned ? (
            <p role="status">Checking for live matches…</p>
          ) : owned.matches === null ? (
            <p role="status">Could not load live matches.</p>
          ) : owned.matches.length === 0 ? (
            <p>No friends in watchable matches.</p>
          ) : (
            <ul className="space-y-2">
              {owned.matches.map((match) => {
                const path = `/spectate/${encodeURIComponent(match.id)}`
                return (
                  <li key={match.id} className="flex items-center justify-between gap-4">
                    <span>{match.friends.join(', ')}</span>
                    {onJoin ? (
                      <button
                        className="font-bold underline"
                        type="button"
                        disabled={joining}
                        onClick={() => onJoin(path)}
                      >
                        Join
                      </button>
                    ) : (
                      <Link className="font-bold underline" to={path}>
                        Join
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
