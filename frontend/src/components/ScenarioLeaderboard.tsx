import { useEffect, useState } from "react"

import { LeaderboardRow, LeaderboardStat, MyStanding } from "@/components/Leaderboard"
import { RangeSlider } from "@/components/RangeSlider"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth/useAuth"
import type { LeaderboardResponse } from "@/lib/leaderboards"

const DAY_MS = 24 * 60 * 60 * 1000
// Wait for the slider to settle before refetching, instead of one request per pixel dragged.
const DATE_FILTER_DEBOUNCE_MS = 300

type ScenarioLeaderboardProps = {
    scenarioId: string
    /** The scenario's current version; null if it has no playable version yet. */
    versionId: string | null
}

/**
 * Best full-speed score per player on one scenario version, with an optional
 * played-at date range. Render it with key={scenarioId} so switching scenarios
 * starts fresh, date range included.
 */
export function ScenarioLeaderboard({ scenarioId, versionId }: ScenarioLeaderboardProps) {
    const { user } = useAuth()

    // What the slider shows right now, as epoch ms; null means "all time".
    const [dateRange, setDateRange] = useState<[number, number] | null>(null)
    // The same range once it has stopped moving; this is what the fetch uses.
    const [appliedRange, setAppliedRange] = useState<[number, number] | null>(null)

    useEffect(() => {
        const timer = setTimeout(() => setAppliedRange(dateRange), DATE_FILTER_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [dateRange])

    const query = versionId === null ? null : buildQuery(scenarioId, versionId, appliedRange)

    // The last board we received, tagged with the query that produced it. While a new
    // date range loads we keep showing the old board (marked stale) rather than flashing
    // "loading" on every slider move. board is null if that fetch failed.
    const [loaded, setLoaded] = useState<{ query: string; board: LeaderboardResponse | null } | null>(null)
    const isStale = loaded !== null && loaded.query !== query

    useEffect(() => {
        if (query === null) return
        let cancelled = false
        apiFetch<LeaderboardResponse>(query)
            .then((board) => {
                if (!cancelled) setLoaded({ query, board })
            })
            .catch((err) => {
                console.error(err)
                if (!cancelled) setLoaded({ query, board: null })
            })
        return () => {
            cancelled = true
        }
    }, [query])

    // Slider bounds, snapped to whole days so the thumbs can land exactly on both ends.
    const board = loaded?.board ?? null
    const bounds = board ? dayBounds(board) : null

    if (versionId === null) {
        return <p className="text-sm italic text-muted">No scores yet.</p>
    }

    return (
        <div className="flex flex-col gap-3">
            {bounds && (
                <div>
                    <RangeSlider
                        label="Played between"
                        min={bounds[0]}
                        max={bounds[1]}
                        step={DAY_MS}
                        value={dateRange ?? bounds}
                        onChange={setDateRange}
                        formatValue={(ms) => new Date(ms).toLocaleDateString()}
                    />
                    {dateRange && (
                        <button
                            type="button"
                            onClick={() => setDateRange(null)}
                            className="mt-1 text-xs text-muted underline hover:text-ink"
                        >
                            Show all time
                        </button>
                    )}
                </div>
            )}

            {loaded === null ? (
                <p className="text-sm text-muted">Loading leaderboard…</p>
            ) : board === null ? (
                <p className="text-sm text-muted">Couldn't load the leaderboard.</p>
            ) : (
                // Faded while a new date range loads, instead of blanking the list.
                <div className={`flex flex-col gap-3 transition-opacity ${isStale ? "opacity-50" : ""}`}>
                    {board.entries.length === 0 ? (
                        <p className="text-sm italic text-muted">
                            {dateRange ? "No scores in this date range." : "No scores yet."}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {board.entries.map((entry) => (
                                <LeaderboardRow
                                    key={entry.uid}
                                    entry={entry}
                                    highlighted={entry.uid === user?.uid}
                                    compact
                                >
                                    <LeaderboardStat label="Score" compact>
                                        {Math.round(entry.key).toLocaleString()}
                                    </LeaderboardStat>
                                    <LeaderboardStat label="Date" compact>
                                        {entry.run ? new Date(entry.run.playedAt).toLocaleDateString() : "—"}
                                    </LeaderboardStat>
                                </LeaderboardRow>
                            ))}
                        </ul>
                    )}

                    <div className="overflow-hidden rounded-xl">
                        <MyStanding
                            board={board}
                            emptyMessage={
                                dateRange
                                    ? "You have no runs in this date range."
                                    : "Play this scenario to get on the board."
                            }
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

/** The API path for one board; also the key that tells us whether a result is current. */
function buildQuery(scenarioId: string, versionId: string, range: [number, number] | null): string {
    const params = new URLSearchParams()
    if (range) {
        params.set("played_after", new Date(range[0]).toISOString())
        params.set("played_before", new Date(range[1]).toISOString())
    }
    const search = params.toString()
    return `/leaderboards/${scenarioId}/${versionId}${search ? `?${search}` : ""}`
}

/**
 * [start of the first day, end of the last day] that any run was played on, as
 * epoch ms, or null if nobody has played this version yet.
 */
function dayBounds(board: LeaderboardResponse): [number, number] | null {
    if (board.earliestPlayedAt === null || board.latestPlayedAt === null) return null
    const start = new Date(board.earliestPlayedAt)
    start.setHours(0, 0, 0, 0)
    const end = new Date(board.latestPlayedAt)
    end.setHours(0, 0, 0, 0)
    return [start.getTime(), end.getTime() + DAY_MS]
}
