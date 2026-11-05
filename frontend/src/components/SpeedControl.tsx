import { useId } from 'react'

import {
  clampSpeed,
  describeTempo,
  formatSpeed,
  MAX_SPEED,
  MIN_SPEED,
  SPEED_PRESETS,
  SPEED_STEP,
} from '@/lib/play/speed'
import type { TempoMapEntry } from '@/lib/schema/types'

interface SpeedControlProps {
  value: number
  onChange: (speed: number) => void
  tempoMap: TempoMapEntry[]
  /** Locked, e.g. while a scenario is being played. */
  disabled?: boolean
  /** Shown under the control when it is locked. */
  lockedReason?: string
  label?: string
}

/** A slider from 0.3x to 3x with presets, showing the speed and the tempo it gives. */
export function SpeedControl({
  value,
  onChange,
  tempoMap,
  disabled = false,
  lockedReason,
  label = 'Speed',
}: SpeedControlProps) {
  const sliderId = useId()
  return (
    <div className="flex w-full flex-col gap-2 text-ink">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={sliderId} className="text-sm font-semibold">
          {label}
        </label>
        <output
          htmlFor={sliderId}
          aria-label="Current speed"
          className="text-lg font-bold tabular-nums"
        >
          {describeTempo(tempoMap, value)}
        </output>
      </div>
      <input
        id={sliderId}
        type="range"
        min={MIN_SPEED}
        max={MAX_SPEED}
        step={SPEED_STEP}
        value={value}
        disabled={disabled}
        aria-valuetext={formatSpeed(value)}
        onChange={(e) => onChange(clampSpeed(Number(e.target.value)))}
        className="w-full accent-accent-start disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Speed presets">
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            aria-pressed={value === preset}
            onClick={() => onChange(preset)}
            className={`rounded-lg border-2 border-accent-start px-3 py-1 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
              value === preset
                ? 'bg-accent-start text-ink'
                : 'bg-white text-black hover:brightness-95'
            }`}
          >
            {formatSpeed(preset)}
          </button>
        ))}
      </div>
      {disabled && lockedReason && <p className="text-xs text-muted">{lockedReason}</p>}
    </div>
  )
}
