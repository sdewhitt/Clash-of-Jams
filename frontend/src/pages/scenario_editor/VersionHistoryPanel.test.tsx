/**
 * User story #27: browsing, naming, sharing and reverting saved versions.
 *
 * The store is mocked, so these cover what the panel shows and asks for. What
 * a revert does to the documents is tested beside the store.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listScenarioVersions,
  loadScenario,
  renameScenarioVersion,
  revertToVersion,
  ScenarioConflictError,
} from '@/lib/scenarios/store'
import { emptyChart } from '@/lib/schema/collections'
import type { Scenario, ScenarioVersion } from '@/lib/schema/types'
import { VersionHistoryPanel } from '@/pages/scenario_editor/VersionHistoryPanel'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/scenarios/store', () => {
  class ScenarioConflictError extends Error {
    message = 'Changed elsewhere'
  }
  return {
    listScenarioVersions: vi.fn(),
    loadScenario: vi.fn(),
    renameScenarioVersion: vi.fn(),
    revertToVersion: vi.fn(),
    ScenarioConflictError,
    VERSION_PAGE_SIZE: 20,
  }
})

const scenario = {
  id: 's1',
  authorUid: 'user-1',
  title: 'Etude',
  visibility: 'public',
  currentVersionId: 'v3',
  currentVersionNumber: 3,
} as unknown as Scenario

function version(number: number, extra: Partial<ScenarioVersion> = {}) {
  return {
    id: `v${number}`,
    scenarioId: 's1',
    versionNumber: number,
    chart: emptyChart('piano'),
    createdAt: { toDate: () => new Date(0) },
    ...extra,
  } as unknown as ScenarioVersion
}

const handlers = {
  onViewVersion: vi.fn(),
  onOpenLatest: vi.fn(),
  onReverted: vi.fn(),
}

function renderPanel(versionId: string | null = null) {
  return renderAtRoute(
    <VersionHistoryPanel scenarioId="s1" versionId={versionId} {...handlers} />,
    { path: '/scenario_editor', auth: signedIn() },
  )
}

function row(number: number) {
  return screen.getByRole('heading', { name: new RegExp(`^Version ${number}`) }).closest('li')!
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadScenario).mockResolvedValue({ scenario, version: version(3) })
  vi.mocked(listScenarioVersions).mockResolvedValue([version(3), version(2), version(1)])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the list', () => {
  it('shows every version newest first and marks the current one', async () => {
    renderPanel()

    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Version 3',
      'Version 2',
      'Version 1',
    ])
    expect(within(row(3)).getByText('Current')).toBeInTheDocument()
    expect(within(row(2)).queryByText('Current')).not.toBeInTheDocument()
  })

  it('offers no revert on the current version', async () => {
    renderPanel()

    await screen.findByRole('heading', { name: 'Version 3' })
    expect(screen.queryByRole('button', { name: 'Revert to version 3' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revert to version 2' })).toBeInTheDocument()
  })

  it('shows recorded settings, and says when a version has none', async () => {
    vi.mocked(listScenarioVersions).mockResolvedValue([
      version(2, {
        metadata: {
          title: 'Etude no. 2',
          description: '',
          instrument: 'guitar',
          authorDifficulty: 4,
          genres: [],
          tags: [],
        },
      }),
      version(1),
    ])
    renderPanel()

    await screen.findByRole('heading', { name: 'Version 2' })
    expect(within(row(2)).getByText('Etude no. 2 · Guitar · difficulty 4/10')).toBeInTheDocument()
    expect(within(row(1)).getByText('Settings not recorded')).toBeInTheDocument()
  })

  it('loads older versions on request, and stops at version 1', async () => {
    vi.mocked(listScenarioVersions)
      .mockResolvedValueOnce([version(3), version(2)])
      .mockResolvedValueOnce([version(1)])
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /older versions/i }))

    expect(listScenarioVersions).toHaveBeenLastCalledWith('s1', 2)
    expect(await screen.findByRole('heading', { name: 'Version 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /older versions/i })).not.toBeInTheDocument()
  })

  it('asks to view a version', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'View version 2' }))

    expect(handlers.onViewVersion).toHaveBeenCalledWith('v2')
  })

  it('will not show the history of a scenario the caller does not own', async () => {
    vi.mocked(loadScenario).mockResolvedValue({
      scenario: { ...scenario, authorUid: 'someone-else' },
      version: version(3),
    })
    renderPanel()

    expect(await screen.findByText('This history is private')).toBeInTheDocument()
    expect(listScenarioVersions).not.toHaveBeenCalled()
  })

  it('reports a load that fails', async () => {
    vi.mocked(loadScenario).mockRejectedValue(new Error('offline'))
    renderPanel()

    expect(await screen.findByText('Could not load this history')).toBeInTheDocument()
    expect(screen.getByText('offline')).toBeInTheDocument()
  })
})

describe('naming', () => {
  it('saves a name and shows it in the row', async () => {
    vi.mocked(renameScenarioVersion).mockResolvedValue('Bridge rewrite')
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Rename version 2' }))
    await userEvent.type(screen.getByLabelText('Name for version 2'), 'Bridge rewrite{Enter}')

    expect(renameScenarioVersion).toHaveBeenCalledWith({
      scenarioId: 's1',
      versionId: 'v2',
      name: 'Bridge rewrite',
    })
    expect(await screen.findByRole('heading', { name: 'Version 2: Bridge rewrite' })).toBeVisible()
    expect(screen.queryByLabelText('Name for version 2')).not.toBeInTheDocument()
  })

  it('leaves the name alone on cancel', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Rename version 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(renameScenarioVersion).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Version 2' })).toBeInTheDocument()
  })

  it('keeps the form open and reports a failed rename', async () => {
    vi.mocked(renameScenarioVersion).mockRejectedValue(new Error('Denied'))
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Rename version 2' }))
    await userEvent.type(screen.getByLabelText('Name for version 2'), 'x{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Denied')
    expect(screen.getByLabelText('Name for version 2')).toBeInTheDocument()
  })
})

describe('sharing', () => {
  it('copies a link to exactly that version', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderPanel()

    await user.click(await screen.findByRole('button', { name: 'Copy link to version 2' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/play/s1?version=v2`)
    expect(await screen.findByRole('status')).toHaveTextContent('Link to version 2 copied.')
  })

  it('says when a private scenario means only the author can open the link', async () => {
    vi.mocked(loadScenario).mockResolvedValue({
      scenario: { ...scenario, visibility: 'private' },
      version: version(3),
    })
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderPanel()

    await user.click(await screen.findByRole('button', { name: 'Copy link to version 2' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/only you can open it/)
  })

  it('reports a clipboard that refuses', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'))
    renderPanel()

    await user.click(await screen.findByRole('button', { name: 'Copy link to version 2' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy the link.')
  })
})

describe('reverting', () => {
  it('does nothing unless the author confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Revert to version 1' }))

    expect(revertToVersion).not.toHaveBeenCalled()
  })

  it('warns how much will be deleted before going ahead', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Revert to version 1' }))

    const warning = confirm.mock.calls[0][0]
    expect(warning).toContain('2 later versions (2 to 3)')
    expect(warning).toContain('cannot be undone')
    expect(warning).toContain('leaderboards')
    expect(warning).toContain('Unsaved edits')
  })

  it('reverts against the version on screen, then refreshes the list and the editor', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(revertToVersion).mockResolvedValue({ versionNumber: 1, deletedCount: 2 })
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Revert to version 1' }))

    expect(revertToVersion).toHaveBeenCalledWith({
      uid: 'user-1',
      scenarioId: 's1',
      targetVersionId: 'v1',
      expectedCurrentVersionId: 'v3',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Reverted to version 1. Deleted 2 later versions.',
    )
    expect(handlers.onReverted).toHaveBeenCalledOnce()
    expect(listScenarioVersions).toHaveBeenCalledTimes(2)
  })

  it('reports a conflict and shows the versions as they now stand', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(revertToVersion).mockRejectedValue(new ScenarioConflictError())
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Revert to version 1' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Changed elsewhere')
    expect(handlers.onReverted).not.toHaveBeenCalled()
    expect(listScenarioVersions).toHaveBeenCalledTimes(2)
  })
})

describe('viewing one version', () => {
  beforeEach(() => {
    vi.mocked(loadScenario).mockImplementation(async (_id, versionId) => ({
      scenario,
      version: versionId === 'gone' ? null : version(versionId === 'v2' ? 2 : 3),
    }))
  })

  it('shows it read only, with a way to revert to it', async () => {
    renderPanel('v2')

    expect(await screen.findByRole('heading', { name: 'Version 2' })).toBeInTheDocument()
    expect(screen.getByText(/^Read only/)).toBeInTheDocument()
    expect(screen.getByRole('application')).toHaveAttribute('aria-readonly', 'true')
    expect(screen.getByRole('button', { name: 'Revert to This Version' })).toBeInTheDocument()
  })

  it('offers no revert when it is already the current version', async () => {
    renderPanel('v3')

    expect(await screen.findByRole('heading', { name: 'Version 3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revert to This Version' })).not.toBeInTheDocument()
  })

  it('returns to the list', async () => {
    renderPanel('v2')

    await userEvent.click(await screen.findByRole('button', { name: 'Back to Version History' }))

    expect(handlers.onViewVersion).toHaveBeenCalledWith(null)
  })

  it('says so when a revert has deleted the version', async () => {
    renderPanel('gone')

    expect(await screen.findByText('This version is no longer available')).toBeInTheDocument()
    expect(screen.queryByRole('application')).not.toBeInTheDocument()
  })
})
