/**
 * The end-of-match breakdown: how each player performed beat by beat, what that says about
 * their strengths and weaknesses, how the Elo change was worked out, and what to practise next.
 *
 * Everything here is derived from the session snapshot and its rating events, so the results
 * screen needs no extra server data beyond the opponent's public profile.
 */
import type { SessionPlayer, SessionSnapshot } from '@/lib/multiplayer/types'
import type { MatchOutcome } from '@/lib/schema/types'

export type SnapshotRatingEvent = SessionSnapshot['ratingEvents'][number]

export interface PerformanceStats {
  beatsHit: number
  totalBeats: number
  missed: number
  /** 0-1. */
  hitRate: number
  /** Null when the server did not say which beats were hit. */
  longestStreak: number | null
  /** The longest run of missed beats inside the match, and where it started (beat number, from 1). */
  longestGap: { beats: number; fromBeat: number } | null
  /** Hit rates for each half of the match, 0-1. */
  firstHalfRate: number | null
  secondHalfRate: number | null
  /** One entry per beat. */
  beats: boolean[] | null
}

export interface Trait {
  title: string
  detail: string
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`

export function performanceStats(player: SessionPlayer, totalBeats: number): PerformanceStats {
  const total = Math.max(0, totalBeats)
  const beatsHit = Math.min(player.beatsHit, total)
  const base = {
    beatsHit,
    totalBeats: total,
    missed: total - beatsHit,
    hitRate: total ? beatsHit / total : 0,
  }
  if (!player.hitBeats || total === 0) {
    return {
      ...base,
      longestStreak: null,
      longestGap: null,
      firstHalfRate: null,
      secondHalfRate: null,
      beats: null,
    }
  }

  const beats = Array.from({ length: total }, () => false)
  for (const slot of player.hitBeats) {
    if (Number.isInteger(slot) && slot >= 0 && slot < total) beats[slot] = true
  }

  let longestStreak = 0
  let streak = 0
  let longestGap: PerformanceStats['longestGap'] = null
  let gap = 0
  for (let i = 0; i < total; i++) {
    if (beats[i]) {
      streak++
      longestStreak = Math.max(longestStreak, streak)
      gap = 0
    } else {
      streak = 0
      gap++
      if (!longestGap || gap > longestGap.beats) longestGap = { beats: gap, fromBeat: i - gap + 2 }
    }
  }

  const half = Math.floor(total / 2)
  const hitsIn = (from: number, to: number) => beats.slice(from, to).filter(Boolean).length
  return {
    ...base,
    beatsHit: beats.filter(Boolean).length,
    missed: beats.filter((hit) => !hit).length,
    hitRate: beats.filter(Boolean).length / total,
    longestStreak,
    longestGap,
    firstHalfRate: half ? hitsIn(0, half) / half : null,
    secondHalfRate: total - half ? hitsIn(half, total) / (total - half) : null,
    beats,
  }
}

/** A drop or rise this big between halves is worth pointing out. */
const HALF_SWING = 0.15
/** A gap this many beats long is a lost thread, not a stray miss. */
const LONG_GAP = 5

export function strengthsAndWeaknesses(stats: PerformanceStats): {
  strengths: Trait[]
  weaknesses: Trait[]
} {
  const strengths: Trait[] = []
  const weaknesses: Trait[] = []
  const { hitRate, longestStreak, longestGap, firstHalfRate, secondHalfRate, totalBeats } = stats

  if (hitRate >= 0.9) {
    strengths.push({ title: 'Accuracy', detail: `Hit ${percent(hitRate)} of the beats.` })
  } else if (hitRate < 0.6) {
    weaknesses.push({
      title: 'Accuracy',
      detail: `Hit only ${percent(hitRate)} of the beats (${stats.missed} missed).`,
    })
  }

  if (longestStreak !== null && totalBeats > 0 && longestStreak >= Math.max(10, totalBeats / 4)) {
    strengths.push({
      title: 'Consistency',
      detail: `Kept a streak of ${longestStreak} beats in a row.`,
    })
  }

  if (longestGap && longestGap.beats >= LONG_GAP) {
    weaknesses.push({
      title: 'Recovery',
      detail: `Lost the beat for ${longestGap.beats} beats in a row from beat ${longestGap.fromBeat}.`,
    })
  }

  if (firstHalfRate !== null && secondHalfRate !== null) {
    if (secondHalfRate - firstHalfRate >= HALF_SWING) {
      strengths.push({
        title: 'Strong finish',
        detail: `Improved from ${percent(firstHalfRate)} to ${percent(secondHalfRate)} in the second half.`,
      })
    } else if (firstHalfRate - secondHalfRate >= HALF_SWING) {
      strengths.push({
        title: 'Fast start',
        detail: `Opened at ${percent(firstHalfRate)} in the first half.`,
      })
      weaknesses.push({
        title: 'Stamina',
        detail: `Dropped from ${percent(firstHalfRate)} to ${percent(secondHalfRate)} in the second half.`,
      })
    }
  }

  if (strengths.length === 0) {
    strengths.push({
      title: 'Steady',
      detail: `Hit ${stats.beatsHit} of ${totalBeats} beats without a standout weakness.`,
    })
  }
  if (weaknesses.length === 0) {
    weaknesses.push({ title: 'None stood out', detail: 'No clear weak spot this match.' })
  }
  return { strengths, weaknesses }
}

/** Personal advice for next time, most useful first. Always at least one tip. */
export function improvementTips(
  stats: PerformanceStats,
  opponentStats: PerformanceStats | null,
  event: SnapshotRatingEvent | null,
): string[] {
  const tips: string[] = []
  const { longestGap, firstHalfRate, secondHalfRate } = stats

  if (event?.reason === 'resigned' && event.outcome !== 'win') {
    tips.push('Resigning always counts as a loss. Playing on can still earn a draw or a win.')
  }
  if (event?.reason === 'disconnected' && event.outcome !== 'win') {
    tips.push(
      'The match was decided by a disconnect. Use a steady connection, and rejoin from Home within 20 seconds if you drop.',
    )
  }
  if (longestGap && longestGap.beats >= LONG_GAP) {
    tips.push(
      `You dropped out for ${longestGap.beats} beats from beat ${longestGap.fromBeat}. After a miss, ` +
        'come straight back in on the next beat instead of waiting to catch up.',
    )
  }
  if (
    firstHalfRate !== null &&
    secondHalfRate !== null &&
    firstHalfRate - secondHalfRate >= HALF_SWING
  ) {
    tips.push(
      `Your accuracy fell from ${percent(firstHalfRate)} to ${percent(secondHalfRate)} in the second half. ` +
        'Practise full-length runs in Solo Play to build stamina.',
    )
  }
  if (stats.hitRate < 0.9) {
    tips.push(
      `You hit ${stats.beatsHit} of ${stats.totalBeats} beats. Slow the scenario down in Solo Play, ` +
        'lock in the pulse, then raise the speed step by step.',
    )
  }
  if (opponentStats && opponentStats.beatsHit > stats.beatsHit) {
    tips.push(
      `Your opponent hit ${opponentStats.beatsHit - stats.beatsHit} more beats. Closing that gap ` +
        'is the quickest way to turn this result around.',
    )
  }
  if (tips.length === 0) {
    tips.push(
      'A clean performance. Try a harder scenario or a faster speed in Solo Play to keep improving.',
    )
  }
  return tips
}

const OUTCOME_WORD: Record<MatchOutcome, string> = {
  win: 'a win',
  draw: 'a draw',
  loss: 'a loss',
  forfeit: 'a forfeit',
}

const fixed = (value: number, digits = 1) =>
  Number(value.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits })

/** The Elo change worked through in plain sentences, using the same formula as the server. */
export function explainElo(event: SnapshotRatingEvent): string[] {
  const sign = event.eloDelta >= 0 ? '+' : '−'
  const lines = [
    `Before the match you were rated ${fixed(event.eloBefore)} and your opponent ` +
      `${fixed(event.opponentEloBefore)}. From that gap, Elo expected you to score ` +
      `${percent(event.expectedScore)} of the result.`,
    `This match counted as ${OUTCOME_WORD[event.outcome]}, which scores ${fixed(event.actualScore, 2)} ` +
      '(a win is 1, a draw 0.5, a loss or forfeit 0).',
    `Rating change = K × (result − expected) = ${event.kFactor} × (${fixed(event.actualScore, 2)} − ` +
      `${fixed(event.expectedScore, 2)}) = ${sign}${fixed(Math.abs(event.eloDelta))}, ` +
      `so you are now rated ${fixed(event.eloAfter)}.`,
  ]
  if (event.expectedScore < 0.4 && event.outcome === 'win') {
    lines.push('Beating a higher-rated opponent earns more than beating an equal one.')
  } else if (event.expectedScore > 0.6 && event.outcome !== 'win') {
    lines.push('Losing to a lower-rated opponent costs more than losing to an equal one.')
  }
  if (event.isProvisional) {
    lines.push(
      `Your rating is still provisional (${event.gamesPlayedAfter} rated matches so far), so it ` +
        'moves faster until it settles.',
    )
  }
  return lines
}

export type ResultHeadline = 'Win' | 'Loss' | 'Tie' | 'Forfeit'

/** Win / lose / tie from the player's rating event, or from the scores while it is not in yet. */
export function resultHeadline(
  event: SnapshotRatingEvent | null,
  self: SessionPlayer | undefined,
  opponent: SessionPlayer | undefined,
): ResultHeadline | null {
  if (event) {
    if (event.outcome === 'win') return 'Win'
    if (event.outcome === 'draw') return 'Tie'
    return event.outcome === 'forfeit' ? 'Forfeit' : 'Loss'
  }
  if (!self || !opponent) return null
  if (self.score === opponent.score) return 'Tie'
  return self.score > opponent.score ? 'Win' : 'Loss'
}
