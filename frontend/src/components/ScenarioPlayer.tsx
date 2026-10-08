import { useEffect, useRef, useState } from 'react'

import { openAudioInput, type AudioInput } from '@/audio/input'
import { getInstrumentProfile, keepNotesInRange, notesOutOfRange } from '@/audio/instruments'
import {
  audioTimeToPerformanceMs,
  listMidiInputs,
  openMidiInput,
  requestMidiAccess,
  type MidiInputConnection,
} from '@/audio/midi-input'
import { toPerformedNotes } from '@/audio/performance'
import { pitchName } from '@/lib/chart/notes'
import {
  INSTRUMENTS,
  type ExpectedNote,
  type Instrument,
  type ScoringRules,
  type TempoMapEntry,
} from '@/lib/schema/types'
import { explainScore, type ScoreExplanation } from '@/scoring/explain'
import { beatToMs, scorePerformance, type PerformedNote, type ScoreResult } from '@/scoring/score'

const COUNT_IN_BEATS = 4
/** Extra time after the last note ends, so a slightly late final note still counts. */
const END_PADDING_MS = 1000

export interface FinishedRun {
  instrument: Instrument
  performed: PerformedNote[]
  result: ScoreResult
  explanation: ScoreExplanation
}

type InputKind = 'microphone' | 'midi'

type ScenarioPlayerProps = {
  expected: ExpectedNote[]
  tempoMap: TempoMapEntry[]
  rules: ScoringRules
  defaultInstrument: Instrument
  /** The player's input latency setting, subtracted from every note time. */
  latencyMs: number
  onFinish: (run: FinishedRun) => void
}

/** Everything that exists only while a scenario is being played. */
interface Session {
  context: AudioContext
  /** AudioContext time of scenario beat 0. */
  startTime: number
  microphone: AudioInput | null
  midi: MidiInputConnection | null
  animationFrame: number
}

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
const primaryButton = `${buttonClass} bg-accent-start text-ink hover:brightness-110`
const secondaryButton = `${buttonClass} bg-white text-black hover:brightness-95`
const controlClass = 'w-full rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black'
const labelClass = 'flex flex-col gap-1 text-sm font-semibold text-ink'

function playClick(context: AudioContext, time: number, accent: boolean) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = accent ? 1760 : 1320
  gain.gain.setValueAtTime(0.2, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(time)
  oscillator.stop(time + 0.04)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Plays one scenario: pick an instrument and input, count in, play, then score. */
export function ScenarioPlayer({
  expected,
  tempoMap,
  rules,
  defaultInstrument,
  latencyMs,
  onFinish,
}: ScenarioPlayerProps) {
  const [instrument, setInstrument] = useState<Instrument>(defaultInstrument)
  const [inputKind, setInputKind] = useState<InputKind>(
    defaultInstrument === 'midi' ? 'midi' : 'microphone',
  )
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [midiDevices, setMidiDevices] = useState<MIDIInput[]>([])
  const [midiDeviceId, setMidiDeviceId] = useState('')
  const [midiConnected, setMidiConnected] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [liveNotes, setLiveNotes] = useState<PerformedNote[]>([])
  const [heldPitch, setHeldPitch] = useState<number | null>(null)

  const session = useRef<Session | null>(null)
  const profile = getInstrumentProfile(instrument)
  const unplayable = notesOutOfRange(expected, profile)

  let lastBeat = 0
  for (const note of expected) {
    lastBeat = Math.max(lastBeat, note.startBeat + note.durationBeats)
  }
  const endMs = beatToMs(lastBeat, tempoMap) + END_PADDING_MS

  // Ask for MIDI access when the player picks a MIDI controller, and keep the device list fresh.
  useEffect(() => {
    if (inputKind !== 'midi') return
    let access: MIDIAccess | null = null
    function refreshDevices() {
      if (!access) return
      const devices = listMidiInputs(access)
      setMidiDevices(devices)
      setMidiDeviceId((current) => current || devices[0]?.id || '')
    }

    requestMidiAccess()
      .then((granted) => {
        access = granted
        setMidiAccess(granted)
        refreshDevices()
        granted.addEventListener('statechange', refreshDevices)
      })
      .catch((e) => setError(errorMessage(e)))

    return () => access?.removeEventListener('statechange', refreshDevices)
  }, [inputKind])

  useEffect(() => {
    return () => stopSession()
  }, [])

  function stopSession() {
    const current = session.current
    if (!current) return
    session.current = null
    cancelAnimationFrame(current.animationFrame)
    current.midi?.stop()
    void current.microphone?.stop()
    void current.context.close()
  }

  function addLiveNote(note: PerformedNote) {
    setLiveNotes((previous) => [...previous, note])
  }

  async function start() {
    setError(null)
    setStarting(true)
    setLiveNotes([])
    setHeldPitch(null)

    const context = new AudioContext({ latencyHint: 'interactive' })
    let microphone: AudioInput | null = null
    let midi: MidiInputConnection | null = null
    // startTime is set below, once we know when the count-in begins.
    let startTime = 0

    try {
      await context.resume()

      if (inputKind === 'microphone') {
        microphone = await openAudioInput({
          context,
          analyzer: profile.analyzer,
          segmenter: profile.segmenter,
          onNote: (note) => {
            for (const performed of toPerformedNotes([note], startTime, latencyMs)) {
              addLiveNote(performed)
            }
          },
          // Rounded, so React only re-renders when the note name changes.
          onFrame: (frame) => {
            const clear = frame.midi !== null && frame.clarity > 0.8
            setHeldPitch(clear ? Math.round(frame.midi as number) : null)
          },
        })
      } else {
        if (!midiAccess || !midiDeviceId) throw new Error('Choose a MIDI controller first.')
        midi = openMidiInput({
          access: midiAccess,
          deviceId: midiDeviceId,
          onNoteOn: (pitch) => setHeldPitch(pitch),
          onNote: (note) => {
            setHeldPitch((current) => (current === note.midiPitch ? null : current))
            addLiveNote(note)
          },
          onConnectionChange: setMidiConnected,
        })
      }

      const secondsPerBeat = 60 / tempoMap[0].bpm
      const clickStart = context.currentTime + 0.3
      startTime = clickStart + COUNT_IN_BEATS * secondsPerBeat
      for (let beat = 0; beat < COUNT_IN_BEATS; beat++) {
        playClick(context, clickStart + beat * secondsPerBeat, beat === 0)
      }
      microphone?.takeNotes()
      midi?.start(audioTimeToPerformanceMs(context, startTime) + latencyMs)

      session.current = { context, startTime, microphone, midi, animationFrame: 0 }
      tick()
    } catch (e) {
      setError(errorMessage(e))
      midi?.stop()
      void microphone?.stop()
      void context.close()
    } finally {
      setStarting(false)
    }
  }

  function tick() {
    const current = session.current
    if (!current) return
    const now = (current.context.currentTime - current.startTime) * 1000
    setElapsedMs(now)
    if (now >= endMs) {
      finish()
      return
    }
    current.animationFrame = requestAnimationFrame(tick)
  }

  function finish() {
    const current = session.current
    if (!current) return

    let performed: PerformedNote[] = []
    if (current.microphone) {
      performed = toPerformedNotes(current.microphone.takeNotes(), current.startTime, latencyMs)
    }
    if (current.midi) {
      performed = current.midi.takeNotes()
    }
    performed = keepNotesInRange(performed, profile)
    stopSession()
    setElapsedMs(null)

    const result = scorePerformance({ expected, tempoMap, performed, rules })
    const explanation = explainScore({ result, expected, rules })
    onFinish({ instrument, performed, result, explanation })
  }

  const playing = elapsedMs !== null
  const countIn = playing && elapsedMs < 0

  // Score only the notes whose time has already passed, so the live score is fair mid-song.
  let liveScore: number | null = null
  if (playing && !countIn) {
    const judged = expected.filter(
      (note) => beatToMs(note.startBeat, tempoMap) < elapsedMs - rules.hitWindowMs * 2,
    )
    if (judged.length > 0) {
      liveScore = scorePerformance({
        expected: judged,
        tempoMap,
        performed: liveNotes,
        rules,
      }).finalScore
    }
  }

  let currentNote: ExpectedNote | null = null
  if (playing) {
    for (const note of expected) {
      if (beatToMs(note.startBeat, tempoMap) <= elapsedMs) currentNote = note
    }
  }

  if (playing) {
    const progress = Math.min(100, Math.max(0, (elapsedMs / endMs) * 100))
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-ink">
        {countIn ? (
          <p className="text-6xl font-bold tabular-nums">
            {Math.ceil(-elapsedMs / 1000 / (60 / tempoMap[0].bpm))}
          </p>
        ) : (
          <div className="grid w-full grid-cols-3 gap-4 text-center">
            <LiveStat
              label="Play now"
              value={currentNote ? pitchName(currentNote.midiPitch) : '—'}
            />
            <LiveStat
              label="You're playing"
              value={heldPitch !== null ? pitchName(heldPitch) : '—'}
            />
            <LiveStat label="Live score" value={liveScore !== null ? String(liveScore) : '—'} />
          </div>
        )}

        <div
          className="h-3 w-full overflow-hidden rounded-full border-2 border-accent-start bg-white"
          role="progressbar"
          aria-label="Scenario progress"
          aria-valuenow={Math.round(progress)}
        >
          <div className="h-full bg-accent-start" style={{ width: `${progress}%` }} />
        </div>

        {!midiConnected && (
          <p className="font-semibold text-red-400">
            Your MIDI controller was unplugged. Plug it back in to keep playing.
          </p>
        )}

        <button type="button" onClick={finish} className={secondaryButton}>
          Stop and see results
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 text-ink">
      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          Instrument
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as Instrument)}
            className={`capitalize ${controlClass}`}
          >
            {INSTRUMENTS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Input
          <select
            value={inputKind}
            onChange={(e) => {
              setInputKind(e.target.value as InputKind)
              setError(null)
            }}
            className={controlClass}
          >
            <option value="microphone">Microphone</option>
            <option value="midi">MIDI controller</option>
          </select>
        </label>
      </div>

      {inputKind === 'midi' && (
        <label className={labelClass}>
          MIDI controller
          <select
            value={midiDeviceId}
            onChange={(e) => setMidiDeviceId(e.target.value)}
            className={controlClass}
            disabled={midiDevices.length === 0}
          >
            {midiDevices.length === 0 && (
              <option value="">No controllers found. Plug one in.</option>
            )}
            {midiDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name ?? device.id}
              </option>
            ))}
          </select>
        </label>
      )}

      {unplayable.length > 0 && (
        <p className="text-sm text-yellow-400">
          {unplayable.length} note{unplayable.length === 1 ? '' : 's'} in this scenario{' '}
          {unplayable.length === 1 ? 'is' : 'are'} outside the {instrument}&apos;s range.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-sm text-muted">
        {expected.length} notes at {tempoMap[0].bpm} bpm. You&apos;ll hear {COUNT_IN_BEATS} clicks
        before the first note. Headphones keep the clicks out of the microphone.
      </p>

      <button
        type="button"
        onClick={start}
        disabled={starting || (inputKind === 'midi' && !midiDeviceId)}
        className={primaryButton}
      >
        {starting ? 'Starting…' : 'Start'}
      </button>
    </div>
  )
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-3 border-accent-start bg-accent-base-start px-3 py-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
    </div>
  )
}
