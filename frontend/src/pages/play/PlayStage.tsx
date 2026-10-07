/**
 * The gameplay screen for one scenario version: pick a part and a speed, hear a count-in, play
 * into the microphone while the chart scrolls past, and hand back a scored performance.
 *
 * Everything is timed on the microphone's AudioContext. Beat 0 is scheduled at a context time,
 * the metronome is scheduled against it and detected notes are stamped on it, so the score never
 * depends on when a frame happened to render. Saving the run is the caller's job.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { openAudioInput, type AudioInput } from '@/audio/input'
import { toPerformedNotes } from '@/audio/performance'
import { estimateLatencyMs, MAX_LATENCY_MS } from '@/lib/play/latency'
import { scheduleClicks } from '@/lib/play/metronome'
import { loadInputLatencyMs, saveInputLatencyMs } from '@/lib/play/settings'
import { buildTimeline, resolveScoringRules, type Timeline } from '@/lib/play/timeline'
import type { Instrument, ScenarioVersion, ScoringRules } from '@/lib/schema/types'
import { NoteHighway } from '@/pages/play/NoteHighway'
import { scorePerformance, type ScoreResult } from '@/scoring/score'

const SPEEDS = [0.5, 0.75, 1]
/** Gap between pressing Start and the first count-in click, so it is never clipped. */
const LEAD_IN_SECONDS = 0.3
/** How long to keep listening after the last note ends, for a late final note. */
const TAIL_MS = 600
/** Frames quieter or less clear than this don't move the live pitch marker. */
const LIVE_MIN_DB = -50
const LIVE_MIN_CLARITY = 0.8

const CALIBRATION_CLICKS = 8
const CALIBRATION_INTERVAL_SECONDS = 0.75

const button =
  'rounded-xl border-3 border-accent-start px-6 py-3 text-lg font-bold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
const field = 'rounded-lg border-2 border-accent-start bg-base-start px-3 py-2 text-ink'
const label = 'flex flex-col gap-1 text-sm text-muted'

/** A finished, scored performance and the settings it was played under. */
export interface PlayOutcome {
  partId: string
  instrument: Instrument
  speedMultiplier: number
  scoringRules: ScoringRules
  score: ScoreResult
  timeline: Timeline
}

interface PlayStageProps {
  version: ScenarioVersion
  uid: string | null
  onFinish: (outcome: PlayOutcome) => void
}

type Calibration = 'idle' | 'listening' | 'done' | 'failed'

function microphoneError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was blocked. Allow it for this site, then try again.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found.'
  }
  return error instanceof Error ? error.message : 'Could not open the microphone.'
}

export function PlayStage({ version, uid, onFinish }: PlayStageProps) {
  const parts = version.chart.parts
  const [partId, setPartId] = useState(
    () => (parts.find((part) => part.notes.length > 0) ?? parts[0])?.partId ?? '',
  )
  const [speed, setSpeed] = useState(1)
  const [metronome, setMetronome] = useState(true)
  const [latencyMs, setLatencyMs] = useState(0)
  const [status, setStatus] = useState<'idle' | 'starting' | 'playing'>('idle')
  const [countIn, setCountIn] = useState<number | null>(null)
  const [calibration, setCalibration] = useState<Calibration>('idle')
  const [error, setError] = useState<string | null>(null)

  const input = useRef<AudioInput | null>(null)
  /** AudioContext time of beat 0 while a run is in progress. */
  const startTime = useRef<number | null>(null)
  const livePitch = useRef<number | null>(null)
  const frame = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelClicks = useRef<(() => void) | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancelAnimationFrame(frame.current)
      clearTimeout(timer.current)
      cancelClicks.current?.()
      void input.current?.stop()
      input.current = null
    }
  }, [])

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    loadInputLatencyMs(uid)
      .then((saved) => {
        if (!cancelled) setLatencyMs(saved)
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [uid])

  const part = parts.find((candidate) => candidate.partId === partId)
  const tempoMap = version.chart.tempoMap
  const timeline = useMemo(
    () =>
      part && part.notes.length > 0 && tempoMap.length > 0
        ? buildTimeline({ notes: part.notes, tempoMap, speedMultiplier: speed })
        : null,
    [part, tempoMap, speed],
  )

  const getPositionMs = useCallback(() => {
    if (!input.current || startTime.current === null) return null
    return (input.current.context.currentTime - startTime.current) * 1000
  }, [])
  const getLivePitch = useCallback(() => livePitch.current, [])

  /** Opens the microphone on first use. Needs a user gesture, so only call it from a click. */
  async function ensureInput(): Promise<AudioInput> {
    if (input.current) return input.current
    const opened = await openAudioInput({
      onFrame: (f) => {
        const audible = f.midi !== null && f.db >= LIVE_MIN_DB && f.clarity >= LIVE_MIN_CLARITY
        livePitch.current = audible ? f.midi : null
      },
    })
    if (!mounted.current) {
      await opened.stop()
      throw new Error('Left the page before the microphone opened.')
    }
    input.current = opened
    return opened
  }

  function saveLatency(value: number) {
    if (uid) saveInputLatencyMs(uid, value).catch(console.error)
  }

  async function start() {
    if (!timeline || !part) return
    setError(null)
    setCalibration('idle')
    setStatus('starting')
    let opened: AudioInput
    try {
      opened = await ensureInput()
    } catch (err) {
      if (mounted.current) {
        setError(microphoneError(err))
        setStatus('idle')
      }
      return
    }

    const context = opened.context
    const countInMs = timeline.countInBeats * timeline.countInBeatMs
    const beatZero = context.currentTime + LEAD_IN_SECONDS + countInMs / 1000
    startTime.current = beatZero
    cancelClicks.current = scheduleClicks(
      context,
      timeline.clicks
        .filter((click) => metronome || click.ms < 0)
        .map((click) => ({ time: beatZero + click.ms / 1000, accent: click.accent })),
    )
    opened.takeNotes()
    setStatus('playing')

    const rules = resolveScoringRules(version.scoringRules)
    const tick = () => {
      const ms = (context.currentTime - beatZero) * 1000
      if (ms < timeline.endMs + TAIL_MS) {
        setCountIn(
          ms < 0 ? Math.min(timeline.countInBeats, Math.ceil(-ms / timeline.countInBeatMs)) : null,
        )
        frame.current = requestAnimationFrame(tick)
        return
      }
      startTime.current = null
      setStatus('idle')
      onFinish({
        partId: part.partId,
        instrument: part.instrument,
        speedMultiplier: speed,
        scoringRules: rules,
        timeline,
        score: scorePerformance({
          expected: part.notes,
          tempoMap: timeline.tempoMap,
          performed: toPerformedNotes(opened.takeNotes(), beatZero, latencyMs),
          rules,
          speedMultiplier: speed,
        }),
      })
    }
    frame.current = requestAnimationFrame(tick)
  }

  function stop() {
    cancelAnimationFrame(frame.current)
    cancelClicks.current?.()
    startTime.current = null
    input.current?.takeNotes()
    setCountIn(null)
    setStatus('idle')
  }

  async function calibrate() {
    setError(null)
    setCalibration('listening')
    let opened: AudioInput
    try {
      opened = await ensureInput()
    } catch (err) {
      if (mounted.current) {
        setError(microphoneError(err))
        setCalibration('idle')
      }
      return
    }

    const first = opened.context.currentTime + 0.5
    const clickTimes = Array.from(
      { length: CALIBRATION_CLICKS },
      (_, k) => first + k * CALIBRATION_INTERVAL_SECONDS,
    )
    cancelClicks.current = scheduleClicks(
      opened.context,
      clickTimes.map((time) => ({ time, accent: false })),
    )
    opened.takeNotes()
    timer.current = setTimeout(
      () => {
        const onsets = opened.takeNotes().map((note) => note.startTime)
        const estimate = estimateLatencyMs(clickTimes, onsets)
        if (estimate === null) {
          setCalibration('failed')
          return
        }
        setLatencyMs(estimate)
        saveLatency(estimate)
        setCalibration('done')
      },
      (0.5 + CALIBRATION_CLICKS * CALIBRATION_INTERVAL_SECONDS + 0.3) * 1000,
    )
  }

  const busy = status !== 'idle' || calibration === 'listening'

  if (parts.length === 0 || tempoMap.length === 0) {
    return <p className="text-lg text-muted">This scenario has no chart to play yet.</p>
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        {parts.length > 1 && (
          <label className={label}>
            Part
            <select
              className={field}
              value={partId}
              disabled={busy}
              onChange={(e) => setPartId(e.target.value)}
            >
              {parts.map((candidate) => (
                <option key={candidate.partId} value={candidate.partId}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={label}>
          Speed
          <select
            className={field}
            value={speed}
            disabled={busy}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value * 100}%
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Input latency (ms)
          <input
            className={`${field} w-28`}
            type="number"
            min={0}
            max={MAX_LATENCY_MS}
            value={latencyMs}
            disabled={busy}
            onChange={(e) =>
              setLatencyMs(Math.min(MAX_LATENCY_MS, Math.max(0, Number(e.target.value) || 0)))
            }
            onBlur={() => saveLatency(latencyMs)}
          />
        </label>
        <button
          type="button"
          className={`${field} font-semibold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={busy}
          onClick={calibrate}
        >
          Calibrate
        </button>
        <label className="flex items-center gap-2 py-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={metronome}
            disabled={busy}
            onChange={(e) => setMetronome(e.target.checked)}
          />
          Metronome
        </label>
      </div>

      {calibration === 'listening' && (
        <p className="text-sm text-ink">
          Play one short note on each of the {CALIBRATION_CLICKS} clicks.
        </p>
      )}
      {calibration === 'done' && (
        <p className="text-sm text-ink">Latency set to {latencyMs} ms and saved.</p>
      )}
      {calibration === 'failed' && (
        <p className="text-sm text-ink">
          Not enough notes were heard on the clicks. Check the microphone and try again.
        </p>
      )}

      {timeline ? (
        <div className="relative">
          <NoteHighway
            timeline={timeline}
            getPositionMs={getPositionMs}
            getLivePitch={getLivePitch}
          />
          {countIn !== null && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-bold text-ink"
            >
              {countIn}
            </div>
          )}
        </div>
      ) : (
        <p className="text-lg text-muted">This part has no notes to play.</p>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {status === 'playing' ? (
          <button
            type="button"
            className={`${button} bg-base-start text-ink hover:brightness-95`}
            onClick={stop}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={`${button} bg-accent-start text-ink hover:brightness-110`}
            disabled={!timeline || busy}
            onClick={start}
          >
            {status === 'starting' ? 'Opening microphone…' : 'Start'}
          </button>
        )}
        <p className="text-sm text-muted">
          Use headphones so the metronome stays out of the microphone.
          {speed !== 1 && ' Only full-speed runs count toward the leaderboard.'}
        </p>
      </div>
    </div>
  )
}
