/**
 * The end of a multiplayer match: win, loss or tie, both players' score breakdowns side by
 * side, who the opponent is and what they are good at, how the Elo change was worked out, and
 * what to work on next.
 */
import { Timestamp } from 'firebase/firestore'

import { RatingResult } from '@/components/RatingResult'
import {
  explainElo,
  improvementTips,
  performanceStats,
  resultHeadline,
  strengthsAndWeaknesses,
  type PerformanceStats,
  type ResultHeadline,
  type SnapshotRatingEvent,
  type Trait,
} from '@/lib/multiplayer/breakdown'
import { useOpponentProfile } from '@/lib/multiplayer/opponent'
import type { SessionPlayer, SessionSnapshot } from '@/lib/multiplayer/types'

const HEADLINE_CLASS: Record<ResultHeadline, string> = {
  Win: 'bg-green-500 text-white',
  Tie: 'bg-yellow-400 text-black',
  Loss: 'bg-red-500 text-white',
  Forfeit: 'bg-red-500 text-white',
}

const HEADLINE_TEXT: Record<ResultHeadline, string> = {
  Win: 'You won!',
  Tie: "It's a tie",
  Loss: 'You lost',
  Forfeit: 'You forfeited',
}

const card = 'rounded-xl border-3 border-accent-start bg-accent-base-start p-5 text-ink'

interface MatchResultsProps {
  snapshot: SessionSnapshot
  selfUid: string | undefined
  onHome: () => void
  buttonClass: string
}

/**
 * The beats actually played: a whole match normally, but only up to the last hit when it was
 * cut short by a resignation or disconnect, so the unplayed rest is not counted as misses.
 */
function playedBeats(snapshot: SessionSnapshot, events: SnapshotRatingEvent[]): number {
  const cutShort = events.some((event) => event.reason !== 'completed')
  if (!cutShort) return snapshot.totalBeats
  const lastHit = Math.max(-1, ...snapshot.participants.flatMap((p) => p.hitBeats ?? []))
  return lastHit >= 0 ? Math.min(snapshot.totalBeats, lastHit + 1) : snapshot.totalBeats
}

export function MatchResults({ snapshot, selfUid, onHome, buttonClass }: MatchResultsProps) {
  const self = snapshot.participants.find((p) => p.uid === selfUid)
  const opponent = snapshot.participants.find((p) => p.uid !== selfUid)
  const selfEvent = snapshot.ratingEvents.find((event) => event.uid === selfUid) ?? null
  const opponentEvent = snapshot.ratingEvents.find((event) => event.uid === opponent?.uid) ?? null
  const { profile: opponentProfile, loading: profileLoading } = useOpponentProfile(opponent?.uid)

  const beats = playedBeats(snapshot, snapshot.ratingEvents)
  const selfStats = self ? performanceStats(self, beats) : null
  const opponentStats = opponent ? performanceStats(opponent, beats) : null
  const headline = resultHeadline(selfEvent, self, opponent)
  const opponentTraits = opponentStats ? strengthsAndWeaknesses(opponentStats) : null
  const tips = selfStats ? improvementTips(selfStats, opponentStats, selfEvent) : []
  const opponentName =
    opponentProfile?.displayName || opponent?.displayName || opponentEvent?.uid || 'Opponent'

  return (
    <section aria-label="Match results" className="space-y-5">
      <h2 className="text-2xl font-bold">Match results</h2>

      {headline && (
        <div
          role="status"
          aria-label="Match outcome"
          className={`rounded-xl px-6 py-5 text-center ${HEADLINE_CLASS[headline]}`}
        >
          <p className="text-4xl font-bold">{HEADLINE_TEXT[headline]}</p>
          <p className="mt-1 text-sm font-semibold">
            {headline} · {snapshot.scenarioTitle} ·{' '}
            <span className="capitalize">{snapshot.instrument}</span>
            {selfEvent?.reason === 'resigned' && ' · decided by resignation'}
            {selfEvent?.reason === 'disconnected' && ' · decided by disconnect'}
          </p>
        </div>
      )}

      <section aria-label="Score breakdown" className={card}>
        <h3 className="text-xl font-bold">Score breakdown</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {self && selfStats && (
            <PlayerBreakdown label="You" player={self} stats={selfStats} other={opponentStats} />
          )}
          {opponent && opponentStats && (
            <PlayerBreakdown
              label={opponentName}
              player={opponent}
              stats={opponentStats}
              other={selfStats}
            />
          )}
        </div>
      </section>

      {opponent && (
        <section aria-label="Your opponent" className={card}>
          <h3 className="text-xl font-bold">Your opponent</h3>
          <div className="mt-4 flex flex-wrap items-start gap-4">
            <img
              src={opponentProfile?.avatarUrl ?? '../../favicon.svg'}
              alt={`${opponentName}'s profile picture`}
              className="size-20 shrink-0 rounded-full border-3 border-accent-start bg-base-start object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold wrap-anywhere">{opponentName}</p>
              {opponentProfile?.username && (
                <p className="text-sm text-muted">@{opponentProfile.username}</p>
              )}
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Instrument</dt>
                  <dd className="capitalize">{snapshot.instrument}</dd>
                </div>
                <div>
                  <dt className="text-muted">Elo</dt>
                  <dd>
                    {Math.round(opponentEvent?.eloAfter ?? opponent.elo)}
                    {opponentEvent &&
                      ` (${opponentEvent.eloDelta >= 0 ? '+' : ''}${Math.round(opponentEvent.eloDelta)})`}
                  </dd>
                </div>
                {opponentEvent && (
                  <>
                    <div>
                      <dt className="text-muted">Rank</dt>
                      <dd className="capitalize">{opponentEvent.tierAfter}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Rated matches</dt>
                      <dd>
                        {opponentEvent.gamesPlayedAfter}
                        {opponentEvent.isProvisional ? ' · provisional' : ''}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              <p className="mt-2 text-sm wrap-anywhere">
                {profileLoading
                  ? 'Loading profile…'
                  : opponentProfile
                    ? opponentProfile.bio || 'No bio yet.'
                    : 'This profile is private.'}
              </p>
            </div>
          </div>
          {opponentTraits && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TraitList title="Strengths" traits={opponentTraits.strengths} />
              <TraitList title="Weaknesses" traits={opponentTraits.weaknesses} />
            </div>
          )}
        </section>
      )}

      {selfEvent && (
        <section aria-label="Elo explained" className={card}>
          <h3 className="text-xl font-bold">How your Elo changed</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {explainElo(selfEvent).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-4">
            <RatingResult
              event={{ ...selfEvent, appliedAt: Timestamp.fromDate(new Date(selfEvent.appliedAt)) }}
            />
          </div>
        </section>
      )}

      <section aria-label="Areas for improvement" className={card}>
        <h3 className="text-xl font-bold">Areas for improvement</h3>
        {selfStats && (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TraitList
              title="Your strengths"
              traits={strengthsAndWeaknesses(selfStats).strengths}
            />
            <TraitList
              title="Your weaknesses"
              traits={strengthsAndWeaknesses(selfStats).weaknesses}
            />
          </div>
        )}
        <h4 className="mt-4 font-bold">Tips for next time</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <button className={buttonClass} onClick={onHome}>
        Return Home
      </button>
    </section>
  )
}

function PlayerBreakdown({
  label,
  player,
  stats,
  other,
}: {
  label: string
  player: SessionPlayer
  stats: PerformanceStats
  other: PerformanceStats | null
}) {
  const rows: [string, string, boolean][] = [
    ['Score', `${Math.round(player.score * 100)}%`, !!other && stats.hitRate > other.hitRate],
    [
      'Beats hit',
      `${stats.beatsHit}/${stats.totalBeats}`,
      !!other && stats.beatsHit > other.beatsHit,
    ],
    ['Missed', String(stats.missed), !!other && stats.missed < other.missed],
  ]
  if (stats.longestStreak !== null) {
    rows.push([
      'Longest streak',
      `${stats.longestStreak} beats`,
      !!other && other.longestStreak !== null && stats.longestStreak > other.longestStreak,
    ])
  }
  if (stats.firstHalfRate !== null && stats.secondHalfRate !== null) {
    rows.push([
      'First half / second half',
      `${Math.round(stats.firstHalfRate * 100)}% / ${Math.round(stats.secondHalfRate * 100)}%`,
      false,
    ])
  }

  return (
    <article
      aria-label={`${label} breakdown`}
      className="min-w-0 rounded-lg border-2 border-accent-start p-4"
    >
      <h4 className="font-bold wrap-anywhere">{label}</h4>
      <dl className="mt-2 space-y-1 text-sm">
        {rows.map(([name, value, better]) => (
          <div key={name} className="flex justify-between gap-3">
            <dt className="text-muted">{name}</dt>
            <dd className={`tabular-nums ${better ? 'font-bold' : ''}`}>
              {value}
              {better && <span className="sr-only"> (better)</span>}
            </dd>
          </div>
        ))}
      </dl>
      {stats.beats && (
        <div
          role="img"
          aria-label={`${label}: ${stats.beatsHit} of ${stats.totalBeats} beats hit`}
          className="mt-3 flex h-4 w-full gap-px overflow-hidden rounded"
        >
          {stats.beats.map((hit, beat) => (
            <div
              key={beat}
              className={`flex-1 ${hit ? 'bg-green-500' : 'bg-red-500/40'}`}
              title={`Beat ${beat + 1}: ${hit ? 'hit' : 'missed'}`}
            />
          ))}
        </div>
      )}
    </article>
  )
}

function TraitList({ title, traits }: { title: string; traits: Trait[] }) {
  return (
    <div>
      <h4 className="font-bold">{title}</h4>
      <ul className="mt-1 space-y-1 text-sm">
        {traits.map((trait) => (
          <li key={trait.title}>
            <span className="font-semibold">{trait.title}:</span> {trait.detail}
          </li>
        ))}
      </ul>
    </div>
  )
}
