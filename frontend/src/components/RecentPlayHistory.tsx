import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { HistoryRow } from '@/components/HistoryRow'
import { fetchPlayHistory, type PlayHistoryEntry } from '@/lib/runs/history'
import { useAuth } from '@/lib/auth/useAuth'
import { useRecentMatchHistory } from '@/lib/ratings/useRatingHistory'
import { RatingResult } from './RatingResult'

export function RecentPlayHistory() {
    const { user } = useAuth()

    const navigate = useNavigate()

    const [entries, setEntries] = useState<PlayHistoryEntry[] | null>(null)
    const [failed, setFailed] = useState(false)

    const [view, setView] = useState<"solo" | "multiplayer">("solo");
    const { events, loading, error } = useRecentMatchHistory(user?.uid)

    useEffect(() => {
        let cancelled = false

        void fetchPlayHistory(null, 10)
            .then((page) => {
                if (!cancelled) {
                    setEntries(page.entries)
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
    }, [])

    return (
        <section 
            aria-label="Recent Activity" 
            className="m-6 space-y-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-4 border-contrast-start">
                <h2 className="text-4xl text-ink font-bold">
                    Your Recent Activity:
                </h2>
                <div className='flex flex-row'>
                    <button
                        type='button'
                        onClick={() => navigate('/play_history')}
                        className={`
                            cursor-pointer 
                            rounded-lg
                            border-2 border-contrast-start 
                            bg-linear-to-br 
                            from-contrast-start 
                            via-contrast-middle 
                            to-contrast-end 
                            px-4 py-2 m-2
                            font-bold text-ink 
                            transition duration-200 
                            hover:scale-105 
                            active:scale-95
                        `}
                    >
                        View Play History
                    </button>
                    <button
                        type='button'
                        onClick={() => navigate('/recent_matches')}
                        className={`
                            cursor-pointer 
                            rounded-lg
                            border-2 border-contrast-start 
                            bg-linear-to-br 
                            from-contrast-start 
                            via-contrast-middle 
                            to-contrast-end 
                            px-4 py-2 m-2
                            font-bold text-ink 
                            transition duration-200 
                            hover:scale-105 
                            active:scale-95
                        `}
                    >
                        View Match History
                    </button>
                </div>
            </div>

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
                    aria-pressed={view === "solo"}
                    onClick={() => setView("solo")}
                    className={`
                        w-1/2
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
                        w-1/2
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

            <div className='mx-6'>
                {view === "solo" && (
                    <>
                        {failed && (
                            <p role="alert">
                                Couldn’t load your recent activity
                            </p>
                        )}
                        
                        {!failed && entries === null && (
                            <div className="flex h-full flex-col items-center justify-center gap-4">
                                <div className="h-32 w-32 animate-spin rounded-full border-10 border-accent-start border-t-transparent"></div>
                                <p className="text-center text-4xl py-4">
                                    Loading recent activity...
                                </p>
                            </div>
                        )}
        
                        {entries?.length === 0 && (
                            <p
                                className='text-2xl text-ink text-center'
                            >
                                You have not played any scenarios yet
                            </p>
                        )}
        
                        {entries && entries.length > 0 && (
                            <div className='overflow-y-auto overscroll-contain'>
                                <ul className="flex flex-col gap-3">
                                    {entries.map((entry) => (
                                        <HistoryRow
                                            key={entry.runId}
                                            entry={entry}
                                            onOpen={() => navigate(`/scenario_search?scenario=${encodeURIComponent(entry.scenarioId)}`)}
                                            onPlay={() => navigate(`/play/${encodeURIComponent(entry.scenarioId)}`)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
                {view === "multiplayer" && (
                    <>
                        {error && (
                            <p role="alert">
                                {error}
                            </p>
                        )}

                        {loading && (
                            <div className="flex h-full flex-col items-center justify-center gap-4">
                                <div className="h-32 w-32 animate-spin rounded-full border-10 border-accent-start border-t-transparent"></div>
                                <p className="text-center text-4xl py-4">
                                    Loading recent activity...
                                </p>
                            </div>
                        )}

                        {!loading && !error && events.length === 0 && (
                            <p
                                className='text-2xl text-ink text-center'
                            >
                                You have not played any online matches yet
                            </p>
                        )}

                        <div className='h-1/6 overflow-y-auto overscroll-contain'>
                            {events.map((event) => (
                                <RatingResult key={event.matchId} event={event} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </section>
    )
}