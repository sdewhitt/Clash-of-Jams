import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'

import { midiToNoteName, type AudioFrame } from '@/audio/analysis'
import { listAudioInputs, openAudioInput, type AudioInput } from '@/audio/input'
import { DEFAULT_PROFILE, getInstrumentProfile, PIANO_PROFILE } from '@/audio/instruments'
import { answerKeyFromMidi, answerKeyToMidi, performanceToMidi, type AnswerKey } from '@/audio/midi'
import {
  listMidiInputs,
  openMidiInput,
  requestMidiAccess,
  type MidiInputConnection,
} from '@/audio/midi-input'
import { toPerformedNotes } from '@/audio/performance'
import { PIANO_CHORD, PIANO_RECORDINGS } from '@/audio/piano-recordings'
import {
  encodeWav,
  evaluateRecording,
  evaluateTranscription,
  recordingAnswerKey,
  RECORDING_SAMPLE_RATE,
  renderRecording,
  TEST_RECORDINGS,
  type RecordingEvaluation,
  type TestRecording,
} from '@/audio/recordings'
import type { DetectedNote } from '@/audio/segmenter'
import { toMono, transcribe } from '@/audio/transcribe'
import { BackButton } from '@/components/BackButton'
import { ProfileButton } from '@/components/ProfileButton'
import { useAuth } from '@/lib/auth/useAuth'
import {
  INSTRUMENTS,
  type ExpectedNote,
  type Instrument,
  type TempoMapEntry,
} from '@/lib/schema/types'
import { beatToMs, scorePerformance, type PerformedNote, type ScoreResult } from '@/scoring/score'

const primary =
  'rounded-xl border-3 border-accent-start bg-accent-start px-4 py-2 font-bold text-ink hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
const secondary =
  'rounded-lg border-2 border-accent-start bg-white px-3 py-1.5 text-sm font-semibold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50'
const panel =
  'flex flex-col gap-4 rounded-xl border-3 border-accent-start bg-linear-to-br from-accent-base-start from-50 via-accent-base-middle to-accent-base-end to-70 p-6'
const field = 'rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black'
const inset = 'rounded-lg border-2 border-accent-start bg-accent-base-start'

function download(bytes: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const cents = (midi: number) => Math.round((midi - Math.round(midi)) * 100)
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

export function AudioLab() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [input, setInput] = useState<AudioInput | null>(null)

  return (
    <main className="flex min-h-screen flex-col">
      <header
        className={`
          flex
          items-center
          justify-between
          bg-linear-to-r
          from-accent-base-start from-10%
          via-accent-base-middle via-70%
          to-accent-base-end to-90%
          border-b-4 border-accent-start
          py-6
        `}
      >
        <div className="ml-12 flex">
          <BackButton onClick={() => navigate('/home')}></BackButton>
          <h1 className="ml-4 text-4xl font-bold text-ink">Audio Lab</h1>
        </div>

        <div className="mr-6">
          <ProfileButton
            username={profile?.displayName ?? user?.email ?? '…'}
            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-8">
        <LiveInput input={input} onInput={setInput} />
        <MidiController />
        <ScoredTake input={input} />
        <TestRecordings />
      </div>
    </main>
  )
}

function LiveInput({
  input,
  onInput,
}: {
  input: AudioInput | null
  onInput: (input: AudioInput | null) => void
}) {
  const [instrument, setInstrument] = useState<Instrument>('piano')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<DetectedNote[]>([])
  const [frame, setFrame] = useState<AudioFrame | null>(null)
  const latestFrame = useRef<AudioFrame | null>(null)

  useEffect(() => {
    if (!input) return
    let id = requestAnimationFrame(function tick() {
      setFrame(latestFrame.current)
      id = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(id)
      void input.stop()
    }
  }, [input])

  async function start() {
    setStarting(true)
    setError(null)
    try {
      const instrumentProfile = getInstrumentProfile(instrument)
      const opened = await openAudioInput({
        deviceId: deviceId || undefined,
        analyzer: instrumentProfile.analyzer,
        segmenter: instrumentProfile.segmenter,
        onFrame: (f) => {
          latestFrame.current = f
        },
        onNote: (note) => setNotes((prev) => [note, ...prev].slice(0, 40)),
      })
      onInput(opened)
      setDevices(await listAudioInputs())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setStarting(false)
    }
  }

  const pitched = frame && frame.midi !== null && frame.clarity >= 0.8 && frame.db > -60
  const levelPercent = frame ? Math.min(100, Math.max(0, ((frame.db + 80) / 80) * 100)) : 0

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">1. Live microphone</h2>        </div>
        <div className="flex items-center gap-3">
          <select
            className={`capitalize ${field}`}
            aria-label="Instrument"
            value={instrument}
            disabled={!!input}
            onChange={(e) => setInstrument(e.target.value as Instrument)}
          >
            {INSTRUMENTS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {devices.length > 0 && (
            <select
              className={field}
              value={deviceId}
              disabled={!!input}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="">Default microphone</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId}
                </option>
              ))}
            </select>
          )}
          {input ? (
            <button className={primary} onClick={() => onInput(null)}>
              Stop
            </button>
          ) : (
            <button className={primary} disabled={starting} onClick={start}>
              {starting ? 'Starting…' : 'Start microphone'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">Could not open the microphone: {error}</p>}

      {input && (
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <div className={`flex flex-col items-center justify-center gap-2 p-6 ${inset}`}>
            <div className="text-6xl font-bold tabular-nums">
              {pitched ? midiToNoteName(frame.midi as number) : '—'}
            </div>
            <div className="text-muted tabular-nums">
              {pitched ? `${signed(cents(frame.midi as number))} cents` : 'no clear pitch'}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-white">
              <div className="h-full bg-accent-start" style={{ width: `${levelPercent}%` }} />
            </div>
            <div className="text-xs text-faint tabular-nums">
              {frame ? `${frame.db.toFixed(1)} dBFS · clarity ${frame.clarity.toFixed(2)}` : ''}
            </div>
            <dl className="mt-2 grid w-full grid-cols-2 gap-x-3 text-xs text-faint">
              <dt>Sample rate</dt>
              <dd className="text-right">{input.context.sampleRate} Hz</dd>
              <dt>Echo cancellation</dt>
              <dd className="text-right">{String(input.settings.echoCancellation ?? 'n/a')}</dd>
              <dt>Noise suppression</dt>
              <dd className="text-right">{String(input.settings.noiseSuppression ?? 'n/a')}</dd>
              <dt>Auto gain</dt>
              <dd className="text-right">{String(input.settings.autoGainControl ?? 'n/a')}</dd>
            </dl>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Detected notes</h3>
              <button className={secondary} onClick={() => setNotes([])}>
                Clear
              </button>
            </div>
            <NoteTable notes={notes} emptyText="Play a note. Each one appears when it ends." />
          </div>
        </div>
      )}
    </section>
  )
}

function NoteTable({ notes, emptyText }: { notes: DetectedNote[]; emptyText: string }) {
  if (notes.length === 0) return <p className="text-sm text-faint">{emptyText}</p>
  return (
    <div className={`max-h-72 overflow-y-auto ${inset}`}>
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-accent-base-start text-left text-muted">
          <tr>
            <th className="px-3 py-1.5">Note</th>
            <th className="px-3 py-1.5">Cents</th>
            <th className="px-3 py-1.5">Onset (s)</th>
            <th className="px-3 py-1.5">Duration (ms)</th>
            <th className="px-3 py-1.5">Velocity</th>
            <th className="px-3 py-1.5">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => (
            <tr
              key={`${note.startTime}-${note.midiPitch}`}
              className="border-t border-accent-start"
            >
              <td className="px-3 py-1.5 font-semibold">{midiToNoteName(note.midiPitch)}</td>
              <td className="px-3 py-1.5">{signed(cents(note.midiPitch))}</td>
              <td className="px-3 py-1.5">{note.startTime.toFixed(3)}</td>
              <td className="px-3 py-1.5">{Math.round(note.durationSeconds * 1000)}</td>
              <td className="px-3 py-1.5">{note.velocity}</td>
              <td className="px-3 py-1.5">{note.confidence.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MidiController() {
  const [access, setAccess] = useState<MIDIAccess | null>(null)
  const [devices, setDevices] = useState<MIDIInput[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [connection, setConnection] = useState<MidiInputConnection | null>(null)
  const [connected, setConnected] = useState(false)
  const [held, setHeld] = useState<number[]>([])
  const [notes, setNotes] = useState<PerformedNote[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!access) return
    const granted = access
    function refresh() {
      const found = listMidiInputs(granted)
      setDevices(found)
      setDeviceId((current) => current || found[0]?.id || '')
    }
    refresh()
    granted.addEventListener('statechange', refresh)
    return () => granted.removeEventListener('statechange', refresh)
  }, [access])

  useEffect(() => {
    return () => connection?.stop()
  }, [connection])

  async function requestAccess() {
    setError(null)
    try {
      setAccess(await requestMidiAccess())
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function listen() {
    if (!access || !deviceId) return
    const opened = openMidiInput({
      access,
      deviceId,
      onNoteOn: (pitch) => setHeld((previous) => [...previous, pitch]),
      onNote: (note) => {
        setHeld((previous) => previous.filter((pitch) => pitch !== note.midiPitch))
        setNotes((previous) => [note, ...previous].slice(0, 40))
      },
      onConnectionChange: (isConnected) => {
        setConnected(isConnected)
        if (!isConnected) setHeld([])
      },
    })
    opened.start(performance.now())
    setConnected(opened.isConnected())
    setConnection(opened)
  }

  function stop() {
    connection?.stop()
    setConnection(null)
    setConnected(false)
    setHeld([])
  }

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">2. MIDI controller</h2>        </div>
        <div className="flex items-center gap-3">
          {access && (
            <select
              className={field}
              aria-label="MIDI controller"
              value={deviceId}
              disabled={!!connection || devices.length === 0}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.length === 0 && <option value="">No controllers found</option>}
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name ?? device.id}
                </option>
              ))}
            </select>
          )}
          {!access && (
            <button className={primary} onClick={requestAccess}>
              Find MIDI controllers
            </button>
          )}
          {access && !connection && (
            <button className={primary} disabled={!deviceId} onClick={listen}>
              Start listening
            </button>
          )}
          {connection && (
            <button className={primary} onClick={stop}>
              Stop
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {connection && (
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <div className={`flex flex-col items-center justify-center gap-2 p-6 ${inset}`}>
            <div className="text-4xl font-bold">
              {held.length > 0 ? held.map((pitch) => midiToNoteName(pitch)).join(' ') : '—'}
            </div>
            <div
              className={connected ? 'text-sm text-muted' : 'text-sm font-semibold text-red-400'}
            >
              {connected ? 'Connected' : 'Unplugged. Plug it back in to continue.'}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Played notes</h3>
              <button className={secondary} onClick={() => setNotes([])}>
                Clear
              </button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-faint">Press a key. Each note appears when you let go.</p>
            ) : (
              <div className={`max-h-72 overflow-y-auto ${inset}`}>
                <table className="w-full text-sm tabular-nums">
                  <thead className="sticky top-0 bg-accent-base-start text-left text-muted">
                    <tr>
                      <th className="px-3 py-1.5">Note</th>
                      <th className="px-3 py-1.5">Onset (ms)</th>
                      <th className="px-3 py-1.5">Duration (ms)</th>
                      <th className="px-3 py-1.5">Velocity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((note) => (
                      <tr
                        key={`${note.startMs}-${note.midiPitch}`}
                        className="border-t border-accent-start"
                      >
                        <td className="px-3 py-1.5 font-semibold">
                          {midiToNoteName(note.midiPitch)}
                        </td>
                        <td className="px-3 py-1.5">{Math.round(note.startMs)}</td>
                        <td className="px-3 py-1.5">{Math.round(note.durationMs)}</td>
                        <td className="px-3 py-1.5">{note.velocity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

const EXERCISE: ExpectedNote[] = [60, 62, 64, 65, 67, 69, 71, 72].map((midiPitch, index) => ({
  index,
  midiPitch,
  startBeat: index,
  durationBeats: 1,
  velocity: 96,
}))
const COUNT_IN_BEATS = 4

function click(context: AudioContext, time: number, accent: boolean) {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.frequency.value = accent ? 1760 : 1320
  gain.gain.setValueAtTime(0.2, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03)
  osc.connect(gain).connect(context.destination)
  osc.start(time)
  osc.stop(time + 0.04)
}

interface TakeResult {
  bpm: number
  performed: PerformedNote[]
  score: ScoreResult
}

function ScoredTake({ input }: { input: AudioInput | null }) {
  const [bpm, setBpm] = useState(80)
  const [latencyMs, setLatencyMs] = useState(0)
  const [beat, setBeat] = useState<number | null>(null)
  const [result, setResult] = useState<TakeResult | null>(null)
  const frameId = useRef(0)

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameId.current)
      setBeat(null)
    }
  }, [input])

  function start() {
    if (!input) return
    const context = input.context
    const secondsPerBeat = 60 / bpm
    const clickStart = context.currentTime + 0.2
    // Scenario time 0: the Gameplay Engine's clock, on the same AudioContext as the mic.
    const startTime = clickStart + COUNT_IN_BEATS * secondsPerBeat
    for (let k = 0; k < COUNT_IN_BEATS + EXERCISE.length; k++) {
      click(context, clickStart + k * secondsPerBeat, k % 4 === 0)
    }
    input.takeNotes()
    setResult(null)

    const tick = () => {
      const now = (context.currentTime - startTime) / secondsPerBeat
      if (now < EXERCISE.length + 0.75) {
        setBeat(now)
        frameId.current = requestAnimationFrame(tick)
        return
      }
      setBeat(null)
      const performed = toPerformedNotes(input.takeNotes(), startTime, latencyMs)
      const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm, timeSigNum: 4, timeSigDen: 4 }]
      setResult({
        bpm,
        performed,
        score: scorePerformance({ expected: EXERCISE, tempoMap, performed }),
      })
    }
    frameId.current = requestAnimationFrame(tick)
  }

  const running = beat !== null
  const current = beat !== null && beat >= 0 ? Math.floor(beat) : null

  return (
    <section className={panel}>
      <div>
        <h2 className="text-xl font-bold">3. Scored take</h2>
        <p className="text-sm text-muted">
          Play a C major scale in quarter notes after a four-click count-in. Notes are timed on the
          scenario clock, corrected for input latency, and scored by the Scoring Engine. Headphones
          keep the metronome out of the mic.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Tempo (bpm)
          <input
            className={`${field} w-28`}
            type="number"
            min={40}
            max={200}
            value={bpm}
            disabled={running}
            onChange={(e) => setBpm(Number(e.target.value) || 80)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Input latency (ms)
          <input
            className={`${field} w-28`}
            type="number"
            min={0}
            max={300}
            value={latencyMs}
            disabled={running}
            onChange={(e) => setLatencyMs(Number(e.target.value) || 0)}
          />
        </label>
        <button className={primary} disabled={!input || running} onClick={start}>
          {input ? 'Start take' : 'Start the microphone first'}
        </button>
      </div>

      <div className="flex gap-2">
        {EXERCISE.map((note, i) => {
          const verdict = result?.score.breakdown.noteResults.find(
            (r) => r.expectedNoteIndex === note.index,
          )?.verdict
          const tone =
            current === i
              ? 'border-accent-start bg-accent-start text-ink'
              : verdict === 'hit'
                ? 'border-emerald-500 bg-white text-emerald-700'
                : verdict
                  ? 'border-red-500 bg-white text-red-600'
                  : 'border-accent-start bg-white text-black'
          return (
            <div
              key={note.index}
              className={`flex h-14 w-14 flex-col items-center justify-center rounded-lg border-2 text-sm font-semibold ${tone}`}
            >
              {midiToNoteName(note.midiPitch)}
              {verdict && <span className="text-[10px] font-normal">{verdict}</span>}
            </div>
          )
        })}
      </div>
      {running && beat < 0 && <p className="text-lg font-semibold">Count-in: {Math.ceil(-beat)}</p>}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-6">
            <div className="text-4xl font-bold tabular-nums">{result.score.finalScore}</div>
            <Stat label="Pitch" value={result.score.breakdown.pitchAccuracy} />
            <Stat label="Rhythm" value={result.score.breakdown.rhythmAccuracy} />
            <Stat label="Completeness" value={result.score.breakdown.completeness} />
            <Stat label="Extra notes" value={result.score.breakdown.extraNotes} />
            <button
              className={secondary}
              disabled={result.performed.length === 0}
              onClick={() =>
                download(performanceToMidi(result.performed, result.bpm), 'take.mid', 'audio/midi')
              }
            >
              Download take as MIDI
            </button>
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-faint">
              <tr>
                <th className="py-1">Expected</th>
                <th className="py-1">Verdict</th>
                <th className="py-1">Timing (ms)</th>
                <th className="py-1">Cents</th>
              </tr>
            </thead>
            <tbody>
              {result.score.breakdown.noteResults.map((r) => (
                <tr key={r.expectedNoteIndex} className="border-t border-accent-start">
                  <td className="py-1">
                    {midiToNoteName(EXERCISE[r.expectedNoteIndex].midiPitch)}
                  </td>
                  <td className="py-1">{r.verdict}</td>
                  <td className="py-1">{signed(Math.round(r.timingDeltaMs))}</td>
                  <td className="py-1">{signed(Math.round(r.centsDeviation))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-faint">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  )
}

const ALL_RECORDINGS: TestRecording[] = [...TEST_RECORDINGS, ...PIANO_RECORDINGS, PIANO_CHORD]

/** Piano recordings are transcribed with the piano settings, everything else with the defaults. */
function profileFor(rec: TestRecording) {
  const profile =
    PIANO_RECORDINGS.includes(rec) || rec === PIANO_CHORD ? PIANO_PROFILE : DEFAULT_PROFILE
  return { analyzer: profile.analyzer, segmenter: profile.segmenter }
}

interface Evaluation extends RecordingEvaluation {
  detected: number
  ms: number
}

function TestRecordings() {
  const contextRef = useRef<AudioContext | null>(null)
  const [results, setResults] = useState<Record<string, Evaluation>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => () => void contextRef.current?.close(), [])
  const audioContext = () => (contextRef.current ??= new AudioContext())

  function play(samples: Float32Array) {
    const context = audioContext()
    void context.resume()
    const buffer = context.createBuffer(1, samples.length, RECORDING_SAMPLE_RATE)
    buffer.getChannelData(0).set(samples)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start()
  }

  function evaluate(ids: string[]) {
    setBusy(true)
    // Yield so the busy state paints before transcription blocks the main thread.
    setTimeout(() => {
      const next: Record<string, Evaluation> = {}
      for (const rec of ALL_RECORDINGS.filter((r) => ids.includes(r.id))) {
        const started = performance.now()
        const detected = transcribe(renderRecording(rec), RECORDING_SAMPLE_RATE, profileFor(rec))
        next[rec.id] = {
          ...evaluateRecording(rec, detected),
          detected: detected.length,
          ms: performance.now() - started,
        }
      }
      setResults((prev) => ({ ...prev, ...next }))
      setBusy(false)
    }, 20)
  }

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">4. Test recordings</h2>
          <p className="text-sm text-muted">
            Synthetic takes with known pitches and rhythms, transcribed and scored against their
            answer keys. Match means onset within 50 ms and pitch within 1 semitone.
          </p>
        </div>
        <button
          className={primary}
          disabled={busy}
          onClick={() => evaluate(ALL_RECORDINGS.map((r) => r.id))}
        >
          {busy ? 'Transcribing…' : 'Evaluate all'}
        </button>
      </div>

      <div className={`overflow-x-auto ${inset}`}>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-faint">
            <tr>
              <th className="px-3 py-2">Recording</th>
              <th className="px-3 py-2">Expected</th>
              <th className="px-3 py-2">Detected</th>
              <th className="px-3 py-2">Matched</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {ALL_RECORDINGS.map((rec) => {
              const r = results[rec.id]
              const matched = rec.notes.length
                ? r &&
                  `${r.withinSemitone} (${Math.round((r.withinSemitone / rec.notes.length) * 100)}%)`
                : r && (r.detected === 0 ? 'none, as expected' : 'false positives')
              return (
                <tr key={rec.id} className="border-t border-accent-start align-top">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{rec.title}</div>
                    <div className="text-xs text-faint">{rec.description}</div>
                  </td>
                  <td className="px-3 py-2">{rec.notes.length}</td>
                  <td className="px-3 py-2">{r ? r.detected : '—'}</td>
                  <td className="px-3 py-2">{matched ?? '—'}</td>
                  <td className="px-3 py-2">{r?.score ? r.score.finalScore : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className={secondary} onClick={() => play(renderRecording(rec))}>
                        Play
                      </button>
                      <button
                        className={secondary}
                        disabled={busy}
                        onClick={() => evaluate([rec.id])}
                      >
                        Evaluate
                      </button>
                      <button
                        className={secondary}
                        onClick={() =>
                          download(
                            encodeWav(renderRecording(rec), RECORDING_SAMPLE_RATE),
                            `${rec.id}.wav`,
                            'audio/wav',
                          )
                        }
                      >
                        WAV
                      </button>
                      {rec.notes.length > 0 && (
                        <button
                          className={secondary}
                          title="The answer key as a MIDI file"
                          onClick={() =>
                            download(
                              answerKeyToMidi(rec.notes, rec.bpm),
                              `${rec.id}-answer-key.mid`,
                              'audio/midi',
                            )
                          }
                        >
                          MIDI
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <TranscribeFile audioContext={audioContext} />
    </section>
  )
}

const fileInput =
  'text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-start file:px-3 file:py-1.5 file:font-semibold file:text-ink'

const baseName = (filename: string) => filename.replace(/\.[^.]+$/, '')

function TranscribeFile({ audioContext }: { audioContext: () => AudioContext }) {
  const [audio, setAudio] = useState<{ name: string; notes: DetectedNote[] } | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [midiKey, setMidiKey] = useState<{ name: string; key: AnswerKey } | null>(null)
  const [midiError, setMidiError] = useState<string | null>(null)
  /** '' for none, 'midi' for the uploaded file, or a test recording id. */
  const [keySource, setKeySource] = useState('')
  const [beatZeroSeconds, setBeatZeroSeconds] = useState(0)

  async function onAudio(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAudioError(null)
    try {
      const buffer = await audioContext().decodeAudioData(await file.arrayBuffer())
      setAudio({ name: file.name, notes: transcribe(toMono(buffer), buffer.sampleRate) })
    } catch (err) {
      setAudioError(errorMessage(err))
    }
  }

  async function onMidi(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMidiError(null)
    try {
      setMidiKey({ name: file.name, key: answerKeyFromMidi(await file.arrayBuffer()) })
      setKeySource('midi')
      setBeatZeroSeconds(0)
    } catch (err) {
      setMidiError(errorMessage(err))
    }
  }

  function chooseKey(source: string) {
    setKeySource(source)
    const rec = TEST_RECORDINGS.find((r) => r.id === source)
    setBeatZeroSeconds(rec ? rec.leadInSeconds : 0)
  }

  const recording = TEST_RECORDINGS.find((r) => r.id === keySource)
  const key: AnswerKey | null =
    keySource === 'midi' ? (midiKey?.key ?? null) : recording ? recordingAnswerKey(recording) : null
  const evaluation = audio && key ? evaluateTranscription(audio.notes, key, beatZeroSeconds) : null

  function alignToFirstNote() {
    if (!audio?.notes.length || !key) return
    const firstExpected = beatToMs(key.expected[0].startBeat, key.tempoMap) / 1000
    setBeatZeroSeconds(Math.round((audio.notes[0].startTime - firstExpected) * 1000) / 1000)
  }

  function downloadTranscription() {
    if (!audio) return
    const offset = key ? beatZeroSeconds : 0
    const bpm = key ? key.tempoMap[0].bpm : 120
    download(
      performanceToMidi(toPerformedNotes(audio.notes, offset), bpm),
      `${baseName(audio.name)}-transcription.mid`,
      'audio/midi',
    )
  }

  return (
    <div className="flex flex-col gap-4 border-t-2 border-accent-start pt-4">
      <div>
        <h3 className="font-semibold">Transcribe a recording file</h3>
        <p className="text-sm text-muted">
          Any audio the browser can decode, such as a real instrument take or a WAV downloaded
          above. Score it against a MIDI file of the part, or against a test recording’s answer key.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted">
          Recording
          <input type="file" accept="audio/*" onChange={onAudio} className={fileInput} />
          {audioError && (
            <span className="text-red-400">Could not decode the file: {audioError}</span>
          )}
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          Answer key (MIDI)
          <input
            type="file"
            accept=".mid,.midi,audio/midi"
            onChange={onMidi}
            className={fileInput}
          />
          {midiError && (
            <span className="text-red-400">Could not read the MIDI file: {midiError}</span>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Score against
          <select className={field} value={keySource} onChange={(e) => chooseKey(e.target.value)}>
            <option value="">No answer key</option>
            <option value="midi" disabled={!midiKey}>
              {midiKey
                ? `MIDI: ${midiKey.name} (${midiKey.key.expected.length} notes)`
                : 'MIDI file (upload one)'}
            </option>
            {TEST_RECORDINGS.filter((r) => r.notes.length).map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        {key && (
          <>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Beat 1 starts at (s)
              <input
                className={`${field} w-28`}
                type="number"
                step={0.01}
                value={beatZeroSeconds}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (Number.isFinite(value)) setBeatZeroSeconds(value)
                }}
              />
            </label>
            <button
              className={secondary}
              disabled={!audio?.notes.length}
              onClick={alignToFirstNote}
            >
              Align to first note
            </button>
          </>
        )}
        <button
          className={secondary}
          disabled={!audio?.notes.length}
          onClick={downloadTranscription}
        >
          Download transcription as MIDI
        </button>
      </div>

      {audio && (
        <>
          <p className="text-sm">
            <span className="font-semibold">{audio.name}</span>: {audio.notes.length} notes detected
          </p>
          {key && evaluation?.score && (
            <div className="flex flex-wrap items-baseline gap-6">
              <div className="text-4xl font-bold tabular-nums">{evaluation.score.finalScore}</div>
              <Stat label="Pitch" value={evaluation.score.breakdown.pitchAccuracy} />
              <Stat label="Rhythm" value={evaluation.score.breakdown.rhythmAccuracy} />
              <Stat label="Completeness" value={evaluation.score.breakdown.completeness} />
              <Stat label="Extra notes" value={evaluation.score.breakdown.extraNotes} />
              <Stat label={`Matched of ${key.expected.length}`} value={evaluation.withinSemitone} />
            </div>
          )}
          <NoteTable notes={audio.notes} emptyText="No notes detected." />
        </>
      )}
    </div>
  )
}
