/**
 * Profanity screening for usernames, which show up publicly on profiles, leaderboards,
 * friends lists and matches.
 *
 * Built on obscenity's English dataset, whose transformers already undo letter swaps
 * ("4" for "a"), mixed case and repeated letters. Usernames add one evasion of their own,
 * underscores, so a name is checked whole, with its underscores removed (f_u_c_k), and
 * one underscore-separated piece at a time (big_ass_guy). The dataset matches whole words
 * for short terms like "ass", so innocent names that contain one (classic, assassin) pass.
 */
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity'

/** Ordinary words the dataset would otherwise flag. */
const ALLOWED_WORDS = ['cockpit', 'pussycat', 'pussywillow']

const dataset = englishDataset.build()
const matcher = new RegExpMatcher({
  ...dataset,
  whitelistedTerms: [...(dataset.whitelistedTerms ?? []), ...ALLOWED_WORDS],
  ...englishRecommendedTransformers,
})

export const PROFANE_USERNAME_MESSAGE =
  'That username is not allowed. Usernames are public, so please choose one without profanity.'

/** True when the username, or a creative spelling of it, contains profanity. */
export function isProfaneUsername(username: string): boolean {
  const candidates = [username, username.replace(/_/g, ''), ...username.split('_')]
  return candidates.some((candidate) => candidate !== '' && matcher.hasMatch(candidate))
}
