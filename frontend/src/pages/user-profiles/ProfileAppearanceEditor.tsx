import { useEffect, useState } from 'react'

import { FeaturedProfileScores } from '@/components/FeaturedProfileScores'
import {
  DEFAULT_APPEARANCE,
  PROFILE_ACCENTS,
  publishedScenarioTitles,
  saveProfileAppearance,
} from '@/lib/profile/profileAppearance'
import { findPublicProfile } from '@/lib/profile/publicProfile'
import { getUserSettings } from '@/lib/profile/userSettings'
import { fetchPlayHistory } from '@/lib/runs/history'
import type { FeaturedProfileScore, ProfileAppearance, PublicProfile } from '@/lib/schema/types'

const MAX_FEATURED_SCORES = 3
const BUTTON_STYLE = 'cursor-pointer rounded-lg border-2 border-accent-start bg-linear-to-br from-accent-base-start via-accent-base-middle to-accent-base-end px-4 py-2 text-ink transition duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100'
const PANEL_STYLE = 'm-4 rounded-lg border-2 border-accent-start bg-linear-to-br from-accent-base-start via-accent-base-middle to-accent-base-end p-6 text-ink'

export function ProfileAppearanceEditor({ uid }: { uid: string }) {
  const [saved, setSaved] = useState<ProfileAppearance>()
  const [draft, setDraft] = useState(DEFAULT_APPEARANCE)
  // undefined while loading; null when the profile is private and has no public document.
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>()
  const [publicProfileError, setPublicProfileError] = useState(false)
  const [choices, setChoices] = useState<FeaturedProfileScore[]>([])
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [cursor, setCursor] = useState<string | null>(null)
  const [historyOpened, setHistoryOpened] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [settingsError, setSettingsError] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getUserSettings(uid).then(async (settings) => {
      const appearance = settings.profileAppearance ?? DEFAULT_APPEARANCE
      const savedTitles = await publishedScenarioTitles(appearance.featuredScores.map(({ scenarioId }) => scenarioId))
      if (cancelled) return
      setTitles((current) => new Map([...current, ...savedTitles]))
      setSaved(appearance)
      setDraft(appearance)
    }).catch(() => { if (!cancelled) setSettingsError(true) })
    void findPublicProfile(uid).then((profile) => {
      if (!cancelled) setPublicProfile(profile)
    }).catch(() => { if (!cancelled) setPublicProfileError(true) })
    return () => { cancelled = true }
  }, [uid])

  async function loadScores() {
    setHistoryLoading(true)
    setHistoryError(false)
    try {
      const page = await fetchPlayHistory(cursor)
      const accepted = page.entries.filter((entry) =>
        entry.validation === 'accepted' && entry.scenarioAvailable
      )
      const pageTitles = await publishedScenarioTitles(accepted.map(({ scenarioId }) => scenarioId))
      setTitles((current) => new Map([...current, ...pageTitles]))
      setChoices((current) => [...current, ...accepted.filter(({ scenarioId }) => pageTitles.has(scenarioId))
        .map(({ runId, scenarioId, finalScore }) => ({ runId, scenarioId, finalScore }))])
      setCursor(page.nextBefore)
    } catch {
      setHistoryError(true)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function save() {
    setSaveState('saving')
    try {
      await saveProfileAppearance(uid, draft)
      setSaved(draft)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  function toggleScore(score: FeaturedProfileScore, selected: boolean) {
    setDraft({
      ...draft,
      featuredScores: selected
        ? draft.featuredScores.filter(({ runId }) => runId !== score.runId)
        : [...draft.featuredScores, score],
    })
    setSaveState('idle')
  }

  const scores = [...new Map([...draft.featuredScores, ...choices].map((score) => [score.runId, score])).values()]
  if (settingsError) return <p className={PANEL_STYLE} role="alert">Could not load your profile appearance.</p>
  if (!saved) return <p className={PANEL_STYLE} role="status">Loading profile appearance…</p>

  return (
    <section className={`${PANEL_STYLE} space-y-4`}>
      <h2 className="text-2xl font-bold">Appearance</h2>
      <fieldset disabled={saveState === 'saving'} className="space-y-4">
        <label className="flex flex-wrap items-center gap-3">
          Profile accent
          <select
            className="cursor-pointer rounded-lg border-2 border-accent-start bg-accent-base-middle px-3 py-2 text-ink"
            value={draft.accent}
            onChange={(event) => {
              setDraft({ ...draft, accent: event.target.value as ProfileAppearance['accent'] })
              setSaveState('idle')
            }}
          >
            {Object.keys(PROFILE_ACCENTS).map((accent) => <option key={accent}>{accent}</option>)}
          </select>
        </label>
        <fieldset className="space-y-2">
          <legend className="font-bold">Featured scores</legend>
          <p className="text-sm">Choose up to three scores from published scenarios. Visitors can see them when your profile and play history are public.</p>
          {scores.map((score) => {
            const selected = draft.featuredScores.some(({ runId }) => runId === score.runId)
            return (
              <label key={score.runId} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && draft.featuredScores.length >= MAX_FEATURED_SCORES}
                  onChange={() => toggleScore(score, selected)}
                />
                {titles.get(score.scenarioId) ?? 'Scenario unavailable'} · {score.finalScore.toLocaleString()}
              </label>
            )
          })}
          {historyError && <p role="alert">Could not load scores. Try again.</p>}
          {!historyLoading && historyOpened && !historyError && !cursor && scores.length === 0 &&
            <p>No eligible scores yet.</p>}
          {(!historyOpened || cursor || historyError) && (
            <button type="button" disabled={historyLoading} className="cursor-pointer underline" onClick={() => {
              setHistoryOpened(true)
              void loadScores()
            }}>
              {historyLoading ? 'Loading scores…' : historyOpened && !historyError ? 'Load more scores' : 'Load play history'}
            </button>
          )}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={BUTTON_STYLE} aria-expanded={preview} onClick={() => setPreview(!preview)}>
            {preview ? 'Close visitor preview' : 'Preview as Visitor'}
          </button>
          <button type="button" disabled={draft === saved} className={BUTTON_STYLE} onClick={() => {
            setDraft(saved)
            setSaveState('idle')
          }}>Cancel</button>
          <button type="button" disabled={draft === saved} className={`${BUTTON_STYLE} font-bold`} onClick={() => void save()}>
            {saveState === 'saving' ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </fieldset>
      {saveState === 'error' && <p role="alert">Could not save your profile appearance. Try again.</p>}
      {saveState === 'saved' && <p role="status">Profile appearance saved.</p>}
      {preview && (
        publicProfileError ? <p role="alert">Could not load your public profile. Try again.</p>
        : publicProfile === undefined ? <p role="status">Loading visitor preview…</p>
        : publicProfile ? (
          <section className="rounded-lg border-4 bg-accent-base-start p-4" style={{ borderColor: PROFILE_ACCENTS[draft.accent] }}>
            <h3 className="font-bold">{publicProfile.displayName}</h3>
            {publicProfile.bio && <p>{publicProfile.bio}</p>}
            {publicProfile.publicHistory === true && <FeaturedProfileScores scores={draft.featuredScores} />}
          </section>
        ) : <p role="status">Your profile is private, so visitors can't see it. Switch it to Public under My Presence to preview it here.</p>
      )}
    </section>
  )
}
