/**
 * Play test: the author plays the chart they are editing, exactly as a player would, without
 * leaving the editor or saving anything.
 *
 * It runs the real ScenarioPlayer on the draft in hand, unsaved edits included, and scores the
 * take under the rules a new version is saved with. No run is written, so a play test never
 * touches a leaderboard or the scenario's play count.
 */
import { useEffect, useState } from 'react'

import { ScenarioPlayer, type FinishedRun } from '@/components/ScenarioPlayer'
import { ScoreReport } from '@/components/ScoreReport'
import { buildTimeline } from '@/lib/play/timeline'
import { getUserSettings } from '@/lib/profile/UserSettings'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import { NoteHighway } from '@/pages/play/NoteHighway'
import type { ScenarioDraft } from '@/pages/scenario_editor/draft'

const BUTTON_CLASS =
  'rounded-lg border-2 border-base-middle px-6 py-3 font-bold text-ink transition-colors ' +
  'hover:border-accent-start hover:bg-accent-base-middle'

interface PlayTestProps {
  draft: ScenarioDraft
  /** Whose input latency setting to play with; null plays with none. */
  uid: string | null
  onClose: () => void
}

export function PlayTest({ draft, uid, onClose }: PlayTestProps) {
  const [latencyMs, setLatencyMs] = useState(0)
  const [run, setRun] = useState<FinishedRun | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    // Settings are optional: play with no latency correction if they can't be read.
    getUserSettings(uid)
      .then((settings) => {
        if (!cancelled) setLatencyMs(settings.inputLatencyOffsetMs ?? 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [uid])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  // The part the piano roll edits.
  const notes = draft.chart.parts[0]?.notes ?? []
  const tempoMap = draft.chart.tempoMap

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="play-test-title"
        className="flex max-h-full w-full max-w-2xl flex-col items-center gap-5 overflow-y-auto
          rounded-xl border-4 border-accent-start bg-base-start p-6"
      >
        <div className="flex w-full items-start justify-between gap-4">
          <div>
            <h2 id="play-test-title" className="text-2xl font-bold text-ink">
              Play test{draft.title.trim() ? `: ${draft.title.trim()}` : ''}
            </h2>
            <p className="text-sm text-muted">
              A preview of your scenario as a player gets it. Nothing here is saved or ranked.
            </p>
          </div>
          <button type="button" onClick={onClose} className={BUTTON_CLASS}>
            Back to editor
          </button>
        </div>

        {run ? (
          <>
            <ScoreReport finalScore={run.result.finalScore} explanation={run.explanation} />
            <div className="w-full max-w-xl">
              <NoteHighway
                timeline={buildTimeline({ notes, tempoMap })}
                verdicts={
                  new Map(
                    run.result.breakdown.noteResults.map((result) => [
                      result.expectedNoteIndex,
                      result.verdict,
                    ]),
                  )
                }
              />
            </div>
            <button type="button" onClick={() => setRun(null)} className={BUTTON_CLASS}>
              Play again
            </button>
          </>
        ) : (
          <ScenarioPlayer
            expected={notes}
            tempoMap={tempoMap}
            rules={DEFAULT_SCORING_RULES}
            defaultInstrument={draft.instrument}
            latencyMs={latencyMs}
            onFinish={setRun}
          />
        )}
      </div>
    </div>
  )
}
