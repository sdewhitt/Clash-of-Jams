export interface DifficultyBand {
  id: string
  label: string
  minElo: number | null
  maxElo: number | null
  players: number
  attempts: number
  meanElo: number | null
  meanScore: number | null
  smoothedScore: number | null
  targetElo: number | null
}

export interface DifficultyEstimate {
  modelVersion: string
  value: number | null
  targetElo: number | null
  label: 'Provisional' | 'Easy' | 'Medium' | 'Hard'
  confidence: 'low' | 'medium' | 'high'
  isProvisional: boolean
  distinctPlayers: number
  effectiveAttempts: number
  representedBands: number
  invalidObservations: number
  duplicateObservations: number
  cappedAttempts: number
  minimumPlayers: number
  minimumBands: number
  highConfidencePlayers: number
  attemptsPerPlayer: number
  smoothingPlayers: number
  baseElo: number
  eloStep: number
  logisticScale: number
  bands: DifficultyBand[]
}

export interface DifficultyScenario {
  id: string
  title: string
  instrument: string
  authorDifficulty: number
  currentVersionId: string | null
}

export interface DifficultyDetail {
  scenario: DifficultyScenario
  estimate: DifficultyEstimate
  source: 'performances' | 'synthetic'
  description: string
  partId: string | null
  excludedRuns: Record<string, number>
  canPublish: boolean
  publishedAt: string | null
}

export type DifficultySource = 'examples' | 'library'
