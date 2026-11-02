/**
 * The scenario editor's sheet music view: the chart engraved on a staff, and editable
 * there the way notation programs work.
 *
 * Mouse: pick a length from the toolbar, click a line or space to write a note there,
 * drag a notehead up or down to change its pitch, right-click to delete. Keyboard follows
 * MuseScore's note input: A to G write the next note at the input cursor (nearest octave
 * to the note before it), Shift adds the letter to the selected chord, 1 to 7 pick
 * 64th through whole, period toggles the dot, 0 steps over a rest, arrows change pitch
 * (Ctrl for an octave) or move the selection. A length or accidental chosen while a note
 * is selected changes that note.
 *
 * Like the piano roll it owns no chart state -- edits go out through onChange -- and the
 * engraving itself (lib/notation) is display only, so switching views never alters notes.
 */
import '@fontsource/noto-music/400.css'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import {
  MAX_VELOCITY,
  MIN_VELOCITY,
  addNote,
  findPart,
  moveNote,
  noteIndexAt,
  removeNote,
  resizeNote,
  setVelocity,
} from '@/lib/chart/edits'
import { chartEndBeat } from '@/lib/chart/notes'
import {
  CLEFS,
  FLAT_POSITIONS,
  MIDDLE_LINE,
  SHARP_POSITIONS,
  SPACE,
  STAFF_HEIGHT,
  autoClef,
  layoutScore,
  positionAt,
  staffPosition,
  staffY,
  systemAt,
  systemForTick,
  tickToX,
  xToTick,
} from '@/lib/notation/engrave'
import type { ClefKind, PlacedEvent, ScoreLayout, SystemLayout } from '@/lib/notation/engrave'
import {
  TICKS_PER_BEAT,
  TYPE_TICKS,
  buildScore,
  durationTicks,
  flagCount,
  toTicks,
} from '@/lib/notation/score'
import type { NoteType, ScoreEvent } from '@/lib/notation/score'
import {
  STEP_NAMES,
  clampFifths,
  keyAlters,
  pitchOf,
  spellPitch,
  spelledName,
} from '@/lib/notation/spelling'
import type { Accidental } from '@/lib/notation/spelling'
import type { Instrument, NoteChart } from '@/lib/schema/types'

const MUSIC_FONT = "'Noto Music', serif"
const DEFAULT_WIDTH = 960
const MIN_WIDTH = 480

const HEAD_RX = 6.2
const HEAD_RY = 4.4
const STEM = SPACE * 3.5
const BEAM_THICKNESS = 5
const BEAM_GAP = 8
/** A flat's glyph centres below its bulb, which is what sits on the line. */
const FLAT_LIFT = -SPACE * 0.7

/** Lowest and highest staff positions a click can write to. */
const MIN_POSITION = -16
const MAX_POSITION = 24

const DURATIONS: { type: NoteType; key: string; glyph: string; label: string }[] = [
  { type: 'whole', key: '7', glyph: '\u{1D15D}', label: 'Whole note' },
  { type: 'half', key: '6', glyph: '\u{1D15E}', label: 'Half note' },
  { type: 'quarter', key: '5', glyph: '\u{1D15F}', label: 'Quarter note' },
  { type: 'eighth', key: '4', glyph: '\u{1D160}', label: 'Eighth note' },
  { type: '16th', key: '3', glyph: '\u{1D161}', label: '16th note' },
  { type: '32nd', key: '2', glyph: '\u{1D162}', label: '32nd note' },
  { type: '64th', key: '1', glyph: '\u{1D163}', label: '64th note' },
]

const ACCIDENTALS: { alter: number; glyph: string; label: string }[] = [
  { alter: 1, glyph: '♯', label: 'Sharp' },
  { alter: -1, glyph: '♭', label: 'Flat' },
  { alter: 0, glyph: '♮', label: 'Natural' },
]

const ACCIDENTAL_GLYPHS: Record<Accidental, string> = {
  'double-flat': '\u{1D12B}',
  flat: '♭',
  natural: '♮',
  sharp: '♯',
  'double-sharp': '\u{1D12A}',
}

const REST_GLYPHS: Partial<Record<NoteType, string>> = {
  quarter: '\u{1D13D}',
  eighth: '\u{1D13E}',
  '16th': '\u{1D13F}',
  '32nd': '\u{1D140}',
  '64th': '\u{1D141}',
}

const CLEF_GLYPHS = { treble: '\u{1D11E}', bass: '\u{1D122}' }

/** Where step input starts when there is no earlier note to stay near. */
const CLEF_HOME: Record<ClefKind, number> = { treble: 71, bass: 50, 'treble-8vb': 59 }

const CLEF_CHOICES: { value: 'auto' | ClefKind; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  ...(Object.keys(CLEFS) as ClefKind[]).map((kind) => ({ value: kind, label: CLEFS[kind].label })),
]

const BUTTON_CLASS =
  'rounded-lg border-2 border-base-middle px-3 py-1 text-sm font-bold text-ink ' +
  'transition-colors hover:border-accent-start hover:bg-accent-base-middle ' +
  'disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-base-middle ' +
  'disabled:hover:bg-transparent'

const PRESSED_CLASS = 'border-accent-start bg-accent-base-middle'

interface Stem {
  up: boolean
  x: number
  /** The notehead end of the stem. */
  fromY: number
  tipY: number
}

interface SheetMusicProps {
  chart: NoteChart
  partId: string
  /** Picks the automatic clef: guitar reads treble 8vb. */
  instrument: Instrument
  onChange: (chart: NoteChart) => void
  /** Draws the chart without accepting edits, e.g. while a MIDI take is coming in. */
  readOnly?: boolean
}

export function SheetMusic({
  chart,
  partId,
  instrument,
  onChange: commit,
  readOnly = false,
}: SheetMusicProps) {
  const onChange = (next: NoteChart) => {
    if (!readOnly) commit(next)
  }
  const [inputType, setInputType] = useState<NoteType>('quarter')
  const [dotted, setDotted] = useState(false)
  /** An accidental armed for the next note written, as an alteration. */
  const [armed, setArmed] = useState<number | null>(null)
  const [clefChoice, setClefChoice] = useState<'auto' | ClefKind>('auto')
  const [selected, setSelected] = useState<number | null>(null)
  /** The input cursor in ticks; null follows the end of the chart. */
  const [cursor, setCursor] = useState<number | null>(null)
  const [hover, setHover] = useState<{ tick: number; position: number } | null>(null)
  const [drag, setDrag] = useState<{ index: number; startY: number; steps: number } | null>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const element = wrapRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(MIN_WIDTH, Math.floor(entry.contentRect.width))),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const notes = findPart(chart, partId)?.notes ?? []
  const selectedNote = selected !== null ? notes[selected] : undefined
  const clef =
    clefChoice === 'auto'
      ? autoClef(
          instrument,
          notes.map((note) => note.midiPitch),
        )
      : clefChoice
  const fifths = clampFifths(chart.keySignature)
  const alters = keyAlters(fifths)

  // Mid-drag, the score shows the note where it would land without committing it.
  const dragged = drag && drag.steps !== 0 ? notes[drag.index] : undefined
  const shown =
    drag && dragged
      ? moveNote(chart, partId, drag.index, {
          midiPitch: shiftedPitch(dragged.midiPitch, drag.steps, fifths),
          startBeat: dragged.startBeat,
        })
      : chart

  const score = buildScore(shown, partId)
  const layout = layoutScore(score, clef, width)
  const stems = layoutStems(layout)

  const inputTicks = durationTicks(inputType, dotted)
  const cursorTick = cursor ?? toTicks(chartEndBeat(chart))

  function pitchAtPosition(position: number, alter: number | null) {
    const diatonic = position + CLEFS[clef].bottomLine
    return pitchOf(diatonic, alter ?? alters[mod(diatonic, 7)])
  }

  function select(index: number | null, chartForIndex: NoteChart = chart) {
    setSelected(index)
    const note = index !== null ? findPart(chartForIndex, partId)?.notes[index] : undefined
    if (note) setCursor(toTicks(note.startBeat + note.durationBeats))
  }

  /** Writes a note, or selects the one already there with that pitch and onset. */
  function write(midiPitch: number, startTick: number, ticks: number) {
    const startBeat = startTick / TICKS_PER_BEAT
    const existing = noteIndexAt(chart, partId, midiPitch, startBeat)
    if (existing >= 0) {
      select(existing)
      return
    }
    const next = addNote(chart, partId, {
      midiPitch,
      startBeat,
      durationBeats: ticks / TICKS_PER_BEAT,
    })
    if (next === chart) return
    onChange(next)
    select(noteIndexAt(next, partId, midiPitch, startBeat), next)
    setArmed(null)
  }

  function repitch(index: number, midiPitch: number) {
    const note = notes[index]
    if (!note || note.midiPitch === midiPitch) return
    const next = moveNote(chart, partId, index, { midiPitch, startBeat: note.startBeat })
    if (next === chart) return
    onChange(next)
    setSelected(noteIndexAt(next, partId, midiPitch, note.startBeat))
  }

  function deleteNote(index: number) {
    const note = notes[index]
    if (!note) return
    onChange(removeNote(chart, partId, index))
    setSelected(null)
    setCursor(toTicks(note.startBeat))
  }

  function chooseDuration(type: NoteType, dot: boolean) {
    setInputType(type)
    setDotted(dot)
    if (selected === null || !selectedNote) return
    const ticks = durationTicks(type, dot)
    // The whole chord takes the new length, as one stem can only carry one. Resizing never
    // reorders notes (they sort by onset and pitch), so the indices stay valid throughout.
    let next = chart
    notes.forEach((note, index) => {
      if (note.startBeat === selectedNote.startBeat) {
        next = resizeNote(next, partId, index, ticks / TICKS_PER_BEAT)
      }
    })
    if (next === chart) return
    onChange(next)
    setCursor(toTicks(selectedNote.startBeat) + ticks)
  }

  function chooseAccidental(alter: number) {
    if (selected !== null && selectedNote) {
      repitch(selected, pitchOf(spellPitch(selectedNote.midiPitch, fifths).diatonic, alter))
      return
    }
    setArmed(armed === alter ? null : alter)
  }

  function stepInput(letter: string, addToChord: boolean) {
    const step = STEP_NAMES.indexOf(letter as (typeof STEP_NAMES)[number])
    const alter = armed ?? alters[step]

    if (addToChord) {
      if (!selectedNote) return
      write(
        pitchNear(step, alter, selectedNote.midiPitch, 'above'),
        toTicks(selectedNote.startBeat),
        toTicks(selectedNote.durationBeats),
      )
      return
    }

    const before = notes.filter((note) => toTicks(note.startBeat) < cursorTick).at(-1)
    const reference = selectedNote?.midiPitch ?? before?.midiPitch ?? CLEF_HOME[clef]
    write(pitchNear(step, alter, reference, 'nearest'), cursorTick, inputTicks)
  }

  function moveSelection(direction: 1 | -1) {
    if (notes.length === 0) return
    if (selected === null) {
      const after = notes.findIndex((note) => toTicks(note.startBeat) >= cursorTick)
      const index = direction === 1 ? after : (after === -1 ? notes.length : after) - 1
      if (index >= 0) select(index)
      return
    }
    const index = selected + direction
    if (index >= 0 && index < notes.length) select(index)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (readOnly || event.altKey) return
    const { key } = event
    const command = event.ctrlKey || event.metaKey

    if (!command && /^[a-g]$/i.test(key)) {
      event.preventDefault()
      stepInput(key.toUpperCase(), event.shiftKey)
      return
    }
    const duration = DURATIONS.find((choice) => choice.key === key)
    if (!command && duration) {
      event.preventDefault()
      chooseDuration(duration.type, dotted)
      return
    }

    switch (key) {
      case '.':
        chooseDuration(inputType, !dotted)
        break
      case '0':
        setCursor(cursorTick + inputTicks)
        setSelected(null)
        break
      case 'ArrowUp':
      case 'ArrowDown':
        if (selected === null || !selectedNote) return
        repitch(
          selected,
          selectedNote.midiPitch + (key === 'ArrowUp' ? 1 : -1) * (command ? 12 : 1),
        )
        break
      case 'ArrowLeft':
      case 'ArrowRight':
        moveSelection(key === 'ArrowRight' ? 1 : -1)
        break
      case 'Delete':
      case 'Backspace':
        if (selected === null) return
        deleteNote(selected)
        break
      case 'Escape':
        setSelected(null)
        setArmed(null)
        break
      default:
        return
    }
    event.preventDefault()
  }

  function pointIn(event: ReactPointerEvent) {
    const rect = svgRef.current?.getBoundingClientRect()
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null
  }

  /** The staff position and (snapped) tick under the pointer. */
  function slotAt(event: ReactPointerEvent) {
    const point = pointIn(event)
    const system = point && systemAt(layout, point.y)
    if (!point || !system) return null
    const snap = Math.min(TYPE_TICKS[inputType], TICKS_PER_BEAT)
    const tick = Math.max(0, Math.floor(xToTick(system, point.x) / snap + 0.25) * snap)
    const position = Math.max(MIN_POSITION, Math.min(MAX_POSITION, positionAt(system, point.y)))
    return { tick, position }
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || readOnly) return
    const slot = slotAt(event)
    if (!slot) return
    write(pitchAtPosition(slot.position, armed), slot.tick, inputTicks)
  }

  function handleNotePointerDown(event: ReactPointerEvent<SVGGElement>, index: number) {
    if (event.button !== 0 || readOnly) return
    event.stopPropagation()
    const point = pointIn(event)
    select(index)
    if (point) setDrag({ index, startY: point.y, steps: 0 })
    svgRef.current?.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag) {
      const point = pointIn(event)
      if (point) setDrag({ ...drag, steps: Math.round((drag.startY - point.y) / (SPACE / 2)) })
      return
    }
    if (!readOnly) setHover(slotAt(event))
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    svgRef.current?.releasePointerCapture?.(event.pointerId)
    if (!drag) return
    const note = notes[drag.index]
    if (note && drag.steps !== 0)
      repitch(drag.index, shiftedPitch(note.midiPitch, drag.steps, fifths))
    setDrag(null)
  }

  const cursorSystem = readOnly ? null : systemForTick(layout, cursorTick)
  const hoverSystem = hover && !drag ? systemForTick(layout, hover.tick) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Note length" className="flex gap-1">
          {DURATIONS.map((choice) => (
            <button
              key={choice.type}
              type="button"
              aria-label={choice.label}
              aria-pressed={inputType === choice.type}
              title={`${choice.label} (${choice.key})`}
              disabled={readOnly}
              onClick={() => chooseDuration(choice.type, dotted)}
              className={`${BUTTON_CLASS} w-10 text-xl leading-7 ${inputType === choice.type ? PRESSED_CLASS : ''}`}
              style={{ fontFamily: MUSIC_FONT }}
            >
              {choice.glyph}
            </button>
          ))}
          <button
            type="button"
            aria-label="Dotted"
            aria-pressed={dotted}
            title="Dotted (.)"
            disabled={readOnly}
            onClick={() => chooseDuration(inputType, !dotted)}
            className={`${BUTTON_CLASS} w-10 text-xl leading-7 ${dotted ? PRESSED_CLASS : ''}`}
          >
            .
          </button>
        </div>

        <div role="group" aria-label="Accidental" className="flex gap-1">
          {ACCIDENTALS.map((choice) => (
            <button
              key={choice.label}
              type="button"
              aria-label={choice.label}
              aria-pressed={armed === choice.alter}
              title={
                selectedNote
                  ? `Make the selected note ${choice.label.toLowerCase()}`
                  : `${choice.label} on the next note`
              }
              disabled={readOnly}
              onClick={() => chooseAccidental(choice.alter)}
              className={`${BUTTON_CLASS} w-10 text-xl leading-7 ${armed === choice.alter ? PRESSED_CLASS : ''}`}
              style={{ fontFamily: MUSIC_FONT }}
            >
              {choice.glyph}
            </button>
          ))}
        </div>

        <label
          className="flex items-center gap-2 text-sm font-bold text-muted"
          htmlFor="sheet-clef"
        >
          Clef
          <select
            id="sheet-clef"
            value={clefChoice}
            onChange={(event) => setClefChoice(event.target.value as 'auto' | ClefKind)}
            className="rounded-lg border-2 border-base-middle bg-base-end px-2 py-1 text-ink
              focus:border-accent-start focus:outline-none"
          >
            {CLEF_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.value === 'auto' ? `Auto (${CLEFS[clef].label})` : choice.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={selected === null || readOnly}
          onClick={() => selected !== null && deleteNote(selected)}
          className={`${BUTTON_CLASS} py-2`}
        >
          Delete note
        </button>

        <label
          className="flex items-center gap-2 text-sm font-bold text-muted"
          htmlFor="sheet-velocity"
        >
          Velocity
          <input
            id="sheet-velocity"
            aria-label="Velocity"
            type="range"
            min={MIN_VELOCITY}
            max={MAX_VELOCITY}
            disabled={!selectedNote || readOnly}
            value={selectedNote?.velocity ?? MIN_VELOCITY}
            onChange={(event) =>
              selected !== null &&
              onChange(setVelocity(chart, partId, selected, Number(event.target.value)))
            }
            className="w-28 accent-accent-start disabled:opacity-40"
          />
          <span className="w-8 text-ink">{selectedNote?.velocity ?? '--'}</span>
        </label>
      </div>

      <p className="text-sm text-faint">
        Click the staff to write a note, drag a note to change its pitch, right-click to delete.
        Keys: A to G write at the cursor (Shift adds to the chord), 1 to 7 pick a length, period
        dots it, 0 skips a rest, arrows change pitch (Ctrl for octaves) or the selection.
      </p>

      <div
        ref={wrapRef}
        role="application"
        aria-label={`Sheet music, ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} placed`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="overflow-x-auto rounded-xl border-2 border-base-middle bg-base-end
          focus:outline-none focus-visible:border-accent-start"
      >
        <svg
          ref={svgRef}
          width={layout.width}
          height={layout.height}
          className={`block touch-none select-none text-ink ${readOnly ? '' : 'cursor-crosshair'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setHover(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          {layout.systems.map((system) => (
            <SystemStaff
              key={system.index}
              system={system}
              layout={layout}
              fifths={score.fifths}
              score={score}
            />
          ))}

          {layout.systems.map((system) =>
            system.measures.map((measure) =>
              measure.events.map((placed) =>
                placed.event.kind === 'rest' ? (
                  <Rest key={placed.event.startTick} system={system} placed={placed} />
                ) : (
                  <Chord
                    key={placed.event.startTick}
                    system={system}
                    placed={placed}
                    clef={layout.clef}
                    stem={stems.get(placed.event)!}
                    selected={selected}
                    onNotePointerDown={handleNotePointerDown}
                    onNoteDelete={(index) => !readOnly && deleteNote(index)}
                  />
                ),
              ),
            ),
          )}

          {layout.systems.map((system) => (
            <Beams key={system.index} system={system} stems={stems} />
          ))}
          <Ties layout={layout} stems={stems} />

          {cursorSystem && (
            <line
              aria-hidden
              x1={tickToX(cursorSystem, cursorTick) - 4}
              x2={tickToX(cursorSystem, cursorTick) - 4}
              y1={cursorSystem.staffTop - 8}
              y2={cursorSystem.staffTop + STAFF_HEIGHT + 8}
              stroke="var(--color-accent-start)"
              strokeWidth={2}
              pointerEvents="none"
            />
          )}

          {hover && hoverSystem && (
            <Ghost
              system={hoverSystem}
              x={tickToX(hoverSystem, hover.tick) + 8}
              position={hover.position}
            />
          )}
        </svg>
      </div>
    </div>
  )
}

function SystemStaff({
  system,
  layout,
  score,
  fifths,
}: {
  system: SystemLayout
  layout: ScoreLayout
  score: ReturnType<typeof buildScore>
  fifths: number
}) {
  const clef = CLEFS[layout.clef]
  const y = (position: number) => staffY(system, position)
  const keyX = system.x0 + 40
  const keyCount = Math.abs(fifths)
  const timeX = keyX + keyCount * 9 + (keyCount > 0 ? 6 : 0) + 12
  const lastMeasure = system.measures.at(-1)!
  const isFinal = lastMeasure.measure.index === score.measures.length - 1

  return (
    <g aria-hidden pointerEvents="none">
      {[0, 2, 4, 6, 8].map((position) => (
        <line
          key={position}
          x1={system.x0}
          x2={system.x1}
          y1={y(position)}
          y2={y(position)}
          stroke="var(--color-muted)"
          strokeWidth={1}
        />
      ))}
      <line x1={system.x0} x2={system.x0} y1={y(8)} y2={y(0)} stroke="currentColor" />

      <text
        x={system.x0 + 6}
        y={clef.glyph === 'treble' ? y(2) : y(1)}
        fontSize={SPACE * 4}
        fontFamily={MUSIC_FONT}
        fill="currentColor"
      >
        {CLEF_GLYPHS[clef.glyph]}
      </text>
      {layout.clef === 'treble-8vb' && (
        <text
          x={system.x0 + 17}
          y={y(-4)}
          fontSize={10}
          fontWeight="bold"
          textAnchor="middle"
          fill="currentColor"
        >
          8
        </text>
      )}

      {Array.from({ length: keyCount }, (_, i) => {
        const position =
          (fifths > 0 ? SHARP_POSITIONS : FLAT_POSITIONS)[i] - (clef.glyph === 'bass' ? 2 : 0)
        return (
          <text
            key={i}
            x={keyX + i * 9}
            y={y(position) + (fifths > 0 ? 0 : FLAT_LIFT)}
            fontSize={SPACE * 2.6}
            fontFamily={MUSIC_FONT}
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
          >
            {fifths > 0 ? ACCIDENTAL_GLYPHS.sharp : ACCIDENTAL_GLYPHS.flat}
          </text>
        )
      })}

      {system.showTimeSignature &&
        [
          [score.timeSigNum, 6],
          [score.timeSigDen, 2],
        ].map(([value, position]) => (
          <text
            key={position}
            x={timeX}
            y={y(position)}
            fontSize={SPACE * 2.2}
            fontWeight="bold"
            fontFamily="Georgia, serif"
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
          >
            {value}
          </text>
        ))}

      {system.index > 0 && (
        <text x={system.contentX} y={y(8) - 10} fontSize={11} fill="var(--color-muted)">
          {system.measures[0].measure.index + 1}
        </text>
      )}

      {system.measures.map((measure) => {
        const x = measure.x + measure.width
        const final = isFinal && measure === lastMeasure
        return final ? (
          <g key={measure.measure.index}>
            <line x1={x - 6} x2={x - 6} y1={y(8)} y2={y(0)} stroke="currentColor" />
            <rect x={x - 3} y={y(8)} width={3} height={STAFF_HEIGHT} fill="currentColor" />
          </g>
        ) : (
          <line
            key={measure.measure.index}
            x1={x}
            x2={x}
            y1={y(8)}
            y2={y(0)}
            stroke="currentColor"
          />
        )
      })}
    </g>
  )
}

function Chord({
  system,
  placed,
  clef,
  stem,
  selected,
  onNotePointerDown,
  onNoteDelete,
}: {
  system: SystemLayout
  placed: PlacedEvent
  clef: ClefKind
  stem: Stem
  selected: number | null
  onNotePointerDown: (event: ReactPointerEvent<SVGGElement>, index: number) => void
  onNoteDelete: (index: number) => void
}) {
  const { event, x } = placed
  const y = (position: number) => staffY(system, position)
  const positions = event.notes.map((note) => staffPosition(note.spelled.diatonic, clef))
  const offsets = headOffsets(positions, stem.up)
  const low = Math.min(...positions)
  const high = Math.max(...positions)
  const leftmost = x + Math.min(0, ...offsets) - HEAD_RX - 4
  const rightmost = x + Math.max(0, ...offsets) + HEAD_RX + 4
  const flags = event.beam === null ? flagCount(event.type) : 0

  const ledgers: number[] = []
  for (let position = -2; position >= low; position -= 2) ledgers.push(position)
  for (let position = 10; position <= high; position += 2) ledgers.push(position)

  // Accidentals stack leftward when they would collide, top note nearest the head.
  const accidentalX = new Map<number, number>()
  let column = 0
  let previous = Infinity
  ;[...event.notes.keys()]
    .sort((a, b) => positions[b] - positions[a])
    .forEach((i) => {
      if (!event.notes[i].accidental) return
      column = previous - positions[i] < 6 ? column + 1 : 0
      previous = positions[i]
      accidentalX.set(i, leftmost - 5 - column * 9)
    })

  return (
    <g>
      {ledgers.map((position) => (
        <line
          key={position}
          x1={leftmost}
          x2={rightmost}
          y1={y(position)}
          y2={y(position)}
          stroke="currentColor"
          pointerEvents="none"
        />
      ))}

      {event.type !== 'whole' && (
        <line
          x1={stem.x}
          x2={stem.x}
          y1={stem.fromY}
          y2={stem.tipY}
          stroke="currentColor"
          strokeWidth={1.3}
          pointerEvents="none"
        />
      )}
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={flagPath(stem, i)} fill="currentColor" pointerEvents="none" />
      ))}

      {event.notes.map((note, i) => {
        const headX = x + offsets[i]
        const headY = y(positions[i])
        const isSelected = note.noteIndex === selected
        const color = isSelected ? 'var(--color-accent-start)' : 'currentColor'
        const label = `${spelledName(note.spelled)} at beat ${round(event.startTick / TICKS_PER_BEAT)}`
        const continuation = note.tieEnd
        return (
          <g
            key={note.noteIndex}
            role={continuation ? undefined : 'button'}
            aria-label={continuation ? undefined : label}
            aria-pressed={continuation ? undefined : isSelected}
            aria-hidden={continuation || undefined}
            className="cursor-pointer"
            onPointerDown={(pointer) => onNotePointerDown(pointer, note.noteIndex)}
            onContextMenu={(menu) => {
              menu.preventDefault()
              menu.stopPropagation()
              onNoteDelete(note.noteIndex)
            }}
          >
            <title>{label}</title>
            <rect
              x={headX - HEAD_RX - 2}
              y={headY - HEAD_RY - 2}
              width={HEAD_RX * 2 + 4}
              height={HEAD_RY * 2 + 4}
              fill="transparent"
            />
            <Notehead type={event.type} x={headX} y={headY} color={color} />
            {note.accidental && (
              <text
                x={accidentalX.get(i)}
                y={headY + (note.accidental.includes('flat') ? FLAT_LIFT : 0)}
                fontSize={SPACE * 2.6}
                fontFamily={MUSIC_FONT}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
              >
                {ACCIDENTAL_GLYPHS[note.accidental]}
              </text>
            )}
            {event.dotted && (
              <circle
                cx={x + Math.max(0, ...offsets) + HEAD_RX + 5}
                cy={y(positions[i] % 2 === 0 ? positions[i] + 1 : positions[i])}
                r={1.8}
                fill={color}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

function Notehead({ type, x, y, color }: { type: NoteType; x: number; y: number; color: string }) {
  if (type === 'whole') {
    return (
      <ellipse
        cx={x}
        cy={y}
        rx={HEAD_RX + 1.2}
        ry={HEAD_RY}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
      />
    )
  }
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={HEAD_RX}
      ry={HEAD_RY}
      transform={`rotate(-20 ${x} ${y})`}
      fill={type === 'half' ? 'none' : color}
      stroke={color}
      strokeWidth={type === 'half' ? 1.7 : 1}
    />
  )
}

function Rest({ system, placed }: { system: SystemLayout; placed: PlacedEvent }) {
  const { event, x } = placed
  const y = (position: number) => staffY(system, position)
  const glyph = REST_GLYPHS[event.type]
  return (
    <g aria-hidden pointerEvents="none" fill="currentColor">
      {event.type === 'whole' && <rect x={x - 6} y={y(6)} width={12} height={5} />}
      {event.type === 'half' && <rect x={x - 6} y={y(4) - 5} width={12} height={5} />}
      {glyph && (
        <text
          x={x}
          y={y(4)}
          fontSize={SPACE * 4}
          fontFamily={MUSIC_FONT}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {glyph}
        </text>
      )}
      {event.dotted && <circle cx={x + 10} cy={y(5)} r={1.8} />}
    </g>
  )
}

function Beams({ system, stems }: { system: SystemLayout; stems: Map<ScoreEvent, Stem> }) {
  return (
    <g aria-hidden pointerEvents="none" fill="currentColor">
      {beamGroups(system).map((group) => {
        const levels = group.map((placed) => flagCount(placed.event.type))
        const tips = group.map((placed) => stems.get(placed.event)!)
        const up = tips[0].up
        const first = tips[0]
        const last = tips.at(-1)!
        const slope = (last.tipY - first.tipY) / (last.x - first.x || 1)
        const at = (x: number, level: number) =>
          first.tipY + slope * (x - first.x) + (up ? 1 : -1) * level * BEAM_GAP

        const bars: [number, number, number][] = [[first.x, last.x, 0]]
        for (let level = 1; level < Math.max(...levels); level++) {
          tips.forEach((tip, i) => {
            if (levels[i] <= level) return
            const next = tips[i + 1]
            if (next && levels[i + 1] > level) bars.push([tip.x, next.x, level])
            else if (!(i > 0 && levels[i - 1] > level)) {
              // A lone 16th points at the longer note it belongs to (dotted eighth, 16th).
              const left = !next || (i > 0 && group[i - 1].event.ticks > group[i].event.ticks)
              bars.push(left ? [tip.x - 9, tip.x, level] : [tip.x, tip.x + 9, level])
            }
          })
        }

        return bars.map(([x1, x2, level]) => {
          const edge = up ? BEAM_THICKNESS : -BEAM_THICKNESS
          const y1 = at(x1, level)
          const y2 = at(x2, level)
          return (
            <polygon
              key={`${group[0].event.startTick}-${x1}-${level}`}
              points={`${x1},${y1} ${x2},${y2} ${x2},${y2 + edge} ${x1},${y1 + edge}`}
            />
          )
        })
      })}
    </g>
  )
}

function Ties({ layout, stems }: { layout: ScoreLayout; stems: Map<ScoreEvent, Stem> }) {
  const flat = layout.systems.flatMap((system) =>
    system.measures.flatMap((measure) => measure.events.map((placed) => ({ system, placed }))),
  )
  const curves: { key: string; d: string }[] = []

  flat.forEach(({ system, placed }, at) => {
    const next = flat[at + 1]
    if (placed.event.kind !== 'chord' || !next) return
    const below = stems.get(placed.event)?.up ?? true
    for (const note of placed.event.notes) {
      if (!note.tieStart) continue
      const position = staffPosition(note.spelled.diatonic, layout.clef)
      const from = staffY(system, position)
      const sign = below ? 1 : -1
      const x1 = placed.x + HEAD_RX + 1
      const key = `${placed.event.startTick}-${note.noteIndex}`
      if (next.system === system) {
        curves.push({ key, d: tiePath(x1, next.placed.x - HEAD_RX - 1, from + sign * 5, sign) })
      } else {
        // Broken across a line: a half tie off the end, and another into the next system.
        curves.push({ key, d: tiePath(x1, system.x1 - 2, from + sign * 5, sign) })
        const to = staffY(next.system, position)
        curves.push({
          key: `${key}-in`,
          d: tiePath(next.system.contentX - 6, next.placed.x - HEAD_RX - 1, to + sign * 5, sign),
        })
      }
    }
  })

  return (
    <g aria-hidden pointerEvents="none" fill="currentColor">
      {curves.map((curve) => (
        <path key={curve.key} d={curve.d} />
      ))}
    </g>
  )
}

function Ghost({ system, x, position }: { system: SystemLayout; x: number; position: number }) {
  const y = (at: number) => staffY(system, at)
  const ledgers: number[] = []
  for (let at = -2; at >= position; at -= 2) ledgers.push(at)
  for (let at = 10; at <= position; at += 2) ledgers.push(at)
  return (
    <g aria-hidden pointerEvents="none" opacity={0.45}>
      {ledgers.map((at) => (
        <line key={at} x1={x - 10} x2={x + 10} y1={y(at)} y2={y(at)} stroke="currentColor" />
      ))}
      <ellipse
        cx={x}
        cy={y(position)}
        rx={HEAD_RX}
        ry={HEAD_RY}
        transform={`rotate(-20 ${x} ${y(position)})`}
        fill="var(--color-accent-start)"
      />
    </g>
  )
}

/** Stem direction and length for every chord, beamed groups sharing one beam line. */
function layoutStems(layout: ScoreLayout) {
  const stems = new Map<ScoreEvent, Stem>()
  const positionsOf = (placed: PlacedEvent) =>
    placed.event.notes.map((note) => staffPosition(note.spelled.diatonic, layout.clef))

  for (const system of layout.systems) {
    const y = (position: number) => staffY(system, position)

    for (const measure of system.measures) {
      for (const placed of measure.events) {
        if (placed.event.kind !== 'chord' || placed.event.beam !== null) continue
        const positions = positionsOf(placed)
        const low = Math.min(...positions)
        const high = Math.max(...positions)
        const up = (low + high) / 2 < MIDDLE_LINE
        const length = STEM + Math.max(0, flagCount(placed.event.type) - 2) * BEAM_GAP
        stems.set(
          placed.event,
          up
            ? {
                up,
                x: placed.x + HEAD_RX - 0.6,
                fromY: y(low),
                tipY: Math.min(y(high) - length, y(MIDDLE_LINE)),
              }
            : {
                up,
                x: placed.x - HEAD_RX + 0.6,
                fromY: y(high),
                tipY: Math.max(y(low) + length, y(MIDDLE_LINE)),
              },
        )
      }
    }

    for (const group of beamGroups(system)) {
      const ranges = group.map((placed) => {
        const positions = positionsOf(placed)
        return { low: Math.min(...positions), high: Math.max(...positions) }
      })
      const low = Math.min(...ranges.map((range) => range.low))
      const high = Math.max(...ranges.map((range) => range.high))
      const up = (low + high) / 2 < MIDDLE_LINE
      const levels = Math.max(...group.map((placed) => flagCount(placed.event.type)))
      const shortest = STEM - 8 + (levels - 1) * BEAM_GAP

      const xs = group.map((placed) => (up ? placed.x + HEAD_RX - 0.6 : placed.x - HEAD_RX + 0.6))
      const natural = ranges.map((range) => (up ? y(range.high) - STEM : y(range.low) + STEM))
      const span = xs.at(-1)! - xs[0] || 1
      const slope = Math.max(-0.12, Math.min(0.12, (natural.at(-1)! - natural[0]) / span))
      let line = (x: number) => natural[0] + slope * (x - xs[0])

      // Pull the beam away from the notes until every stem is long enough.
      let shift = 0
      ranges.forEach((range, i) => {
        const needed = up
          ? y(range.high) - shortest - line(xs[i])
          : line(xs[i]) - (y(range.low) + shortest)
        shift = Math.max(shift, -needed)
      })
      const base = line
      line = (x: number) => base(x) + (up ? -shift : shift)

      group.forEach((placed, i) =>
        stems.set(placed.event, {
          up,
          x: xs[i],
          fromY: up ? y(ranges[i].low) : y(ranges[i].high),
          tipY: line(xs[i]),
        }),
      )
    }
  }
  return stems
}

function beamGroups(system: SystemLayout) {
  const groups = new Map<number, PlacedEvent[]>()
  for (const measure of system.measures) {
    for (const placed of measure.events) {
      if (placed.event.beam === null) continue
      const group = groups.get(placed.event.beam) ?? []
      group.push(placed)
      groups.set(placed.event.beam, group)
    }
  }
  return [...groups.values()]
}

/**
 * Horizontal offsets for a chord's noteheads: a second (two adjacent positions) can't
 * share a column, so the second note of the pair flips to the other side of the stem.
 */
function headOffsets(positions: number[], up: boolean) {
  const order = [...positions.keys()].sort((a, b) =>
    up ? positions[a] - positions[b] : positions[b] - positions[a],
  )
  const offsets = positions.map(() => 0)
  order.forEach((i, at) => {
    if (at === 0) return
    const previous = order[at - 1]
    if (Math.abs(positions[i] - positions[previous]) === 1 && offsets[previous] === 0) {
      offsets[i] = (up ? 1 : -1) * (HEAD_RX * 2 - 1)
    }
  })
  return offsets
}

function flagPath(stem: Stem, level: number) {
  const { x } = stem
  if (stem.up) {
    const y = stem.tipY + level * BEAM_GAP
    return `M${x},${y} c1,6 10,9 8,20 c3,-8 -2,-12 -8,-15 Z`
  }
  const y = stem.tipY - level * BEAM_GAP
  return `M${x},${y} c1,-6 10,-9 8,-20 c3,8 -2,12 -8,15 Z`
}

/** A tie as a filled crescent, thickest in the middle like an engraved one. */
function tiePath(x1: number, x2: number, y: number, sign: number) {
  const width = x2 - x1
  const height = Math.min(9, 4 + width / 12) * sign
  const inner = height - 1.8 * sign
  return (
    `M${x1},${y} C${x1 + width / 4},${y + height} ${x2 - width / 4},${y + height} ${x2},${y} ` +
    `C${x2 - width / 4},${y + inner} ${x1 + width / 4},${y + inner} ${x1},${y} Z`
  )
}

/** A pitch moved by diatonic steps, taking the key signature's spelling at its new place. */
function shiftedPitch(midiPitch: number, steps: number, fifths: number) {
  const diatonic = spellPitch(midiPitch, fifths).diatonic + steps
  return pitchOf(diatonic, keyAlters(fifths)[mod(diatonic, 7)])
}

/** The written step and alteration in the octave nearest to (or just above) a pitch. */
function pitchNear(step: number, alter: number, reference: number, mode: 'nearest' | 'above') {
  let best: number | null = null
  for (let octave = 0; octave <= 8; octave++) {
    const pitch = pitchOf(octave * 7 + step, alter)
    if (mode === 'above') {
      if (pitch > reference && (best === null || pitch < best)) best = pitch
    } else if (best === null || Math.abs(pitch - reference) < Math.abs(best - reference)) {
      best = pitch
    }
  }
  return best ?? reference
}

function mod(value: number, by: number) {
  return ((value % by) + by) % by
}

function round(beats: number) {
  return Math.round(beats * 1000) / 1000
}
