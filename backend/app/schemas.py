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


class Visibility(StrEnum):
    PRIVATE = "private"
    UNLISTED = "unlisted"
    PUBLIC = "public"


class ScenarioCreate(ApiModel):
    """What a client sends to create a scenario. Server fills in the rest."""

    title: str = Field(min_length=1, max_length=120)
    description: str = ""
    instrument: Instrument
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


class LeaderboardReponse(ApiModel):
    uid: str
    username: str # TODO: will also want to bring in pfp at some point
    ranking: int
    key: float # this will be ELO or score so we can use this for both


class CurrentUser(BaseModel):
    """The caller, as resolved from their Firebase ID token.

    Internal to the service — it is never serialized into a response, so it
    needs no aliases.
    """

    uid: str
    email: str | None = None


class HealthResponse(ApiModel):
    status: str
    app: str
    version: str
