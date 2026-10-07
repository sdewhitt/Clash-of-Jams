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

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
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
    genres: list[Genre]
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


class ScenarioWithAuthor(ApiModel):
    scenario: Scenario
    author_name: str


class FilterResponse(ApiModel):
    max_plays: int | None = None
    min_plays: int | None = None
    max_rating: float = 5.0
    min_rating: float = 0.0
    max_difficulty: float | None = None # TODO: for now this is the difficulty set by the author.  I would like to make this the avg_rating eventually
    min_difficulty: float | None = None


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
    elo: float = 400  # matches STARTING_ELO in collections.ts and initial_elo in algs/elo.py
    tier: RankTier = RankTier.BRONZE
    games_played: int = 0
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


class LeaderboardResponse(ApiModel):
    entries: list[LeaderboardEntry]
    my_entry: LeaderboardEntry | None = None
    total_players: int
    percentile: float | None # caller's rank / total_players, i.e. "top X%" (0.05 = top 5%)
    # Range of played_at across all runs, for the scenario board's date slider. None on the ELO board.
    earliest_played_at: datetime | None = None
    latest_played_at: datetime | None = None





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
