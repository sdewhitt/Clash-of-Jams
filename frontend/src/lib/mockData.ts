import type { ChartNote, Run, Scenario, UserProfile } from '@/lib/types'

/**
 * Stand-in data so the UI renders before any backend exists.
 * Everything here should disappear once the Firebase client lands.
 */

export const currentUser: UserProfile = {
  id: 'u_demo',
  username: 'demo_player',
  displayName: 'Demo Player',
  elo: 1284,
  rank: 'Gold',
  primaryInstrument: 'piano',
  joinedAt: '2026-08-02',
  totalRuns: 137,
}

export const scenarios: Scenario[] = [
  {
    id: 's_001',
    title: 'Prelude in C — Right Hand',
    composer: 'J.S. Bach',
    instrument: 'piano',
    difficulty: 'beginner',
    durationSec: 48,
    bpm: 72,
    tags: ['baroque', 'arpeggios', 'public-domain'],
    playCount: 8421,
    rating: 4.6,
  },
  {
    id: 's_002',
    title: 'Chromatic Run Drill',
    composer: 'Clash of Jams',
    instrument: 'guitar',
    difficulty: 'intermediate',
    durationSec: 30,
    bpm: 120,
    tags: ['drill', 'technique', 'alternate-picking'],
    playCount: 3190,
    rating: 4.1,
  },
  {
    id: 's_003',
    title: 'Moonlight Sonata — Mvt. I Opening',
    composer: 'L. van Beethoven',
    instrument: 'piano',
    difficulty: 'advanced',
    durationSec: 95,
    bpm: 54,
    tags: ['romantic', 'dynamics', 'public-domain'],
    playCount: 12005,
    rating: 4.8,
  },
  {
    id: 's_004',
    title: 'Interval Leaps — Octaves',
    composer: 'Clash of Jams',
    instrument: 'voice',
    difficulty: 'intermediate',
    durationSec: 40,
    bpm: 90,
    tags: ['drill', 'pitch-accuracy', 'ear-training'],
    playCount: 2244,
    rating: 3.9,
  },
  {
    id: 's_005',
    title: 'Flight of the Bumblebee — First 8 Bars',
    composer: 'N. Rimsky-Korsakov',
    instrument: 'woodwind',
    difficulty: 'expert',
    durationSec: 22,
    bpm: 168,
    tags: ['speed', 'chromatic', 'public-domain'],
    playCount: 5677,
    rating: 4.4,
  },
  {
    id: 's_006',
    title: 'Blues Shuffle in E',
    composer: 'Traditional',
    instrument: 'guitar',
    difficulty: 'beginner',
    durationSec: 60,
    bpm: 96,
    tags: ['blues', 'rhythm', 'groove'],
    playCount: 6710,
    rating: 4.3,
  },
]

export const recentRuns: Run[] = [
  {
    id: 'r_01',
    scenarioId: 's_001',
    scenarioTitle: 'Prelude in C — Right Hand',
    playedAt: '2026-09-17',
    score: 94_200,
    accuracy: 0.961,
    perfect: 182,
    good: 21,
    missed: 4,
  },
  {
    id: 'r_02',
    scenarioId: 's_002',
    scenarioTitle: 'Chromatic Run Drill',
    playedAt: '2026-09-16',
    score: 71_450,
    accuracy: 0.884,
    perfect: 96,
    good: 34,
    missed: 12,
  },
  {
    id: 'r_03',
    scenarioId: 's_006',
    scenarioTitle: 'Blues Shuffle in E',
    playedAt: '2026-09-14',
    score: 88_010,
    accuracy: 0.933,
    perfect: 141,
    good: 28,
    missed: 7,
  },
]

export const leaderboard = [
  { rank: 1, username: 'perfect_fifth', elo: 2310, score: 99_820 },
  { rank: 2, username: 'tritone_sub', elo: 2185, score: 98_440 },
  { rank: 3, username: 'andante_andy', elo: 2044, score: 97_110 },
  { rank: 4, username: 'demo_player', elo: 1284, score: 94_200 },
  { rank: 5, username: 'rest_note', elo: 1210, score: 91_775 },
]

/** A short demo chart so the gameplay canvas has something to scroll. */
export const demoChart: ChartNote[] = Array.from({ length: 48 }, (_, i) => {
  const scale = [60, 62, 64, 65, 67, 69, 71, 72]
  return {
    pitch: scale[i % scale.length],
    startSec: 1.5 + i * 0.5,
    durationSec: 0.35,
  }
})
