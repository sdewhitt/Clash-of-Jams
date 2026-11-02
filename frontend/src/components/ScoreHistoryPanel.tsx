import { useEffect, useState } from "react"

import {
    fetchScenarioScoreHistory,
    type ScenarioScoreHistory,
    type ScoreSort,
    type SortOrder,
} from "@/lib/runs/history"

const SORT_OPTIONS = [
    { value: "date", label: "Date" },
    { value: "score", label: "Score" },
] as const

const ORDER_LABELS: Record<ScoreSort, Record<SortOrder, string>> = {
    date: { desc: "Newest first", asc: "Oldest first" },
    score: { desc: "Highest first", asc: "Lowest first" },
}

const controlClass = "rounded-lg border-2 border-accent-start bg-white px-2 py-1 text-sm text-black"

function formatScore(score: number): string {
    return score.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatImprovement(improvement: number | null): string {
    if (improvement === null) return "—"
    return `${improvement > 0 ? "+" : ""}${formatScore(improvement)}`
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums text-ink">{children}</dd>
        </div>
    )
}

type ScoreHistoryPanelProps = {
    scenarioId: string
}

/**
 * User story #35: the signed-in user's own attempts on one scenario, with summary stats.
 * Render it with key={scenarioId} so switching scenarios starts fresh, sort included.
 */
export function ScoreHistoryPanel({ scenarioId }: ScoreHistoryPanelProps) {
    const [sort, setSort] = useState<ScoreSort>("date")
    const [order, setOrder] = useState<SortOrder>("desc")
    const query = `${sort}:${order}`

    // The last history we received, tagged with the sort that produced it. While a new sort
    // loads we keep showing the old rows (marked stale) instead of flashing "loading".
    // history is null if that fetch failed.
    const [loaded, setLoaded] = useState<{ query: string; history: ScenarioScoreHistory | null } | null>(null)
    const isStale = loaded !== null && loaded.query !== query

    useEffect(() => {
        let cancelled = false
        const requested = `${sort}:${order}`
        fetchScenarioScoreHistory(scenarioId, sort, order)
            .then((history) => {
                if (!cancelled) setLoaded({ query: requested, history })
            })
            .catch((err) => {
                console.error(err)
                if (!cancelled) setLoaded({ query: requested, history: null })
            })
        return () => {
            cancelled = true
        }
    }, [scenarioId, sort, order])

    if (loaded === null) {
        return <p className="text-sm text-muted">Loading your scores…</p>
    }
    if (loaded.history === null) {
        return <p className="text-sm text-muted">Couldn't load your scores.</p>
    }

    const { stats, attempts } = loaded.history
    if (attempts.length === 0) {
        return <p className="text-sm italic text-muted">No attempts yet.</p>
    }

    return (
        <div className={`flex flex-col gap-3 ${isStale ? "opacity-60" : ""}`}>
            {stats ? (
                <dl aria-label="Score summary" className="grid grid-cols-5 gap-2 text-center text-sm">
                    <Stat label="Best">{formatScore(stats.bestScore)}</Stat>
                    <Stat label="Average">{formatScore(stats.averageScore)}</Stat>
                    <Stat label="Latest">{formatScore(stats.mostRecentScore)}</Stat>
                    <Stat label="Attempts">{stats.attemptCount}</Stat>
                    <Stat label="Improvement">{formatImprovement(stats.improvement)}</Stat>
                </dl>
            ) : (
                <p className="text-sm text-muted">None of your attempts have counted yet.</p>
            )}

            <div className="flex items-center justify-end gap-2 text-sm text-ink">
                <label className="flex items-center gap-2">
                    Sort by
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as ScoreSort)}
                        className={controlClass}
                    >
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
                    className={`${controlClass} cursor-pointer`}
                >
                    {ORDER_LABELS[sort][order]}
                </button>
            </div>

            <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm text-ink">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted">
                        <tr>
                            <th className="py-1 font-semibold">Played</th>
                            <th className="py-1 font-semibold">Instrument</th>
                            <th className="py-1 text-right font-semibold">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {attempts.map((attempt) => (
                            <tr key={attempt.runId} className="border-t border-accent-start/50">
                                <td className="py-1.5">
                                    {new Date(attempt.playedAt).toLocaleString(undefined, {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                    })}
                                </td>
                                <td className="py-1.5 capitalize">{attempt.instrument}</td>
                                <td className="py-1.5 text-right tabular-nums">
                                    {formatScore(attempt.finalScore)}
                                    {attempt.validation === "rejected" && (
                                        <span className="ml-1 text-xs text-muted">(not counted)</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
