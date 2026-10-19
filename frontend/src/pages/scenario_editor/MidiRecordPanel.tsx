/**
 * Recording from a MIDI controller straight into the scenario editor (user story #26).
 *
 * Recording counts in one bar at the opening tempo, then clicks along with the chart's tempo
 * map while the author plays. Notes that finish are previewed in the piano roll as they come
 * in; Stop converts the whole take to beats (audio/midi-input times it in milliseconds) and
 * hands it to the editor, either added to the part or replacing it.
 *
 * Calibration plays a run of clicks and measures how late the controller's notes arrive, with
 * the same estimator the microphone calibration uses. That offset is saved to the user's
 * settings and taken off every recorded note.
 *
 * MIDI access is only requested when the author asks for it, because Chrome now prompts for
 * it. Without Web MIDI the panel says so and the editor carries on with the mouse.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  audioTimeToPerformanceMs,
  listMidiInputs,
  openMidiInput,
  requestMidiAccess,
} from '@/audio/midi-input'
import type { MidiInputConnection } from '@/audio/midi-input'
import type { NoteInput } from '@/lib/chart/edits'
import { beatToMs, beatsPerBar, tempoAt } from '@/lib/chart/notes'
import { recordedToNotes } from '@/lib/chart/record'
import { estimateLatencyMs } from '@/lib/play/latency'
import { scheduleClicks } from '@/lib/play/metronome'
import { loadMidiLatencyMs, saveMidiLatencyMs } from '@/lib/play/settings'
import type { NoteChart } from '@/lib/schema/types'
import type { PerformedNote } from '@/scoring/score'

const BUTTON_CLASS =
  'rounded-lg border-2 border-base-middle px-4 py-2 text-sm font-bold text-ink ' +
  'transition-colors hover:border-accent-start hover:bg-accent-base-middle ' +
  'disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-base-middle ' +
  'disabled:hover:bg-transparent'

const SELECT_CLASS =
  'rounded-lg border-2 border-base-middle bg-base-end px-2 py-1 text-ink ' +
  'focus:border-accent-start focus:outline-none'

const QUANTIZE_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 0.5, label: '1/2 beat' },
  { value: 0.25, label: '1/4 beat' },
  { value: 0.125, label: '1/8 beat' },
]

/** How far ahead the click track is scheduled, and how often the scheduler wakes. */
const LOOKAHEAD_SECONDS = 0.2
const SCHEDULER_MS = 50
/** Breathing room before the first click, so it is never scheduled in the past. */
const START_DELAY_SECONDS = 0.15

const CALIBRATION_BPM = 100
const CALIBRATION_CLICKS = 10

type Access =
  | { kind: 'unrequested' }
  | { kind: 'unsupported' }
  | { kind: 'requesting' }
  | { kind: 'denied'; message: string }
  | { kind: 'ready'; access: MIDIAccess }

type Mode = 'idle' | 'count-in' | 'recording' | 'calibrating'

interface Session {
  context: AudioContext
  connection: MidiInputConnection
  timers: number[]
  stopClicks: (() => void)[]
}

export interface MidiRecordPanelProps {
  chart: NoteChart
  /** Signed-in user, whose calibration is loaded and saved; null keeps it for this visit. */
  uid: string | null
  /** The take so far, for the piano roll to draw; null when nothing is being recorded. */
  onPreview: (take: { notes: NoteInput[]; replace: boolean } | null) => void
  /** The finished take, in beats. */
  onCommit: (notes: NoteInput[], replace: boolean) => void
}

export function MidiRecordPanel({ chart, uid, onPreview, onCommit }: MidiRecordPanelProps) {
  const [access, setAccess] = useState<Access>(() =>
    typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
      ? { kind: 'unrequested' }
      : { kind: 'unsupported' },
  )
  const [devices, setDevices] = useState<MIDIInput[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [mode, setMode] = useState<Mode>('idle')
  const [replace, setReplace] = useState(false)
  const [quantize, setQuantize] = useState(0)
  const [latencyMs, setLatencyMs] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const session = useRef<Session | null>(null)
  // The chart and options a take started with; the tempo map cannot change mid-take.
  const take = useRef({ chart, replace, quantize, latencyMs, played: [] as PerformedNote[] })

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    loadMidiLatencyMs(uid)
      .then((ms) => !cancelled && setLatencyMs(ms))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [uid])

  // Keeps the device list current as controllers are plugged in and out.
  useEffect(() => {
    if (access.kind !== 'ready') return
    const midi = access.access
    const refresh = () => {
      const inputs = listMidiInputs(midi)
      setDevices(inputs)
      setDeviceId((current) =>
        inputs.some((input) => input.id === current) ? current : (inputs[0]?.id ?? ''),
      )
    }
    refresh()
    midi.addEventListener('statechange', refresh)
    return () => midi.removeEventListener('statechange', refresh)
  }, [access])

  // Leaving the editor mid-take must not leave clicks running or the device held.
  useEffect(() => () => endSession(), [])

  async function connect() {
    setAccess({ kind: 'requesting' })
    try {
      setAccess({ kind: 'ready', access: await requestMidiAccess() })
    } catch (error: unknown) {
      setAccess({
        kind: 'denied',
        message:
          error instanceof Error && error.name !== 'SecurityError'
            ? error.message
            : 'MIDI access was blocked. Allow it in the browser to record from a controller.',
      })
    }
  }

  function beginSession(onNote?: (note: PerformedNote) => void): Session | null {
    if (access.kind !== 'ready' || !deviceId) return null
    const context = new AudioContext({ latencyHint: 'interactive' })
    const connection = openMidiInput({
      access: access.access,
      deviceId,
      onNote,
      onConnectionChange: (connected) => {
        if (!connected) setMessage('The controller was disconnected.')
      },
    })
    session.current = { context, connection, timers: [], stopClicks: [] }
    return session.current
  }

  function endSession() {
    const current = session.current
    if (!current) return
    session.current = null
    for (const timer of current.timers) {
      clearInterval(timer)
      clearTimeout(timer)
    }
    for (const stop of current.stopClicks) stop()
    current.connection.stop()
    void current.context.close().catch(() => undefined)
  }

  function startRecording() {
    setMessage(null)
    take.current = { chart, replace, quantize, latencyMs, played: [] }
    const current = beginSession((note) => {
      take.current.played.push(note)
      onPreview({ notes: convert(take.current.played), replace: take.current.replace })
    })
    if (!current) return
    const { context, connection } = current

    const opening = tempoAt(chart, 0)
    const barBeats = beatsPerBar(opening)
    const secondsPerBeat = 60 / opening.bpm
    const beatZero = context.currentTime + START_DELAY_SECONDS + barBeats * secondsPerBeat

    // One bar of count-in, accented on the downbeat.
    current.stopClicks.push(
      scheduleClicks(
        context,
        Array.from({ length: Math.ceil(barBeats) }, (_, beat) => ({
          time: beatZero - (barBeats - beat) * secondsPerBeat,
          accent: beat === 0,
        })),
      ),
    )

    // Then a click on every beat for as long as the take runs, following tempo changes.
    let nextBeat = 0
    const scheduleAhead = () => {
      const clicks = []
      for (;;) {
        const time = beatZero + beatToMs(chart, nextBeat) / 1000
        if (time > context.currentTime + LOOKAHEAD_SECONDS) break
        const meter = beatsPerBar(tempoAt(chart, nextBeat))
        clicks.push({ time, accent: nextBeat % meter === 0 })
        nextBeat += 1
      }
      if (clicks.length > 0) current.stopClicks.push(scheduleClicks(context, clicks))
    }
    scheduleAhead()
    current.timers.push(window.setInterval(scheduleAhead, SCHEDULER_MS))
    current.timers.push(
      window.setTimeout(
        () => setMode((now) => (now === 'count-in' ? 'recording' : now)),
        (beatZero - context.currentTime) * 1000,
      ),
    )

    connection.start(audioTimeToPerformanceMs(context, beatZero))
    onPreview({ notes: [], replace })
    setMode('count-in')
  }

  function stopRecording() {
    const notes = session.current?.connection.takeNotes() ?? []
    endSession()
    setMode('idle')
    onPreview(null)
    const recorded = convert(notes)
    if (recorded.length === 0) {
      setMessage('Nothing was recorded.')
      return
    }
    onCommit(recorded, take.current.replace)
    setMessage(`Recorded ${recorded.length} ${recorded.length === 1 ? 'note' : 'notes'}.`)
  }

  function convert(played: PerformedNote[]) {
    const { chart: atStart, quantize: grid, latencyMs: offsetMs } = take.current
    return recordedToNotes(played, atStart, { offsetMs, snapBeats: grid || null })
  }

  function calibrate() {
    setMessage('Play one note on each click.')
    const current = beginSession()
    if (!current) return
    const { context, connection } = current

    const interval = 60 / CALIBRATION_BPM
    const firstClick = context.currentTime + START_DELAY_SECONDS + 4 * interval
    // Four lead-in clicks to find the pulse, then the ones that are measured.
    const leadIn = Array.from({ length: 4 }, (_, at) => firstClick - (4 - at) * interval)
    const measured = Array.from(
      { length: CALIBRATION_CLICKS },
      (_, at) => firstClick + at * interval,
    )
    current.stopClicks.push(
      scheduleClicks(context, [
        ...leadIn.map((time, at) => ({ time, accent: at === 0 })),
        ...measured.map((time) => ({ time, accent: false })),
      ]),
    )
    connection.start(audioTimeToPerformanceMs(context, firstClick))
    setMode('calibrating')

    const done = measured[measured.length - 1] + interval - context.currentTime
    current.timers.push(
      window.setTimeout(() => {
        const onsets = connection.takeNotes().map((note) => firstClick + note.startMs / 1000)
        endSession()
        setMode('idle')
        const measuredMs = estimateLatencyMs(measured, onsets)
        if (measuredMs === null) {
          setMessage('Too few notes landed near the clicks. Try calibrating again.')
          return
        }
        setLatencyMs(measuredMs)
        setMessage(`MIDI latency set to ${measuredMs} ms.`)
        if (uid) {
          saveMidiLatencyMs(uid, measuredMs).catch(() =>
            setMessage(`MIDI latency set to ${measuredMs} ms, but it could not be saved.`),
          )
        }
      }, done * 1000),
    )
  }

  function cancelCalibration() {
    endSession()
    setMode('idle')
    setMessage(null)
  }

  if (access.kind === 'unsupported') {
    return (
      <Frame>
        <p className="text-sm text-muted">
          This browser can't use MIDI controllers, so recording is unavailable. Try Chrome or Edge
          -- you can still place notes with the mouse.
        </p>
      </Frame>
    )
  }

  if (access.kind !== 'ready') {
    return (
      <Frame>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={access.kind === 'requesting'}
          onClick={() => void connect()}
        >
          {access.kind === 'requesting' ? 'Connecting...' : 'Connect MIDI controller'}
        </button>
        {access.kind === 'denied' && <p className="text-sm text-accent-end">{access.message}</p>}
      </Frame>
    )
  }

  if (devices.length === 0) {
    return (
      <Frame>
        <p className="text-sm text-muted">
          No MIDI controller is connected. Plug one in to record, or keep editing with the mouse.
        </p>
      </Frame>
    )
  }

  const busy = mode !== 'idle'
  const recording = mode === 'count-in' || mode === 'recording'

  return (
    <Frame>
      <label className="flex items-center gap-2 text-sm font-bold text-muted">
        Controller
        <select
          value={deviceId}
          disabled={busy}
          onChange={(event) => setDeviceId(event.target.value)}
          className={SELECT_CLASS}
        >
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name || 'MIDI input'}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm font-bold text-muted">
        Quantize
        <select
          value={quantize}
          disabled={busy}
          onChange={(event) => setQuantize(Number(event.target.value))}
          className={SELECT_CLASS}
        >
          {QUANTIZE_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm font-bold text-muted">
        <input
          type="checkbox"
          checked={replace}
          disabled={busy}
          onChange={(event) => setReplace(event.target.checked)}
          className="accent-accent-start"
        />
        Replace existing notes
      </label>

      {recording ? (
        <button type="button" className={BUTTON_CLASS} onClick={stopRecording}>
          {mode === 'count-in' ? 'Counting in... Stop' : 'Stop recording'}
        </button>
      ) : (
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={startRecording}>
          Record
        </button>
      )}

      {mode === 'calibrating' ? (
        <button type="button" className={BUTTON_CLASS} onClick={cancelCalibration}>
          Cancel calibration
        </button>
      ) : (
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={calibrate}>
          Calibrate
        </button>
      )}

      <span className="text-sm text-faint">Latency {latencyMs} ms</span>
      {mode === 'recording' && (
        <span role="status" className="text-sm font-bold text-accent-start">
          Recording
        </span>
      )}
      {message && (
        <p role="status" className="w-full text-sm text-muted">
          {message}
        </p>
      )}
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="MIDI recording"
      className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-base-middle p-3"
    >
      {children}
    </section>
  )
}
