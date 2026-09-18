import { useState } from 'react'

import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

export function Settings() {
  const [inputDevice, setInputDevice] = useState('default')
  const [latencyMs, setLatencyMs] = useState(0)
  const [noteSpeed, setNoteSpeed] = useState(1.0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [colorblindSafe, setColorblindSafe] = useState(false)

  return (
    <>
      <PageHeader title="Settings" subtitle="Local only for now — nothing is persisted yet." />

      <div className="grid max-w-2xl gap-6">
        <Card>
          <h2 className="mb-4 font-medium">Audio input</h2>

          <label className="mb-4 flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Input device</span>
            <select
              value={inputDevice}
              onChange={(event) => setInputDevice(event.target.value)}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2"
            >
              <option value="default">System default</option>
              <option value="interface">Audio interface</option>
              <option value="midi">MIDI controller</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Latency offset: {latencyMs} ms</span>
            <input
              type="range"
              min={-100}
              max={200}
              value={latencyMs}
              onChange={(event) => setLatencyMs(Number(event.target.value))}
              className="accent-accent"
            />
            <span className="text-xs text-faint">
              Shifts the scoring window to compensate for device round-trip delay.
            </span>
          </label>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium">Gameplay</h2>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Note scroll speed: {noteSpeed.toFixed(1)}x</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={noteSpeed}
              onChange={(event) => setNoteSpeed(Number(event.target.value))}
              className="accent-accent"
            />
          </label>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium">Accessibility</h2>
          <Toggle
            label="Reduce motion"
            description="Disables scrolling animations and hit-effect flashes."
            checked={reducedMotion}
            onChange={setReducedMotion}
          />
          <Toggle
            label="Colorblind-safe judgments"
            description="Uses shape and text labels instead of color alone."
            checked={colorblindSafe}
            onChange={setColorblindSafe}
          />
        </Card>
      </div>
    </>
  )
}

interface ToggleProps {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-accent"
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-faint">{description}</span>
      </span>
    </label>
  )
}
