/**
 * Frontend-facing shapes only. These are placeholders that mirror the entities in
 * the design document; replace them with whatever the Firestore schema settles on.
 */

export type Instrument = 'piano' | 'guitar' | 'voice' | 'woodwind' | 'midi'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert'

export interface Scenario {
  id: string
  title: string
  composer: string
  instrument: Instrument
  difficulty: Difficulty
  /** Length of the playable section in seconds. */
  durationSec: number
  bpm: number
  tags: string[]
  playCount: number
  rating: number
}

export interface Run {
  id: string
  scenarioId: string
  scenarioTitle: string
  playedAt: string
  score: number
  accuracy: number
  /** Note-level breakdown, used by the results screen. */
  perfect: number
  good: number
  missed: number
}

export interface UserProfile {
  id: string
  username: string
  displayName: string
  elo: number
  rank: string
  primaryInstrument: Instrument
  joinedAt: string
  totalRuns: number
}

/** One note in a scenario chart. Timing is in seconds from scenario start. */
export interface ChartNote {
  /** MIDI note number, 21-108. */
  pitch: number
  startSec: number
  durationSec: number
}
