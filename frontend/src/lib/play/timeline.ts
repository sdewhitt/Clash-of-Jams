/**
 * Turns one chart part into what a run needs on the clock: every note's position in
 * milliseconds, the metronome clicks, and where the run ends.
 *
 * Times are scenario time -- 0 is beat 0, and the count-in sits at negative times -- already
 * scaled by the speed multiplier, so the gameplay screen only has to add the AudioContext time
 * it scheduled beat 0 at. Nothing here touches the audio or React.
 */
import { beatsPerBar } from '@/lib/chart/notes'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, ScoringRules, TempoMapEntry } from '@/lib/schema/types'
import { beatToMs } from '@/scoring/score'

export interface TimedNote {
  note: ExpectedNote
  startMs: number
  endMs: number
}

export interface Click {
  ms: number
  /** The first beat of a bar. */
  accent: boolean
}

export interface Timeline {
  /** Sorted by atBeat, as scorePerformance expects. */
  tempoMap: TempoMapEntry[]
  notes: TimedNote[]
  /** One per beat, count-in included. */
  clicks: Click[]
  countInBeats: number
  /** Length of one count-in beat. */
  countInBeatMs: number
  /** When the last note lets go. */
  endMs: number
}

/** `notes` and `tempoMap` must both be non-empty. The count-in is one bar of the opening meter. */
export function buildTimeline(args: {
  notes: ExpectedNote[]
  tempoMap: TempoMapEntry[]
  speedMultiplier?: number
}): Timeline {
  const speed = args.speedMultiplier ?? 1
  const tempoMap = [...args.tempoMap].sort((a, b) => a.atBeat - b.atBeat)
  const at = (beat: number) => beatToMs(beat, tempoMap) / speed

  const notes = args.notes
    .map((note) => ({
      note,
      startMs: at(note.startBeat),
      endMs: at(note.startBeat + note.durationBeats),
    }))
    .sort((a, b) => a.startMs - b.startMs)
  const endBeat = Math.max(...args.notes.map((note) => note.startBeat + note.durationBeats))

  const countInBeats = Math.max(1, Math.round(beatsPerBar(tempoMap[0])))
  const countInBeatMs = 60_000 / (tempoMap[0].bpm * speed)
  const clicks: Click[] = []
  for (let k = countInBeats; k >= 1; k--) {
    clicks.push({ ms: -k * countInBeatMs, accent: k === countInBeats })
  }

  let entry = 0
  for (let beat = 0; beat < endBeat; beat++) {
    while (entry + 1 < tempoMap.length && tempoMap[entry + 1].atBeat <= beat) entry++
    const intoBar = (beat - tempoMap[entry].atBeat) % beatsPerBar(tempoMap[entry])
    clicks.push({ ms: at(beat), accent: Math.abs(intoBar) < 1e-6 })
  }

  return { tempoMap, notes, clicks, countInBeats, countInBeatMs, endMs: at(endBeat) }
}

/**
 * The rules a run is scored under and snapshots: the version's, with defaults for any field it
 * lacks. Versions saved before hitWindowBeats existed carry hitWindowMs instead, which is dropped.
 */
export function resolveScoringRules(rules: Partial<ScoringRules> | undefined): ScoringRules {
  const merged = { ...DEFAULT_SCORING_RULES, ...rules }
  return {
    pitchWeight: merged.pitchWeight,
    rhythmWeight: merged.rhythmWeight,
    completenessWeight: merged.completenessWeight,
    hitWindowBeats: merged.hitWindowBeats,
    pitchToleranceCents: merged.pitchToleranceCents,
  }
}
