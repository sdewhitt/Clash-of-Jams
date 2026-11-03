/**
 * The tuner: tune an instrument before playing a scenario, so pitch scoring starts from an
 * in-tune instrument.
 *
 * It listens through the same input chain gameplay uses (the saved audio interface and input
 * channel, the same pitch detector), or to a MIDI controller. The input is reopened on its own
 * when it is unplugged and plugged back in, switched, or suspended by the browser, and the
 * tuner starts by itself after a reload once microphone access has been granted.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import type { AudioFrame } from '@/audio/analysis'
import { DEFAULT_INPUT_CHOICE, type AudioInputChoice } from '@/audio/devices'
import { PIANO_PROFILE } from '@/audio/instruments'
import { listMidiInputs, openMidiInput, requestMidiAccess } from '@/audio/midi-input'
import { useLiveAudioInput, type LiveInputStatus } from '@/audio/useLiveAudioInput'
import { AudioInputPicker } from '@/components/AudioInputPicker'
import { BackButton } from '@/components/BackButton'
import { LevelMeter } from '@/components/LevelMeter'
import { ProfileButton } from '@/components/ProfileButton'
import { TunerDisplay } from '@/components/TunerDisplay'
import { useAuth } from '@/lib/auth/useAuth'
import { loadAudioInputChoice, saveAudioInputChoice } from '@/lib/play/settings'
import {
  clampA4,
  DEFAULT_A4_HZ,
  MAX_A4_HZ,
  MIN_A4_HZ,
  PitchSmoother,
  readMidi,
  type TunerReading,
} from '@/lib/tuner/tuner'

type Source = 'audio' | 'midi'

const A4_KEY = 'coj.tuner.a4'
const SOURCE_KEY = 'coj.tuner.source'

const controlClass = 'w-full rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black'
const labelClass = 'flex flex-col gap-1 text-sm font-semibold text-ink'
const buttonClass =
  'rounded-xl border-3 border-accent-start bg-accent-start px-6 py-3 text-lg font-bold text-ink ' +
  'hover:brightness-110 active:scale-[0.98]'

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private browsing can refuse storage; the tuner still works for this visit.
  }
}

/** Whether microphone access was already granted, so the tuner can start without a click. */
async function microphoneGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
    return status?.state === 'granted'
  } catch {
    return false
  }
}

export function Tuner() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [source, setSource] = useState<Source>(() =>
    readStored(SOURCE_KEY) === 'midi' ? 'midi' : 'audio',
  )
  const [a4Hz, setA4Hz] = useState(() => clampA4(Number(readStored(A4_KEY) ?? DEFAULT_A4_HZ)))
  const [choice, setChoice] = useState<AudioInputChoice>(DEFAULT_INPUT_CHOICE)
  const [listening, setListening] = useState(false)
  const [reading, setReading] = useState<TunerReading | null>(null)
  const [suspended, setSuspended] = useState(false)

  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [midiDevices, setMidiDevices] = useState<MIDIInput[]>([])
  const [midiDeviceId, setMidiDeviceId] = useState('')
  const [midiConnected, setMidiConnected] = useState(true)
  const [midiError, setMidiError] = useState<string | null>(null)

  const smoother = useRef(new PitchSmoother())
  /** The smoothed pitch, as fractional MIDI at A4 = 440, written by the audio thread's frames. */
  const pitch = useRef<number | null>(null)
  const a4Now = useRef(a4Hz)
  useEffect(() => {
    a4Now.current = a4Hz
  }, [a4Hz])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    loadAudioInputChoice(user.uid)
      .then((saved) => {
        if (!cancelled) setChoice(saved)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  // After a reload, pick up where the player left off if the browser lets us.
  useEffect(() => {
    let cancelled = false
    void microphoneGranted().then((granted) => {
      if (granted && !cancelled) setListening(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onFrame = useCallback((frame: AudioFrame) => {
    pitch.current = smoother.current.push(frame.midi, frame.clarity, performance.now())
  }, [])

  const { isSuspended, ...audio } = useLiveAudioInput({
    enabled: listening && source === 'audio',
    choice,
    analyzer: PIANO_PROFILE.analyzer,
    onFrame,
  })

  // Frames arrive far faster than the screen refreshes; draw at most once a frame.
  useEffect(() => {
    if (source !== 'audio') return
    let frame = 0
    const draw = () => {
      const midi = pitch.current
      setReading((previous) => {
        const next = midi === null ? null : readMidi(midi, a4Now.current)
        if (previous === null || next === null) return next
        return Math.abs(previous.cents - next.cents) < 0.1 && previous.noteName === next.noteName
          ? previous
          : next
      })
      setSuspended(isSuspended())
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [source, isSuspended])

  /** Switching inputs starts the reading afresh rather than blending two instruments. */
  function clearReading() {
    smoother.current.reset()
    pitch.current = null
    setReading(null)
  }

  useEffect(() => {
    if (source !== 'midi' || !listening) return
    let access: MIDIAccess | null = null
    function refresh() {
      if (!access) return
      const devices = listMidiInputs(access)
      setMidiDevices(devices)
      setMidiDeviceId((current) => current || devices[0]?.id || '')
    }
    requestMidiAccess()
      .then((granted) => {
        access = granted
        setMidiAccess(granted)
        setMidiError(null)
        refresh()
        granted.addEventListener('statechange', refresh)
      })
      .catch((e: unknown) => setMidiError(e instanceof Error ? e.message : String(e)))
    return () => access?.removeEventListener('statechange', refresh)
  }, [source, listening])

  // A MIDI note is its own pitch: the reading is exact, so a controller reads perfectly in tune.
  useEffect(() => {
    if (source !== 'midi' || !midiAccess || !midiDeviceId) return
    const connection = openMidiInput({
      access: midiAccess,
      deviceId: midiDeviceId,
      onNoteOn: (note) => setReading(readMidi(note, a4Now.current)),
      onConnectionChange: setMidiConnected,
    })
    return () => connection.stop()
  }, [source, midiAccess, midiDeviceId])

  function chooseInput(next: AudioInputChoice) {
    setChoice(next)
    clearReading()
    if (user) saveAudioInputChoice(user.uid, next).catch(console.error)
  }

  function chooseSource(next: Source) {
    setSource(next)
    clearReading()
    store(SOURCE_KEY, next)
  }

  function chooseA4(value: number) {
    const clamped = clampA4(value)
    setA4Hz(clamped)
    store(A4_KEY, String(clamped))
  }

  return (
    <main className="h-screen flex flex-col">
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
        <div className="flex ml-12">
          <BackButton onClick={() => navigate('/home')}></BackButton>
          <h1 className="ml-4 text-4xl font-bold text-ink">Tuner</h1>
        </div>

        <div className="mr-6">
          <ProfileButton
            username={profile?.displayName ?? user?.email ?? '…'}
            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
          />
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col items-center gap-6 overflow-y-auto px-6 py-8">
        <TunerDisplay reading={reading} a4Hz={a4Hz} />

        <section
          aria-label="Tuner input"
          className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border-3 border-accent-start bg-base-middle p-6 text-ink"
        >
          <div className="grid grid-cols-2 gap-4">
            <label className={labelClass}>
              Listen to
              <select
                value={source}
                onChange={(e) => chooseSource(e.target.value as Source)}
                className={controlClass}
              >
                <option value="audio">Microphone or audio interface</option>
                <option value="midi">MIDI controller</option>
              </select>
            </label>
            <label className={labelClass}>
              Reference A4 (Hz)
              <input
                type="number"
                min={MIN_A4_HZ}
                max={MAX_A4_HZ}
                value={a4Hz}
                onChange={(e) => chooseA4(Number(e.target.value))}
                className={controlClass}
              />
            </label>
          </div>

          {source === 'audio' && (
            <>
              <AudioInputPicker
                value={choice}
                onChange={chooseInput}
                labelClass={labelClass}
                controlClass={controlClass}
              />
              {listening && <LevelMeter getLevel={audio.getLevel} />}
            </>
          )}

          {source === 'midi' && listening && (
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

          <TunerStatus
            listening={listening}
            source={source}
            audioStatus={audio.status}
            audioError={audio.error}
            suspended={suspended}
            midiConnected={midiConnected}
            midiError={midiError}
          />

          {!listening ? (
            <button type="button" onClick={() => setListening(true)} className={buttonClass}>
              Start tuner
            </button>
          ) : (
            audio.status === 'error' &&
            source === 'audio' && (
              <button type="button" onClick={audio.retry} className={buttonClass}>
                Try again
              </button>
            )
          )}
        </section>
      </div>
    </main>
  )
}

interface StatusInputs {
  listening: boolean
  source: Source
  audioStatus: LiveInputStatus
  audioError: string | null
  suspended: boolean
  midiConnected: boolean
  midiError: string | null
}

const MUTED = 'text-muted'
const WARNING = 'text-yellow-400'
const ERROR = 'text-red-400'

function statusMessage(props: StatusInputs): [message: string, tone: string] {
  if (!props.listening) {
    return ['Press Start tuner and allow audio access when your browser asks.', MUTED]
  }
  if (props.source === 'midi') {
    if (props.midiError) return [props.midiError, ERROR]
    if (!props.midiConnected)
      return ['Your MIDI controller was unplugged. Plug it back in.', WARNING]
    return ['Play a key. MIDI notes are exact, so they read in tune at A4 = 440 Hz.', MUTED]
  }
  if (props.suspended) return ['Audio is paused by the browser. Click anywhere to resume.', WARNING]
  switch (props.audioStatus) {
    case 'starting':
      return ['Opening your audio input…', MUTED]
    case 'live':
      return ['Listening. Play one note at a time and let it ring.', MUTED]
    case 'fallback':
      return [
        'Your audio interface is unplugged, so the tuner is using the default input. It ' +
          'switches back when you plug the interface in.',
        WARNING,
      ]
    case 'disconnected':
      return ['The audio input was disconnected. Reconnecting…', WARNING]
    case 'error':
      return [props.audioError ?? 'Could not open the audio input.', ERROR]
    default:
      return ['', MUTED]
  }
}

function TunerStatus(props: StatusInputs) {
  const [message, tone] = statusMessage(props)
  return (
    <p role="status" aria-label="Tuner status" className={`min-h-5 text-sm ${tone}`}>
      {message}
    </p>
  )
}
