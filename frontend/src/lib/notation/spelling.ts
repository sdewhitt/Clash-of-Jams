/**
 * Pitch spelling: turning a MIDI number into a written note under a key signature.
 *
 * A chart stores sounding pitch only, so MIDI 61 has no inherent name -- it is C# in A
 * major and Db in Ab major. Sheet music has to commit to one, and this module makes that
 * choice the way an engraver would: notes in the key take the key's spelling, and the rest
 * are raised in sharp keys and lowered in flat keys. Steps count C=0 through B=6, and a
 * note's `diatonic` number (octave * 7 + step) is what places it on a staff.
 */

/** Pitch class of each natural note, C through B. */
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11] as const

export const STEP_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

/** The order sharps and flats are added to a key signature, as steps. */
export const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] as const
export const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] as const

/** Out-of-key spellings for C major, which has no sharp or flat leaning of its own. */
const C_MAJOR_CHROMATIC: Record<number, [step: number, alter: number]> = {
  1: [0, 1],
  3: [2, -1],
  6: [3, 1],
  8: [4, 1],
  10: [6, -1],
}

export interface SpelledPitch {
  step: number
  octave: number
  /** -2 to 2: double flat through double sharp. */
  alter: number
  /** octave * 7 + step, which counts staff lines and spaces. */
  diatonic: number
}

export type Accidental = 'double-flat' | 'flat' | 'natural' | 'sharp' | 'double-sharp'

const ACCIDENTAL_BY_ALTER: Record<number, Accidental> = {
  [-2]: 'double-flat',
  [-1]: 'flat',
  0: 'natural',
  1: 'sharp',
  2: 'double-sharp',
}

export function accidentalFor(alter: number): Accidental {
  return ACCIDENTAL_BY_ALTER[alter]
}

/** Key signatures run from seven flats (-7) to seven sharps (7). */
export function clampFifths(fifths: number) {
  return Number.isFinite(fifths) ? Math.max(-7, Math.min(7, Math.round(fifths))) : 0
}

/** The alteration the key signature gives each step, C through B. */
export function keyAlters(fifths: number): number[] {
  const key = clampFifths(fifths)
  const alters = [0, 0, 0, 0, 0, 0, 0]
  const order = key > 0 ? SHARP_ORDER : FLAT_ORDER
  for (let i = 0; i < Math.abs(key); i++) alters[order[i]] = Math.sign(key)
  return alters
}

export function spellPitch(midiPitch: number, fifths: number): SpelledPitch {
  const key = clampFifths(fifths)
  const alters = keyAlters(key)
  const pc = mod(midiPitch, 12)

  // In the key first, then a natural (F natural in G major, not E#), then the key's leaning.
  const choice =
    findStep(pc, (step) => alters[step]) ??
    findStep(pc, () => 0) ??
    (key === 0 ? C_MAJOR_CHROMATIC[pc] : findStep(pc, () => Math.sign(key)))
  // Every pitch class is a natural or a semitone off one, so a choice always exists.
  const [step, alter] = choice!

  const octave = (midiPitch - NATURAL_PC[step] - alter) / 12 - 1
  return { step, octave, alter, diatonic: octave * 7 + step }
}

/** The MIDI pitch of a written note: a staff position (as a diatonic number) plus alteration. */
export function pitchOf(diatonic: number, alter: number) {
  const step = mod(diatonic, 7)
  const octave = Math.floor(diatonic / 7)
  return (octave + 1) * 12 + NATURAL_PC[step] + alter
}

/** "C#4" for a spelled pitch, with b for flat. */
export function spelledName({ step, octave, alter }: SpelledPitch) {
  const sign = alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter)
  return `${STEP_NAMES[step]}${sign}${octave}`
}

function findStep(pc: number, alterOf: (step: number) => number): [number, number] | undefined {
  for (let step = 0; step < 7; step++) {
    const alter = alterOf(step)
    if (mod(NATURAL_PC[step] + alter, 12) === pc) return [step, alter]
  }
  return undefined
}

function mod(value: number, by: number) {
  return ((value % by) + by) % by
}
