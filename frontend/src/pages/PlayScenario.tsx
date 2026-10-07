import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"

import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { ScenarioLeaderboard } from "@/components/ScenarioLeaderboard"
import { StarPicker } from "@/components/StarRating"
import { ApiError, apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth/useAuth"
import type { ScenarioReview } from "@/lib/schema/types"

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

/**
 * Stand-in for scenario gameplay until it exists. Walks through what happens
 * around a run: play (a Finish button for now), see where you landed on the
 * leaderboard, then rate the scenario.
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
                <div className="flex flex-1 flex-col items-center justify-center gap-6">
                    <p className="text-3xl font-bold text-ink">Play scenario</p>
                    {/* Stands in for the end of a real run. */}
                    <button
                        type="button"
                        onClick={() => setPhase("results")}
                        className={`${buttonClass} bg-accent-start text-ink hover:brightness-110`}
                    >
                        Finish
                    </button>
                </div>
            ) : (
                <div className="flex flex-1 min-h-0 flex-col items-center gap-4 px-6 py-6">
                    <h2 className="text-3xl font-bold text-ink">Results</h2>

                    {/* TODO: highlight the run just played once runs can be created in the app;
                        until then the highlighted row is the player's best run. */}
                    <section className={`
                        min-h-0
                        w-full
                        max-w-xl
                        flex-1
                        overflow-y-auto
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
                        {scenarioId && <ScenarioLeaderboard scenarioId={scenarioId} versionId={versionId} />}
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
