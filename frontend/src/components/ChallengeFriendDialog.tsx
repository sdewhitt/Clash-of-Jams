
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Scenario } from "@/lib/schema/types";
import { createFriendMatchInvitation } from "@/lib/matchmaking/GameInvitation";

type ScenarioWithAuthor = {
    scenario: Scenario;
    authorName: string;
};

interface ChallengeFriendDialogProps {
    friendUid: string;
    onClose: () => void;
}

export function ChallengeFriendDialog({ friendUid, onClose, }: ChallengeFriendDialogProps) {
    const [scenarios, setScenarios] = useState<ScenarioWithAuthor[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadScenarios() {
            try {
                setLoading(true);
                setError(null);

                const result = await apiFetch<ScenarioWithAuthor[]>(
                    "/scenarios/scenario_with_author"
                );

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

    async function handleChallenge() {
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

            await createFriendMatchInvitation({
                toUid: friendUid,
                scenarioId: scenario.id,
                scenarioVersionId: versionId,
            });

            onClose();
        } catch (err) {
            console.error("Failed to send challenge:", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to send your challenge."
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !submitting) {
                    onClose();
                }
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="challenge-dialog-title"
                className="
                    w-full max-w-xl
                    max-h-[85vh]
                    overflow-y-auto
                    rounded-2xl
                    border-2 border-accent-start
                    bg-surface
                    p-6
                    shadow-2xl
                "
            >
                <header className="mb-5 flex items-center justify-between">
                    <h2
                        id="challenge-dialog-title"
                        className="text-2xl font-bold text-ink"
                    >
                        Challenge Friend
                    </h2>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close dialog"
                        className="text-xl text-muted hover:text-ink disabled:opacity-50"
                    >
                        ✕
                    </button>
                </header>

                <p className="mb-4 text-sm text-muted">
                    Choose a scenario to challenge your friend with.
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
                            const playable = Boolean(
                                scenario.currentVersionId
                            );

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
                                            transition-colors
                                            disabled:cursor-not-allowed
                                            disabled:opacity-80
                                            ${
                                                selected
                                                    ? "border-accent-soft bg-accent-start/30"
                                                    : "border-line bg-base hover:border-accent-start"
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

                                        <p className="mt-1 text-sm text-muted">
                                            by {authorName}
                                        </p>

                                        {!playable && (
                                            <p className="mt-2 text-xs text-red-400">
                                                No playable version available
                                            </p>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {error && scenarios.length > 0 && (
                    <p role="alert" className="mt-4 text-sm text-red-400">
                        {error}
                    </p>
                )}

                <footer className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="
                            rounded-lg border border-line
                            px-4 py-2 text-ink
                            hover:bg-base
                            disabled:opacity-80
                        "
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleChallenge}
                        disabled={
                            !selectedScenario ||
                            !selectedScenario.scenario.currentVersionId ||
                            submitting ||
                            loading
                        }
                        className="
                            rounded-lg bg-accent-start
                            px-5 py-2 font-semibold text-white
                            hover:brightness-110
                            disabled:cursor-not-allowed
                            disabled:opacity-80
                        "
                    >
                        {submitting ? "Sending..." : "Send Challenge"}
                    </button>
                </footer>
            </section>
        </div>
    );
}
