/** Player-facing names for scoring verdicts. */
import type { HitVerdict } from '@/lib/schema/types'

export const VERDICT_LABEL: Record<HitVerdict, string> = {
  hit: 'Hit',
  early: 'Early',
  late: 'Late',
  wrong_pitch: 'Wrong pitch',
  missed: 'Missed',
  extra: 'Extra',
}
