/**
 * A piano-roll note editor: pitch runs up the vertical axis, time runs along
 * the horizontal one, so the shape of the chart reads at a glance.
 *
 * Mouse behaviour follows the FL Studio convention the story asks for --
 * press on empty grid to drop a note and drag right to set its length, drag a
 * note to move it, drag its right edge to resize, right-click to delete.
 * Arrow keys nudge the selection so the editor is usable without a mouse too.
 *
 * The component owns no chart state: every committed edit goes back out
 * through onChange, and in-flight drags live in local state as a preview so a
 * half-finished gesture never reaches the draft.
 */
import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import {
  EDITOR_LIMITS,
  addNote,
  findPart,
  moveNote,
  noteIndexAt,
  removeNote,
  resizeNote,
} from '@/lib/chart/edits'
import { beatsPerBar, chartEndBeat, isBlackKey, pitchName, tempoAt } from '@/lib/chart/notes'
import type { ExpectedNote, NoteChart } from '@/lib/schema/types'

const ROW_HEIGHT = 18
const BEAT_WIDTH = 64
const KEY_WIDTH = 64
const RULER_HEIGHT = 24
const MIN_BARS = 8

const SNAP_CHOICES = [
  { value: 1, label: '1 beat' },
  { value: 0.5, label: '1/2 beat' },
  { value: 0.25, label: '1/4 beat' },
  { value: 0.125, label: '1/8 beat' },
]

const LENGTH_CHOICES = [
  { value: 4, label: '4 beats' },
  { value: 2, label: '2 beats' },
  { value: 1, label: '1 beat' },
  { value: 0.5, label: '1/2 beat' },
  { value: 0.25, label: '1/4 beat' },
]

type Drag =
  | { kind: 'move'; index: number; grabOffsetBeats: number; midiPitch: number; startBeat: number }
  | { kind: 'resize'; index: number; durationBeats: number }

interface PianoRollProps {
  chart: NoteChart
  partId: string
  onChange: (chart: NoteChart) => void
}

export function PianoRoll({ chart, partId, onChange }: PianoRollProps) {
  const [snapBeats, setSnapBeats] = useState(0.25)
  const [lengthBeats, setLengthBeats] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const notes = findPart(chart, partId)?.notes ?? []
  const barBeats = beatsPerBar(tempoAt(chart, 0))
  const bars = Math.max(MIN_BARS, Math.ceil((chartEndBeat(chart) + barBeats) / barBeats))
  const totalBeats = bars * barBeats
  const pitches = descendingPitches()
  const selectedNote = selected !== null ? notes[selected] : undefined

  function snapTo(beat: number, round: 'down' | 'near') {
    const steps = round === 'down' ? Math.floor(beat / snapBeats) : Math.round(beat / snapBeats)
    return Math.max(0, steps * snapBeats)
  }

  function pointAt(event: ReactPointerEvent) {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return null
    const row = Math.floor((event.clientY - rect.top) / ROW_HEIGHT)
    return {
      beat: (event.clientX - rect.left) / BEAT_WIDTH,
      midiPitch: clamp(
        EDITOR_LIMITS.maxPitch - row,
        EDITOR_LIMITS.minPitch,
        EDITOR_LIMITS.maxPitch,
      ),
    }
  }

  /** Move commits can reorder the part, so the selection is looked up again. */
  function commitMove(index: number, midiPitch: number, startBeat: number) {
    const next = moveNote(chart, partId, index, { midiPitch, startBeat })
    if (next === chart) return
    onChange(next)
    setSelected(noteIndexAt(next, partId, midiPitch, startBeat))
  }

  function deleteNote(index: number) {
    onChange(removeNote(chart, partId, index))
    setSelected(null)
  }

  function handleGridPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const point = pointAt(event)
    if (!point) return

    const startBeat = snapTo(point.beat, 'down')
    const next = addNote(chart, partId, {
      midiPitch: point.midiPitch,
      startBeat,
      durationBeats: lengthBeats,
    })
    if (next === chart) return

    const index = noteIndexAt(next, partId, point.midiPitch, startBeat)
    onChange(next)
    setSelected(index)
    // Drag straight on from the new note, so press-and-pull sets its length.
    setDrag({ kind: 'resize', index, durationBeats: lengthBeats })
    gridRef.current?.setPointerCapture?.(event.pointerId)
  }

  function handleNotePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    index: number,
    note: ExpectedNote,
    mode: 'move' | 'resize',
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    const point = pointAt(event)
    if (!point) return

    setSelected(index)
    setDrag(
      mode === 'move'
        ? {
            kind: 'move',
            index,
            grabOffsetBeats: point.beat - note.startBeat,
            midiPitch: note.midiPitch,
            startBeat: note.startBeat,
          }
        : { kind: 'resize', index, durationBeats: note.durationBeats },
    )
    gridRef.current?.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return
    const point = pointAt(event)
    if (!point) return

    if (drag.kind === 'move') {
      setDrag({
        ...drag,
        midiPitch: point.midiPitch,
        startBeat: snapTo(point.beat - drag.grabOffsetBeats, 'near'),
      })
      return
    }

    const note = notes[drag.index]
    if (!note) return
    setDrag({
      ...drag,
      durationBeats: Math.max(snapBeats, snapTo(point.beat - note.startBeat, 'near')),
    })
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    gridRef.current?.releasePointerCapture?.(event.pointerId)
    if (!drag) return

    if (drag.kind === 'move') {
      commitMove(drag.index, drag.midiPitch, drag.startBeat)
    } else {
      onChange(resizeNote(chart, partId, drag.index, drag.durationBeats))
    }
    setDrag(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (selected === null || !selectedNote) return

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      deleteNote(selected)
      return
    }

    const pitchStep = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
    const beatStep =
      event.key === 'ArrowRight' ? snapBeats : event.key === 'ArrowLeft' ? -snapBeats : 0
    if (pitchStep === 0 && beatStep === 0) return

    event.preventDefault()
    commitMove(
      selected,
      selectedNote.midiPitch + pitchStep,
      Math.max(0, selectedNote.startBeat + beatStep),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <ToolbarSelect
          id="piano-roll-snap"
          label="Snap"
          value={snapBeats}
          choices={SNAP_CHOICES}
          onChange={setSnapBeats}
        />
        <ToolbarSelect
          id="piano-roll-length"
          label="New note"
          value={lengthBeats}
          choices={LENGTH_CHOICES}
          onChange={setLengthBeats}
        />
        <button
          type="button"
          disabled={selected === null}
          onClick={() => selected !== null && deleteNote(selected)}
          className="rounded-lg border-2 border-base-middle px-4 py-2 text-sm font-bold text-ink
            transition-colors hover:border-accent-start hover:bg-accent-base-middle
            disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
        >
          Delete note
        </button>
        <p className="text-sm text-faint">
          Click to place, drag to move, drag the right edge to resize, right-click to delete.
        </p>
      </div>

      <div
        className="overflow-auto rounded-xl border-2 border-base-middle bg-base-end"
        style={{ maxHeight: 440 }}
      >
        <div className="relative" style={{ width: KEY_WIDTH + totalBeats * BEAT_WIDTH }}>
          <div className="sticky top-0 z-20 flex" style={{ height: RULER_HEIGHT }}>
            <div
              className="sticky left-0 z-30 shrink-0 bg-base-start"
              style={{ width: KEY_WIDTH }}
            />
            <div
              className="relative shrink-0 border-b-2 border-base-middle bg-base-start"
              style={{ width: totalBeats * BEAT_WIDTH }}
            >
              {Array.from({ length: bars }, (_, bar) => (
                <span
                  key={bar}
                  className="absolute top-0 pl-1 text-xs font-bold text-muted"
                  style={{ left: bar * barBeats * BEAT_WIDTH }}
                >
                  {bar + 1}
                </span>
              ))}
            </div>
          </div>

          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-base-start" style={{ width: KEY_WIDTH }}>
              {pitches.map((pitch) => (
                <div
                  key={pitch}
                  className={`flex items-center justify-end pr-2 text-xs ${
                    isBlackKey(pitch) ? 'bg-base-start text-faint' : 'bg-base-end text-muted'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  {pitch % 12 === 0 ? pitchName(pitch) : ''}
                </div>
              ))}
            </div>

            <div
              ref={gridRef}
              role="application"
              aria-label={`Note grid, ${notes.length} notes placed`}
              tabIndex={0}
              className="relative shrink-0 touch-none select-none"
              style={{ width: totalBeats * BEAT_WIDTH, height: pitches.length * ROW_HEIGHT }}
              onPointerDown={handleGridPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown}
              onContextMenu={(event) => event.preventDefault()}
            >
              {pitches.map((pitch, row) => (
                <div
                  key={pitch}
                  className={`absolute w-full ${isBlackKey(pitch) ? 'bg-base-start' : 'bg-base-end'}`}
                  style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
                />
              ))}

              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: gridLines(barBeats) }}
              />

              {notes.map((note, index) => {
                const view = previewOf(note, drag, index)
                const isSelected = index === selected
                return (
                  <div
                    key={note.index}
                    onPointerDown={(event) => handleNotePointerDown(event, index, note, 'move')}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      deleteNote(index)
                    }}
                    title={`${pitchName(view.midiPitch)} at beat ${round(view.startBeat)}`}
                    className={`absolute cursor-grab rounded border-2 ${
                      isSelected
                        ? 'border-ink bg-accent-start'
                        : 'border-accent-end bg-accent-base-middle'
                    }`}
                    style={{
                      top: (EDITOR_LIMITS.maxPitch - view.midiPitch) * ROW_HEIGHT + 1,
                      left: view.startBeat * BEAT_WIDTH,
                      width: Math.max(view.durationBeats * BEAT_WIDTH, 8),
                      height: ROW_HEIGHT - 2,
                    }}
                  >
                    <div
                      onPointerDown={(event) => handleNotePointerDown(event, index, note, 'resize')}
                      className="absolute top-0 right-0 h-full w-2 cursor-ew-resize"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolbarSelect({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  id: string
  label: string
  value: number
  choices: { value: number; label: string }[]
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold text-muted" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-lg border-2 border-base-middle bg-base-end px-2 py-1 text-ink
          focus:border-accent-start focus:outline-none"
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Bar lines, beat lines and an octave rule, drawn as one layered background. */
function gridLines(barBeats: number) {
  return [
    `repeating-linear-gradient(to right, var(--color-faint) 0 1px, transparent 1px ${barBeats * BEAT_WIDTH}px)`,
    `repeating-linear-gradient(to right, var(--color-base-middle) 0 1px, transparent 1px ${BEAT_WIDTH}px)`,
    `repeating-linear-gradient(to bottom, var(--color-base-middle) 0 1px, transparent 1px ${12 * ROW_HEIGHT}px)`,
  ].join(',')
}

/** The note as it should be drawn, standing in the drag's values mid-gesture. */
function previewOf(note: ExpectedNote, drag: Drag | null, index: number): ExpectedNote {
  if (!drag || drag.index !== index) return note
  return drag.kind === 'move'
    ? { ...note, midiPitch: drag.midiPitch, startBeat: drag.startBeat }
    : { ...note, durationBeats: drag.durationBeats }
}

function descendingPitches() {
  const pitches: number[] = []
  for (let pitch = EDITOR_LIMITS.maxPitch; pitch >= EDITOR_LIMITS.minPitch; pitch--) {
    pitches.push(pitch)
  }
  return pitches
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(beats: number) {
  return Math.round(beats * 1000) / 1000
}
