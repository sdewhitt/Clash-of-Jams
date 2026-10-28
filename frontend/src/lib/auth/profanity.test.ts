/** User story #73: usernames are screened for profanity, including creative spellings. */
import { describe, expect, it } from 'vitest'

import { isProfaneUsername } from '@/lib/auth/profanity'

describe('isProfaneUsername', () => {
  it.each(['fuck', 'shithead', 'asshole', 'bitchy'])('flags %s', (name) => {
    expect(isProfaneUsername(name)).toBe(true)
  })

  it.each(['FUCK', 'FuCk', 'ShItHeAd'])('ignores case: %s', (name) => {
    expect(isProfaneUsername(name)).toBe(true)
  })

  it.each(['f4ck', 'sh1t', 'b1tch', 'a55hole'])('sees through letter swaps: %s', (name) => {
    expect(isProfaneUsername(name)).toBe(true)
  })

  it.each(['f_u_c_k', 'sh_it', 'big_ass_guy', 'dumb_ass', 'xXfuckXx'])(
    'sees through underscores and padding: %s',
    (name) => {
      expect(isProfaneUsername(name)).toBe(true)
    },
  )

  it.each([
    'player_one',
    'classic_rock',
    'assassin',
    'bass_player',
    'Scunthorpe',
    'cockpit',
    'peacock',
    'pussycat',
    'grass_hopper',
    'analyst',
    'cumbersome',
    'dickens',
    'Essex',
  ])('leaves %s alone', (name) => {
    expect(isProfaneUsername(name)).toBe(false)
  })
})
