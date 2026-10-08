/**
 * User story #24: opening the Scenario Editor.
 *
 * Covers the homepage entry point, the default blank-scenario state, the tab
 * strip, the signed-out Your Library prompt, and the route guard. Editing and
 * saving belong to story #25 and are tested beside EditorPanel's modules.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/App'
import { listMyScenarios, loadScenario, saveScenarioDraft } from '@/lib/scenarios/store'
import { Home } from '@/pages/Home'
import { ScenarioEditor } from '@/pages/ScenarioEditor'
import { YourLibraryPanel } from '@/pages/scenario_editor/YourLibraryPanel'
import { LocationProbe, renderAtRoute, renderWithAuth, SIGNED_OUT, signedIn } from '@/test/render'

vi.mock('@/lib/scenarios/store', () => ({
  deleteScenario: vi.fn(),
  listMyScenarios: vi.fn(),
  loadScenario: vi.fn(),
  saveScenarioDraft: vi.fn(),
}))

// This navigation test does not exercise rating subscriptions.
vi.mock('@/components/LiveElo', () => ({ LiveElo: () => null }))

beforeEach(() => {
  vi.mocked(listMyScenarios).mockReset().mockResolvedValue([])
  vi.mocked(loadScenario).mockReset()
  vi.mocked(saveScenarioDraft).mockReset()
})

function renderEditor(route = '/scenario_editor') {
  return renderAtRoute(<ScenarioEditor />, {
    path: '/scenario_editor',
    route,
    auth: signedIn(),
  })
}

function tab(name: string) {
  return screen.getByRole('tab', { name })
}

describe('homepage entry point', () => {
  it('routes to the editor in one click', async () => {
    renderAtRoute(<Home />, { path: '/home', auth: signedIn() })

    await userEvent.click(screen.getByRole('button', { name: 'Scenario Editor' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/scenario_editor')
  })
})

describe('editor default state', () => {
  it('opens on the New Scenario tab with blank metadata', () => {
    renderEditor()

    expect(screen.getByRole('heading', { name: 'Scenario Editor' })).toBeInTheDocument()
    expect(tab('New Scenario')).toHaveAttribute('aria-selected', 'true')

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByLabelText('Title')).toHaveValue('')
    expect(within(panel).getByLabelText('Description')).toHaveValue('')
    expect(within(panel).getByLabelText('Instrument')).toHaveValue('piano')
    expect(within(panel).getByLabelText('Visibility')).toHaveValue('private')
    expect(within(panel).getByLabelText(/Difficulty/)).toHaveValue('1')
  })

  it('starts from an empty 120 BPM 4/4 chart that cannot be saved untitled', () => {
    renderEditor()

    expect(screen.getByLabelText('Tempo (BPM)')).toHaveValue(120)
    expect(screen.getByLabelText('Beats per bar')).toHaveValue(4)
    expect(screen.getByLabelText('Beat unit')).toHaveValue('4')
    expect(screen.getByText(/^0 notes · 120 BPM · 4\/4/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Scenario' })).toBeDisabled()
    expect(screen.getByText('Give the scenario a title to enable saving.')).toBeInTheDocument()
  })

  it('makes no database call while showing a blank scenario', () => {
    renderEditor()

    expect(loadScenario).not.toHaveBeenCalled()
    expect(listMyScenarios).not.toHaveBeenCalled()
    expect(saveScenarioDraft).not.toHaveBeenCalled()
  })

  it('falls back to the default tab for an unrecognised ?tab= value', () => {
    renderEditor('/scenario_editor?tab=not-a-tab')

    expect(tab('New Scenario')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
  })
})

describe('MusicXML import (user story #29)', () => {
  const scoreFile = (name: string, measure: string) =>
    new File(
      [
        '<score-partwise><work><work-title>Ode to Joy</work-title></work>' +
          '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
          `<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>` +
          `<direction><sound tempo="90"/></direction>${measure}</measure></part></score-partwise>`,
      ],
      name,
    )
  const pitched = (step: string) =>
    `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>2</duration></note>`

  it('fills the editor from an uploaded score and leaves it ready to save', async () => {
    renderEditor()

    await userEvent.upload(
      screen.getByLabelText('MusicXML file'),
      scoreFile('ode.musicxml', pitched('E') + pitched('D')),
    )

    expect(await screen.findByText('Imported 2 notes from ode.musicxml.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Ode to Joy')
    expect(screen.getByLabelText('Tempo (BPM)')).toHaveValue(90)
    expect(screen.getByText(/^2 notes · 90 BPM · 4\/4/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Scenario' })).toBeEnabled()
  })

  it('reports an unreadable file and keeps the draft as it was', async () => {
    renderEditor()

    await userEvent.upload(
      screen.getByLabelText('MusicXML file'),
      new File(['not a score'], 'notes.xml'),
    )

    expect(await screen.findByText('This file is not valid XML.')).toBeInTheDocument()
    expect(screen.getByText(/^0 notes · 120 BPM/)).toBeInTheDocument()
  })

  it('asks before replacing notes that are already there', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderEditor()
    const input = screen.getByLabelText('MusicXML file')

    await userEvent.upload(input, scoreFile('first.xml', pitched('E') + pitched('D')))
    await screen.findByText('Imported 2 notes from first.xml.')
    await userEvent.upload(input, scoreFile('second.xml', pitched('C')))

    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByText(/^2 notes ·/)).toBeInTheDocument()

    confirm.mockReturnValue(true)
    await userEvent.upload(input, scoreFile('second.xml', pitched('C')))

    expect(await screen.findByText('Imported 1 note from second.xml.')).toBeInTheDocument()
    confirm.mockRestore()
  })
})

describe('editor tabs', () => {
  it('renders every tab with its label and exactly one selected', () => {
    renderEditor()

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'New Scenario',
      'Browse Published Scenarios',
      'Your Library',
    ])
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(screen.getByRole('tablist', { name: 'Scenario Editor sections' })).toBeInTheDocument()
  })

  it('shows the selected tab panel and deselects the previous tab', async () => {
    renderEditor()

    await userEvent.click(tab('Browse Published Scenarios'))

    expect(tab('Browse Published Scenarios')).toHaveAttribute('aria-selected', 'true')
    expect(tab('New Scenario')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Browse Published Scenarios')
    expect(screen.getByText('No published scenarios yet')).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()

    await userEvent.click(tab('Your Library'))

    expect(tab('Your Library')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Browse Published Scenarios')).toHaveAttribute('aria-selected', 'false')
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument()
    expect(listMyScenarios).toHaveBeenCalledWith('user-1')
  })

  it('keeps the open tab in the URL so a return trip reopens it', async () => {
    renderAtRoute(
      <>
        <ScenarioEditor />
        <LocationProbe />
      </>,
      { path: '/scenario_editor', auth: signedIn() },
    )

    await userEvent.click(tab('Your Library'))

    expect(screen.getByTestId('location')).toHaveTextContent('/scenario_editor?tab=library')
  })

  it('opens directly on a tab named in the URL', () => {
    renderEditor('/scenario_editor?tab=browse')

    expect(tab('Browse Published Scenarios')).toHaveAttribute('aria-selected', 'true')
  })

  it('moves the selection with the arrow keys, wrapping at the ends', async () => {
    renderEditor()

    tab('New Scenario').focus()
    await userEvent.keyboard('{ArrowLeft}')

    expect(tab('Your Library')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Your Library')).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')

    expect(tab('New Scenario')).toHaveAttribute('aria-selected', 'true')
  })

  it('returns from Your Library to a blank New Scenario', async () => {
    renderEditor('/scenario_editor?tab=library')

    await userEvent.click(await screen.findByRole('button', { name: 'Start a New Scenario' }))

    expect(tab('New Scenario')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Title')).toHaveValue('')
  })

  it('shows an error state, not a crash, when the library cannot load', async () => {
    vi.mocked(listMyScenarios).mockRejectedValue(new Error('offline'))
    renderEditor('/scenario_editor?tab=library')

    expect(await screen.findByText('Could not load your library')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })
})

describe('Your Library while signed out', () => {
  it('prompts for sign-in instead of rendering library content', async () => {
    renderAtRoute(<YourLibraryPanel onOpenScenario={() => {}} onCreateNew={() => {}} />, {
      path: '/scenario_editor',
      auth: SIGNED_OUT,
    })

    expect(screen.getByText('Sign in to see your library')).toBeInTheDocument()
    expect(screen.queryByText('Your library is empty')).not.toBeInTheDocument()
    expect(listMyScenarios).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })
})

describe('editor route guard', () => {
  it('redirects a signed-out visitor to sign-in', () => {
    renderWithAuth(<AppRoutes />, { auth: SIGNED_OUT, route: '/scenario_editor' })

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scenario Editor' })).not.toBeInTheDocument()
  })

  it('lets any signed-in user reach the editor', () => {
    renderWithAuth(<AppRoutes />, { auth: signedIn(), route: '/scenario_editor' })

    expect(screen.getByRole('heading', { name: 'Scenario Editor' })).toBeInTheDocument()
  })

  it('reopens cleanly after leaving for the homepage and coming back', async () => {
    renderWithAuth(<AppRoutes />, { auth: signedIn(), route: '/scenario_editor?tab=library' })
    await screen.findByText('Your library is empty')

    await userEvent.click(screen.getByRole('button', { name: '⬅' }))
    expect(screen.queryByRole('heading', { name: 'Scenario Editor' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Scenario Editor' }))

    expect(screen.getByRole('heading', { name: 'Scenario Editor' })).toBeInTheDocument()
    expect(tab('New Scenario')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Title')).toHaveValue('')
    expect(screen.queryByText(/could not/i)).not.toBeInTheDocument()
  })
})
