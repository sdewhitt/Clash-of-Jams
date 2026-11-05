/**
 * A live input level meter with a clip light, for setting the gain on an audio interface.
 *
 * The bar is redrawn every animation frame outside React; the advice under it only re-renders
 * when it changes.
 */
import { useEffect, useRef, useState } from 'react'

import {
  gainAdvice,
  GAIN_ADVICE_TEXT,
  LevelHold,
  levelToPercent,
  type GainAdvice,
  type InputLevel,
} from '@/audio/level'

interface LevelMeterProps {
  /** The current level, or null while nothing is being heard. */
  getLevel: () => InputLevel | null
  /** A single line, for the gameplay screen. */
  compact?: boolean
}

export function LevelMeter({ getLevel, compact = false }: LevelMeterProps) {
  const bar = useRef<HTMLDivElement>(null)
  const peak = useRef<HTMLDivElement>(null)
  const meter = useRef<HTMLDivElement>(null)
  const [advice, setAdvice] = useState<GainAdvice>('silent')
  const [clipping, setClipping] = useState(false)

  useEffect(() => {
    const hold = new LevelHold()
    let frame = 0
    const draw = () => {
      const level = getLevel()
      const now = performance.now()
      if (level) {
        const held = hold.update(level, now)
        const rms = levelToPercent(level.rmsDb)
        if (bar.current) bar.current.style.width = `${rms}%`
        if (peak.current) peak.current.style.left = `${levelToPercent(held.peakDb)}%`
        meter.current?.setAttribute('aria-valuenow', String(Math.round(level.rmsDb)))
        setAdvice(gainAdvice(held.peakDb, held.clipping))
        setClipping(held.clipping)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [getLevel])

  return (
    <div className={`flex w-full flex-col ${compact ? 'gap-1' : 'gap-2'}`}>
      <div className="flex items-center gap-3">
        <div
          ref={meter}
          role="meter"
          aria-label="Input level"
          aria-valuemin={-60}
          aria-valuemax={0}
          aria-valuenow={-60}
          className={`relative w-full overflow-hidden rounded-full border-2 border-accent-start bg-base-start ${
            compact ? 'h-3' : 'h-5'
          }`}
        >
          {/* Green to -12 dB, amber to -3 dB, red above: where the bar sits tells the story. */}
          <div className="absolute inset-0 bg-linear-to-r from-green-500 from-80% via-yellow-400 via-95% to-red-500 opacity-25" />
          <div
            ref={bar}
            className="absolute inset-y-0 left-0 bg-linear-to-r from-green-500 from-60% via-yellow-400 via-85% to-red-500"
            style={{ width: '0%' }}
          />
          <div ref={peak} className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: '0%' }} />
        </div>
        <span
          role="status"
          aria-label="Clipping"
          className={`shrink-0 rounded px-2 text-xs font-bold ${
            clipping ? 'bg-red-500 text-white' : 'bg-base-start text-faint'
          }`}
        >
          CLIP
        </span>
      </div>
      {!compact && (
        <p className={`text-sm ${advice === 'clipping' ? 'font-bold text-red-400' : 'text-muted'}`}>
          {GAIN_ADVICE_TEXT[advice]}
        </p>
      )}
      {compact && clipping && (
        <p className="text-xs font-bold text-red-400">{GAIN_ADVICE_TEXT.clipping}</p>
      )}
    </div>
  )
}
