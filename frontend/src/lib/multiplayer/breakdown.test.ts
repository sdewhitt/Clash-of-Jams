import { describe, expect, it } from 'vitest'

import type { SessionPlayer } from '@/lib/multiplayer/types'
import { ratingEvent, sessionSnapshot } from '@/test/multiplayer'

import {
  explainElo,
  improvementTips,
  performanceStats,
  resultHeadline,
  strengthsAndWeaknesses,
} from './breakdown'

function player(hitBeats: number[] | undefined, overrides: Partial<SessionPlayer> = {}) {
  return {
    ...sessionSnapshot().participants[0]!,
    beatsHit: hitBeats?.length ?? 0,
    hitBeats,
    ...overrides,
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

describe('performanceStats', () => {
  it('counts hits, misses, streaks, gaps and halves', () => {
    // Hits beats 0-5 and 12-19 of 20: a 6-beat gap from beat 7 (counting from 1).
    const stats = performanceStats(player([...range(0, 6), ...range(12, 20)]), 20)

    expect(stats).toMatchObject({
      beatsHit: 14,
      totalBeats: 20,
      missed: 6,
      hitRate: 0.7,
      longestStreak: 8,
      longestGap: { beats: 6, fromBeat: 7 },
      firstHalfRate: 0.6,
      secondHalfRate: 0.8,
    })
    expect(stats.beats).toHaveLength(20)
    expect(stats.beats![6]).toBe(false)
  })

  it('falls back to totals when the server did not say which beats were hit', () => {
    const stats = performanceStats(player(undefined, { beatsHit: 30 }), 60)
    expect(stats).toMatchObject({ beatsHit: 30, missed: 30, hitRate: 0.5, longestStreak: null })
    expect(stats.beats).toBeNull()
  })

  it('ignores beats outside the match and handles an empty one', () => {
    expect(performanceStats(player([-1, 0, 99]), 4).beatsHit).toBe(1)
    expect(performanceStats(player([]), 0)).toMatchObject({ hitRate: 0, beats: null })
  })
})

describe('strengthsAndWeaknesses', () => {
  const titles = (traits: { title: string }[]) => traits.map((trait) => trait.title)

  it('praises accuracy and consistency in a near-perfect run', () => {
    const { strengths, weaknesses } = strengthsAndWeaknesses(
      performanceStats(player(range(0, 58)), 60),
    )
    expect(titles(strengths)).toEqual(['Accuracy', 'Consistency'])
    expect(titles(weaknesses)).toEqual(['None stood out'])
  })

  it('flags poor accuracy, a long gap and fading in the second half', () => {
    const stats = performanceStats(player([...range(0, 20), 25, 40]), 60)
    const { strengths, weaknesses } = strengthsAndWeaknesses(stats)
    expect(titles(weaknesses)).toEqual(['Accuracy', 'Recovery', 'Stamina'])
    expect(titles(strengths)).toContain('Fast start')
    expect(weaknesses[1]!.detail).toBe('Lost the beat for 19 beats in a row from beat 42.')
  })

  it('notices a strong finish', () => {
    const stats = performanceStats(player([2, 5, ...range(10, 20)]), 20)
    expect(titles(strengthsAndWeaknesses(stats).strengths)).toContain('Strong finish')
  })
})

describe('improvementTips', () => {
  it('gives specific tips for gaps, stamina, accuracy and the opponent lead', () => {
    const mine = performanceStats(player([...range(0, 20), 25, 40]), 60)
    const theirs = performanceStats(player(range(0, 50)), 60)
    const tips = improvementTips(mine, theirs, ratingEvent({ outcome: 'loss' }))

    expect(tips).toHaveLength(4)
    expect(tips[0]).toMatch(/dropped out for 19 beats from beat 42/)
    expect(tips[1]).toMatch(/fell from 70% to 3%/)
    expect(tips[2]).toMatch(/You hit 22 of 60 beats\. Slow the scenario down/)
    expect(tips[3]).toMatch(/Your opponent hit 28 more beats/)
  })

  it('explains resigning and disconnecting first', () => {
    const stats = performanceStats(player(range(0, 60)), 60)
    expect(
      improvementTips(stats, null, ratingEvent({ outcome: 'loss', reason: 'resigned' }))[0],
    ).toMatch(/Resigning always counts as a loss/)
    expect(
      improvementTips(stats, null, ratingEvent({ outcome: 'forfeit', reason: 'disconnected' }))[0],
    ).toMatch(/rejoin from Home within 20 seconds/)
  })

  it('always offers something after a clean match', () => {
    const stats = performanceStats(player(range(0, 60)), 60)
    expect(improvementTips(stats, stats, ratingEvent())).toEqual([
      expect.stringMatching(/Try a harder scenario or a faster speed/),
    ])
  })
})

describe('explainElo', () => {
  it('works through the rating change with the real numbers', () => {
    const lines = explainElo(ratingEvent())
    expect(lines[0]).toBe(
      'Before the match you were rated 400 and your opponent 450. From that gap, Elo expected ' +
        'you to score 43% of the result.',
    )
    expect(lines[1]).toMatch(/counted as a win, which scores 1/)
    expect(lines[2]).toBe(
      'Rating change = K × (result − expected) = 32 × (1 − 0.43) = +18.3, so you are now rated 418.3.',
    )
    expect(lines[3]).toMatch(/provisional \(4 rated matches so far\)/)
    expect(lines).toHaveLength(4)
  })

  it('points out an upset', () => {
    const upset = explainElo(ratingEvent({ opponentEloBefore: 550, expectedScore: 0.3 }))
    expect(upset[3]).toMatch(/Beating a higher-rated opponent earns more/)
  })

  it('explains losses, draws and established ratings', () => {
    const loss = explainElo(
      ratingEvent({
        outcome: 'loss',
        actualScore: 0,
        expectedScore: 0.7,
        eloDelta: -22.4,
        eloAfter: 377.6,
        isProvisional: false,
      }),
    )
    expect(loss[2]).toMatch(/= 32 × \(0 − 0.7\) = −22.4/)
    expect(loss[3]).toMatch(/Losing to a lower-rated opponent costs more/)
    expect(loss).toHaveLength(4)

    const draw = explainElo(ratingEvent({ outcome: 'draw', actualScore: 0.5, expectedScore: 0.5 }))
    expect(draw[1]).toMatch(/a draw, which scores 0.5/)
  })
})

describe('resultHeadline', () => {
  const [one, two] = sessionSnapshot().participants

  it('reads the outcome from the rating event', () => {
    expect(resultHeadline(ratingEvent(), one, two)).toBe('Win')
    expect(resultHeadline(ratingEvent({ outcome: 'loss' }), one, two)).toBe('Loss')
    expect(resultHeadline(ratingEvent({ outcome: 'draw' }), one, two)).toBe('Tie')
    expect(resultHeadline(ratingEvent({ outcome: 'forfeit' }), one, two)).toBe('Forfeit')
  })

  it('compares scores while the rating is still being applied', () => {
    expect(resultHeadline(null, { ...one!, score: 0.6 }, { ...two!, score: 0.4 })).toBe('Win')
    expect(resultHeadline(null, { ...one!, score: 0.4 }, { ...two!, score: 0.6 })).toBe('Loss')
    expect(resultHeadline(null, one, two)).toBe('Tie')
    expect(resultHeadline(null, one, undefined)).toBeNull()
  })
})
