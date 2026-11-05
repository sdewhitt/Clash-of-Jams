import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SampleBlock } from '@/audio/frame-processor'
import {
  DEFAULT_INPUT_CHOICE,
  findDevice,
  isDevicePresent,
  watchAudioInputs,
  type AudioInputChoice,
} from '@/audio/devices'
import { listAudioInputs, openAudioInput, type AudioInput } from '@/audio/input'
import { getInstrumentProfile, keepNotesInRange, notesOutOfRange } from '@/audio/instruments'
import {
  audioTimeToPerformanceMs,
  listMidiInputs,
  openMidiInput,
  requestMidiAccess,
  type MidiInputConnection,
} from '@/audio/midi-input'
import { toPerformedNotes } from '@/audio/performance'
import type { RunTake } from '@/audio/run-audio'
import { describeInputError, useLiveAudioInput } from '@/audio/useLiveAudioInput'
import { AudioInputPicker } from '@/components/AudioInputPicker'
import { LevelMeter } from '@/components/LevelMeter'
import { ScenarioPlayback } from '@/components/ScenarioPlayback'
import { SpeedControl } from '@/components/SpeedControl'
import { pitchName } from '@/lib/chart/notes'
import { scheduleClicks } from '@/lib/play/metronome'
import { clampSpeed, DEFAULT_SPEED, describeTempo, playedBpm } from '@/lib/play/speed'
import { buildTimeline } from '@/lib/play/timeline'
import {
  INSTRUMENTS,
  type ExpectedNote,
  type Instrument,
  type ScoringRules,
  type TempoMapEntry,
} from '@/lib/schema/types'
import { NoteHighway } from '@/pages/play/NoteHighway'
import { explainScore, type ScoreExplanation } from '@/scoring/explain'
import { scorePerformance, type PerformedNote, type ScoreResult } from '@/scoring/score'

/** Extra time after the last note ends, so a slightly late final note still counts. */
const END_PADDING_MS = 1000
/** Gap between pressing Start and the first count-in click. */
const LEAD_IN_SECONDS = 0.3

type InputKind = 'microphone' | 'midi'

/** What the player picked before pressing Start; a replay starts from the same choices. */
export interface PlayerSetup {
  instrument: Instrument
  inputKind: InputKind
  midiDeviceId: string
}

export interface FinishedRun extends PlayerSetup {
  /** The speed the run was played at; note times in `performed` are at this speed. */
  speedMultiplier: number
  performed: PerformedNote[]
  result: ScoreResult
  explanation: ScoreExplanation
  /** What was captured of the player, for exporting the run's audio. */
  take?: RunTake
  /** From beat 0 to the moment the run ended. */
  durationMs?: number
}

type Mode = 'setup' | 'playback'

type ScenarioPlayerProps = {
  expected: ExpectedNote[]
  tempoMap: TempoMapEntry[]
  rules: ScoringRules
  defaultInstrument: Instrument
  /** The player's input latency setting, subtracted from every note time. */
  latencyMs: number
  onFinish: (run: FinishedRun) => void
  /** The speed the setup screen starts at. */
  initialSpeed?: number
  /** The saved audio interface and input; the browser default when omitted. */
  audioInput?: AudioInputChoice
  /** Called when the player picks another interface or input, so it can be remembered. */
  onAudioInputChange?: (choice: AudioInputChoice) => void
  /** The previous run's choices, when replaying. Falls back to defaultInstrument and the microphone. */
  initialSetup?: PlayerSetup | null
  /** Told when the count-in starts and when the run ends, so the page can hide its chrome. */
  onPlayingChange?: (playing: boolean) => void
}

/** Everything that exists only while a scenario is being played. */
interface Session {
  context: AudioContext
  /** AudioContext time of scenario beat 0. */
  startTime: number
  microphone: AudioInput | null
  /** The device the microphone was opened on; null is the browser default. */
  deviceId: string | null
  midi: MidiInputConnection | null
  /** Everything the microphone heard, kept so the run's audio can be exported. */
  blocks: SampleBlock[]
  silenceClicks: () => void
  stopWatchingDevices: () => void
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

export const DISCONNECTED_MESSAGE =
  'Your audio interface was disconnected, so the scenario was stopped. Plug it back in and ' +
  'press Start to try again.'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Plays one scenario: pick an instrument, input and speed, count in, play, then score. */
export function ScenarioPlayer({
  expected,
  tempoMap,
  rules,
  defaultInstrument,
  latencyMs,
  initialSetup,
  onFinish,
  onPlayingChange,
  initialSpeed = DEFAULT_SPEED,
  audioInput = DEFAULT_INPUT_CHOICE,
  onAudioInputChange,
}: ScenarioPlayerProps) {
  const [mode, setMode] = useState<Mode>('setup')
  const [instrument, setInstrument] = useState<Instrument>(
    initialSetup?.instrument ?? defaultInstrument,
  )
  const [inputKind, setInputKind] = useState<InputKind>(
    initialSetup?.inputKind ?? (defaultInstrument === 'midi' ? 'midi' : 'microphone'),
  )
  const [speed, setSpeed] = useState(() => clampSpeed(initialSpeed))
  const [inputChoice, setInputChoice] = useState<AudioInputChoice>(audioInput)
  const [checkingLevel, setCheckingLevel] = useState(false)
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [midiDevices, setMidiDevices] = useState<MIDIInput[]>([])
  const [midiDeviceId, setMidiDeviceId] = useState(initialSetup?.midiDeviceId ?? '')
  const [midiConnected, setMidiConnected] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [liveNotes, setLiveNotes] = useState<PerformedNote[]>([])
  const [heldPitch, setHeldPitch] = useState<number | null>(null)

  const session = useRef<Session | null>(null)
  /** The pitch sounding now, unrounded, for the marker on the note highway. */
  const livePitch = useRef<number | null>(null)

  // The saved choice usually arrives after the first render.
  const [savedInput, setSavedInput] = useState(audioInput)
  if (savedInput !== audioInput) {
    setSavedInput(audioInput)
    setInputChoice(audioInput)
  }

  const timeline = useMemo(
    () =>
      expected.length > 0
        ? buildTimeline({ notes: expected, tempoMap, speedMultiplier: speed })
        : null,
    [expected, tempoMap, speed],
  )
  const getPositionMs = useCallback(() => {
    const current = session.current
    return current ? (current.context.currentTime - current.startTime) * 1000 : null
  }, [])
  const getLivePitch = useCallback(() => livePitch.current, [])
  const getSessionLevel = useCallback(() => {
    const microphone = session.current?.microphone
    return microphone && microphone.isLive() ? microphone.readLevel() : null
  }, [])
  const profile = getInstrumentProfile(instrument)
  const unplayable = notesOutOfRange(expected, profile)
  const endMs = (timeline?.endMs ?? 0) + END_PADDING_MS

  const levelCheck = useLiveAudioInput({
    enabled: checkingLevel && mode === 'setup' && inputKind === 'microphone' && elapsedMs === null,
    choice: inputChoice,
    analyzer: profile.analyzer,
  })

  function chooseInput(choice: AudioInputChoice) {
    setInputChoice(choice)
    setError(null)
    onAudioInputChange?.(choice)
  }

  // Ask for MIDI access when the player picks a MIDI controller, and keep the device list fresh.
  useEffect(() => {
    if (inputKind !== 'midi') return
    let access: MIDIAccess | null = null
    function refreshDevices() {
      if (!access) return
      const devices = listMidiInputs(access)
      setMidiDevices(devices)
      // Keep the chosen controller if it's still plugged in; otherwise fall back to the first one.
      setMidiDeviceId((current) =>
        devices.some((device) => device.id === current) ? current : (devices[0]?.id ?? ''),
      )
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
    current.stopWatchingDevices()
    current.silenceClicks()
    current.midi?.stop()
    void current.microphone?.stop()
    void current.context.close()
  }

  function addLiveNote(note: PerformedNote) {
    setLiveNotes((previous) => [...previous, note])
  }

  /** The interface went away mid-run: drop the run and say why. */
  function abortForDisconnect() {
    if (!session.current) return
    stopSession()
    setElapsedMs(null)
    setHeldPitch(null)
    livePitch.current = null
    setError(DISCONNECTED_MESSAGE)
  }

  async function start() {
    if (!timeline) return
    setError(null)
    setStarting(true)
    setCheckingLevel(false)
    setLiveNotes([])
    setHeldPitch(null)
    livePitch.current = null

    const context = new AudioContext({ latencyHint: 'interactive' })
    let microphone: AudioInput | null = null
    let midi: MidiInputConnection | null = null
    const blocks: SampleBlock[] = []
    let deviceId: string | null = null
    // startTime is set below, once we know when the count-in begins.
    let startTime = 0

    try {
      await context.resume()

      if (inputKind === 'microphone') {
        deviceId = findDevice(await listAudioInputs().catch(() => []), inputChoice)
        microphone = await openAudioInput({
          context,
          deviceId: deviceId ?? undefined,
          channel: deviceId !== null ? (inputChoice.channel ?? undefined) : undefined,
          analyzer: profile.analyzer,
          segmenter: profile.segmenter,
          onSamples: (block) => blocks.push(block),
          onNote: (note) => {
            for (const performed of toPerformedNotes([note], startTime, latencyMs)) {
              addLiveNote(performed)
            }
          },
          // Rounded, so React only re-renders when the note name changes.
          onFrame: (frame) => {
            const clear = frame.midi !== null && frame.clarity > 0.8
            livePitch.current = clear ? frame.midi : null
            setHeldPitch(clear ? Math.round(frame.midi as number) : null)
          },
          onEnded: abortForDisconnect,
        })
      } else {
        if (!midiAccess || !midiDeviceId) throw new Error('Choose a MIDI controller first.')
        midi = openMidiInput({
          access: midiAccess,
          deviceId: midiDeviceId,
          onNoteOn: (pitch) => {
            livePitch.current = pitch
            setHeldPitch(pitch)
          },
          onNote: (note) => {
            if (livePitch.current === note.midiPitch) livePitch.current = null
            setHeldPitch((current) => (current === note.midiPitch ? null : current))
            addLiveNote(note)
          },
          onConnectionChange: setMidiConnected,
        })
      }

      // The count-in is the timeline's clicks before beat 0, already at the chosen speed.
      const countIn = timeline.clicks.filter((click) => click.ms < 0)
      startTime = context.currentTime + LEAD_IN_SECONDS - (countIn[0]?.ms ?? 0) / 1000
      const silenceClicks = scheduleClicks(
        context,
        countIn.map((click) => ({ time: startTime + click.ms / 1000, accent: click.accent })),
      )
      microphone?.takeNotes()
      midi?.start(audioTimeToPerformanceMs(context, startTime) + latencyMs)

      // Unplugging usually ends the track, but some systems only report a device change.
      const stopWatchingDevices = microphone
        ? watchAudioInputs((devices) => {
            if (!isDevicePresent(devices, deviceId)) abortForDisconnect()
          })
        : () => {}

      session.current = {
        context,
        startTime,
        microphone,
        deviceId,
        midi,
        blocks,
        silenceClicks,
        stopWatchingDevices,
        animationFrame: 0,
      }
      tick()
    } catch (e) {
      setError(inputKind === 'microphone' ? describeInputError(e) : errorMessage(e))
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

    const durationMs = Math.max(0, (current.context.currentTime - current.startTime) * 1000)
    let performed: PerformedNote[] = []
    let take: RunTake | undefined
    if (current.microphone) {
      performed = toPerformedNotes(current.microphone.takeNotes(), current.startTime, latencyMs)
      take = {
        kind: 'microphone',
        blocks: current.blocks,
        sampleRate: current.context.sampleRate,
        beatZeroTime: current.startTime,
        latencyMs,
      }
    }
    if (current.midi) {
      performed = current.midi.takeNotes()
      // Everything pressed is heard in the export, even notes the scoring range drops.
      take = { kind: 'midi', notes: performed }
    }
    performed = keepNotesInRange(performed, profile)
    stopSession()
    setElapsedMs(null)

    const result = scorePerformance({
      expected,
      tempoMap,
      performed,
      rules,
      speedMultiplier: speed,
    })
    const explanation = explainScore({ result, expected, rules, speedMultiplier: speed })
    onFinish({
      instrument,
      inputKind,
      midiDeviceId,
      speedMultiplier: speed,
      performed,
      result,
      explanation,
      take,
      durationMs,
    })
  }

  const playing = elapsedMs !== null

  useEffect(() => {
    onPlayingChange?.(playing)
  }, [playing, onPlayingChange])

  if (mode === 'playback' && expected.length > 0) {
    return (
      <ScenarioPlayback
        expected={expected}
        tempoMap={tempoMap}
        speed={speed}
        onSpeedChange={setSpeed}
        onClose={() => setMode('setup')}
      />
    )
  }

  const countIn = playing && elapsedMs < 0

  // Score only the notes whose time has already passed, so the live score is fair mid-song.
  let liveScore: number | null = null
  if (playing && !countIn && timeline) {
    const judged = timeline.notes
      .filter(({ startMs }) => startMs < elapsedMs - (rules.hitWindowMs / speed) * 2)
      .map(({ note }) => note)
    if (judged.length > 0) {
      liveScore = scorePerformance({
        expected: judged,
        tempoMap,
        performed: liveNotes,
        rules,
        speedMultiplier: speed,
      }).finalScore
    }
  }

  let currentNote: ExpectedNote | null = null
  if (playing && timeline) {
    for (const { note, startMs } of timeline.notes) {
      if (startMs <= elapsedMs) currentNote = note
    }
  }

  if (playing) {
    const progress = Math.min(100, Math.max(0, (elapsedMs / endMs) * 100))
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-ink">
        {timeline && (
          <NoteHighway
            timeline={timeline}
            getPositionMs={getPositionMs}
            getLivePitch={getLivePitch}
          />
        )}
        {countIn && timeline ? (
          <p className="text-6xl font-bold tabular-nums">
            {Math.ceil(-elapsedMs / timeline.countInBeatMs)}
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

        <div className="flex w-full items-center justify-between gap-4 text-sm text-muted">
          <span aria-label="Locked speed">
            Speed {describeTempo(tempoMap, speed)} · locked while playing
          </span>
        </div>

        {inputKind === 'microphone' && <LevelMeter getLevel={getSessionLevel} compact />}

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
            <option value="microphone">Microphone or audio interface</option>
            <option value="midi">MIDI controller</option>
          </select>
        </label>
      </div>

      {inputKind === 'microphone' && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-accent-start p-3">
          <AudioInputPicker
            value={inputChoice}
            onChange={chooseInput}
            labelClass={labelClass}
            controlClass={controlClass}
          />
          {checkingLevel ? (
            <>
              <LevelMeter getLevel={levelCheck.getLevel} />
              {levelCheck.status === 'fallback' && (
                <p className="text-sm text-yellow-400">
                  Your audio interface is unplugged; checking the default input instead.
                </p>
              )}
              {levelCheck.error && <p className="text-sm text-red-400">{levelCheck.error}</p>}
            </>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <button
              type="button"
              onClick={() => setCheckingLevel((on) => !on)}
              className="font-semibold text-ink underline"
            >
              {checkingLevel ? 'Stop level check' : 'Check input level'}
            </button>
            <span>
              Input latency {latencyMs} ms ·{' '}
              <a href="/settings" className="underline">
                calibrate in Settings
              </a>
            </span>
          </div>
        </div>
      )}

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

      <SpeedControl value={speed} onChange={setSpeed} tempoMap={tempoMap} />

      {unplayable.length > 0 && (
        <p className="text-sm text-yellow-400">
          {unplayable.length} note{unplayable.length === 1 ? '' : 's'} in this scenario{' '}
          {unplayable.length === 1 ? 'is' : 'are'} outside the {instrument}&apos;s range.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-400">
          {error}
        </p>
      )}

      <p className="text-sm text-muted">
        {expected.length} notes at {playedBpm(tempoMap, speed)} bpm. You&apos;ll hear{' '}
        {timeline?.countInBeats ?? 4} clicks before the first note. Headphones keep the clicks out
        of the microphone.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => {
            setCheckingLevel(false)
            setMode('playback')
          }}
          disabled={expected.length === 0}
          className={secondaryButton}
        >
          Listen
        </button>
        <button
          type="button"
          onClick={start}
          disabled={starting || (inputKind === 'midi' && !midiDeviceId)}
          className={primaryButton}
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
      </div>
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
