"""
Request and response models.

These mirror the Firestore shapes in frontend/src/lib/schema/types.ts. Only the
handful of types the stub routes need are defined so far; add the rest as the
routes that need them land, keeping the field names identical to the TypeScript
side so payloads round-trip without renaming.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


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


class ScenarioCreate(BaseModel):
    """What a client sends to create a scenario. Server fills in the rest."""

    title: str = Field(min_length=1, max_length=120)
    description: str = ""
    instrument: Instrument
    visibility: Visibility = Visibility.PRIVATE
    tags: list[str] = []
    author_difficulty: int = Field(default=1, ge=1, le=10)


class Scenario(BaseModel):
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


class CurrentUser(BaseModel):
    """The caller, as resolved from their Firebase ID token."""

    uid: str
    email: str | None = None


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
