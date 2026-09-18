import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { scenarios } from '@/lib/mockData'
import type { Difficulty, Instrument } from '@/lib/types'

const instruments: (Instrument | 'all')[] = ['all', 'piano', 'guitar', 'voice', 'woodwind', 'midi']
const difficulties: (Difficulty | 'all')[] = [
  'all',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]

export function ScenarioSearch() {
  const [query, setQuery] = useState('')
  const [instrument, setInstrument] = useState<Instrument | 'all'>('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')

  // Client-side filtering stands in for the search endpoint.
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return scenarios.filter((scenario) => {
      const matchesQuery =
        !needle ||
        scenario.title.toLowerCase().includes(needle) ||
        scenario.composer.toLowerCase().includes(needle) ||
        scenario.tags.some((tag) => tag.includes(needle))
      const matchesInstrument = instrument === 'all' || scenario.instrument === instrument
      const matchesDifficulty = difficulty === 'all' || scenario.difficulty === difficulty
      return matchesQuery && matchesInstrument && matchesDifficulty
    })
  }, [query, instrument, difficulty])

  return (
    <>
      <PageHeader
        title="Scenarios"
        subtitle={`${results.length} of ${scenarios.length} scenarios`}
        actions={
          <Link to="/editor">
            <Button variant="secondary">Create scenario</Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, composer, or tag"
          aria-label="Search scenarios"
          className="min-w-64 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint"
        />

        <select
          value={instrument}
          onChange={(event) => setInstrument(event.target.value as Instrument | 'all')}
          aria-label="Filter by instrument"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          {instruments.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All instruments' : option}
            </option>
          ))}
        </select>

        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as Difficulty | 'all')}
          aria-label="Filter by difficulty"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          {difficulties.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All difficulties' : option}
            </option>
          ))}
        </select>
      </div>

      {results.length === 0 ? (
        <Card className="text-center text-sm text-muted">No scenarios match those filters.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((scenario) => (
            <Card key={scenario.id} className="flex flex-col">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-medium leading-snug">{scenario.title}</h2>
                <Badge tone="accent">{scenario.difficulty}</Badge>
              </div>
              <p className="text-sm text-muted">{scenario.composer}</p>
              <p className="mt-1 text-xs text-faint">
                {scenario.bpm} BPM &middot; {scenario.durationSec}s &middot; {scenario.instrument}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {scenario.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-xs text-faint">
                  ★ {scenario.rating.toFixed(1)} &middot; {scenario.playCount.toLocaleString()}{' '}
                  plays
                </span>
                <Link to={`/play/${scenario.id}`}>
                  <Button size="sm">Play</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
