import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"

import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { ScenarioLeaderboard } from "@/components/ScenarioLeaderboard"
import { ScenarioPlayer, type FinishedRun } from "@/components/ScenarioPlayer"
import { ScoreReport } from "@/components/ScoreReport"
import { StarPicker } from "@/components/StarRating"
import { ApiError, apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth/useAuth"
import { buildTimeline, resolveScoringRules } from "@/lib/play/timeline"
import { getUserSettings } from "@/lib/profile/UserSettings"
import { submitRun, type SubmittedRun } from "@/lib/runs/store"
import { loadScenario } from "@/lib/scenarios/store"
import type { ExpectedNote, Instrument, ScenarioReview, ScoringRules, TempoMapEntry } from "@/lib/schema/types"
import { NoteHighway } from "@/pages/play/NoteHighway"

// Matches ReviewUpsert.comment's max_length in backend/app/schemas.py.
const MAX_COMMENT_LENGTH = 200

// Only the fields the form uses; the API sends timestamps as ISO strings, not Firestore Timestamps.
type ExistingReview = Pick<ScenarioReview, "rating" | "comment">

/** What the player needs from the scenario, its current version, and the user's settings. */
type PlayableScenario = {
    title: string
    versionId: string
    partId: string
    expected: ExpectedNote[]
    tempoMap: TempoMapEntry[]
    rules: ScoringRules
    instrument: Instrument
    latencyMs: number
}

const buttonClass = `
    rounded-xl
    border-3
    border-accent-start
    px-6
    py-3
    text-lg
    font-bold
    active:scale-[0.98]
    disabled:cursor-not-allowed
    disabled:opacity-50
`

/** What the results screen says about the run's trip to the leaderboard. */
function saveMessage(saved: SubmittedRun | null, saveError: string | null): string {
    if (saveError) return saveError
    if (!saved) return "Saving your run…"
    if (saved.validation === "rejected") {
        return `This run was not accepted${saved.reason ? `: ${saved.reason}` : ""}.`
    }
    if (saved.validation === "pending") {
        return "Run saved, but it could not be checked for the leaderboard yet."
    }
    return "Run saved to the leaderboard."
}

/**
 * Plays a scenario, saves the scored run, then shows the score, where you
 * landed on the leaderboard, and lets you rate the scenario.
 */
export function PlayScenario() {
    const { scenarioId } = useParams()
    // The version being played; the search page passes the scenario's current one.
    const [searchParams] = useSearchParams()
    const versionId = searchParams.get("version")
    const { user, profile } = useAuth()
    const navigate = useNavigate()

    const [phase, setPhase] = useState<"playing" | "results">("playing")
    const [ratingOpen, setRatingOpen] = useState(false)
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [playable, setPlayable] = useState<PlayableScenario | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [run, setRun] = useState<FinishedRun | null>(null)
    const [saved, setSaved] = useState<SubmittedRun | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)

    useEffect(() => {
        if (!scenarioId || !user) return
        async function load(id: string, uid: string) {
            try {
                const { scenario, version } = await loadScenario(id, versionId)
                const part = version?.chart.parts.find((candidate) => candidate.notes.length > 0)
                const notes = part?.notes ?? []
                if (!version || !part || notes.length === 0) {
                    setLoadError("This scenario has no notes to play yet.")
                    return
                }
                // Settings are optional: play with defaults if they can't be read.
                const settings = await getUserSettings(uid).catch(() => null)
                setPlayable({
                    title: scenario.title,
                    versionId: version.id,
                    partId: part.partId,
                    expected: notes,
                    tempoMap: version.chart.tempoMap,
                    rules: resolveScoringRules(version.scoringRules),
                    instrument: scenario.instrument,
                    latencyMs: settings?.inputLatencyOffsetMs ?? 0,
                })
            } catch (err) {
                setLoadError(err instanceof Error ? err.message : "Could not load this scenario.")
            }
        }
        void load(scenarioId, user.uid)
    }, [scenarioId, versionId, user])

    function finishRun(finished: FinishedRun) {
        setRun(finished)
        setSaved(null)
        setSaveError(null)
        setPhase("results")
        if (!scenarioId || !playable) return
        submitRun({
            uid: user?.uid ?? null,
            scenarioId,
            scenarioVersionId: playable.versionId,
            instrument: finished.instrument,
            partId: playable.partId,
            speedMultiplier: 1,
            scoringRules: playable.rules,
            finalScore: finished.result.finalScore,
            breakdown: finished.result.breakdown,
        })
            .then(setSaved)
            .catch((err) => {
                console.error(err)
                setSaveError("Your run could not be saved.")
            })
    }

    // Pre-fill the form if the user has rated this scenario before.
    useEffect(() => {
        if (!scenarioId) return
        apiFetch<ExistingReview | null>(`/ratings/${scenarioId}/my-rating`)
            .then((review) => {
                if (review) {
                    setRating(review.rating)
                    setComment(review.comment)
                }
            })
            .catch(console.error)
    }, [scenarioId])

    async function submitRating() {
        setSubmitting(true)
        setError(null)
        try {
            await apiFetch(`/ratings/${scenarioId}`, {
                method: "PUT",
                body: JSON.stringify({ rating, comment }),
            })
            setSubmitted(true)
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not submit your rating.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className="h-screen flex flex-col">
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
                    <h1 className="ml-4 text-4xl font-bold text-ink">Play Scenario</h1>
                </div>

                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>

            {phase === "playing" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
                    <p className="text-3xl font-bold text-ink">{playable?.title ?? "Play scenario"}</p>
                    {playable && (
                        <ScenarioPlayer
                            expected={playable.expected}
                            tempoMap={playable.tempoMap}
                            rules={playable.rules}
                            defaultInstrument={playable.instrument}
                            latencyMs={playable.latencyMs}
                            onFinish={finishRun}
                        />
                    )}
                    {!playable && !loadError && <p className="text-muted">Loading scenario…</p>}
                    {loadError && (
                        <>
                            <p className="text-muted">{loadError}</p>
                            <button
                                type="button"
                                onClick={() => setPhase("results")}
                                className={`${buttonClass} bg-accent-start text-ink hover:brightness-110`}
                            >
                                Skip to results
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="flex flex-1 min-h-0 flex-col items-center gap-4 overflow-y-auto px-6 py-6">
                    <h2 className="text-3xl font-bold text-ink">Results</h2>

                    {run && (
                        <ScoreReport finalScore={run.result.finalScore} explanation={run.explanation} />
                    )}
                    {run && playable && (
                        <div className="flex w-full max-w-xl shrink-0 flex-col gap-2">
                            <NoteHighway
                                timeline={buildTimeline({ notes: playable.expected, tempoMap: playable.tempoMap })}
                                verdicts={
                                    new Map(
                                        run.result.breakdown.noteResults.map((result) => [
                                            result.expectedNoteIndex,
                                            result.verdict,
                                        ]),
                                    )
                                }
                            />
                            <p role="status" className="text-center text-sm font-semibold text-ink">
                                {saveMessage(saved, saveError)}
                            </p>
                        </div>
                    )}

                    {/* TODO: highlight the run just played; the highlighted row is the player's best run. */}
                    <section className={`
                        min-h-64
                        w-full
                        max-w-xl
                        shrink-0
                        rounded-xl
                        border-3
                        border-accent-start
                        bg-linear-to-br
                        from-accent-base-start from-50
                        via-accent-base-middle
                        to-accent-base-end to-70
                        px-5
                        py-4
                    `}>
                        <h3 className="mb-3 text-lg font-bold text-ink">Leaderboard</h3>
                        {/* Remounts once the run is decided, so the board includes it. */}
                        {scenarioId && (
                            <ScenarioLeaderboard
                                key={saved?.runId ?? "unsaved"}
                                scenarioId={scenarioId}
                                versionId={playable?.versionId ?? versionId}
                            />
                        )}
                    </section>

                    <div className="flex w-full max-w-xl gap-4">
                        <button
                            type="button"
                            onClick={() => {
                                setRun(null)
                                setPhase("playing")
                            }}
                            className={`${buttonClass} flex-1 bg-white text-black hover:brightness-95`}
                        >
                            Play again
                        </button>
                        <button
                            type="button"
                            onClick={() => setRatingOpen(true)}
                            className={`${buttonClass} flex-1 bg-accent-start text-ink hover:brightness-110`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {ratingOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rating-title"
                        className={`
                            flex
                            w-full
                            max-w-md
                            flex-col
                            items-center
                            gap-5
                            rounded-xl
                            border-4
                            border-accent-start
                            bg-linear-to-br
                            from-accent-base-start from-50
                            via-accent-base-middle
                            to-accent-base-end to-70
                            p-6
                        `}
                    >
                        {submitted ? (
                            <h2 id="rating-title" className="text-2xl font-bold text-ink">
                                Rating submitted!
                            </h2>
                        ) : (
                            <>
                                <h2 id="rating-title" className="text-2xl font-bold text-ink">
                                    Rate this scenario
                                </h2>

                                <StarPicker value={rating} onChange={setRating} />

                                <div className="w-full">
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        maxLength={MAX_COMMENT_LENGTH}
                                        rows={4}
                                        placeholder="Write a review (optional)"
                                        aria-label="Review"
                                        className="w-full resize-none rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black"
                                    />
                                    <p className="text-right text-xs text-muted">
                                        {comment.length}/{MAX_COMMENT_LENGTH}
                                    </p>
                                </div>

                                {error && <p className="text-sm text-red-400">{error}</p>}

                                <button
                                    type="button"
                                    onClick={submitRating}
                                    disabled={rating === 0 || submitting}
                                    className={`${buttonClass} w-full bg-accent-start text-ink hover:brightness-110`}
                                >
                                    {submitting ? "Submitting…" : "Submit"}
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => navigate("/home")}
                            className={`${buttonClass} w-full bg-white text-black hover:brightness-95`}
                        >
                            Go back to home
                        </button>
                    </div>
                </div>
            )}
        </main>
    )
}
