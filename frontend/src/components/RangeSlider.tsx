type RangeSliderProps = {
    label: string
    min: number
    max: number
    step: number
    value: [number, number]
    onChange: (value: [number, number]) => void
    formatValue?: (value: number) => string
    disabled?: boolean
}

// Two native range inputs stacked on top of each other. Each input's own
// track is hidden (pointer-events-none + transparent track) so only its
// thumb is interactive; the visible track/selected-range bars underneath
// are plain divs positioned by percentage.
const thumbInputClass = `
    pointer-events-none absolute inset-0 h-5 w-full cursor-pointer appearance-none bg-transparent
    [&::-webkit-slider-runnable-track]:appearance-none
    [&::-webkit-slider-runnable-track]:bg-transparent
    [&::-webkit-slider-thumb]:pointer-events-auto
    [&::-webkit-slider-thumb]:appearance-none
    [&::-webkit-slider-thumb]:h-5
    [&::-webkit-slider-thumb]:w-5
    [&::-webkit-slider-thumb]:cursor-pointer
    [&::-webkit-slider-thumb]:rounded-full
    [&::-webkit-slider-thumb]:border-2
    [&::-webkit-slider-thumb]:border-accent-start
    [&::-webkit-slider-thumb]:bg-white
    [&::-moz-range-track]:appearance-none
    [&::-moz-range-track]:bg-transparent
    [&::-moz-range-thumb]:pointer-events-auto
    [&::-moz-range-thumb]:h-5
    [&::-moz-range-thumb]:w-5
    [&::-moz-range-thumb]:cursor-pointer
    [&::-moz-range-thumb]:rounded-full
    [&::-moz-range-thumb]:border-2
    [&::-moz-range-thumb]:border-accent-start
    [&::-moz-range-thumb]:bg-white
`

export function RangeSlider({
    label,
    min,
    max,
    step,
    value,
    onChange,
    formatValue = (v) => String(v),
    disabled = false,
}: RangeSliderProps) {
    const [lower, upper] = value
    const span = max - min

    function handleLowerChange(next: number) {
        onChange([Math.min(next, upper), upper])
    }

    function handleUpperChange(next: number) {
        onChange([lower, Math.max(next, lower)])
    }

    const lowerPercent = span === 0 ? 0 : ((lower - min) / span) * 100
    const upperPercent = span === 0 ? 100 : ((upper - min) / span) * 100

    return (
        <div className="rounded-lg border-2 border-accent bg-white/90 px-3 py-2 text-black">
            <div className="text-center text-sm font-semibold">{label}</div>

            {disabled ? (
                <div className="py-3 text-center text-xs text-gray-500">Not available yet</div>
            ) : (
                <>
                    <div className="relative my-3 h-5">
                        <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-gray-400" />
                        <div
                            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent-start"
                            style={{ left: `${lowerPercent}%`, right: `${100 - upperPercent}%` }}
                        />
                        <input
                            type="range"
                            min={min}
                            max={max}
                            step={step}
                            value={lower}
                            onChange={(e) => handleLowerChange(Number(e.target.value))}
                            aria-label={`${label} lower bound`}
                            className={thumbInputClass}
                        />
                        <input
                            type="range"
                            min={min}
                            max={max}
                            step={step}
                            value={upper}
                            onChange={(e) => handleUpperChange(Number(e.target.value))}
                            aria-label={`${label} upper bound`}
                            className={thumbInputClass}
                        />
                    </div>
                    <div className="text-center text-xs">
                        ≥ {formatValue(lower)} · ≤ {formatValue(upper)}
                    </div>
                </>
            )}
        </div>
    )
}
