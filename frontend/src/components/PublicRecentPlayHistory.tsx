import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { formatPlayedAt } from '@/lib/runs/history'

type PublicActivityEntry = {
    id: string
    scenarioTitle: string
    instrument: string
    playedAt: string
    score: number
} & (
    | { kind: 'solo' }
    | { kind: 'multiplayer'; outcome: 'win' | 'loss' | 'draw' | 'forfeit' }
)

const percent = new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
})

export function PublicRecentActivity({ uid }: { uid: string }) {
    const [entries, setEntries] = useState<PublicActivityEntry[] | null>(null)
    const [failed, setFailed] = useState(false)

    const [view, setView] = useState<"all" | "solo" | "multiplayer">("all");

    const visibleEntries = (entries ?? []).filter(
        (entry) => view === 'all' || entry.kind === view,
    )

    useEffect(() => {
        let cancelled = false

        void apiFetch<{ entries: PublicActivityEntry[] }>(`/history/public/${encodeURIComponent(uid)}`,)
            .then((response) => {
                if (!cancelled) {
                    setEntries(response.entries)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setFailed(true)
                }
            })

        return () => {
            cancelled = true
        }
    }, [uid])

    if (failed) {
        return (
            <p
                role="alert"
                className='text-2xl text-ink text-center'
            >
                User's activity is not publicly accessible!
            </p>
        )
    }

    if (entries === null) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <div className="h-32 w-32 animate-spin rounded-full border-10 border-accent-start border-t-transparent"></div>
                <p className="text-center text-4xl py-4">
                    Loading recent activity...
                </p>
            </div>
        )
    }

    if (entries.length === 0) {
        return (
            <p
                className='text-2xl text-ink text-center'
            >
                User has not played any scenarios or matches yet!
            </p>
        )
    }

    return (
        <ul className="w-full space-y-3 px-4">
            <div 
                role="group" 
                aria-label="History list view" 
                className={`
                    flex flex-row 
                    items-center 
                    gap-4 mb-4 px-4
                    rounded-lg
                    bg-linear-to-b
                    from-contrast-start
                    via-contrast-middle
                    to-contrast-end
                    border-2 border-contrast-start
                `}
            >
                <button
                    type="button"
                    aria-pressed={view === "all"}
                    onClick={() => setView("all")}
                    className={`
                        w-1/3
                        rounded-lg 
                        px-4 py-2 my-2
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        border-2 border-accent-start
                        brightness-80
                        aria-pressed:brightness-100
                        text-ink
                        hover:scale-102
                        hover:brightness-120
                        active:scale-99
                        active:opacity-30%
                        active:brightness-60
                        transition
                        duration-200
                    `}
                >
                    All Playthroughs
                </button>
                <button
                    type="button"
                    aria-pressed={view === "solo"}
                    onClick={() => setView("solo")}
                    className={`
                        w-1/3
                        rounded-lg
                        px-4 py-2 my-2
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        border-2 border-accent-start
                        brightness-80
                        aria-pressed:brightness-100
                        text-ink
                        hover:scale-102
                        hover:brightness-120
                        active:scale-99
                        active:opacity-30%
                        active:brightness-60
                        transition
                        duration-200
                    `}
                >
                    Solo Playthroughs
                </button>
                <button
                    type="button"
                    aria-pressed={view === "multiplayer"}
                    onClick={() => setView("multiplayer")}
                    className={`
                        w-1/3
                        rounded-lg
                        px-4 py-2 my-2
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        border-2 border-accent-start
                        brightness-80
                        aria-pressed:brightness-100
                        text-ink
                        hover:scale-102
                        hover:brightness-120
                        active:scale-99
                        active:opacity-30%
                        active:brightness-60
                        transition
                        duration-200
                    `}
                >
                    Multiplayer Playthroughs
                </button>
            </div>
            {visibleEntries.length === 0 && (
                <p
                    className='text-2xl text-ink text-center'
                >
                    No recent activity matches this filter
                </p>
            )}
            {visibleEntries.length > 0 && visibleEntries.map((entry) => (
                <li 
                    key={entry.id} 
                    className={`
                        rounded-lg
                        border-2 border-contrast-start 
                        bg-linear-to-br 
                        from-contrast-start 
                        via-contrast-middle 
                        to-contrast-end 
                        px-4 py-2 m-2
                        font-bold text-ink
                    `}
                >
                    <div className='flex flex-row justify-between items-center'>
                        <div className='flex flex-col'>
                            <p className="text-xl font-bold">{entry.scenarioTitle}</p>
                            <p className="text-sm text-inverse-ink">
                                {entry.instrument} · {formatPlayedAt(entry.playedAt)}
                            </p>
                        </div>
                        {entry.kind === 'multiplayer' ? (
                            <p 
                                className={`
                                    rounded-lg
                                    w-36 py-2
                                    text-xl text-center font-bold capitalize
                                    border-2 border-accent-start 
                                    bg-linear-to-br 
                                    from-accent-start 
                                    via-accent-middle 
                                    to-accent-end
                                `}
                            >
                                {entry.outcome} · {percent.format(entry.score)}
                            </p>
                        ) : (
                            <p 
                                className={`
                                    rounded-lg
                                    w-36 py-2
                                    text-xl text-center font-bold capitalize
                                    border-2 border-accent-start 
                                    bg-linear-to-br 
                                    from-accent-start 
                                    via-accent-middle 
                                    to-accent-end
                                `}
                            >
                                {entry.score.toLocaleString()} points
                            </p>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    )
}