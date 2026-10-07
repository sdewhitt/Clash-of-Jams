import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"

import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { ScenarioLeaderboard } from "@/components/ScenarioLeaderboard"
import { StarPicker } from "@/components/StarRating"
import { ApiError, apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth/useAuth"
import { VERDICT_LABEL } from "@/lib/play/verdicts"
import { submitRun, type SubmittedRun } from "@/lib/runs/store"
import { loadScenario, type LoadedScenario } from "@/lib/scenarios/store"
import type { HitVerdict, ScenarioReview } from "@/lib/schema/types"
import { NoteHighway } from "@/pages/play/NoteHighway"
import { PlayStage, type PlayOutcome } from "@/pages/play/PlayStage"

// Matches ReviewUpsert.comment's max_length in backend/app/schemas.py.
const MAX_COMMENT_LENGTH = 200

// Only the fields the form uses; the API sends timestamps as ISO strings, not Firestore Timestamps.
type ExistingReview = Pick<ScenarioReview, "rating" | "comment">

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

// Shown beside the score, in the order a player cares about them.
const REVIEW_VERDICTS: HitVerdict[] = ["hit", "early", "late", "wrong_pitch", "missed"]

/** What the results screen says about the run's trip to the leaderboard. */
function saveMessage(saved: SubmittedRun | null, saveError: string | null, fullSpeed: boolean): string {
    if (saveError) return saveError
    if (!saved) return "Saving your run…"
    if (saved.validation === "rejected") {
        return `This run was not accepted${saved.reason ? `: ${saved.reason}` : ""}.`
    }
    if (saved.validation === "pending") {
        return "Run saved, but it could not be checked for the leaderboard yet."
    }
    return fullSpeed ? "Run saved to the leaderboard." : "Run saved. Only full-speed runs are ranked."
}

/**
 * Everything around one run of a scenario: load the version, play it
 * (PlayStage), save the scored run, see where it landed on the leaderboard,
 * then rate the scenario.
 */
export function PlayScenario() {
    const { scenarioId } = useParams()
    // The version being played; the search page passes the scenario's current one.
    const [searchParams] = useSearchParams()
    const versionId = searchParams.get("version")
    const { user, profile } = useAuth()
    const navigate = useNavigate()

    const [phase, setPhase] = useState<"playing" | "results">("playing")
    const [loaded, setLoaded] = useState<LoadedScenario | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [outcome, setOutcome] = useState<PlayOutcome | null>(null)
    const [saved, setSaved] = useState<SubmittedRun | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [ratingOpen, setRatingOpen] = useState(false)
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!scenarioId) return
        let cancelled = false
        loadScenario(scenarioId, versionId)
            .then((result) => {
                if (!cancelled) setLoaded(result)
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load this scenario.")
            })
        return () => {
            cancelled = true
        }
    }, [scenarioId, versionId])

    const version = loaded?.version ?? null

    function finishRun(played: PlayOutcome) {
        setOutcome(played)
        setSaved(null)
        setSaveError(null)
        setPhase("results")
        if (!scenarioId || !version) return
        submitRun({
            uid: user?.uid ?? null,
            scenarioId,
            scenarioVersionId: version.id,
            instrument: played.instrument,
            partId: played.partId,
            speedMultiplier: played.speedMultiplier,
            scoringRules: played.scoringRules,
            finalScore: played.score.finalScore,
            breakdown: played.score.breakdown,
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
                    <h1 className="ml-4 text-4xl font-bold text-ink">{loaded?.scenario.title ?? "Play Scenario"}</h1>
                </div>

                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>

            {phase === "playing" ? (
                <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-6">
                    {loadError ? (
                        <p role="alert" className="text-lg text-ink">{loadError}</p>
                    ) : !loaded ? (
                        <p className="text-lg text-muted">Loading scenario…</p>
                    ) : !version ? (
                        <p className="text-lg text-muted">This scenario has no playable version yet.</p>
                    ) : (
                        <PlayStage version={version} uid={user?.uid ?? null} onFinish={finishRun} />
                    )}
                </div>
            ) : (
                <div className="flex flex-1 min-h-0 flex-col items-center gap-4 overflow-y-auto px-6 py-6">
                    <h2 className="text-3xl font-bold text-ink">Results</h2>

                    {outcome && (
                        <section className="flex w-full max-w-4xl flex-col gap-3">
                            <div className="flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2">
                                <p className="text-6xl font-bold tabular-nums text-ink" aria-label="Final score">
                                    {outcome.score.finalScore}
                                </p>
                                <ScoreStat label="Pitch" value={outcome.score.breakdown.pitchAccuracy} />
                                <ScoreStat label="Rhythm" value={outcome.score.breakdown.rhythmAccuracy} />
                                <ScoreStat label="Completeness" value={outcome.score.breakdown.completeness} />
                                <ScoreStat label="Extra notes" value={outcome.score.breakdown.extraNotes} />
                            </div>
                            <p className="text-center text-sm text-muted">
                                {REVIEW_VERDICTS.map((verdict) => {
                                    const count = outcome.score.breakdown.noteResults.filter(
                                        (result) => result.verdict === verdict,
                                    ).length
                                    return `${VERDICT_LABEL[verdict]} ${count}`
                                }).join(" · ")}
                            </p>
                            <NoteHighway
                                timeline={outcome.timeline}
                                verdicts={
                                    new Map(
                                        outcome.score.breakdown.noteResults.map((result) => [
                                            result.expectedNoteIndex,
                                            result.verdict,
                                        ]),
                                    )
                                }
                            />
                            <p role="status" className="text-center text-sm font-semibold text-ink">
                                {saveMessage(saved, saveError, outcome.speedMultiplier === 1)}
                            </p>
                        </section>
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
                                versionId={version?.id ?? versionId}
                            />
                        )}
                    </section>

                    <div className="flex w-full max-w-xl gap-4">
                        <button
                            type="button"
                            onClick={() => setPhase("playing")}
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

function ScoreStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex flex-col items-center">
            <span className="text-xs text-muted">{label}</span>
            <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
        </div>
    )
}
