/**
 * The input latency setting: how many milliseconds to take off every note a player's
 * microphone picks up, so a note played on the beat is scored on the beat.
 *
 * The value can be typed in, or measured: Calibrate plays a run of clicks, the player plays a
 * note on each, and the typical gap between click and note becomes the setting. It is stored
 * on userSettings/{uid}, where the play page and the editor's play test read it.
 */
import { useEffect, useRef, useState } from 'react'

import { openAudioInput, type AudioInput } from '@/audio/input'
import { estimateLatencyMs, MAX_LATENCY_MS } from '@/lib/play/latency'
import { scheduleClicks } from '@/lib/play/metronome'
import { loadInputLatencyMs, saveInputLatencyMs } from '@/lib/play/settings'

const CLICKS = 8
const INTERVAL_SECONDS = 0.75
/** Gap before the first click, and how long to keep listening after the last. */
const LEAD_IN_SECONDS = 0.5
const TAIL_SECONDS = 0.3

const FIELD_CLASS =
  'w-28 rounded-lg border-2 border-accent-start bg-base-start px-3 py-2 text-ink ' +
  'disabled:opacity-50'
const BUTTON_CLASS =
  'rounded-xl border-3 border-accent-start px-6 py-3 font-bold text-ink ' +
  'hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

type Status =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'saved'; message: string }
  | { kind: 'error'; message: string }

function microphoneError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was blocked. Allow it for this site, then try again.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found.'
  }
  return error instanceof Error ? error.message : 'Could not open the microphone.'
}

export function InputLatencySetting({ uid }: { uid: string }) {
  const [latencyMs, setLatencyMs] = useState(0)
  /** The value last read from or written to the database. */
  const [savedMs, setSavedMs] = useState(0)
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  const input = useRef<AudioInput | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
      void input.current?.stop()
      input.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadInputLatencyMs(uid)
      .then((value) => {
        if (cancelled) return
        setLatencyMs(value)
        setSavedMs(value)
        setStatus({ kind: 'idle' })
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'error', message: 'Could not load your settings.' })
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  async function save(value: number, message: string) {
    try {
      await saveInputLatencyMs(uid, value)
      if (!mounted.current) return
      setSavedMs(value)
      setStatus({ kind: 'saved', message })
    } catch {
      if (mounted.current) setStatus({ kind: 'error', message: 'Could not save your settings.' })
    }
  }

  async function calibrate() {
    setStatus({ kind: 'listening' })
    let opened: AudioInput
    try {
      opened = await openAudioInput()
    } catch (error) {
      if (mounted.current) setStatus({ kind: 'error', message: microphoneError(error) })
      return
    }
    if (!mounted.current) {
      void opened.stop()
      return
    }
    input.current = opened

    const first = opened.context.currentTime + LEAD_IN_SECONDS
    const clickTimes = Array.from({ length: CLICKS }, (_, k) => first + k * INTERVAL_SECONDS)
    scheduleClicks(
      opened.context,
      clickTimes.map((time) => ({ time, accent: false })),
    )
    opened.takeNotes()

    timer.current = setTimeout(
      () => {
        const onsets = opened.takeNotes().map((note) => note.startTime)
        void opened.stop()
        input.current = null
        const estimate = estimateLatencyMs(clickTimes, onsets)
        if (estimate === null) {
          setStatus({
            kind: 'error',
            message: 'Not enough notes were heard on the clicks. Check the microphone and retry.',
          })
          return
        }
        setLatencyMs(estimate)
        void save(estimate, `Measured ${estimate} ms and saved.`)
      },
      (LEAD_IN_SECONDS + CLICKS * INTERVAL_SECONDS + TAIL_SECONDS) * 1000,
    )
  }

  const busy = status.kind === 'loading' || status.kind === 'listening'

  return (
    <section
      aria-labelledby="input-latency-title"
      className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border-3 border-accent-start
        bg-base-middle p-6"
    >
      <div>
        <h2 id="input-latency-title" className="text-2xl font-bold text-ink">
          Input latency
        </h2>
        <p className="text-sm text-muted">
          The delay between playing a note and the app hearing it. It is subtracted from every note
          when a scenario is scored, so set it once per microphone and speaker setup.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">
          Latency (ms)
          <input
            className={FIELD_CLASS}
            type="number"
            min={0}
            max={MAX_LATENCY_MS}
            value={latencyMs}
            disabled={busy}
            onChange={(event) => {
              const value = Math.round(Number(event.target.value) || 0)
              setLatencyMs(Math.min(MAX_LATENCY_MS, Math.max(0, value)))
              setStatus({ kind: 'idle' })
            }}
          />
        </label>
        <button
          type="button"
          className={`${BUTTON_CLASS} bg-accent-start`}
          disabled={busy || latencyMs === savedMs}
          onClick={() => void save(latencyMs, 'Saved.')}
        >
          Save
        </button>
        <button
          type="button"
          className={`${BUTTON_CLASS} bg-base-start`}
          disabled={busy}
          onClick={() => void calibrate()}
        >
          Calibrate
        </button>
      </div>

      <p role="status" className="min-h-5 text-sm text-ink">
        {status.kind === 'loading' && 'Loading your settings…'}
        {status.kind === 'listening' &&
          `Play one short note on each of the ${CLICKS} clicks. Use headphones if you can.`}
        {(status.kind === 'saved' || status.kind === 'error') && status.message}
      </p>
    </section>
  )
}
