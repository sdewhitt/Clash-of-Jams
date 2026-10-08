import { useEffect, useId, useRef, useState } from 'react'

import { EloDisplay } from '@/components/EloDisplay'
import { useAuth } from '@/lib/auth/useAuth'
import { useInstrumentPreference } from '@/lib/ratings/useInstrumentPreference'
import { useSkillRatings } from '@/lib/ratings/useSkillRatings'
import { INSTRUMENTS, type Instrument } from '@/lib/schema/types'

export function LiveElo() {
  const { user } = useAuth()
  const { ratings, preferredInstrument, loading, error } = useSkillRatings(user?.uid)
  const { instrument, saving, saveError, selectInstrument } = useInstrumentPreference(
    user?.uid,
    preferredInstrument,
  )
  const [openFor, setOpenFor] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const open = !!user && openFor === user.uid

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpenFor(null)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenFor(null)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  if (!user) return null
  const rating = ratings.find((item) => item.instrument === instrument)
  return (
    <div ref={container} className="shrink-0 sm:relative">
      <button
        ref={trigger}
        type="button"
        aria-label={'View ' + instrument + ' Elo details'}
        aria-expanded={open}
        aria-controls={panelId}
        className="cursor-pointer whitespace-nowrap rounded-lg focus-visible:outline-3 focus-visible:outline-white"
        onClick={() => setOpenFor(open ? null : user.uid)}
      >
        <div aria-live="polite" aria-atomic="true">
          {loading ? (
            <span className="text-sm text-muted">Loading Elo…</span>
          ) : rating ? (
            <EloDisplay instrument={rating.instrument} tier={rating.tier} elo={rating.elo} />
          ) : (
            <span className="text-sm text-muted">
              {error ? 'Elo unavailable' : 'No rating yet'}
            </span>
          )}
        </div>
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Elo details"
          className="absolute left-4 right-4 top-full z-50 mt-3 rounded-xl border-3 border-accent-start bg-accent-base-start p-5 text-ink shadow-xl sm:left-auto sm:right-0 sm:w-72"
        >
          <h2 className="mb-3 text-lg font-bold">Your Elo</h2>
          <label htmlFor={panelId + '-instrument'} className="mb-2 block text-sm font-bold">
            Instrument
          </label>
          <select
            id={panelId + '-instrument'}
            value={instrument}
            disabled={saving || loading}
            onChange={(event) => {
              void selectInstrument(event.target.value as Instrument)
            }}
            className="w-full cursor-pointer rounded-lg border-2 border-accent-start bg-accent-base-middle px-3 py-2 capitalize disabled:cursor-not-allowed"
          >
            {INSTRUMENTS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {rating && (
            <p className="mt-3 text-sm">
              {rating.gamesPlayed} rated matches ·{' '}
              {rating.isProvisional ? 'Provisional' : 'Established'}
            </p>
          )}
          {!loading && !error && !rating && (
            <p className="mt-3 text-sm">No rating for this instrument yet.</p>
          )}
          <p className="mt-3 text-sm">
            Each instrument has its own Elo. Wins raise it, losses lower it, and draws can change it
            based on your opponent’s rating. Beating a stronger opponent earns more points.
          </p>
          <p className="mt-2 text-sm text-muted">
            Your instrument choice is saved to your account.
          </p>
          {saving && (
            <p role="status" className="mt-2 text-sm">
              Saving…
            </p>
          )}
          {(error || saveError) && (
            <p role="alert" className="mt-2 text-sm">
              {saveError ?? error}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
