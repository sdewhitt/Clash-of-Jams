import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"

import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
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
 * Stand-in for scenario gameplay until it exists. All it does is offer the
 * post-play rating popup, so ratings can be exercised end to end.
 */
export function PlayScenario() {
    const { scenarioId } = useParams()
    const { user, profile } = useAuth()
    const navigate = useNavigate()

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

            <div className="flex flex-1 flex-col items-center justify-center gap-6">
                <p className="text-3xl font-bold text-ink">Play scenario</p>
                <button
                    type="button"
                    onClick={() => setRatingOpen(true)}
                    className={`${buttonClass} bg-accent-start text-ink hover:brightness-110`}
                >
                    Rate this scenario
                </button>
            </div>

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
                                        className="w-full resize-none rounded-lg border-2 border-accent bg-white px-3 py-2 text-black"
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
