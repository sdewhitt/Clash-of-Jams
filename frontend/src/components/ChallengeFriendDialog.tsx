import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { apiFetch } from "@/lib/api";
import type { Scenario } from "@/lib/schema/types";
import { acceptFriendMatchInvitation, createFriendMatchInvitation } from "@/lib/matchmaking/gameInvitation";

type ScenarioWithAuthor = {
    scenario: Scenario;
    authorName: string;
};

type ChallengeFriendDialogProps =
    | {
        mode: "challenge";
        friendUid: string;
        onClose: () => void;
    }
    | {
        mode: "accept";
        invitationId: string;
        onClose: () => void;
    };

export function ChallengeFriendDialog(props: ChallengeFriendDialogProps) {
    const navigate = useNavigate();

    const [scenarios, setScenarios] = useState<ScenarioWithAuthor[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isAccepting = props.mode === "accept";

    useEffect(() => {
        let cancelled = false;

        async function loadScenarios() {
            try {
                setLoading(true);
                setError(null);

                const result = await apiFetch<ScenarioWithAuthor[]>("/scenarios/scenario_with_author");

                if (!cancelled) {
                    setScenarios(result);
                }
            } catch (err) {
                console.error("Failed to load scenarios:", err);

                if (!cancelled) {
                    setError("Unable to load available scenarios.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void loadScenarios();

        return () => {
            cancelled = true;
        };
    }, []);

    const selectedScenario =
        scenarios.find(({ scenario }) => scenario.id === selectedId) ?? null;

    async function handleSubmit() {
        if (!selectedScenario || submitting) return;

        const { scenario } = selectedScenario;
        const versionId = scenario.currentVersionId;

        if (!versionId) {
            setError("This scenario does not have a playable version.");
            return;
        }

        try {
            setSubmitting(true);
            setError(null);

            if (props.mode === "challenge") {
                const response = await createFriendMatchInvitation({
                    toUid: props.friendUid,
                    scenarioId: scenario.id,
                    scenarioVersionId: versionId,
                });

                props.onClose();

                navigate(`/multiplayer/friend-invitations/${encodeURIComponent(response.invitationId)}`, { replace: true });
                return;
            }

            const response = await acceptFriendMatchInvitation({
                invitationId: props.invitationId,
                scenarioId: scenario.id,
                scenarioVersionId: versionId,
            });

            if (!response.matchId) {
                setError(
                    "The invitation was processed, but no match was returned. Please check your notifications."
                );
                return;
            }

            navigate(
                `/multiplayer/${encodeURIComponent(response.matchId)}`,
                { replace: true }
            );
        } catch (err) {
            console.error(
                isAccepting
                    ? "Failed to accept invitation:"
                    : "Failed to send challenge:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : isAccepting
                        ? "Unable to accept this invitation."
                        : "Unable to send your challenge."
            );
        } finally {
            setSubmitting(false);
        }
    }

    const title = isAccepting ? "Accept Friend Challenge" : "Challenge Friend";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !submitting) {
                    props.onClose();
                }
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="challenge-dialog-title"
                className={`
                    w-full max-w-xl
                    max-h-[85vh]
                    overflow-y-auto
                    rounded-2xl
                    bg-radial
                    from-contrast-start
                    via-contrast-middle 
                    to-contrast-end
                    border-2 border-accent-start
                    bg-surface
                    p-6
                    shadow-2xl
                `}
            >
                <header className="mb-5 flex items-center justify-between border-b-2">
                    <h2
                        id="challenge-dialog-title"
                        className="text-2xl font-bold text-ink"
                    >
                        {title}
                    </h2>

                    <button
                        type="button"
                        onClick={props.onClose}
                        disabled={submitting}
                        aria-label="Close dialog"
                        className="text-xl text-muted hover:text-ink disabled:opacity-50"
                    >
                        ✕
                    </button>
                </header>

                <p className="mb-4 text-sm text-ink">
                    {isAccepting
                        ? "Choose a scenario to play against your friend. The game will randomly select between your scenario and theirs."
                        : "Choose a scenario to challenge your friend with."}
                </p>

                {loading ? (
                    <p className="py-8 text-center text-muted">
                        Loading scenarios...
                    </p>
                ) : error && scenarios.length === 0 ? (
                    <p className="py-8 text-center text-red-400">
                        {error}
                    </p>
                ) : scenarios.length === 0 ? (
                    <p className="py-8 text-center text-muted">
                        You don't have any available scenarios.
                    </p>
                ) : (
                    <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
                        {scenarios.map(({ scenario, authorName }) => {
                            const selected = scenario.id === selectedId;
                            const playable = Boolean( scenario.currentVersionId );
                            if (playable) {
                                return (
                                    <li key={scenario.id}>
                                        <button
                                            type="button"
                                            disabled={!playable || submitting}
                                            onClick={() => {
                                                setSelectedId(scenario.id);
                                                setError(null);
                                            }}
                                            aria-pressed={selected}
                                            className={`
                                                w-full rounded-xl border-2 p-4 text-left
                                                bg-radial
                                                from-accent-start
                                                via-accent-middle 
                                                to-accent-end
                                                transition-colors
                                                disabled:cursor-not-allowed
                                                disabled:opacity-80
                                                ${
                                                    selected
                                                        ? "border-accent-soft brightness-80"
                                                        : "border-line hover:border-accent-start"
                                                }
                                            `}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-semibold text-ink">
                                                    {scenario.title}
                                                </span>

                                                {selected && (
                                                    <span className="text-sm text-accent-soft">
                                                        Selected
                                                    </span>
                                                )}
                                            </div>

                                            <p className="mt-1 text-sm text-ink">
                                                by {authorName} for {scenario.instrument}
                                            </p>
                                        </button>
                                    </li>
                                );
                            }
                            else {
                                return;
                            }
                        })}
                    </ul>
                )}

                {error && scenarios.length > 0 && (
                    <p role="alert" className="mt-4 text-sm font-bold text-center text-ink">
                        {error}
                    </p>
                )}

                <footer className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={props.onClose}
                        disabled={submitting}
                        className="
                            rounded-lg
                            bg-radial
                            from-accent-start
                            via-accent-middle 
                            to-accent-end
                            px-5 py-2 font-semibold text-inverse-ink
                            border border-2 border-ink
                            hover:brightness-110
                            disabled:cursor-not-allowed
                            disabled:opacity-80
                        "
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={
                            !selectedScenario ||
                            !selectedScenario.scenario.currentVersionId ||
                            submitting ||
                            loading
                        }
                        className="
                            rounded-lg
                            bg-radial
                            from-accent-start
                            via-accent-middle 
                            to-accent-end
                            px-5 py-2 font-semibold text-inverse-ink
                            border border-2 border-ink
                            hover:brightness-110
                            disabled:cursor-not-allowed
                            disabled:opacity-80
                        "
                    >
                        {submitting
                            ? isAccepting
                                ? "Accepting..."
                                : "Sending..."
                            : isAccepting
                                ? "Accept Challenge"
                                : "Send Challenge"}
                    </button>
                </footer>
            </section>
        </div>
    );
}