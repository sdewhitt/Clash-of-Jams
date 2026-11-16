import { formatPlayedAt, type PlayHistoryEntry } from "@/lib/runs/history"
import { MAX_SCORE } from "@/scoring/score"

const buttonClass = 'cursor-pointer rounded-lg border-2 border-accent-start px-4 py-2 font-bold hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'

export function HistoryRow({ entry, onOpen, onPlay, }: { entry: PlayHistoryEntry, onOpen: () => void, onPlay: () => void }) {
    const title = entry.scenarioTitle ?? 'Unavailable scenario'
    const notes = [
        entry.matchId && 'Multiplayer match',
        entry.validation === 'rejected' && 'Not accepted for the leaderboard',
        entry.scenarioAvailable && !entry.isCurrentVersion && 'Scenario updated since this run',
        !entry.scenarioAvailable && 'This scenario was deleted or made private',
    ].filter(Boolean)
  
    return (
        <li 
            className={`
                flex flex-wrap 
                items-center justify-between
                gap-4 
                rounded-xl 
                border-3 border-contrast-start 
                bg-linear-to-r 
                from-contrast-start 
                via-contrast-middle 
                to-contrast-end 
                px-5 py-3
            `}
        >
            <div className="min-w-0 flex-1">
                {entry.scenarioAvailable ? (
                    <button
                    type="button"
                    onClick={onOpen}
                    className="cursor-pointer truncate text-left text-2xl font-bold hover:underline"
                    >
                    {title}
                    </button>
                ) : (
                    <p className="truncate text-xl font-bold text-muted">{title}</p>
                )}
                <p className="text-sm text-inverse-ink">
                    <span className="capitalize">{entry.instrument}</span> · {formatPlayedAt(entry.playedAt)}
                </p>
                {notes.map((note) => (
                    <p key={String(note)} className="text-xs text-muted">
                    {note}
                    </p>
                ))}
            </div>
    
            <div className="flex flex-row gap-8">
                <div>
                    <div className="text-2xl font-bold tabular-nums">{entry.finalScore.toLocaleString()}</div>
                    <div className="text-xs text-inverse-ink text-right">/ {MAX_SCORE.toLocaleString()}</div>
                </div>
        
                {/* Always the scenario's current version: an older one is never offered for play. */}
                {entry.scenarioAvailable && (
                    <button 
                        type="button" 
                        onClick={onPlay} 
                        className={`
                            ${buttonClass} 
                            bg-linear-to-r 
                            from-accent-start 
                            via-accent-middle 
                            to-accent-end
                        `}
                    >
                        {entry.isCurrentVersion ? 'Play again' : 'Play latest'}
                    </button>
                )}
            </div>
        </li>
    )
  }
  