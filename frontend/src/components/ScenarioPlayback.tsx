/**
 * Playback mode: hear and watch the scenario before playing it.
 *
 * The notes are synthesized on an AudioContext and the note highway follows that same clock, so
 * what is heard and what is shown cannot drift apart. Speed can change mid-playback: the
 * position is carried over in beats and the rest is rescheduled at the new speed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { SpeedControl } from '@/components/SpeedControl'
import { pitchName } from '@/lib/chart/notes'
import { scheduleClicks } from '@/lib/play/metronome'
import { planPlayback, schedulePlayback, soundingNotes } from '@/lib/play/playback'
import { buildTimeline, type Timeline } from '@/lib/play/timeline'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import { NoteHighway } from '@/pages/play/NoteHighway'

/** Scheduling a little ahead keeps the first note from being clipped. */
const LEAD_SECONDS = 0.1
/** Let the last note ring out before playback reports it has ended. */
const TAIL_MS = 400

type PlaybackStatus = 'stopped' | 'playing' | 'paused' | 'ended'

interface Session {
  context: AudioContext
  /** AudioContext time of scenario position 0 at the current speed. */
  startTime: number
  /** The timeline being played, at the speed it was scheduled with. */
  plan: Timeline
  silence: () => void
  frame: number
}

interface ScenarioPlaybackProps {
  expected: ExpectedNote[]
  tempoMap: TempoMapEntry[]
  speed: number
  onSpeedChange: (speed: number) => void
  onClose: () => void
}

const buttonClass = `
  rounded-xl
  border-3
  border-accent-start
  px-5
  py-2
  font-bold
  active:scale-[0.98]
  disabled:cursor-not-allowed
  disabled:opacity-50
`
const primaryButton = `${buttonClass} bg-accent-start text-ink hover:brightness-110`
const secondaryButton = `${buttonClass} bg-white text-black hover:brightness-95`

export function ScenarioPlayback({
  expected,
  tempoMap,
  speed,
  onSpeedChange,
  onClose,
}: ScenarioPlaybackProps) {
  const [status, setStatus] = useState<PlaybackStatus>('stopped')
  const [positionMs, setPositionMs] = useState(0)
  const [nowPlaying, setNowPlaying] = useState('')
  const [metronome, setMetronome] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const context = useRef<AudioContext | null>(null)
  const session = useRef<Session | null>(null)
  /** Where playback stands while paused or stopped. */
  const heldMs = useRef(0)
  const metronomeOn = useRef(false)

  const timeline = useMemo(
    () => buildTimeline({ notes: expected, tempoMap, speedMultiplier: speed }),
    [expected, tempoMap, speed],
  )

  const currentMs = useCallback(() => {
    const live = session.current
    return live ? (live.context.currentTime - live.startTime) * 1000 : heldMs.current
  }, [])
  const getLivePitch = useCallback(() => {
    const live = session.current
    if (!live) return null
    const sounding = soundingNotes(live.plan, currentMs())
    return sounding.length ? Math.max(...sounding.map(({ note }) => note.midiPitch)) : null
  }, [currentMs])

  const halt = useCallback(() => {
    const live = session.current
    if (!live) return
    session.current = null
    cancelAnimationFrame(live.frame)
    live.silence()
  }, [])

  useEffect(
    () => () => {
      halt()
      void context.current?.close()
      context.current = null
    },
    [halt],
  )

  /** Plays `plan` from scenario position `fromMs`, replacing whatever is playing. */
  async function playFrom(fromMs: number, plan: Timeline = timeline) {
    halt()
    setError(null)
    try {
      const audio = context.current ?? new AudioContext({ latencyHint: 'interactive' })
      context.current = audio
      await audio.resume()

      const startTime = audio.currentTime + LEAD_SECONDS - fromMs / 1000
      const silenceNotes = schedulePlayback(audio, planPlayback(plan, startTime, fromMs))
      const silenceClicks = metronomeOn.current
        ? scheduleClicks(
            audio,
            plan.clicks
              .filter((click) => click.ms >= 0 && click.ms >= fromMs)
              .map((click) => ({ time: startTime + click.ms / 1000, accent: click.accent })),
            0.12,
          )
        : () => {}
      const live: Session = {
        context: audio,
        startTime,
        plan,
        silence: () => {
          silenceNotes()
          silenceClicks()
        },
        frame: 0,
      }
      session.current = live
      setStatus('playing')

      const step = () => {
        if (session.current !== live) return
        const ms = currentMs()
        setPositionMs(ms)
        setNowPlaying(
          soundingNotes(plan, ms)
            .map(({ note }) => pitchName(note.midiPitch))
            .join(' '),
        )
        if (ms >= plan.endMs + TAIL_MS) {
          halt()
          heldMs.current = 0
          setPositionMs(plan.endMs)
          setNowPlaying('')
          setStatus('ended')
          return
        }
        live.frame = requestAnimationFrame(step)
      }
      step()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Playback could not start.')
      setStatus('stopped')
    }
  }

  function pause() {
    heldMs.current = Math.max(0, currentMs())
    halt()
    setPositionMs(heldMs.current)
    setStatus('paused')
  }

  function stop() {
    halt()
    heldMs.current = 0
    setPositionMs(0)
    setNowPlaying('')
    setStatus('stopped')
  }

  /** A speed change keeps the place in the music: the same beat, at the new tempo. */
  function changeSpeed(next: number) {
    if (next === speed) return
    const fromMs = Math.max(0, currentMs() * (speed / next))
    onSpeedChange(next)
    if (session.current) {
      void playFrom(fromMs, buildTimeline({ notes: expected, tempoMap, speedMultiplier: next }))
    } else {
      heldMs.current = fromMs
      setPositionMs(fromMs)
    }
  }

  function toggleMetronome(on: boolean) {
    setMetronome(on)
    metronomeOn.current = on
    // Mid-playback, reschedule from where it is so the clicks start or stop right away.
    if (session.current) void playFrom(Math.max(0, currentMs()), session.current.plan)
  }

  const progress = Math.min(100, Math.max(0, (positionMs / timeline.endMs) * 100))
  const playing = status === 'playing'

  return (
    <section
      aria-label="Scenario playback"
      className="flex w-full max-w-xl flex-col gap-4 text-ink"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">Listen to the scenario</h2>
        <span className="text-sm tabular-nums text-muted">
          {formatClock(positionMs)} / {formatClock(timeline.endMs)}
        </span>
      </div>

      <NoteHighway timeline={timeline} getPositionMs={currentMs} getLivePitch={getLivePitch} />

      <p className="min-h-6 text-center text-lg font-semibold">
        {nowPlaying ? `Now playing: ${nowPlaying}` : status === 'ended' ? 'Finished.' : ' '}
      </p>

      <div
        className="h-3 w-full overflow-hidden rounded-full border-2 border-accent-start bg-white"
        role="progressbar"
        aria-label="Playback progress"
        aria-valuenow={Math.round(progress)}
      >
        <div className="h-full bg-accent-start" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {playing ? (
          <button type="button" onClick={pause} className={primaryButton}>
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void playFrom(status === 'paused' ? heldMs.current : 0)}
            className={primaryButton}
          >
            {status === 'paused' ? 'Resume' : status === 'ended' ? 'Play again' : 'Play'}
          </button>
        )}
        <button
          type="button"
          onClick={stop}
          disabled={status === 'stopped'}
          className={secondaryButton}
        >
          Stop
        </button>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={metronome}
            onChange={(e) => toggleMetronome(e.target.checked)}
            className="size-4 accent-accent-start"
          />
          Metronome
        </label>
        <button type="button" onClick={onClose} className={`${secondaryButton} ml-auto`}>
          Back to setup
        </button>
      </div>

      <SpeedControl
        value={speed}
        onChange={changeSpeed}
        tempoMap={tempoMap}
        label="Playback speed"
      />

      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  )
}

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
