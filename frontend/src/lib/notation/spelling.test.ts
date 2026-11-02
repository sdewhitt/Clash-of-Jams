import { describe, expect, it } from 'vitest'

import { keyAlters, pitchOf, spellPitch, spelledName } from '@/lib/notation/spelling'

const name = (midiPitch: number, fifths: number) => spelledName(spellPitch(midiPitch, fifths))

describe('keyAlters', () => {
  it('adds sharps and flats in key-signature order', () => {
    // C D E F G A B
    expect(keyAlters(0)).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(keyAlters(2)).toEqual([1, 0, 0, 1, 0, 0, 0])
    expect(keyAlters(-3)).toEqual([0, 0, -1, 0, 0, -1, -1])
  })
})

describe('spellPitch', () => {
  it('names notes in the key by the key', () => {
    expect(name(61, 2)).toBe('C#4')
    expect(name(61, -4)).toBe('Db4')
    expect(name(70, -1)).toBe('Bb4')
  })

  it('writes a natural rather than a remote spelling for out-of-key white keys', () => {
    expect(name(65, 1)).toBe('F4')
    expect(name(71, -1)).toBe('B4')
  })

  it('raises in sharp keys and lowers in flat keys', () => {
    expect(name(63, 2)).toBe('D#4')
    expect(name(66, -2)).toBe('Gb4')
  })

  it('uses the conventional mix in C major', () => {
    expect([61, 63, 66, 68, 70].map((pitch) => name(pitch, 0))).toEqual([
      'C#4',
      'Eb4',
      'F#4',
      'G#4',
      'Bb4',
    ])
  })

  it('keeps the octave with the letter across the B/C boundary', () => {
    // C# major spells C natural as B#, which belongs to the octave below.
    expect(name(60, 7)).toBe('B#3')
    // Gb major spells B as Cb, in the octave above.
    expect(name(71, -6)).toBe('Cb5')
  })

  it('round-trips through pitchOf', () => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (let pitch = 36; pitch <= 84; pitch++) {
        const spelled = spellPitch(pitch, fifths)
        expect(pitchOf(spelled.diatonic, spelled.alter)).toBe(pitch)
      }
    }
  })
})
