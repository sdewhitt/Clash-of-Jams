import { useEffect, useState } from 'react'

import { publishedScenarioTitles } from '@/lib/profile/profileAppearance'
import type { FeaturedProfileScore } from '@/lib/schema/types'

export function FeaturedProfileScores({ scores }: { scores: FeaturedProfileScore[] }) {
  const [titles, setTitles] = useState<Map<string, string>>()

  useEffect(() => {
    let cancelled = false
    void publishedScenarioTitles(scores.map(({ scenarioId }) => scenarioId)).then((result) => {
      if (!cancelled) setTitles(result)
    })
    return () => { cancelled = true }
  }, [scores])

  const visible = scores.filter(({ scenarioId }) => titles?.has(scenarioId))
  if (visible.length === 0) return null

  return (
    <section className="mx-4 my-3 rounded-lg border-2 border-accent-start bg-accent-base-start p-4 text-ink">
      <h3 className="font-bold">Featured scores</h3>
      <ul className="mt-2 space-y-1">
        {visible.map(({ runId, scenarioId, finalScore }) => (
          <li key={runId} className="flex justify-between gap-3">
            <span>{titles?.get(scenarioId)}</span>
            <span className="tabular-nums">{finalScore.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
