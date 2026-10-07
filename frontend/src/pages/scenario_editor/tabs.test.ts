/** User story #24: the editor's tab ids and the ?tab= parser. */
import { describe, expect, it } from 'vitest'

import { DEFAULT_EDITOR_TAB, EDITOR_TABS, parseEditorTab } from '@/pages/scenario_editor/tabs'

describe('parseEditorTab', () => {
  it('accepts every known tab id', () => {
    for (const { id } of EDITOR_TABS) expect(parseEditorTab(id)).toBe(id)
  })

  it.each([null, '', 'Library', 'settings'])('falls back to the default for %j', (value) => {
    expect(parseEditorTab(value)).toBe(DEFAULT_EDITOR_TAB)
  })

  it('defaults to the New Scenario tab', () => {
    expect(DEFAULT_EDITOR_TAB).toBe('new')
  })
})
