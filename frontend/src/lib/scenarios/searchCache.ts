/**
 * The last scenario search listing, kept in localStorage per user so the search page can
 * show it at once while a fresh copy loads. Only a convenience: any read or write that fails
 * (private mode, quota, a shape from an older build) acts as an empty cache.
 */
import type { Scenario } from '@/lib/schema/types'

/** One row of /scenarios/scenario_with_author. Timestamps stay ISO strings, as on the wire. */
export type ScenarioWithAuthor = {
  scenario: Scenario
  authorName: string
}

const VERSION = 1
const keyFor = (uid: string) => `scenarioSearch:${uid}`

export function loadCachedSearch(uid: string | undefined): ScenarioWithAuthor[] | null {
  if (!uid) return null
  try {
    const stored = JSON.parse(localStorage.getItem(keyFor(uid)) ?? 'null')
    return stored?.version === VERSION && Array.isArray(stored.rows) ? stored.rows : null
  } catch {
    return null
  }
}

export function saveCachedSearch(uid: string | undefined, rows: ScenarioWithAuthor[]) {
  if (!uid) return
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify({ version: VERSION, rows }))
  } catch {
    // Over quota or storage blocked: the next visit just waits for the network.
  }
}
