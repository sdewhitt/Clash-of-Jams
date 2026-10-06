import { useState } from "react"

const STAR_COUNT = 5

/** Read-only stars for an average rating; fractional values partially fill a star. */
export function StarDisplay({ value }: { value: number | null }) {
    if (value === null) {
        return <span className="text-xs italic text-muted">Not yet rated</span>
    }

    return (
        <span
            role="img"
            aria-label={`${value.toFixed(1)} out of ${STAR_COUNT} stars`}
            title={value.toFixed(1)}
            className="inline-flex"
        >
            {Array.from({ length: STAR_COUNT }, (_, i) => {
                // How much of star i is covered: 2.5 fills stars 0-1 fully and star 2 halfway.
                const fill = Math.min(Math.max(value - i, 0), 1) * 100
                return (
                    <span key={i} aria-hidden className="relative text-gray-500">
                        ★
                        <span
                            className="absolute left-0 top-0 h-full overflow-hidden text-yellow-400"
                            style={{ width: `${fill}%` }}
                        >
                            ★
                        </span>
                    </span>
                )
            })}
        </span>
    )
}

type StarPickerProps = {
    /** 0 means nothing picked yet. */
    value: number
    onChange: (value: number) => void
}

/** Clickable 1-5 stars; hovering previews a rating without committing it. */
export function StarPicker({ value, onChange }: StarPickerProps) {
    const [hovered, setHovered] = useState<number | null>(null)
    const shown = hovered ?? value

    return (
        <div
            role="radiogroup"
            aria-label="Rating"
            className="flex gap-1"
            onMouseLeave={() => setHovered(null)}
        >
            {Array.from({ length: STAR_COUNT }, (_, i) => {
                const star = i + 1
                return (
                    <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={value === star}
                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                        onMouseEnter={() => setHovered(star)}
                        onClick={() => onChange(star)}
                        className={`
                            cursor-pointer
                            text-5xl
                            transition-transform
                            hover:scale-110
                            ${star <= shown ? "text-yellow-400" : "text-gray-500"}
                        `}
                    >
                        ★
                    </button>
                )
            })}
        </div>
    )
}
