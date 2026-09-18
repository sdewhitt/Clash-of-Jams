import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

const PITCH_ROWS = 14
const BEAT_COLUMNS = 32

export function ScenarioEditor() {
  return (
    <>
      <PageHeader
        title="Scenario editor"
        subtitle="Placeholder shell — the MIDI grid is not wired up yet."
        actions={
          <>
            <Button variant="secondary">Import MIDI</Button>
            <Button variant="secondary">Save draft</Button>
            <Button>Publish</Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="overflow-x-auto p-0">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm">
            <Button size="sm" variant="ghost">
              Draw
            </Button>
            <Button size="sm" variant="ghost">
              Select
            </Button>
            <Button size="sm" variant="ghost">
              Erase
            </Button>
            <span className="ml-auto text-xs text-faint">4/4 &middot; 120 BPM</span>
          </div>

          {/* Static piano-roll mockup; replace with a canvas-backed editor. */}
          <div className="min-w-[48rem] p-4">
            <div
              className="grid gap-px rounded-lg bg-line"
              style={{ gridTemplateColumns: `repeat(${BEAT_COLUMNS}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: PITCH_ROWS * BEAT_COLUMNS }, (_, i) => {
                const column = i % BEAT_COLUMNS
                const isBarLine = column % 4 === 0
                return (
                  <div
                    key={i}
                    className={isBarLine ? 'h-5 bg-surface-2' : 'h-5 bg-surface'}
                    aria-hidden
                  />
                )
              })}
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium">Scenario details</h2>
          <div className="flex flex-col gap-4 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-muted">Title</span>
              <input
                className="rounded-lg border border-line bg-surface-2 px-3 py-2 placeholder:text-faint"
                placeholder="Untitled scenario"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted">Instrument</span>
              <select className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <option>piano</option>
                <option>guitar</option>
                <option>voice</option>
                <option>woodwind</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted">Difficulty</span>
              <select className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <option>beginner</option>
                <option>intermediate</option>
                <option>advanced</option>
                <option>expert</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted">Tempo (BPM)</span>
              <input
                type="number"
                defaultValue={120}
                className="rounded-lg border border-line bg-surface-2 px-3 py-2"
              />
            </label>
          </div>
        </Card>
      </div>
    </>
  )
}
