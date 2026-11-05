/**
 * The audio input setting: which audio interface (or microphone) to play through, and which of
 * its inputs the instrument is plugged into. Saved on userSettings/{uid}, where gameplay, the
 * tuner and latency calibration read it.
 */
import { useEffect, useState } from 'react'

import { DEFAULT_INPUT_CHOICE, type AudioInputChoice } from '@/audio/devices'
import { useLiveAudioInput } from '@/audio/useLiveAudioInput'
import { AudioInputPicker } from '@/components/AudioInputPicker'
import { LevelMeter } from '@/components/LevelMeter'
import { loadAudioInputChoice, saveAudioInputChoice } from '@/lib/play/settings'

const BUTTON_CLASS =
  'rounded-xl border-3 border-accent-start bg-base-start px-6 py-3 font-bold text-ink ' +
  'hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
const LABEL_CLASS = 'flex flex-col gap-1 text-sm font-bold text-muted'
const CONTROL_CLASS =
  'w-full rounded-lg border-2 border-accent-start bg-base-start px-3 py-2 text-ink'

type Status = 'loading' | 'idle' | 'saved' | 'error'

export function AudioInputSetting({ uid }: { uid: string }) {
  const [choice, setChoice] = useState<AudioInputChoice>(DEFAULT_INPUT_CHOICE)
  const [status, setStatus] = useState<Status>('loading')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadAudioInputChoice(uid)
      .then((saved) => {
        if (cancelled) return
        setChoice(saved)
        setStatus('idle')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const monitor = useLiveAudioInput({ enabled: testing, choice, fallbackToDefault: false })

  async function choose(next: AudioInputChoice) {
    setChoice(next)
    try {
      await saveAudioInputChoice(uid, next)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section
      aria-labelledby="audio-input-title"
      className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border-3 border-accent-start
        bg-base-middle p-6"
    >
      <div>
        <h2 id="audio-input-title" className="text-2xl font-bold text-ink">
          Audio interface
        </h2>
        <p className="text-sm text-muted">
          Plug your instrument into an audio interface for less room noise than a laptop microphone.
          Pick the interface and the input your instrument is plugged into; only that input is
          listened to.
        </p>
      </div>

      <AudioInputPicker
        value={choice}
        onChange={(next) => void choose(next)}
        disabled={status === 'loading'}
        labelClass={LABEL_CLASS}
        controlClass={CONTROL_CLASS}
      />

      {testing && (
        <>
          <LevelMeter getLevel={monitor.getLevel} />
          {monitor.status === 'disconnected' && (
            <p className="text-sm text-yellow-400">The interface is unplugged.</p>
          )}
          {monitor.error && <p className="text-sm text-red-400">{monitor.error}</p>}
        </>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={status === 'loading'}
          onClick={() => setTesting((on) => !on)}
        >
          {testing ? 'Stop level test' : 'Test level'}
        </button>
        <p role="status" className="text-sm text-ink">
          {status === 'loading' && 'Loading your settings…'}
          {status === 'saved' && 'Saved.'}
          {status === 'error' && 'Could not load or save your audio settings.'}
        </p>
      </div>
    </section>
  )
}
