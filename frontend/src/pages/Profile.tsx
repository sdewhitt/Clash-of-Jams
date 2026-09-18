import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { currentUser, recentRuns } from '@/lib/mockData'

export function Profile() {
  const best = recentRuns.reduce((a, b) => (a.score > b.score ? a : b))

  return (
    <>
      <PageHeader
        title={currentUser.displayName}
        subtitle={`@${currentUser.username} · joined ${currentUser.joinedAt}`}
        actions={<Button variant="secondary">Edit profile</Button>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ELO" value={currentUser.elo.toString()} note={currentUser.rank} />
        <Stat label="Runs played" value={currentUser.totalRuns.toString()} />
        <Stat label="Best score" value={best.score.toLocaleString()} note={best.scenarioTitle} />
        <Stat label="Primary instrument" value={currentUser.primaryInstrument} />
      </div>

      <h2 className="mb-3 text-sm font-medium tracking-wide text-faint uppercase">Run history</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-faint uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">Scenario</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Score</th>
              <th className="px-5 py-3 font-medium">Accuracy</th>
              <th className="px-5 py-3 font-medium">Breakdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {recentRuns.map((run) => (
              <tr key={run.id}>
                <td className="px-5 py-3">{run.scenarioTitle}</td>
                <td className="px-5 py-3 text-muted">{run.playedAt}</td>
                <td className="px-5 py-3 font-mono">{run.score.toLocaleString()}</td>
                <td className="px-5 py-3">{(run.accuracy * 100).toFixed(1)}%</td>
                <td className="flex gap-1.5 px-5 py-3">
                  <Badge tone="perfect">{run.perfect}</Badge>
                  <Badge tone="good">{run.good}</Badge>
                  <Badge tone="miss">{run.missed}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <p className="text-xs tracking-wide text-faint uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-1 truncate text-xs text-muted">{note}</p>}
    </Card>
  )
}
