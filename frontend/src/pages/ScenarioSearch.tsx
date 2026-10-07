import { useEffect, useState } from "react"
import { useNavigate } from "react-router"

import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { RangeSlider } from "@/components/RangeSlider"
import { ScenarioLeaderboard } from "@/components/ScenarioLeaderboard"
import { StarDisplay } from "@/components/StarRating"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth/useAuth"
import { INSTRUMENTS, type Scenario, type ScenarioReview } from "@/lib/schema/types"

type ScenarioWithAuthor = {
    scenario: Scenario
    authorName: string
}

// Mirrors backend/app/schemas.py's PublicReview; timestamps arrive as ISO strings.
type ApiReview = Omit<ScenarioReview, "createdAt" | "updatedAt"> & {
    createdAt: string
    updatedAt: string
    /** The reviewer's display name, or "Anonymous" for private profiles. */
    displayName: string
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

const DETAILS_TABS = [
    { value: "leaderboard", label: "Leaderboard" },
    { value: "reviews", label: "Reviews" },
] as const

type DetailsTab = (typeof DETAILS_TABS)[number]["value"]

function ScenarioStat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="w-20">
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold text-ink">{children}</dd>
        </div>
    )
}

const controlClass =
    "w-full rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black"

export function ScenarioSearch() {
    const { user, profile } = useAuth()
    const navigate = useNavigate()

    // Filter and sort state is wired to the controls but not applied to the list yet.
    const [search, setSearch] = useState("")
    const [instrument, setInstrument] = useState("")
    const [sortKey, setSortKey] = useState<SortKey>("title")
    const [sortAscending, setSortAscending] = useState(true)

    const [scenarios, setScenarios] = useState<ScenarioWithAuthor[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    // Kept across selections, so someone reading reviews can flip between scenarios without re-picking the tab.
    const [detailsTab, setDetailsTab] = useState<DetailsTab>("leaderboard")
    const selected = scenarios.find(({ scenario }) => scenario.id === selectedId) ?? null

    // Tagged with the scenario they belong to, so switching selection never shows
    // the previous scenario's reviews. reviews is null if the fetch failed.
    const [loadedReviews, setLoadedReviews] = useState<{
        scenarioId: string
        reviews: ApiReview[] | null
    } | null>(null)
    const selectedReviews = loadedReviews?.scenarioId === selectedId ? loadedReviews : null

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

    useEffect(() => {
        if (!selectedId) return
        let cancelled = false
        apiFetch<ApiReview[]>(`/ratings/${selectedId}`)
            .then((reviews) => {
                if (!cancelled) setLoadedReviews({ scenarioId: selectedId, reviews })
            })
            .catch((err) => {
                console.error(err)
                if (!cancelled) setLoadedReviews({ scenarioId: selectedId, reviews: null })
            })
        return () => {
            cancelled = true
        }
    }, [selectedId])

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
                from-accent-base-start from-10
                via-accent-base-middle via-80
                to-accent-base-end to-90
                border-b-4
                border-accent-start
                pt-6
                pb-6
            `}>
                <div className="flex ml-12">
                    <BackButton></BackButton>
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
                            from-accent-start from-50
                            via-accent-middle
                            to-accent-end to-70
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
                                    className="shrink-0 rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black active:scale-95"
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
                            from-accent-start from-50
                            via-accent-middle
                            to-accent-end to-70
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
                                                    {/* Only the author is sent their non-public scenarios. */}
                                                    {scenario.visibility !== "public" &&
                                                        ` · ${scenario.visibility}, only you can see this`}
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
                                                    <StarDisplay value={scenario.avgRating} />
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
                                        {/* playCount is incremented by run submission (not built yet); until then the seed script recounts it. */}
                                        <ScenarioStat label="Plays">{selected.scenario.playCount}</ScenarioStat>
                                        <ScenarioStat label="Difficulty">
                                            {selected.scenario.authorDifficulty}
                                        </ScenarioStat>
                                        <ScenarioStat label="Rating">
                                            <StarDisplay value={selected.scenario.avgRating} />
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

                                    <div role="tablist" aria-label="Scenario details" className="mt-6 flex gap-2 border-b-2 border-accent-start">
                                        {DETAILS_TABS.map((tab) => {
                                            const isActive = tab.value === detailsTab
                                            return (
                                                <button
                                                    key={tab.value}
                                                    type="button"
                                                    role="tab"
                                                    id={`details-tab-${tab.value}`}
                                                    aria-selected={isActive}
                                                    aria-controls="details-tabpanel"
                                                    onClick={() => setDetailsTab(tab.value)}
                                                    className={`
                                                        -mb-0.5
                                                        rounded-t-lg
                                                        border-2
                                                        border-b-0
                                                        px-4
                                                        py-1.5
                                                        text-lg
                                                        font-bold
                                                        ${isActive
                                                            ? "border-accent-start bg-accent-start text-ink"
                                                            : "border-transparent text-muted hover:text-ink"}
                                                    `}
                                                >
                                                    {tab.label}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    <div
                                        role="tabpanel"
                                        id="details-tabpanel"
                                        aria-labelledby={`details-tab-${detailsTab}`}
                                        className="pt-3"
                                    >
                                    {detailsTab === "leaderboard" ? (
                                        <ScenarioLeaderboard
                                            key={selected.scenario.id}
                                            scenarioId={selected.scenario.id}
                                            versionId={selected.scenario.currentVersionId}
                                        />
                                    ) : selectedReviews === null ? (
                                        <p className="text-sm text-muted">Loading reviews…</p>
                                    ) : selectedReviews.reviews === null ? (
                                        <p className="text-sm text-muted">Couldn't load reviews.</p>
                                    ) : selectedReviews.reviews.length === 0 ? (
                                        <p className="text-sm italic text-muted">No reviews yet.</p>
                                    ) : (
                                        <ul className="flex flex-col gap-3">
                                            {selectedReviews.reviews.map((review) => (
                                                <li
                                                    key={review.id}
                                                    className="rounded-lg border-2 border-accent-start px-3 py-2"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="truncate font-semibold text-ink">
                                                            {review.displayName}
                                                        </span>
                                                        <span className="shrink-0 text-xs text-muted">
                                                            {new Date(review.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <StarDisplay value={review.rating} />
                                                    {review.comment && (
                                                        <p className="mt-1 wrap-break-word text-sm text-ink">
                                                            {review.comment}
                                                        </p>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    </div>
                                </>
                            ) : (
                                <p className="flex h-full items-center justify-center text-center text-muted">
                                    Select a scenario to see its details.
                                </p>
                            )}
                        </section>

                        {/* Goes to a placeholder page until gameplay exists; it only offers rating. */}
                        <button
                            type="button"
                            disabled={!selected}
                            onClick={() => {
                                if (!selected) return
                                // Gameplay always plays the current version; scenarios without one still open for now.
                                const version = selected.scenario.currentVersionId
                                navigate(`/play/${selected.scenario.id}${version ? `?version=${version}` : ""}`)
                            }}
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
