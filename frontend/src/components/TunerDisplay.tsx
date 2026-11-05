/**
 * The tuner's face: the nearest note, a needle showing how far off it is, and the numbers
 * behind it. Purely presentational, so any pitch can be shown and checked in isolation.
 */
import {
  formatCents,
  IN_TUNE_CENTS,
  NEEDLE_RANGE_CENTS,
  needlePercent,
  type TunerReading,
} from '@/lib/tuner/tuner'

const STATUS_TEXT = {
  in_tune: 'In tune',
  flat: 'Flat · tune up',
  sharp: 'Sharp · tune down',
} as const

const STATUS_CLASS = {
  in_tune: 'bg-green-500 text-white',
  flat: 'bg-yellow-400 text-black',
  sharp: 'bg-yellow-400 text-black',
} as const

const TICKS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]

interface TunerDisplayProps {
  reading: TunerReading | null
  /** Reference pitch of A4, shown so a non-440 reference is never a surprise. */
  a4Hz: number
}

export function TunerDisplay({ reading, a4Hz }: TunerDisplayProps) {
  const inTuneHalfWidth = (IN_TUNE_CENTS / NEEDLE_RANGE_CENTS) * 50
  const octave = reading ? reading.noteName.match(/-?\d+$/)?.[0] : undefined
  const letter = reading ? reading.noteName.replace(/-?\d+$/, '') : '—'

  return (
    <section
      aria-label="Tuner"
      className="flex w-full max-w-2xl flex-col items-center gap-5 rounded-xl border-3 border-accent-start bg-base-middle p-6 text-ink"
    >
      <div className="flex items-start" aria-label="Detected note" role="status">
        <span className="text-8xl font-bold leading-none tabular-nums" data-testid="tuner-note">
          {letter}
        </span>
        {octave !== undefined && <span className="mt-2 text-3xl font-bold">{octave}</span>}
      </div>

      <div className="relative h-16 w-full" aria-hidden="true">
        <div
          className="absolute inset-y-3 rounded bg-green-500/30"
          style={{ left: `${50 - inTuneHalfWidth}%`, width: `${inTuneHalfWidth * 2}%` }}
        />
        {TICKS.map((tick) => (
          <div
            key={tick}
            className={`absolute bottom-0 w-px -translate-x-1/2 bg-ink ${tick === 0 ? 'top-0' : 'top-6 opacity-50'}`}
            style={{ left: `${needlePercent(tick)}%` }}
          />
        ))}
        {reading && (
          <div
            data-testid="tuner-needle"
            className={`absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full transition-[left] duration-75 ${
              reading.status === 'in_tune' ? 'bg-green-500' : 'bg-accent-start'
            }`}
            style={{ left: `${needlePercent(reading.cents)}%` }}
          />
        )}
      </div>
      <div className="flex w-full justify-between text-xs text-muted" aria-hidden="true">
        <span>−50 ♭</span>
        <span>0</span>
        <span>♯ +50</span>
      </div>

      <div
        role="meter"
        aria-label="Cents from target"
        aria-valuemin={-NEEDLE_RANGE_CENTS}
        aria-valuemax={NEEDLE_RANGE_CENTS}
        aria-valuenow={reading ? Math.round(reading.cents) : 0}
        aria-valuetext={reading ? formatCents(reading.cents) : 'No pitch'}
        className={`rounded-full px-5 py-2 text-xl font-bold ${
          reading ? STATUS_CLASS[reading.status] : 'bg-base-start text-muted'
        }`}
      >
        {reading ? `${formatCents(reading.cents)} · ${STATUS_TEXT[reading.status]}` : 'Play a note'}
      </div>

      <dl className="grid w-full grid-cols-3 gap-4 text-center">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Heard</dt>
          <dd className="text-xl font-bold tabular-nums">
            {reading ? `${reading.hz.toFixed(1)} Hz` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Target</dt>
          <dd className="text-xl font-bold tabular-nums">
            {reading ? `${reading.noteName} · ${reading.targetHz.toFixed(1)} Hz` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Reference</dt>
          <dd className="text-xl font-bold tabular-nums">A4 = {a4Hz} Hz</dd>
        </div>
      </dl>
    </section>
  )
}
