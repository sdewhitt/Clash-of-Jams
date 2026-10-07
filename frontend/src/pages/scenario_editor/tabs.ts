/**
 * The Scenario Editor's sections.
 *
 * Kept beside the page rather than inside it so the tab ids can be read by the
 * panels and by the URL parser without importing the page component.
 */
import type { TabDefinition } from '@/components/TabBar'

export const EDITOR_TAB_IDS = ['new', 'browse', 'library'] as const
export type EditorTabId = (typeof EDITOR_TAB_IDS)[number]

export const EDITOR_TABS: readonly TabDefinition<EditorTabId>[] = [
  { id: 'new', label: 'New Scenario' },
  { id: 'browse', label: 'Browse Published Scenarios' },
  { id: 'library', label: 'Your Library' },
]

/** Opening the editor lands on a blank scenario, per user story #24. */
export const DEFAULT_EDITOR_TAB: EditorTabId = 'new'

/** The query parameter carrying the open tab, so a refresh returns to it. */
export const EDITOR_TAB_PARAM = 'tab'

/** Anything unrecognised in the URL falls back to the default, never an error. */
export function parseEditorTab(value: string | null): EditorTabId {
  const match = EDITOR_TAB_IDS.find((id) => id === value)
  return match ?? DEFAULT_EDITOR_TAB
}

/** The scenario currently open in the editor tab, if any. */
export const EDITOR_SCENARIO_PARAM = 'scenario'
