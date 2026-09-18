import { Link } from 'react-router'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { currentUser, leaderboard, recentRuns, scenarios } from '@/lib/mockData'

export function Home() {
  const featured = scenarios.slice(0, 3)

  return (
    <>
      <PageHeader
        title={`Welcome back, ${currentUser.displayName}`}
        subtitle={`${currentUser.rank} · ${currentUser.elo} ELO · ${currentUser.totalRuns} runs logged`}
        actions={
          <>
            <Button variant="secondary">Find a match</Button>
            <Link to="/scenarios">
              <Button>Browse scenarios</Button>
            </Link>
          </>
        }
      />

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium tracking-wide text-faint uppercase">
          Jump back in
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((scenario) => (
            <Card key={scenario.id} className="flex flex-col">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="font-medium leading-snug">{scenario.title}</h3>
                <Badge tone="accent">{scenario.difficulty}</Badge>
              </div>
              <p className="text-sm text-muted">{scenario.composer}</p>
              <p className="mt-1 text-xs text-faint">
                {scenario.bpm} BPM &middot; {scenario.durationSec}s &middot; {scenario.instrument}
              </p>
              <Link to={`/play/${scenario.id}`} className="mt-4">
                <Button size="sm" className="w-full">
                  Play
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-faint uppercase">
            Recent runs
          </h2>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {recentRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{run.scenarioTitle}</p>
                    <p className="text-xs text-faint">{run.playedAt}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">{run.score.toLocaleString()}</p>
                    <p className="text-xs text-muted">{(run.accuracy * 100).toFixed(1)}%</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-faint uppercase">
            Leaderboard &mdash; Prelude in C
          </h2>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {leaderboard.map((entry) => (
                <li
                  key={entry.rank}
                  className={
                    entry.username === currentUser.username
                      ? 'flex items-center gap-4 bg-accent/10 px-5 py-3'
                      : 'flex items-center gap-4 px-5 py-3'
                  }
                >
                  <span className="w-6 font-mono text-sm text-faint">{entry.rank}</span>
                  <span className="flex-1 truncate text-sm">{entry.username}</span>
                  <span className="text-xs text-muted">{entry.elo}</span>
                  <span className="font-mono text-sm">{entry.score.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </>
  )
}
