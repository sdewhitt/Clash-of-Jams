import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { RangeSlider } from "@/components/RangeSlider"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth/useAuth"
import { INSTRUMENTS, type Scenario } from "@/lib/schema/types"

type ScenarioWithAuthor = {
    scenario: Scenario
    authorName: string
}

// Mirrors backend/app/schemas.py's FilterResponse (camelCase on the wire).
type FilterResponse = {
    instruments: string[]
    minPlays: number | null
    maxPlays: number | null
    minRating: number | null
    maxRating: number | null
    minDifficulty: number | null
    maxDifficulty: number | null
}

const SORT_OPTIONS = [
    { value: "title", label: "Name" },
    { value: "author", label: "Author" },
    { value: "difficulty", label: "Difficulty" },
    { value: "rating", label: "Rating" },
    { value: "plays", label: "Plays" },
] as const

type SortKey = (typeof SORT_OPTIONS)[number]["value"]

function ScenarioStat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="w-20">
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold text-ink">{children}</dd>
        </div>
    )
}

const controlClass =
    "w-full rounded-lg border-2 border-accent bg-white px-3 py-2 text-black"

export function ScenarioSearch() {
    const { user, profile } = useAuth()

    const navigate = useNavigate()

    function navPortal(location: string) {
        navigate(location)
    }

    // Filter and sort state is wired to the controls but not applied to the list yet.
    const [search, setSearch] = useState("")
    const [instrument, setInstrument] = useState("")
    const [sortKey, setSortKey] = useState<SortKey>("title")
    const [sortAscending, setSortAscending] = useState(true)

    const [scenarios, setScenarios] = useState<ScenarioWithAuthor[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = scenarios.find(({ scenario }) => scenario.id === selectedId) ?? null

    // Each range is null until we know the real bounds from the API — a
    // slider with a null range renders disabled instead of guessing 0-0.
    const [filterBounds, setFilterBounds] = useState<FilterResponse | null>(null)
    const [ratingRange, setRatingRange] = useState<[number, number] | null>(null)
    const [playsRange, setPlaysRange] = useState<[number, number] | null>(null)
    const [difficultyRange, setDifficultyRange] = useState<[number, number] | null>(null)

    useEffect(() => {
        apiFetch<ScenarioWithAuthor[]>("/scenarios/scenario_with_author")
            .then(setScenarios)
            .catch(console.error)
    }, [])

    useEffect(() => {
        apiFetch<FilterResponse>("/scenarios/filter_items")
            .then(setFilterBounds)
            .catch(console.error)
    }, [])

    // Seed each slider's range from the fetched bounds, once they arrive.
    // Left null (and the slider left disabled) if a bound isn't available yet,
    // e.g. rating, since that feature isn't implemented on the backend.
    useEffect(() => {
        if (!filterBounds) return
        if (filterBounds.minPlays !== null && filterBounds.maxPlays !== null) {
            setPlaysRange([filterBounds.minPlays, filterBounds.maxPlays])
        }
        if (filterBounds.minDifficulty !== null && filterBounds.maxDifficulty !== null) {
            setDifficultyRange([filterBounds.minDifficulty, filterBounds.maxDifficulty])
        }
        if (filterBounds.minRating !== null && filterBounds.maxRating !== null) {
            setRatingRange([filterBounds.minRating, filterBounds.maxRating])
        }
    }, [filterBounds])

    function compareScenarios(a: ScenarioWithAuthor, b: ScenarioWithAuthor): number {
        let result: number
        
        switch(sortKey) {
            case "title":
                result = a.scenario.title.localeCompare(b.scenario.title)
                break
            case "author":
                result = a.authorName.localeCompare(b.authorName)
                break
            case "difficulty":
                result = (a.scenario.authorDifficulty ?? 0) - (b.scenario.authorDifficulty ?? 0) // TODO: switch to crowd_difficulty
                break
            case "rating":
                result = (a.scenario.avgRating ?? 0) - (b.scenario.avgRating ?? 0)
                break
            case "plays":
                result = (a.scenario.playCount ?? 0) - (b.scenario.playCount ?? 0)
                break

        }
        result = sortAscending ? result : -result
        return result
    }

    const visibleScenarios = scenarios
        .filter(({ scenario, authorName }) => {
            const matchesSearch = scenario.title.toLowerCase().includes(search.toLowerCase()) || authorName.toLowerCase().includes(search.toLowerCase())
            const matchesInstrument = instrument === "" || scenario.instrument === instrument
            const matchesPlays =
                playsRange === null ||
                (scenario.playCount >= playsRange[0] && scenario.playCount <= playsRange[1])
            const matchesDifficulty =
                difficultyRange === null ||
                (scenario.authorDifficulty >= difficultyRange[0] &&
                    scenario.authorDifficulty <= difficultyRange[1])
            // TODO: switch to crowd_difficulty once the sort comparator does.
            const matchesRating =
                ratingRange === null ||
                ((scenario.avgRating ?? 0) >= ratingRange[0] && (scenario.avgRating ?? 0) <= ratingRange[1])
            return (
                matchesInstrument && matchesSearch && matchesPlays && matchesDifficulty && matchesRating
            )
        })
        .sort(compareScenarios)

    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className={`
                flex
                items-center
                justify-between
                bg-linear-to-r 
                from-accent-base-start from-10%
                via-accent-base-middle via-70%
                to-accent-base-end to-90%
                border-b-4
                border-accent-start
                pt-6
                pb-6
            `}>
                <div className="flex ml-12">
                    <BackButton onClick={() => navPortal('/home')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Scenario Search</h1>
                </div>
                <div className="mr-6">
                <ProfileButton
                    username={profile?.displayName ?? user?.email ?? "…"}
                    userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                />
                </div>
            </header>

            <div className="px-12 pt-6 flex-1 min-h-0 flex items-stretch">
                <div className="w-full grid grid-cols-[2fr_1fr] gap-12 max-h-full">
                    <section className={`
                        h-full
                        w-full
                        rounded-xl
                        border-4
                        border-accent-start
                        overflow-hidden
                        flex
                        flex-col
                    `}>
                        <header className={`
                            grid
                            grid-cols-8
                            gap-3
                            items-center
                            px-4 py-5
                            bg-linear-to-b
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                            brightness-110
                            border-b-3
                            border-accent-start
                        `}>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search Scenarios"
                                className={`col-span-2 text-lg ${controlClass}`}
                            />

                            <select
                                value={instrument}
                                onChange={(e) => setInstrument(e.target.value)}
                                aria-label="Instrument"
                                className={`capitalize ${controlClass}`}
                            >
                                <option value="">All instruments</option>
                                {INSTRUMENTS.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>

                            <RangeSlider
                                label="Rating"
                                min={filterBounds?.minRating ?? 0}
                                max={filterBounds?.maxRating ?? 0}
                                step={0.5}
                                value={ratingRange ?? [0, 0]}
                                onChange={setRatingRange}
                                disabled={ratingRange === null}
                            />
                            <RangeSlider
                                label="Plays"
                                min={filterBounds?.minPlays ?? 0}
                                max={filterBounds?.maxPlays ?? 0}
                                step={1}
                                value={playsRange ?? [0, 0]}
                                onChange={setPlaysRange}
                                disabled={playsRange === null}
                            />
                            <RangeSlider
                                label="Difficulty"
                                min={filterBounds?.minDifficulty ?? 0}
                                max={filterBounds?.maxDifficulty ?? 0}
                                step={1}
                                value={difficultyRange ?? [0, 0]}
                                onChange={setDifficultyRange}
                                disabled={difficultyRange === null}
                            />

                            <div className="col-span-2 flex gap-2">
                                <select
                                    value={sortKey}
                                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                                    aria-label="Sort by"
                                    className={controlClass}
                                >
                                    {SORT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            Sort: {option.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setSortAscending((asc) => !asc)}
                                    aria-label={sortAscending ? "Sort ascending" : "Sort descending"}
                                    title={sortAscending ? "Ascending" : "Descending"}
                                    className="shrink-0 rounded-lg border-2 border-accent bg-white px-3 py-2 text-black active:scale-95"
                                >
                                    {sortAscending ? "↑" : "↓"}
                                </button>
                            </div>
                        </header>

                        <div className={`
                            flex-1
                            min-h-0
                            overflow-y-auto
                            bg-linear-to-br
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                            brightness-90
                            px-4
                            py-4
                        `}>
                            <ul className="flex flex-col gap-3">
                                {visibleScenarios.map(({ scenario, authorName }) => {
                                    const isSelected = scenario.id === selectedId
                                    return (
                                        <li
                                            key={scenario.id}
                                            className={`
                                                flex
                                                items-center
                                                gap-4
                                                rounded-xl
                                                border-3
                                                px-5
                                                py-3
                                                bg-linear-to-r
                                                from-accent-base-start
                                                via-accent-base-middle
                                                to-accent-base-end
                                                transition-colors
                                                ${isSelected ? "border-white" : "border-accent-start"}
                                            `}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-xl font-bold text-ink">
                                                    {scenario.title}
                                                </div>
                                                <div className="truncate text-sm text-muted">
                                                    by {authorName}
                                                </div>
                                            </div>

                                            <dl className="grid grid-cols-4 gap-4 text-center text-sm">
                                                <ScenarioStat label="Instrument">
                                                    <span className="capitalize">{scenario.instrument}</span>
                                                </ScenarioStat>
                                                <ScenarioStat label="Plays">{scenario.playCount}</ScenarioStat>
                                                <ScenarioStat label="Difficulty">
                                                    {scenario.authorDifficulty}
                                                </ScenarioStat>
                                                <ScenarioStat label="Rating">
                                                    {scenario.avgRating ?? "—"}
                                                </ScenarioStat>
                                            </dl>

                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(scenario.id)}
                                                aria-pressed={isSelected}
                                                className={`
                                                    shrink-0
                                                    rounded-lg
                                                    border-2
                                                    border-accent-start
                                                    px-5
                                                    py-2
                                                    font-semibold
                                                    active:scale-95
                                                    ${isSelected ? "bg-white text-black" : "bg-accent-start text-ink hover:brightness-110"}
                                                `}
                                            >
                                                {isSelected ? "Selected" : "Select"}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                            {visibleScenarios.length === 0 && (
                                <p className="py-8 text-center text-muted">No scenarios match these filters.</p>
                            )}
                        </div>
                    </section>
                    <aside className="flex h-full min-h-0 flex-col gap-4 pb-6">
                        {/* Placeholder until we have recorded sample playthroughs. */}
                        <section className={`
                            aspect-video
                            w-full
                            shrink-0
                            rounded-xl
                            border-3
                            border-accent-start
                            bg-linear-to-br
                            from-accent-base-start from-50
                            via-accent-base-middle
                            to-accent-base-end to-70
                            overflow-hidden
                        `}>
                            <img
                            src="../../favicon.svg"
                            alt="Clash of Jams Preview"
                            className="w-full h-full object-cover"
                            />
                        </section>

                        <section className={`
                            min-h-0
                            flex-1
                            overflow-y-auto
                            rounded-xl
                            border-3
                            border-accent-start
                            bg-linear-to-br
                            from-accent-base-start from-50
                            via-accent-base-middle
                            to-accent-base-end to-70
                            px-5
                            py-4
                        `}>
                            {selected ? (
                                <>
                                    <h2 className="text-2xl font-bold text-ink">{selected.scenario.title}</h2>
                                    <p className="text-sm text-muted">by {selected.authorName}</p>

                                    <p className="mt-3 text-ink">
                                        {selected.scenario.description || (
                                            <span className="italic text-muted">No description.</span>
                                        )}
                                    </p>

                                    <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                                        <ScenarioStat label="Instrument">
                                            <span className="capitalize">{selected.scenario.instrument}</span>
                                        </ScenarioStat>
                                        <ScenarioStat label="Plays">{selected.scenario.playCount}</ScenarioStat>
                                        <ScenarioStat label="Difficulty">
                                            {selected.scenario.authorDifficulty}
                                        </ScenarioStat>
                                        <ScenarioStat label="Rating">
                                            {selected.scenario.avgRating ?? "—"}
                                        </ScenarioStat>
                                    </dl>

                                    {selected.scenario.tags.length > 0 && (
                                        <ul className="mt-4 flex flex-wrap gap-2">
                                            {selected.scenario.tags.map((tag) => (
                                                <li
                                                    key={tag}
                                                    className="rounded-full border-2 border-accent-start px-3 py-0.5 text-xs text-ink"
                                                >
                                                    {tag}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            ) : (
                                <p className="flex h-full items-center justify-center text-center text-muted">
                                    Select a scenario to see its details.
                                </p>
                            )}
                        </section>

                        {/* No play route exists yet, so this only enables once something is selected. */}
                        <button
                            type="button"
                            disabled={!selected}
                            className={`
                                shrink-0
                                rounded-xl
                                border-3
                                border-accent-start
                                bg-accent-start
                                py-4
                                text-2xl
                                font-bold
                                text-ink
                                hover:brightness-110
                                active:scale-[0.98]
                                disabled:cursor-not-allowed
                                disabled:opacity-50
                                disabled:hover:brightness-100
                                disabled:active:scale-100
                            `}
                        >
                            Play!
                        </button>
                    </aside>
                </div>
            </div>
        </main>
    )
}
