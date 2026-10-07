/**
 * The Scenario Editor hub (user stories #24 and #25).
 *
 * Opening /scenario_editor lands on a blank scenario; Browse Published
 * Scenarios and Your Library sit beside it. Both the open tab and the scenario
 * being edited live in the URL (?tab= and ?scenario=), so a refresh or a return
 * trip reopens the same work, and an unrecognised tab falls back to the default
 * instead of rendering an error.
 */
import { useNavigate, useSearchParams } from 'react-router'

import { ProfileButton } from '@/components/ProfileButton'
import { TabBar } from '@/components/TabBar'
import { panelId, tabId } from '@/components/tabIds'
import { useAuth } from '@/lib/auth/useAuth'
import { BrowsePublishedPanel } from '@/pages/scenario_editor/BrowsePublishedPanel'
import { EditorPanel } from '@/pages/scenario_editor/EditorPanel'
import { YourLibraryPanel } from '@/pages/scenario_editor/YourLibraryPanel'
import {
  EDITOR_SCENARIO_PARAM,
  EDITOR_TABS,
  EDITOR_TAB_PARAM,
  parseEditorTab,
} from '@/pages/scenario_editor/tabs'
import type { EditorTabId } from '@/pages/scenario_editor/tabs'
import { BackButton } from '@/components/BackButton'

const ID_PREFIX = 'scenario-editor'

export function ScenarioEditor() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const selected = parseEditorTab(searchParams.get(EDITOR_TAB_PARAM))
  const scenarioId = searchParams.get(EDITOR_SCENARIO_PARAM)

  function navPortal(location: string) {
      navigate(location)
  }

  // replace: the back button should leave the editor, not walk back through
  // every tab the author happened to look at.
  function show(tab: EditorTabId, openScenarioId: string | null = scenarioId) {
    const next: Record<string, string> = { [EDITOR_TAB_PARAM]: tab }
    if (openScenarioId) next[EDITOR_SCENARIO_PARAM] = openScenarioId
    setSearchParams(next, { replace: true })
  }

  const tabs = EDITOR_TABS.map((tab) =>
    tab.id === 'new' && scenarioId ? { ...tab, label: 'Editing Scenario' } : tab,
  )

  return (
    <main className="flex min-h-dvh flex-col">
      <header
        className="flex items-center justify-between gap-4 border-b-4 border-accent-start
          bg-linear-to-r from-accent-base-start from-10 via-accent-base-middle via-80
          to-accent-base-end to-90 py-6"
      >
        <div className="ml-12 flex items-center gap-6">
          <BackButton onClick={() => navPortal('/home')}></BackButton>
          <h1 className="text-4xl font-bold text-ink">Scenario Editor</h1>
        </div>
        <div className="mr-6">
          <ProfileButton
            username={profile?.displayName ?? user?.email ?? '...'}
            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
          />
        </div>
      </header>

      <div className="flex-1 px-8 py-8">
        <TabBar
          tabs={tabs}
          selected={selected}
          onSelect={(tab) => show(tab)}
          idPrefix={ID_PREFIX}
          label="Scenario Editor sections"
        />

        <div
          role="tabpanel"
          id={panelId(ID_PREFIX, selected)}
          aria-labelledby={tabId(ID_PREFIX, selected)}
          tabIndex={0}
          className="pt-8"
        >
          {selected === 'new' && (
            <EditorPanel
              scenarioId={scenarioId}
              onSaved={(savedId) => show('new', savedId)}
              onStartNew={() => show('new', null)}
            />
          )}
          {selected === 'browse' && <BrowsePublishedPanel />}
          {selected === 'library' && (
            <YourLibraryPanel
              onOpenScenario={(id) => show('new', id)}
              onCreateNew={() => show('new', null)}
            />
          )}
        </div>
      </div>
    </main>
  )
}
