import { useEffect, useRef } from 'react'

import type { Transport } from '@/features/gameplay/transport'
import type { ChartNote } from '@/lib/types'

interface NoteHighwayProps {
  notes: ChartNote[]
  transport: Transport
  /** Multiplier on scroll speed; matches the setting in Settings. */
  speed?: number
}

const PX_PER_SEC = 260
const JUDGE_OFFSET_PX = 96
const NOTE_WIDTH_RATIO = 0.62

const COLORS = {
  lane: '#14121f',
  laneAlt: '#1d1a2c',
  line: '#2c2840',
  judge: '#a855f7',
  note: '#22d3ee',
  noteHot: '#c084fc',
  label: '#6e6987',
}

/**
 * The scenario view, drawn on a raw canvas and driven by requestAnimationFrame.
 *
 * This is intentionally outside React's render cycle: the playhead moves every
 * frame, and routing that through useState would put the reconciler on the hot
 * path at 60fps. React mounts the canvas and then stays out of the way.
 */
export function NoteHighway({ notes, transport, speed = 1 }: NoteHighwayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Lanes are the distinct pitches in the chart, low to high.
    const pitches = [...new Set(notes.map((note) => note.pitch))].sort((a, b) => a - b)
    const laneOf = new Map(pitches.map((pitch, index) => [pitch, index]))
    const pxPerSec = PX_PER_SEC * speed

    let width = 0
    let height = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)

      const now = transport.position
      const judgeY = height - JUDGE_OFFSET_PX
      const laneWidth = width / Math.max(pitches.length, 1)

      ctx.clearRect(0, 0, width, height)

      // Lanes
      for (let i = 0; i < pitches.length; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? COLORS.lane : COLORS.laneAlt
        ctx.fillRect(i * laneWidth, 0, laneWidth, height)
      }

      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 1
      for (let i = 1; i < pitches.length; i += 1) {
        ctx.beginPath()
        ctx.moveTo(i * laneWidth, 0)
        ctx.lineTo(i * laneWidth, height)
        ctx.stroke()
      }

      // Notes, drawn only while on screen.
      const noteWidth = laneWidth * NOTE_WIDTH_RATIO
      for (const note of notes) {
        const lane = laneOf.get(note.pitch) ?? 0
        const tail = judgeY - (note.startSec - now) * pxPerSec
        const noteHeight = Math.max(note.durationSec * pxPerSec, 10)
        const top = tail - noteHeight
        if (tail < -noteHeight || top > height) continue

        const x = lane * laneWidth + (laneWidth - noteWidth) / 2
        const active = tail >= judgeY - 12 && top <= judgeY + 12
        ctx.fillStyle = active ? COLORS.noteHot : COLORS.note
        ctx.beginPath()
        ctx.roundRect(x, top, noteWidth, noteHeight, 4)
        ctx.fill()
      }

      // Judgment line
      ctx.strokeStyle = COLORS.judge
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, judgeY)
      ctx.lineTo(width, judgeY)
      ctx.stroke()

      // Lane labels below the line
      ctx.fillStyle = COLORS.label
      ctx.font = '11px ui-monospace, monospace'
      ctx.textAlign = 'center'
      for (let i = 0; i < pitches.length; i += 1) {
        ctx.fillText(midiToName(pitches[i]), i * laneWidth + laneWidth / 2, judgeY + 24)
      }
    }

    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [notes, transport, speed])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiToName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`
}
