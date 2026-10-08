/**
 * The scenario theme a player picked in Edit Profile, as a play page wears it.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadScenarioAppearance,
  scenarioThemeProps,
  useScenarioTheme,
} from '@/lib/play/scenarioTheme'
import { getUserScenarioTheme, getUserSettings } from '@/lib/profile/UserSettings'
import type { ScenarioTheme, UserSettings } from '@/lib/schema/types'

vi.mock('@/lib/profile/UserSettings', () => ({
  getUserSettings: vi.fn(),
  getUserScenarioTheme: vi.fn(),
}))

function settings(scenarioTheme: string) {
  vi.mocked(getUserSettings).mockResolvedValue({ scenarioTheme } as UserSettings)
}

function customTheme(overrides: Partial<ScenarioTheme> = {}) {
  vi.mocked(getUserScenarioTheme).mockResolvedValue({
    uid: 'user-1',
    themeName: 'Purdue_Pete',
    themeUrl: 'data:image/png;base64,AAAA',
    accompanyTheme: 'dark',
    ...overrides,
  } as ScenarioTheme)
}

beforeEach(() => {
  vi.mocked(getUserSettings).mockReset()
  vi.mocked(getUserScenarioTheme).mockReset().mockResolvedValue(null)
})

describe('loadScenarioAppearance', () => {
  it('uses an application theme by name, with no custom background', async () => {
    settings('neon')

    await expect(loadScenarioAppearance('user-1')).resolves.toEqual({
      theme: 'neon',
      backgroundUrl: null,
    })
    expect(getUserScenarioTheme).not.toHaveBeenCalled()
  })

  it('reads a custom theme: its image and the palette that accompanies it', async () => {
    settings('Purdue_Pete')
    customTheme()

    await expect(loadScenarioAppearance('user-1')).resolves.toEqual({
      theme: 'dark',
      backgroundUrl: 'data:image/png;base64,AAAA',
    })
    expect(getUserScenarioTheme).toHaveBeenCalledWith('user-1', 'Purdue_Pete')
  })

  it('keeps the application palette when the accompanying theme is not one it knows', async () => {
    settings('Purdue_Pete')
    customTheme({ accompanyTheme: 'sepia' })

    await expect(loadScenarioAppearance('user-1')).resolves.toMatchObject({ theme: null })
  })

  it('has nothing to apply when the named custom theme is gone, or none was chosen', async () => {
    settings('Deleted_Theme')
    await expect(loadScenarioAppearance('user-1')).resolves.toBeNull()

    settings('')
    await expect(loadScenarioAppearance('user-1')).resolves.toBeNull()
  })
})

describe('scenarioThemeProps', () => {
  it('re-themes the page and repaints its background in that palette', () => {
    const props = scenarioThemeProps({ theme: 'neon', backgroundUrl: null })

    expect(props['data-theme']).toBe('neon')
    expect(props.className).toContain('from-base-start')
    expect(props.style).toBeUndefined()
  })

  it('paints a custom image over the page', () => {
    const props = scenarioThemeProps({ theme: 'dark', backgroundUrl: 'https://example.com/a.png' })

    expect(props['data-theme']).toBe('dark')
    expect(props.style).toEqual({ backgroundImage: 'url("https://example.com/a.png")' })
  })

  it('leaves the page alone without an appearance', () => {
    expect(scenarioThemeProps(null)).toEqual({ className: '' })
  })
})

describe('useScenarioTheme', () => {
  function Page({ uid }: { uid: string | null }) {
    return <main {...useScenarioTheme(uid)}>play</main>
  }

  it('applies the saved theme once the settings arrive', async () => {
    settings('high-contrast')
    render(<Page uid="user-1" />)

    expect(screen.getByRole('main')).not.toHaveAttribute('data-theme')
    await vi.waitFor(() =>
      expect(screen.getByRole('main')).toHaveAttribute('data-theme', 'high-contrast'),
    )
  })

  it('stays on the application theme when the settings cannot be read', async () => {
    vi.mocked(getUserSettings).mockRejectedValue(new Error('offline'))
    render(<Page uid="user-1" />)

    await vi.waitFor(() => expect(getUserSettings).toHaveBeenCalled())
    expect(screen.getByRole('main')).not.toHaveAttribute('data-theme')
  })

  it('does not look anything up while signed out', () => {
    render(<Page uid={null} />)

    expect(getUserSettings).not.toHaveBeenCalled()
  })
})
