import { formatTopPercent, type LeaderboardEntry, type LeaderboardResponse } from "@/lib/leaderboards"

type LeaderboardStatProps = {
    label: string
    /** Narrower column, for compact rows. */
    compact?: boolean
    children: React.ReactNode
}

/** A labelled value in a leaderboard row; same look as the stats on the scenario search page. */
export function LeaderboardStat({ label, compact = false, children }: LeaderboardStatProps) {
    return (
        <div className={compact ? "w-20" : "w-24"}>
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold text-ink">{children}</dd>
        </div>
    )
}

// Gold, silver and bronze for the podium; everyone else gets the plain rank.
const PODIUM_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"]

type LeaderboardRowProps = {
    entry: LeaderboardEntry
    /** The caller's own row. */
    highlighted: boolean
    /** Smaller text and padding, for narrow spots like the scenario details panel. */
    compact?: boolean
    /** The board-specific stats, as LeaderboardStat elements. */
    children: React.ReactNode
}

export function LeaderboardRow({ entry, highlighted, compact = false, children }: LeaderboardRowProps) {
    return (
        <li
            aria-current={highlighted ? "true" : undefined}
            className={`
                flex
                items-center
                rounded-xl
                bg-linear-to-r
                from-accent-base-start
                via-accent-base-middle
                to-accent-base-end
                ${compact ? "gap-2 border-2 px-3 py-2" : "gap-4 border-3 px-5 py-3"}
                ${highlighted ? "border-white" : "border-accent-start"}
            `}
        >
            <div
                className={`
                    shrink-0
                    font-bold
                    ${compact ? "w-10 text-lg" : "w-14 text-2xl"}
                    ${PODIUM_COLORS[entry.ranking - 1] ?? "text-ink"}
                `}
            >
                #{entry.ranking}
            </div>

            <div className={`min-w-0 flex-1 truncate font-bold text-ink ${compact ? "text-base" : "text-xl"}`}>
                {entry.displayName}
                {highlighted && <span className="ml-2 text-sm font-normal text-muted">(you)</span>}
            </div>

            <dl className={`flex text-center ${compact ? "gap-1 text-xs" : "gap-4 text-sm"}`}>{children}</dl>
        </li>
    )
}

type MyStandingProps = {
    board: LeaderboardResponse
    /** What to say when the caller has no entry at all. */
    emptyMessage: string
}

/**
 * Pinned under the list: the caller's rank and percentile when their row isn't
 * already visible in the list, or a nudge when they have no entry.
 */
export function MyStanding({ board, emptyMessage }: MyStandingProps) {
    const { myEntry, entries, percentile, totalPlayers } = board
    const visibleInList = myEntry !== null && entries.some((entry) => entry.uid === myEntry.uid)
    if (visibleInList) return null

    return (
        <div className="shrink-0 border-t-3 border-accent-start bg-accent-base-start px-5 py-4 text-ink">
            {myEntry === null ? (
                <p className="text-center text-muted">{emptyMessage}</p>
            ) : (
                <p className="text-center text-lg">
                    You're <span className="font-bold">#{myEntry.ranking}</span> of {totalPlayers}
                    {percentile !== null && (
                        <span className="ml-2 font-bold text-yellow-400">
                            {formatTopPercent(percentile)}
                        </span>
                    )}
                </p>
            )}
        </div>
    )
}
