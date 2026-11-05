/**
 * How saved versions are described to the author, shared by the library, the
 * history list and the read-only version view.
 */
import type { ScenarioVersion } from '@/lib/schema/types'
import { INSTRUMENT_LABELS } from '@/pages/scenario_editor/draft'

export const QUIET_BUTTON =
  'rounded-lg border-2 border-base-middle px-4 py-2 text-sm font-bold text-ink ' +
  'transition-colors hover:border-accent-start hover:bg-accent-base-middle ' +
  'disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-base-middle ' +
  'disabled:hover:bg-transparent'

/** A Firestore timestamp as a local date and time; a pending write has none yet. */
export function formatSavedAt(timestamp: { toDate(): Date } | null | undefined) {
  return timestamp?.toDate?.().toLocaleString() ?? 'just now'
}

/** "Version 3", or "Version 3: Bridge rewrite" once it has been named. */
export function versionLabel(version: Pick<ScenarioVersion, 'versionNumber' | 'name'>) {
  const number = `Version ${version.versionNumber}`
  return version.name ? `${number}: ${version.name}` : number
}

/** One line of the settings this version recorded, or a note that it recorded none. */
export function describeSettings(version: ScenarioVersion) {
  const settings = version.metadata
  if (!settings) return 'Settings not recorded'
  return [
    settings.title,
    INSTRUMENT_LABELS[settings.instrument],
    `difficulty ${settings.authorDifficulty}/10`,
  ].join(' · ')
}

/** The link that plays exactly this version, whatever the scenario moves on to. */
export function versionShareUrl(scenarioId: string, versionId: string, origin: string) {
  return `${origin}/play/${encodeURIComponent(scenarioId)}?version=${encodeURIComponent(versionId)}`
}

/** What a revert is about to destroy, spelled out for the confirmation prompt. */
export function revertWarning(targetNumber: number, currentNumber: number) {
  const count = currentNumber - targetNumber
  const doomed =
    count === 1
      ? `version ${currentNumber}`
      : `${count} later versions (${targetNumber + 1} to ${currentNumber})`
  return (
    `Revert to version ${targetNumber}? This permanently deletes ${doomed}, ` +
    'and cannot be undone. Scores on deleted versions stay in play history, but their ' +
    'leaderboards can no longer be reached. Unsaved edits in the editor are discarded too.'
  )
}
