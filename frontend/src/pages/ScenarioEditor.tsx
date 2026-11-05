/**
 * The Scenario Editor hub (user stories #24, #25 and #27).
 *
 * Opening /scenario_editor lands on a blank scenario; Browse Published
 * Scenarios and Your Library sit beside it, and Version History joins them once
 * a scenario is open. The open tab, the scenario being edited and any version
 * being looked at live in the URL (?tab=, ?scenario= and ?version=), so a
 * refresh or a return trip reopens the same work, and an unrecognised tab falls
 * back to the default instead of rendering an error.
 *
 * The editor stays mounted while another tab is showing, because the draft it
 * holds is the author's only copy of their unsaved work.
 */
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { ProfileButton } from '@/components/ProfileButton'
import { TabBar } from '@/components/TabBar'
import { panelId, tabId } from '@/components/tabIds'
import { useAuth } from '@/lib/auth/useAuth'
import { BrowsePublishedPanel } from '@/pages/scenario_editor/BrowsePublishedPanel'
import { EditorPanel } from '@/pages/scenario_editor/EditorPanel'
import { VersionHistoryPanel } from '@/pages/scenario_editor/VersionHistoryPanel'
import { YourLibraryPanel } from '@/pages/scenario_editor/YourLibraryPanel'
import {
  DEFAULT_EDITOR_TAB,
  EDITOR_SCENARIO_PARAM,
  EDITOR_TABS,
  EDITOR_TAB_PARAM,
  EDITOR_VERSION_PARAM,
  parseEditorTab,
} from '@/pages/scenario_editor/tabs'
import type { EditorTabId } from '@/pages/scenario_editor/tabs'
import { BackButton } from '@/components/BackButton'
import { NotificationButton } from '@/components/NotificationButton'
import { LiveElo } from '@/components/LiveElo'

const ID_PREFIX = 'scenario-editor'

export function ScenarioEditor() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const scenarioId = searchParams.get(EDITOR_SCENARIO_PARAM)
  const versionId = searchParams.get(EDITOR_VERSION_PARAM)
  const requested = parseEditorTab(searchParams.get(EDITOR_TAB_PARAM))
  // History belongs to a scenario, so without one there is nothing to show.
  const selected = requested === 'history' && !scenarioId ? DEFAULT_EDITOR_TAB : requested
  // Bumped to make the editor read the scenario again after a revert.
  const [editorRevision, setEditorRevision] = useState(0)

  function navPortal(location: string) {
      navigate(location)
  }

  // replace: the back button should leave the editor, not walk back through
  // every tab the author happened to look at.
  function show(
    tab: EditorTabId,
    openScenarioId: string | null = scenarioId,
    openVersionId: string | null = null,
  ) {
    const next: Record<string, string> = { [EDITOR_TAB_PARAM]: tab }
    if (openScenarioId) next[EDITOR_SCENARIO_PARAM] = openScenarioId
    if (openVersionId) next[EDITOR_VERSION_PARAM] = openVersionId
    setSearchParams(next, { replace: true })
  }

  const tabs = EDITOR_TABS.filter((tab) => tab.id !== 'history' || scenarioId).map((tab) =>
    tab.id === 'new' && scenarioId ? { ...tab, label: 'Editing Scenario' } : tab,
  )

  return (
    <main className="flex min-h-dvh flex-col">
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start
          bg-linear-to-r from-accent-base-start from-10 via-accent-base-middle via-80
          to-accent-base-end to-90 py-6"
      >
        <div className="ml-4 flex items-center gap-6 sm:ml-12">
          <BackButton onClick={() => navPortal('/home')}></BackButton>
          <h1 className="text-4xl font-bold text-ink">Scenario Editor</h1>
        </div>
        <div className="mr-4 ml-auto flex items-center gap-3 sm:mr-12 sm:gap-4">
            <NotificationButton uid={profile?.uid ?? ""}/>
            <LiveElo />
            <ProfileButton
            className="w-36 shrink-0 sm:w-50"
            username={profile?.displayName ?? user?.email ?? '…'}
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
          <div hidden={selected !== 'new'}>
            <EditorPanel
              key={editorRevision}
              scenarioId={scenarioId}
              onSaved={(savedId) => show('new', savedId)}
              onStartNew={() => show('new', null)}
            />
          </div>
          {selected === 'browse' && <BrowsePublishedPanel />}
          {selected === 'library' && (
            <YourLibraryPanel
              onOpenScenario={(id) => show('new', id)}
              onViewHistory={(id) => show('history', id)}
              onCreateNew={() => show('new', null)}
              // Drop a deleted scenario from the URL, or the editor tab would
              // try to reopen something that is no longer there.
              onScenarioDeleted={(id) => {
                if (id === scenarioId) show('library', null)
              }}
            />
          )}
          {selected === 'history' && scenarioId && (
            <VersionHistoryPanel
              key={scenarioId}
              scenarioId={scenarioId}
              versionId={versionId}
              onViewVersion={(id) => show('history', scenarioId, id)}
              onOpenLatest={() => show('new', scenarioId)}
              onReverted={() => setEditorRevision((revision) => revision + 1)}
            />
          )}
        </div>
      </div>
    </main>
  )
}
