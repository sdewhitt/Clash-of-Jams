import { useEffect, useState } from "react"

import { LineChart, MAX_SERIES, type ChartSeries } from "@/components/LineChart"
import { fetchScoreTrends, type ScoreTrends } from "@/lib/runs/history"
import { INSTRUMENTS, type Instrument } from "@/lib/schema/types"

const DAY_MS = 24 * 60 * 60 * 1000

// Date range first, presets before anything custom.
const TIME_RANGES = [
    { value: "all", label: "All time", days: null },
    { value: "7", label: "Last 7 days", days: 7 },
    { value: "30", label: "Last 30 days", days: 30 },
    { value: "90", label: "Last 90 days", days: 90 },
] as const

type TimeRange = (typeof TIME_RANGES)[number]["value"]

const controlClass = "rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-sm text-black capitalize"

/** "2026-09-01" as epoch ms at UTC midnight, so the day never shifts with the browser's timezone. */
function dayToMs(day: string): number {
    const [year, month, date] = day.split("-").map(Number)
    return Date.UTC(year, month - 1, date)
}

function formatDay(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

function formatScore(score: number): string {
    return score.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/**
 * One line per scenario. A scenario's color comes from its place in the unfiltered list, so
 * filtering never repaints the lines that are left. Only the eight most recently played
 * scenarios get a line at once; picking a scenario in the filter shows any of the others.
 */
function buildSeries(trends: ScoreTrends): { series: ChartSeries[]; hidden: number } {
    const withPoints = trends.scenarios
        .map((scenario, index) => ({
            scenario,
            index,
            points: trends.points.filter((point) => point.scenarioId === scenario.scenarioId),
        }))
        .filter(({ points }) => points.length > 0)

    const series = withPoints.slice(0, MAX_SERIES).map(({ scenario, index, points }) => ({
        id: scenario.scenarioId,
        label: scenario.title ?? "Unavailable scenario",
        // A scenario past the first eight only ever shows alone, so slot 1 can't clash.
        slot: index < MAX_SERIES ? index : 0,
        points: points.map((point) => ({
            x: dayToMs(point.day),
            y: point.bestScore,
            detail: `${point.attempts} ${point.attempts === 1 ? "attempt" : "attempts"} · avg ${formatScore(point.averageScore)}`,
        })),
    }))
    return { series, hidden: withPoints.length - series.length }
}

/** User story #33: the caller's best score per day on each scenario, with filters. */
export function ScoreTrendsChart() {
    const [timeRange, setTimeRange] = useState<TimeRange>("all")
    const [scenarioId, setScenarioId] = useState("")
    const [instrument, setInstrument] = useState<Instrument | "">("")
    const query = `${timeRange}|${scenarioId}|${instrument}`

    // The last trends we received, tagged with the filters that produced them, so a refetch
    // keeps the chart on screen (dimmed) instead of flashing a loading state.
    const [loaded, setLoaded] = useState<{ query: string; trends: ScoreTrends | null } | null>(null)
    const isStale = loaded !== null && loaded.query !== query

    useEffect(() => {
        let cancelled = false
        const requested = `${timeRange}|${scenarioId}|${instrument}`
        const days = TIME_RANGES.find((range) => range.value === timeRange)?.days ?? null
        fetchScoreTrends({
            scenarioId: scenarioId || null,
            instrument: instrument || null,
            playedAfter: days === null ? null : new Date(Date.now() - days * DAY_MS).toISOString(),
        })
            .then((trends) => {
                if (!cancelled) setLoaded({ query: requested, trends })
            })
            .catch((err) => {
                console.error(err)
                if (!cancelled) setLoaded({ query: requested, trends: null })
            })
        return () => {
            cancelled = true
        }
    }, [timeRange, scenarioId, instrument])

    const trends = loaded?.trends ?? null
    const { series, hidden } = trends ? buildSeries(trends) : { series: [], hidden: 0 }

    return (
        <section aria-labelledby="score-trends-title" className="flex flex-col gap-4 rounded-xl border-3 border-accent-start bg-base-start p-5">
            <h2 id="score-trends-title" className="text-xl font-bold">Score trends</h2>

            <div className="flex flex-wrap gap-3">
                <select
                    aria-label="Time range"
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                    className={controlClass}
                >
                    {TIME_RANGES.map((range) => (
                        <option key={range.value} value={range.value}>
                            {range.label}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Scenario"
                    value={scenarioId}
                    onChange={(e) => setScenarioId(e.target.value)}
                    className={controlClass}
                >
                    <option value="">All scenarios</option>
                    {(trends?.scenarios ?? []).map((scenario) => (
                        <option key={scenario.scenarioId} value={scenario.scenarioId}>
                            {scenario.title ?? "Unavailable scenario"}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Instrument"
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value as Instrument | "")}
                    className={controlClass}
                >
                    <option value="">All instruments</option>
                    {INSTRUMENTS.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
            </div>

            {loaded === null ? (
                <p className="text-muted">Loading your score trends…</p>
            ) : trends === null && !isStale ? (
                <p role="alert">Couldn&apos;t load your score trends.</p>
            ) : (
                <>
                    <LineChart
                        series={series}
                        title="Best score per day, by scenario"
                        labels={{ x: "Date", y: "Best score", series: "Scenario" }}
                        formatX={formatDay}
                        formatY={formatScore}
                        stale={isStale}
                    />
                    {hidden > 0 && (
                        <p className="text-sm text-muted">
                            Showing your {MAX_SERIES} most recently played scenarios. Pick a scenario
                            above to see the other {hidden}.
                        </p>
                    )}
                </>
            )}
        </section>
    )
}
