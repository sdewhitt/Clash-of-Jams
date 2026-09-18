import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/Button'
import { NoteHighway } from '@/features/gameplay/NoteHighway'
import { useTransport } from '@/features/gameplay/useTransport'
import { demoChart, scenarios } from '@/lib/mockData'

export function Play() {
  const { scenarioId } = useParams()
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0]
  const transport = useTransport()

  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  // Sampled at 10Hz rather than per frame — React never sees the playhead.
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(transport.position), 100)
    return () => window.clearInterval(id)
  }, [transport])

  async function handleStart() {
    await transport.start()
    setStarted(true)
    setPaused(false)
  }

  function handlePause() {
    transport.pause()
    setPaused(true)
  }

  function handleRestart() {
    transport.reset()
    setStarted(false)
    setPaused(false)
    setElapsed(0)
  }

  return (
    <div className="flex h-dvh flex-col bg-base">
      <header className="flex items-center gap-4 border-b border-line px-6 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium">{scenario.title}</h1>
          <p className="text-xs text-faint">
            {scenario.composer} &middot; {scenario.bpm} BPM &middot; {scenario.instrument}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-6">
          <Readout label="Time" value={formatTime(elapsed)} />
          <Readout label="Score" value="0" />
          <Readout label="Combo" value="0" />
          <Link to="/scenarios">
            <Button variant="ghost" size="sm">
              Exit
            </Button>
          </Link>
        </div>
      </header>

      <div className="relative flex-1">
        <NoteHighway notes={demoChart} transport={transport} />

        {(!started || paused) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base/80 backdrop-blur-sm">
            <p className="text-lg font-medium">{paused ? 'Paused' : 'Ready when you are'}</p>
            <p className="max-w-sm text-center text-sm text-muted">
              {paused
                ? 'The clock is held. Resume picks up where you left off.'
                : 'Browsers only allow audio to start from a click, so the scenario waits for one.'}
            </p>
            <div className="flex gap-3">
              <Button size="lg" onClick={handleStart}>
                {paused ? 'Resume' : 'Start scenario'}
              </Button>
              {paused && (
                <Button size="lg" variant="secondary" onClick={handleRestart}>
                  Restart
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t border-line px-6 py-3">
        <Button size="sm" variant="secondary" onClick={handlePause} disabled={!started || paused}>
          Pause
        </Button>
        <Button size="sm" variant="secondary" onClick={handleRestart}>
          Restart
        </Button>
        <p className="ml-auto text-xs text-faint">
          Chart and scoring are placeholders — no audio input is captured yet.
        </p>
      </footer>
    </div>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] tracking-wide text-faint uppercase">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  )
}

function formatTime(seconds: number): string {
  const safe = Math.max(seconds, 0)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
