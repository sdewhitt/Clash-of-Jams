"""
Request and response models.

These mirror the Firestore shapes in frontend/src/lib/schema/types.ts. Only the
handful of types the stub routes need are defined so far; add the rest as the
routes that need them land.

Field names are snake_case in Python and camelCase on the wire. Every model
below inherits ApiModel, which generates the camelCase aliases, so a payload
moves between the TypeScript side and this one without either side renaming
anything.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    StringConstraints,
    field_validator,
)
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Base class for anything that crosses the wire.

    The alias generator maps author_difficulty <-> authorDifficulty, matching
    the interfaces in frontend/src/lib/schema/types.ts and the field names in
    the Firestore documents themselves. FastAPI serializes responses by alias,
    so clients only ever see camelCase; validation accepts either spelling, so
    Python callers can keep using snake_case keyword arguments.

    One consequence worth knowing: `model_dump()` returns snake_case. Code that
    writes a model straight to Firestore or another camelCase sink has to ask
    for `model_dump(by_alias=True)`.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
    )


class Instrument(StrEnum):
    PIANO = "piano"
    GUITAR = "guitar"
    WOODWIND = "woodwind"
    VOCALS = "vocals"
    MIDI = "midi"

class Genre(StrEnum):
    BLUES = 'blues'
    JAZZ = 'jazz'
    ELECTRONIC = 'electronic'
    HIPHOP = 'hip-hop'
    POP = 'pop'
    RANDB = 'r&b'
    ROCK = 'rock'
    INDIE = 'indie'
    ALTERNATIVE = 'alternative'
    FOLK = 'folk'
    METAL = 'metal'


class Visibility(StrEnum):
    PRIVATE = "private"
    UNLISTED = "unlisted"
    PUBLIC = "public"


class RankTier(StrEnum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    PLATINUM = "platinum"
    DIAMOND = "diamond"


class ScenarioCreate(ApiModel):
    """What a client sends to create a scenario. Server fills in the rest."""

    title: str = Field(min_length=1, max_length=120)
    description: str = ""
    instrument: Instrument
    genres: list[Genre] = []
    visibility: Visibility = Visibility.PRIVATE
    tags: list[str] = []
    author_difficulty: int = Field(default=1, ge=1, le=10)



class Scenario(ApiModel):
    """A scenario as returned by the API — scenarios/{scenarioId}."""

    id: str
    author_uid: str
    title: str
    description: str
    instrument: Instrument
    genres: list[Genre] = []  # documents written before the field existed have none
    visibility: Visibility
    tags: list[str]
    author_difficulty: int
    play_count: int = 0
    created_at: datetime
    avg_rating: float | None
    crowd_difficulty: float | None
    rating_count: int
    current_version_id: str | None
    current_version_number: int
    updated_at: datetime

    @field_validator("genres", mode="before")
    @classmethod
    def _drop_unknown_genres(cls, value: object) -> object:
        """Ignore genres this service doesn't know, rather than rejecting the document.

        Stored documents aren't guaranteed to match the enum (the rules only check
        that genres is a list), and one stray value shouldn't fail a whole listing.
        ScenarioCreate stays strict, so the API itself never writes one.
        """
        if isinstance(value, list):
            return [g for g in value if g in Genre]
        return value


class ScenarioWithAuthor(ApiModel):
    scenario: Scenario
    author_name: str


class ReviewUpsert(ApiModel):
    comment: str = Field(default="", max_length=200)
    rating: int = Field(ge=1, le=5)


class ScenarioReview(ApiModel):
    id: str
    scenario_id: str
    reviewer_uid: str
    rating: int # 1-5 stars
    comment: str
    created_at: datetime
    updated_at: datetime


class PublicReview(ScenarioReview):
    display_name: str


class SkillRating(ApiModel):
    """users/{uid}/skillRatings/{instrument}: one rating per user per instrument."""

    uid: str
    instrument: Instrument
    elo: FiniteFloat = 400  # matches STARTING_ELO in collections.ts and algs/elo.py
    tier: RankTier = RankTier.BRONZE
    games_played: int = Field(default=0, ge=0)
    is_provisional: bool = True  # until PROVISIONAL_MATCHES (10) games are played
    updated_at: datetime


class RunSummary(ApiModel):
    """The slice of a run a scenario leaderboard shows — not the full breakdown."""

    run_id: str
    played_at: datetime


class LeaderboardEntry(ApiModel):
    uid: str
    display_name: str # TODO: will also want to bring in pfp at some point
    ranking: int
    key: float # this will be ELO or score so we can use this for both
    skill_rating: SkillRating | None = None # will be used only in ELO leaderboard
    run: RunSummary | None = None # will be used only in scenario leaderboards

class RunValidation(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class RunValidationResult(ApiModel):
    """What POST /runs/{runId}/validate decided, and why if the run was rejected."""

    run_id: str
    validation: RunValidation
    reason: str | None = None


class PlayHistoryEntry(ApiModel):
    """One of the caller's runs, with what the history page needs to know about its scenario."""

    run_id: str
    scenario_id: str
    scenario_version_id: str
    scenario_title: str | None  # None once the scenario is deleted or made private
    instrument: Instrument
    final_score: float
    played_at: datetime
    validation: RunValidation
    match_id: str | None = None
    scenario_available: bool  # False when the scenario can no longer be opened or played
    is_current_version: bool  # False when the scenario has been updated since this run


class PlayHistoryResponse(ApiModel):
    entries: list[PlayHistoryEntry]
    # Pass back as ?before= to get the next page; None on the last page.
    next_before: datetime | None = None


class LeaderboardResponse(ApiModel):
    entries: list[LeaderboardEntry]
    my_entry: LeaderboardEntry | None = None
    total_players: int
    percentile: float | None # caller's rank / total_players, i.e. "top X%" (0.05 = top 5%)
    # Range of played_at across all runs, for the scenario board's date slider. None on the ELO board.
    earliest_played_at: datetime | None = None
    latest_played_at: datetime | None = None


class ScoreSummary(ApiModel):
    """subscores from the scoring engine"""

    pitch_accuracy: float
    rhythm_accuracy: float
    completeness: float
    notes_hit: int
    notes_missed: int
    extra_notes: int


class ScenarioAttempt(ApiModel):
    """one run on a single scenario"""
    run_id: str
    scenario_version_id: str
    instrument: Instrument
    final_score: float
    played_at: datetime
    validation: RunValidation
    match_id: str | None = None
    breakdown: ScoreSummary


class ScenarioScoreStats(ApiModel):
    """summary of non-rejected runs"""
    attempt_count: int
    best_score: float
    average_score: float
    most_recent_score: float
    first_score: float
    improvement: float | None # difference btwn most recent and first, none if no attempts


class ScenarioScoreHistory(ApiModel):
    scenario_id: str
    stats: ScenarioScoreStats | None # none until we have a non-rejected run
    attempts: list[ScenarioAttempt]


class ScoreTrendPoint(ApiModel):
    """scenario scores on one day == one point on chart"""
    scenario_id: str
    day: date # callers local day
    best_score: float
    average_score: float
    attempts: int


class PlayedScenario(ApiModel):
    """a scenario the caller has played"""

    scenario_id: str
    title: str | None # none if scenario deleted or made private
    last_played_at: datetime


class ScoreTrends(ApiModel):
    scenarios: list[PlayedScenario] # list of scenarios caller has played
    points: list[ScoreTrendPoint] # list of scores per day, oldest day first



class Role(StrEnum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


# Mirrors isAdmin() in firebase/firestore.rules.
ADMIN_ROLES = frozenset({Role.ADMIN, Role.MODERATOR})


class CurrentUser(BaseModel):
    """The caller, as resolved from their Firebase ID token.

    Internal to the service — it is never serialized into a response, so it
    needs no aliases.
    """

    uid: str
    email: str | None = None
    role: Role = Role.USER

    @property
    def is_admin(self) -> bool:
        return self.role in ADMIN_ROLES


class HealthResponse(ApiModel):
    status: str
    app: str
    version: str


PlaylistName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class PlaylistCreate(ApiModel):
    name: PlaylistName
    description: str = Field(default = "", max_length=200)
    is_public: bool = False


class PlaylistUpdate(ApiModel):
    """only provided fields are changed"""
    name: PlaylistName | None = None
    description: str | None = Field(default=None, max_length=200)
    is_public: bool | None = None


class Playlist(ApiModel):
    """playlists/{playlistId}"""
    id: str
    owner_uid: str
    name: str
    description: str
    is_public: bool
    scenario_ids: list[str]
    created_at: datetime
    updated_at: datetime


class PlaylistAdd(ApiModel):
    scenario_id: str = Field(min_length=1)


class PlaylistReorder(ApiModel):
    """same scenario ids, just in desired order"""
    scenario_ids: list[str]


class PlaylistEntry(ApiModel):
    scenario_id: str
    title: str | None # none if scenario unavailable
    available: bool

class PlaylistDetail(Playlist):
    """playlist w/ each scenario looked up in play order"""
    entries: list[PlaylistEntry]