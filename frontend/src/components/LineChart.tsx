import { useEffect, useMemo, useRef, useState } from "react"

/** The most series one chart draws: --chart-series-1 to -8 in index.css. */
export const MAX_SERIES = 8

const HEIGHT = 260
const MARGIN = { top: 16, right: 20, bottom: 28, left: 60 }
// Used until the first measurement, and in tests, where there is no ResizeObserver.
const FALLBACK_WIDTH = 640
const MIN_WIDTH = 240

export interface ChartPoint {
    /** Position along the x axis, e.g. epoch milliseconds. */
    x: number
    /** Never negative: the y axis always starts at zero. */
    y: number
    /** Extra context for the tooltip and table, e.g. "3 attempts". */
    detail?: string
}

export interface ChartSeries {
    id: string
    label: string
    /**
     * Which color slot (0-7) this series wears. Tie it to the entity, not its position in
     * the current list, so a filter that hides other series never repaints this one.
     */
    slot: number
    points: ChartPoint[]
}

type LineChartProps = {
    series: ChartSeries[]
    /** Names the chart for screen readers and captions the table view. */
    title: string
    /** Column headers for the table view, e.g. { x: "Date", y: "Score", series: "Scenario" }. */
    labels: { x: string; y: string; series: string }
    formatX: (x: number) => string
    formatY: (y: number) => string
    emptyMessage?: string
    /** Dims the chart while newer data loads, instead of flashing a loading state. */
    stale?: boolean
}

function seriesColor(slot: number): string {
    return `var(--chart-series-${(slot % MAX_SERIES) + 1})`
}

/** The next step up the 1-2-5 ladder from `value`, so axis ticks land on round numbers. */
function niceStep(value: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(value))
    const scaled = value / magnitude
    const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
    return nice * magnitude
}

/** Up to five of `xs`, spread evenly, for the x axis labels. */
function pickXTicks(xs: number[]): number[] {
    if (xs.length <= 5) return xs
    return [0, 1, 2, 3, 4].map((i) => xs[Math.round((i * (xs.length - 1)) / 4)])
}

/**
 * A line chart with one line per series, a hover/keyboard crosshair, a legend for two or
 * more series, and a table view, so no value is only reachable by hovering.
 */
export function LineChart({
    series,
    title,
    labels,
    formatX,
    formatY,
    emptyMessage = "No data for this range",
    stale = false,
}: LineChartProps) {
    const wrapper = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(FALLBACK_WIDTH)
    const [activeIndex, setActiveIndex] = useState<number | null>(null)
    const [showTable, setShowTable] = useState(false)

    useEffect(() => {
        const element = wrapper.current
        if (!element || typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(([entry]) => {
            setWidth(Math.max(MIN_WIDTH, entry.contentRect.width))
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const visible = useMemo(
        () =>
            series
                .filter((item) => item.points.length > 0)
                .map((item) => ({ ...item, points: [...item.points].sort((a, b) => a.x - b.x) })),
        [series],
    )
    // Every x any series has a point at; the crosshair snaps to these.
    const xs = useMemo(
        () => [...new Set(visible.flatMap((item) => item.points.map((point) => point.x)))].sort((a, b) => a - b),
        [visible],
    )
    const rows = useMemo(
        () =>
            visible
                .flatMap((item) => item.points.map((point) => ({ series: item, point })))
                .sort((a, b) => a.point.x - b.point.x || a.series.label.localeCompare(b.series.label)),
        [visible],
    )

    const plotWidth = width - MARGIN.left - MARGIN.right
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
    const xMin = xs[0] ?? 0
    const xMax = xs[xs.length - 1] ?? 0
    // A single x sits in the middle rather than on the left edge.
    const xPos = (x: number) =>
        MARGIN.left + (xMax === xMin ? plotWidth / 2 : ((x - xMin) / (xMax - xMin)) * plotWidth)

    const maxY = Math.max(0, ...rows.map((row) => row.point.y))
    const yStep = niceStep(maxY > 0 ? maxY / 4 : 1)
    const yTop = Math.max(yStep, Math.ceil(maxY / yStep) * yStep)
    const yTicks = Array.from({ length: Math.round(yTop / yStep) + 1 }, (_, i) => i * yStep)
    const yPos = (y: number) => MARGIN.top + plotHeight - (y / yTop) * plotHeight

    const activeX = activeIndex === null ? null : (xs[activeIndex] ?? null)
    const readout =
        activeX === null
            ? []
            : visible.flatMap((item) => {
                  const point = item.points.find((candidate) => candidate.x === activeX)
                  return point ? [{ series: item, point }] : []
              })

    function nearestIndex(px: number): number {
        let best = 0
        for (let i = 1; i < xs.length; i++) {
            if (Math.abs(xPos(xs[i]) - px) < Math.abs(xPos(xs[best]) - px)) best = i
        }
        return best
    }

    function handleKeyDown(event: React.KeyboardEvent) {
        if (xs.length === 0) return
        const last = xs.length - 1
        const current = activeIndex ?? last
        const next =
            event.key === "ArrowLeft" ? Math.max(0, current - 1)
            : event.key === "ArrowRight" ? Math.min(last, current + 1)
            : event.key === "Home" ? 0
            : event.key === "End" ? last
            : null
        if (next === null) return
        event.preventDefault()
        setActiveIndex(next)
    }

    const toggle = (
        <button
            type="button"
            onClick={() => setShowTable((shown) => !shown)}
            className="self-end rounded-lg border-2 border-accent-start px-3 py-1 text-sm font-semibold text-ink hover:bg-accent-start"
        >
            {showTable ? "Show chart" : "Show table"}
        </button>
    )

    if (rows.length === 0) {
        return (
            <div ref={wrapper} className="w-full">
                <div
                    className="flex items-center justify-center rounded-xl border-2 border-dashed border-accent-start text-muted"
                    style={{ height: HEIGHT }}
                >
                    {emptyMessage}
                </div>
            </div>
        )
    }

    return (
        <div ref={wrapper} className={`flex w-full flex-col gap-3 ${stale ? "opacity-60" : ""}`}>
            {visible.length > 1 && (
                <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
                    {visible.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="inline-block h-0.5 w-4 rounded-full"
                                style={{ background: seriesColor(item.slot) }}
                            />
                            {item.label}
                        </li>
                    ))}
                </ul>
            )}

            {showTable ? (
                <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm text-ink">
                        <caption className="sr-only">{title}</caption>
                        <thead className="text-left text-xs uppercase tracking-wide text-muted">
                            <tr>
                                <th className="py-1 font-semibold">{labels.x}</th>
                                <th className="py-1 font-semibold">{labels.series}</th>
                                <th className="py-1 text-right font-semibold">{labels.y}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ series: item, point }) => (
                                <tr key={`${item.id}-${point.x}`} className="border-t border-accent-start/50">
                                    <td className="py-1.5">{formatX(point.x)}</td>
                                    <td className="py-1.5">{item.label}</td>
                                    <td className="py-1.5 text-right tabular-nums">
                                        {formatY(point.y)}
                                        {point.detail && (
                                            <span className="ml-2 text-xs text-muted">{point.detail}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="relative">
                    <svg
                        width={width}
                        height={HEIGHT}
                        viewBox={`0 0 ${width} ${HEIGHT}`}
                        role="img"
                        aria-label={`${title}. Use the left and right arrow keys to read each point.`}
                        tabIndex={0}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setActiveIndex((current) => current ?? xs.length - 1)}
                        onBlur={() => setActiveIndex(null)}
                        className="block max-w-full overflow-visible rounded-lg"
                    >
                        {yTicks.map((tick) => (
                            <g key={tick}>
                                <line
                                    x1={MARGIN.left}
                                    x2={MARGIN.left + plotWidth}
                                    y1={yPos(tick)}
                                    y2={yPos(tick)}
                                    stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}
                                    strokeWidth={1}
                                />
                                <text
                                    x={MARGIN.left - 8}
                                    y={yPos(tick)}
                                    textAnchor="end"
                                    dominantBaseline="middle"
                                    fill="var(--color-muted)"
                                    fontSize={11}
                                    style={{ fontVariantNumeric: "tabular-nums" }}
                                >
                                    {formatY(tick)}
                                </text>
                            </g>
                        ))}

                        {pickXTicks(xs).map((tick) => (
                            <text
                                key={tick}
                                x={xPos(tick)}
                                y={HEIGHT - 8}
                                textAnchor="middle"
                                fill="var(--color-muted)"
                                fontSize={11}
                            >
                                {formatX(tick)}
                            </text>
                        ))}

                        {activeX !== null && (
                            <line
                                x1={xPos(activeX)}
                                x2={xPos(activeX)}
                                y1={MARGIN.top}
                                y2={MARGIN.top + plotHeight}
                                stroke="var(--color-muted)"
                                strokeWidth={1}
                            />
                        )}

                        {visible.map((item) => (
                            <g key={item.id} data-testid="chart-series">
                                {item.points.length > 1 && (
                                    <path
                                        d={item.points
                                            .map((point, i) => `${i === 0 ? "M" : "L"}${xPos(point.x)},${yPos(point.y)}`)
                                            .join(" ")}
                                        fill="none"
                                        stroke={seriesColor(item.slot)}
                                        strokeWidth={2}
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                )}
                                {item.points.map((point) => (
                                    <circle
                                        key={point.x}
                                        cx={xPos(point.x)}
                                        cy={yPos(point.y)}
                                        r={point.x === activeX ? 5 : 4}
                                        fill={seriesColor(item.slot)}
                                        // A ring in the surface color keeps dots legible where lines cross.
                                        stroke="var(--color-base-start)"
                                        strokeWidth={2}
                                    />
                                ))}
                            </g>
                        ))}

                        {/* Covers the plot so the pointer only has to be near a date, not on a line. */}
                        <rect
                            x={MARGIN.left}
                            y={MARGIN.top}
                            width={plotWidth}
                            height={plotHeight}
                            fill="transparent"
                            onPointerMove={(event) => {
                                // Screen pixels to chart units, in case the SVG is drawn scaled.
                                const rect = event.currentTarget.getBoundingClientRect()
                                const offset = ((event.clientX - rect.left) / rect.width) * plotWidth
                                setActiveIndex(nearestIndex(MARGIN.left + offset))
                            }}
                            onPointerLeave={() => setActiveIndex(null)}
                        />
                    </svg>

                    {activeX !== null && readout.length > 0 && (
                        <div
                            role="status"
                            className="pointer-events-none absolute top-0 z-10 min-w-40 -translate-x-1/2 rounded-lg border-2 border-accent-start bg-base-start px-3 py-2 text-sm text-ink shadow-lg"
                            style={{ left: Math.min(Math.max(xPos(activeX), 90), width - 90) }}
                        >
                            <div className="mb-1 text-xs text-muted">{formatX(activeX)}</div>
                            {readout.map(({ series: item, point }) => (
                                <div key={item.id} className="flex items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className="inline-block h-0.5 w-3 shrink-0 rounded-full"
                                        style={{ background: seriesColor(item.slot) }}
                                    />
                                    <span className="font-bold tabular-nums">{formatY(point.y)}</span>
                                    <span className="truncate text-muted">{item.label}</span>
                                    {point.detail && <span className="text-xs text-muted">{point.detail}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {toggle}
        </div>
    )
}
