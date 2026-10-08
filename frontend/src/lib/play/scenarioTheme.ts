/**
 * The look a player chose for scenario playthroughs, applied to a play page.
 *
 * userSettings.scenarioTheme names either one of the application themes, or a
 * custom theme under userSettings/{uid}/scenarioThemes: a background image plus
 * the application theme that accompanies it. The palettes hang off
 * [data-theme], so putting that attribute on a page's root re-themes just that
 * page and leaves the rest of the app on the theme it already had.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import type { Theme } from '@/context/ThemeContext'
import { getUserScenarioTheme, getUserSettings } from '@/lib/profile/UserSettings'

const APP_THEMES = [
  'default',
  'dark',
  'neon',
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'high-contrast',
] as const satisfies readonly Theme[]

export interface ScenarioAppearance {
  /** The palette to play in, or null to keep the application theme. */
  theme: Theme | null
  /** A custom background image, or null for the palette's own background. */
  backgroundUrl: string | null
}

function asAppTheme(name: string | undefined): Theme | null {
  return APP_THEMES.find((theme) => theme === name) ?? null
}

/** Resolves the player's saved scenario theme; null when they have none. */
export async function loadScenarioAppearance(uid: string): Promise<ScenarioAppearance | null> {
  const { scenarioTheme } = await getUserSettings(uid)
  if (!scenarioTheme) return null

  const theme = asAppTheme(scenarioTheme)
  if (theme) return { theme, backgroundUrl: null }

  const custom = await getUserScenarioTheme(uid, scenarioTheme)
  if (!custom) return null
  return { theme: asAppTheme(custom.accompanyTheme), backgroundUrl: custom.themeUrl || null }
}

/** The body's own background, repeated so a re-themed page repaints it in its palette. */
const PALETTE_BACKGROUND =
  'bg-linear-to-bl from-base-start from-10% via-base-middle via-70% to-base-end to-90% text-ink'

export interface ScenarioThemeProps {
  'data-theme'?: Theme
  className: string
  style?: CSSProperties
}

/** What a play page's root element needs to wear the appearance. */
export function scenarioThemeProps(appearance: ScenarioAppearance | null): ScenarioThemeProps {
  if (!appearance) return { className: '' }
  return {
    'data-theme': appearance.theme ?? undefined,
    className: appearance.backgroundUrl ? 'bg-cover bg-center text-ink' : PALETTE_BACKGROUND,
    style: appearance.backgroundUrl
      ? { backgroundImage: `url(${JSON.stringify(appearance.backgroundUrl)})` }
      : undefined,
  }
}

/**
 * Props to spread onto a play page's root. Until the settings arrive, and if
 * they cannot be read, the page simply stays on the application theme.
 */
export function useScenarioTheme(uid: string | null | undefined): ScenarioThemeProps {
  // The uid travels with the result so one player's look is never shown to the next.
  const [loaded, setLoaded] = useState<{ uid: string; appearance: ScenarioAppearance | null }>()

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    loadScenarioAppearance(uid)
      .catch(() => null)
      .then((appearance) => {
        if (!cancelled) setLoaded({ uid, appearance })
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  return scenarioThemeProps(uid && loaded?.uid === uid ? loaded.appearance : null)
}
