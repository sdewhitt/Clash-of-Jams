import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { DifficultyVisualization } from '@/components/DifficultyVisualization'
import { ProfileButton } from '@/components/ProfileButton'
import { TabBar } from '@/components/TabBar'
import { panelId, tabId } from '@/components/tabIds'
import { useAuth } from '@/lib/auth/useAuth'
import {
  loadDifficulty,
  loadDifficultyScenarios,
  loadExamples,
  publishDifficulty,
} from '@/lib/difficulty/api'
import type { DifficultyDetail, DifficultyScenario, DifficultySource } from '@/lib/difficulty/types'

interface Catalog {
  key: string
  scenarios: DifficultyScenario[]
  examples: DifficultyDetail[]
  error: string | null
}
interface DetailEntry {
  key: string
  value: DifficultyDetail | null
  error: string | null
}

export function ScenarioDifficulty() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const source: DifficultySource = params.get('source') === 'library' ? 'library' : 'examples'
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [entry, setEntry] = useState<DetailEntry | null>(null)
  const [retry, setRetry] = useState(0)
  const [publication, setPublication] = useState<{
    key: string
    pending: boolean
    message: string
    failed: boolean
  } | null>(null)
  const key = (user?.uid ?? '') + ':' + source + ':' + retry
  const current = catalog?.key === key ? catalog : null
  const scenarios = current?.scenarios ?? []
  const selected = scenarios.find((item) => item.id === params.get('scenario')) ?? scenarios[0]
  const detailKey = key + ':' + (selected?.id ?? '')
  const detail =
    source === 'examples'
      ? current?.examples.find((item) => item.scenario.id === selected?.id)
      : entry?.key === detailKey
        ? entry.value
        : null
  const error = current?.error ?? (entry?.key === detailKey ? entry.error : null)

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    let active = true
    async function load() {
      try {
        const examples = source === 'examples' ? await loadExamples(controller.signal) : []
        const items =
          source === 'examples'
            ? examples.map((item) => item.scenario)
            : await loadDifficultyScenarios(controller.signal)
        if (active) setCatalog({ key, scenarios: items, examples, error: null })
      } catch (reason) {
        if (active)
          setCatalog({
            key,
            scenarios: [],
            examples: [],
            error: reason instanceof Error ? reason.message : 'Could not load scenarios.',
          })
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [user, source, key])

  useEffect(() => {
    if (source !== 'library' || !selected) return
    const controller = new AbortController()
    let active = true
    loadDifficulty(selected.id, controller.signal)
      .then((value) => {
        if (active) setEntry({ key: detailKey, value, error: null })
      })
      .catch((reason) => {
        if (active)
          setEntry({
            key: detailKey,
            value: null,
            error: reason instanceof Error ? reason.message : 'Could not load difficulty.',
          })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [source, selected, detailKey])

  async function publish() {
    if (!selected || !detail?.canPublish) return
    setPublication({ key: detailKey, pending: true, message: '', failed: false })
    try {
      const value = await publishDifficulty(selected.id)
      setEntry({ key: detailKey, value, error: null })
      setPublication({
        key: detailKey,
        pending: false,
        failed: false,
        message: value.estimate.isProvisional
          ? 'Provisional estimate saved. Matchmaking keeps the author grade until more evidence arrives.'
          : 'Estimate saved. Matchmaking can use this version’s empirical difficulty.',
      })
    } catch (reason) {
      setPublication({
        key: detailKey,
        pending: false,
        failed: true,
        message: reason instanceof Error ? reason.message : 'Could not save the estimate.',
      })
    }
  }

  return (
    <main className="min-h-screen bg-base-start text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-6 py-6">
        <div className="flex items-center gap-4">
          <BackButton onClick={() => navigate('/home')} />
          <h1 className="text-2xl font-bold sm:text-3xl">Scenario Difficulty</h1>
        </div>
        <ProfileButton
          username={profile?.displayName ?? user?.email ?? '…'}
          userAvatar={profile?.avatarUrl ?? '/favicon.svg'}
        />
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold">What makes a scenario challenging?</p>
            <p className="mt-1 text-muted">
              Explore the scores behind the grade, from beginners to experienced players.
            </p>
          </div>
          <div className="flex gap-2" aria-label="Evidence source">
            {(['examples', 'library'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={source === value}
                onClick={() => setParams({ source: value })}
                className={
                  'cursor-pointer rounded-xl border-2 border-accent-start px-4 py-2 font-bold ' +
                  (source === value ? 'bg-accent-base-start' : 'bg-base-start')
                }
              >
                {value === 'examples' ? 'Demo examples' : 'Scenario library'}
              </button>
            ))}
          </div>
        </div>
        {source === 'examples' && (
          <p className="rounded-xl border-2 border-contrast-middle bg-base-middle p-4">
            Demo examples use synthetic scores to explain the model. They are not real performances
            and do not update matchmaking or player Elo.
          </p>
        )}
        {error ? (
          <div className="space-y-3">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="cursor-pointer rounded-xl border-2 border-accent-start px-4 py-2 font-bold"
            >
              Try again
            </button>
          </div>
        ) : !current ? (
          <p role="status">Loading scenarios…</p>
        ) : scenarios.length === 0 ? (
          <p className="rounded-xl border-2 border-base-middle p-6">
            No scenarios available. Create a scenario in the editor or explore the demo examples.
          </p>
        ) : (
          <>
            <TabBar
              tabs={scenarios.map((item) => ({ id: item.id, label: item.title }))}
              selected={selected.id}
              onSelect={(id) => setParams({ source, scenario: id })}
              idPrefix="difficulty-scenarios"
              label="Scenarios"
            />
            <section
              role="tabpanel"
              id={panelId('difficulty-scenarios', selected.id)}
              aria-labelledby={tabId('difficulty-scenarios', selected.id)}
              className="rounded-2xl border-2 border-base-middle bg-base-start p-4 sm:p-6"
            >
              {!detail ? (
                <p role="status">Loading performance evidence…</p>
              ) : (
                <>
                  <DifficultyVisualization key={detailKey} detail={detail} />
                  {detail.canPublish && (
                    <div className="mt-6 border-t-2 border-base-middle pt-5">
                      <button
                        type="button"
                        disabled={publication?.key === detailKey && publication.pending}
                        onClick={() => {
                          void publish()
                        }}
                        className="cursor-pointer rounded-xl border-2 border-accent-start bg-accent-base-start px-5 py-3 font-bold disabled:cursor-wait disabled:opacity-60"
                      >
                        {publication?.key === detailKey && publication.pending
                          ? 'Saving…'
                          : 'Recompute and save estimate'}
                      </button>
                      <p className="mt-2 text-sm text-muted">
                        Saves an aggregate for this scenario version. Individual performances stay
                        private.
                      </p>
                    </div>
                  )}
                  {publication?.key === detailKey && publication.message && (
                    <p className="mt-3" role={publication.failed ? 'alert' : 'status'}>
                      {publication.message}
                    </p>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
