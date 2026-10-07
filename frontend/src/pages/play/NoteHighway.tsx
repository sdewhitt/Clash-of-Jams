/**
 * The scrolling note display for a run: pitch runs up the vertical axis and time runs left to
 * right, with notes sliding toward a fixed playhead.
 *
 * Notes are laid out once, by time rather than by beat, so a tempo change needs no special
 * handling. Scrolling moves one strip with a transform from an animation frame, outside React,
 * which keeps a long chart from re-rendering sixty times a second.
 *
 * With `verdicts` the same display becomes the review of a finished run: it stops following a
 * clock, scrolls by hand, and colours each note by how it was scored.
 */
import { useEffect, useRef } from 'react'

import { pitchName } from '@/lib/chart/notes'
import type { Timeline } from '@/lib/play/timeline'
import { VERDICT_LABEL } from '@/lib/play/verdicts'
import type { HitVerdict } from '@/lib/schema/types'

const PX_PER_MS = 0.12
const PLAYHEAD_PX = 160
/** Empty rows above and below the part's range. */
const PITCH_MARGIN = 2
/** Room after the last note, so it can scroll all the way to the playhead. */
const TAIL_PX = 480

const VERDICT_CLASS: Record<HitVerdict, string> = {
  hit: 'border-contrast-middle bg-contrast-middle text-inverse-ink',
  early: 'border-contrast-middle bg-contrast-start text-ink',
  late: 'border-contrast-middle bg-contrast-start text-ink',
  wrong_pitch: 'border-accent-middle bg-accent-base-start text-ink',
  missed: 'border-dashed border-faint text-faint',
  extra: 'border-faint text-faint',
}

interface NoteHighwayProps {
  timeline: Timeline
  /** Scenario time now, in ms, or null when nothing is playing. Ignored in review. */
  getPositionMs?: () => number | null
  /** The pitch being played now, as fractional MIDI, or null. */
  getLivePitch?: () => number | null
  /** Verdicts by expected-note index; passing them switches to review. */
  verdicts?: Map<number, HitVerdict>
}

export function NoteHighway({ timeline, getPositionMs, getLivePitch, verdicts }: NoteHighwayProps) {
  const strip = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const review = verdicts !== undefined

  const pitches = timeline.notes.map(({ note }) => note.midiPitch)
  const top = Math.max(...pitches) + PITCH_MARGIN
  const rows = top - Math.min(...pitches) + PITCH_MARGIN + 1
  const rowPercent = 100 / rows

  useEffect(() => {
    if (review) return
    let frame = 0
    const draw = () => {
      const ms = getPositionMs?.() ?? null
      if (strip.current) {
        strip.current.style.transform = `translateX(${-(ms ?? 0) * PX_PER_MS}px)`
      }
      if (marker.current) {
        const pitch = ms === null ? null : (getLivePitch?.() ?? null)
        marker.current.hidden = pitch === null
        // A row's centre is its pitch, so in-tune playing sits mid-note.
        if (pitch !== null) marker.current.style.top = `${(top + 0.5 - pitch) * rowPercent}%`
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [review, getPositionMs, getLivePitch, top, rowPercent])

  return (
    <div
      data-testid="note-highway"
      className={`relative h-64 w-full rounded-xl border-3 border-accent-start bg-base-middle ${
        review ? 'overflow-x-auto' : 'overflow-hidden'
      }`}
    >
      <div
        ref={strip}
        className="absolute inset-y-0 left-0 will-change-transform"
        style={{ width: PLAYHEAD_PX + timeline.endMs * PX_PER_MS + TAIL_PX }}
      >
        {timeline.clicks
          .filter((click) => click.accent && click.ms >= 0)
          .map((click) => (
            <div
              key={click.ms}
              className="absolute inset-y-0 border-l border-faint opacity-40"
              style={{ left: PLAYHEAD_PX + click.ms * PX_PER_MS }}
            />
          ))}
        {timeline.notes.map(({ note, startMs, endMs }) => {
          const verdict = verdicts?.get(note.index)
          const tone = verdict
            ? VERDICT_CLASS[verdict]
            : 'border-accent-middle bg-accent-start text-inverse-ink'
          return (
            <div
              key={note.index}
              title={
                verdict ? `${pitchName(note.midiPitch)}: ${VERDICT_LABEL[verdict]}` : undefined
              }
              className={`absolute flex items-center overflow-hidden rounded border pl-1 text-[10px] font-semibold leading-none ${tone}`}
              style={{
                left: PLAYHEAD_PX + startMs * PX_PER_MS,
                width: Math.max(4, (endMs - startMs) * PX_PER_MS - 1),
                top: `${(top - note.midiPitch) * rowPercent}%`,
                height: `${rowPercent}%`,
              }}
            >
              {pitchName(note.midiPitch)}
            </div>
          )
        })}
      </div>

      {!review && (
        <>
          <div
            className="absolute inset-y-0 border-l-2 border-contrast-middle"
            style={{ left: PLAYHEAD_PX }}
          />
          <div
            ref={marker}
            hidden
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-contrast-middle outline-2 outline-ink"
            style={{ left: PLAYHEAD_PX }}
          />
        </>
      )}
    </div>
  )
}
