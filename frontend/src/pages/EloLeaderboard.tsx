import { useEffect, useState } from "react"

import { BackButton } from "@/components/BackButton"
import { LeaderboardRow, LeaderboardStat, MyStanding } from "@/components/Leaderboard"
import { ProfileButton } from "@/components/ProfileButton"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth/useAuth"
import type { LeaderboardResponse } from "@/lib/leaderboards"
import { INSTRUMENTS, type Instrument } from "@/lib/schema/types"

const controlClass =
    "rounded-lg border-2 border-accent bg-white px-3 py-2 text-black"

/** Top players by ELO for one instrument, with the caller's own standing highlighted. */
export function EloLeaderboard() {
    const { user, profile } = useAuth()

    const [instrument, setInstrument] = useState<Instrument>("piano")

    // Tagged with the instrument it was fetched for, so switching instruments shows
    // "loading" instead of the previous instrument's board. board is null if the fetch failed.
    const [loaded, setLoaded] = useState<{
        instrument: Instrument
        board: LeaderboardResponse | null
    } | null>(null)
    const current = loaded?.instrument === instrument ? loaded : null

    useEffect(() => {
        let cancelled = false
        apiFetch<LeaderboardResponse>(`/leaderboards/elo?instrument=${instrument}`)
            .then((board) => {
                if (!cancelled) setLoaded({ instrument, board })
            })
            .catch((err) => {
                console.error(err)
                if (!cancelled) setLoaded({ instrument, board: null })
            })
        return () => {
            cancelled = true
        }
    }, [instrument])

    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header
                className={`
                    flex
                    items-center
                    justify-between
                    bg-linear-to-r
                    from-accent-base-start from-10
                    via-accent-base-middle via-80
                    to-accent-base-end to-90
                    border-b-4 border-accent-start
                    py-6
                `}
            >
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Leaderboards</h1>
                </div>

                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>

            <div className="px-12 pt-6 pb-6 flex-1 min-h-0 flex">
                <section className={`
                    mx-auto
                    w-full
                    max-w-5xl
                    rounded-xl
                    border-4
                    border-accent-start
                    overflow-hidden
                    flex
                    flex-col
                `}>
                    <header className={`
                        flex
                        items-center
                        justify-between
                        gap-4
                        px-4 py-5
                        bg-linear-to-b
                        from-accent-start from-50
                        via-accent-middle
                        to-accent-end to-70
                        brightness-110
                        border-b-3
                        border-accent-start
                    `}>
                        <h2 className="text-2xl font-bold text-ink">Top players by ELO</h2>
                        <div className="flex items-center gap-4">
                            {current?.board && (
                                <span className="text-sm text-ink">
                                    {current.board.totalPlayers} ranked player
                                    {current.board.totalPlayers === 1 ? "" : "s"}
                                </span>
                            )}
                            <select
                                value={instrument}
                                onChange={(e) => setInstrument(e.target.value as Instrument)}
                                aria-label="Instrument"
                                className={`capitalize ${controlClass}`}
                            >
                                {INSTRUMENTS.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </header>

                    <div className={`
                        flex-1
                        min-h-0
                        overflow-y-auto
                        bg-linear-to-br
                        from-accent-start from-50
                        via-accent-middle
                        to-accent-end to-70
                        brightness-90
                        px-4
                        py-4
                    `}>
                        {current === null ? (
                            <p className="py-8 text-center text-muted">Loading leaderboard…</p>
                        ) : current.board === null ? (
                            <p className="py-8 text-center text-muted">Couldn't load the leaderboard.</p>
                        ) : current.board.entries.length === 0 ? (
                            <p className="py-8 text-center text-muted">
                                No ranked <span className="capitalize">{instrument}</span> players yet.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {current.board.entries.map((entry) => (
                                    <LeaderboardRow
                                        key={entry.uid}
                                        entry={entry}
                                        highlighted={entry.uid === user?.uid}
                                    >
                                        <LeaderboardStat label="ELO">{Math.round(entry.key)}</LeaderboardStat>
                                        <LeaderboardStat label="Tier">
                                            <span className="capitalize">{entry.skillRating?.tier ?? "—"}</span>
                                        </LeaderboardStat>
                                        <LeaderboardStat label="Games">
                                            {entry.skillRating?.gamesPlayed ?? "—"}
                                            {entry.skillRating?.isProvisional && (
                                                <span
                                                    title="Provisional: fewer than 10 games played"
                                                    className="ml-1 text-xs font-normal text-muted"
                                                >
                                                    (prov.)
                                                </span>
                                            )}
                                        </LeaderboardStat>
                                    </LeaderboardRow>
                                ))}
                            </ul>
                        )}
                    </div>

                    {current?.board && (
                        <MyStanding
                            board={current.board}
                            emptyMessage={`Play an online ${instrument} match to get ranked.`}
                        />
                    )}
                </section>
            </div>
        </main>
    )
}
