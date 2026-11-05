/**
 * The results screen's audio section (user story #37): download the run as a WAV file, with
 * the scenario's backing parts mixed in at a chosen volume. The file is built and saved on the
 * player's device; nothing is uploaded.
 *
 * The mix is only rendered when the player asks for it, since a long take is a lot of samples
 * to synthesize and encode, and a slider drag shouldn't redo that work on every step.
 */
import { useMemo, useState } from 'react'

import { isSilent } from '@/audio/mixdown'
import { renderRunAudio, runAudioFileName, type RunTake } from '@/audio/run-audio'
import { downloadBytes } from '@/lib/download'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

const DEFAULT_BACKING_VOLUME = 0.6

const buttonClass =
  'rounded-lg border-2 border-accent-start px-4 py-2 font-bold text-ink transition-colors ' +
  'hover:bg-accent-base-middle disabled:cursor-not-allowed disabled:opacity-50'

export interface RunAudioExportProps {
  title: string
  take: RunTake | undefined
  durationMs: number
  /** The scenario's other parts; empty when it has none, which hides the backing controls. */
  backing: readonly ExpectedNote[]
  tempoMap: TempoMapEntry[]
  /** When the run was played, for the file name. */
  playedAt: Date
}

export function RunAudioExport({
  title,
  take,
  durationMs,
  backing,
  tempoMap,
  playedAt,
}: RunAudioExportProps) {
  const [backingVolume, setBackingVolume] = useState(DEFAULT_BACKING_VOLUME)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const hasAudio = useMemo(() => {
    if (!take) return false
    if (take.kind === 'midi') return take.notes.length > 0
    return take.blocks.some((block) => !isSilent(block.samples))
  }, [take])
  const hasBacking = backing.length > 0

  function handleDownload() {
    if (!take) return
    setMessage(null)
    setBusy(true)
    // Lets "Preparing" paint before the synchronous render blocks the thread.
    setTimeout(() => {
      try {
        const audio = renderRunAudio({
          take,
          durationMs,
          backing,
          tempoMap,
          backingVolume: hasBacking ? backingVolume : 0,
        })
        if (!audio) {
          setMessage('No audio was recorded for this run, so there is nothing to export.')
          return
        }
        downloadBytes(audio.wav, runAudioFileName(title, playedAt), 'audio/wav')
      } finally {
        setBusy(false)
      }
    }, 0)
  }

  return (
    <section
      aria-label="Your recording"
      className="flex w-full max-w-xl shrink-0 flex-col gap-3 rounded-xl border-3
        border-accent-start bg-accent-base-start px-5 py-4 text-ink"
    >
      <h3 className="text-lg font-bold">Your recording</h3>

      {!hasAudio ? (
        <p className="text-sm text-muted">
          No audio was recorded for this run, so there is nothing to export.
        </p>
      ) : (
        <>
          {hasBacking && (
            <label className="flex items-center gap-3 text-sm font-semibold">
              Backing track
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(backingVolume * 100)}
                onChange={(event) => setBackingVolume(Number(event.target.value) / 100)}
                className="flex-1 accent-accent-start"
              />
              <span className="w-12 text-right tabular-nums">
                {backingVolume === 0 ? 'Off' : `${Math.round(backingVolume * 100)}%`}
              </span>
            </label>
          )}

          <button
            type="button"
            className={`${buttonClass} self-start`}
            disabled={busy}
            onClick={handleDownload}
          >
            {busy ? 'Preparing...' : 'Download audio'}
          </button>

          {message && <p className="text-sm text-muted">{message}</p>}
        </>
      )}
    </section>
  )
}
