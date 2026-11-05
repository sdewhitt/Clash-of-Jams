"""Versioned session contract. Scores here are explicitly synthetic demo scores."""

from typing import Literal

from pydantic import Field, StrictBool

from app.schemas import ApiModel, Instrument
from app.services.skill_ratings import RatingEvent

PHRASES = {
    "well_done": "Well done!",
    "challenge": "Best you can do?",
    "thanks": "Thanks!",
    "good_game": "Good game!",
}


class SessionEvent(ApiModel):
    event_id: str = Field(min_length=1, max_length=128)
    sequence: int = Field(ge=1, le=2**53 - 1)
    kind: Literal["ready", "demo_hit", "emote", "resign", "spectating"]
    allow_spectators: StrictBool | None = None
    phrase: Literal["well_done", "challenge", "thanks", "good_game"] | None = None


class SessionPlayer(ApiModel):
    uid: str
    display_name: str
    elo: float
    is_ready: bool
    connected: bool
    reconnect_until_ms: float | None
    score: float
    beats_hit: int
    # Zero-based beat slots this player hit, ascending; the results screen reads streaks from it.
    hit_beats: list[int] = Field(default_factory=list)
    allow_spectators: bool = False


class SessionMessage(ApiModel):
    id: int
    uid: str
    text: str
    at_ms: float
    system: bool = False
    reactions: dict[str, int] = Field(default_factory=dict)


class SessionSnapshot(ApiModel):
    id: str
    state: Literal["lobby", "in_progress", "complete", "abandoned"]
    protocol_version: str = "multiplayer-v1"
    instrument: Instrument
    scenario_id: str
    scenario_version_id: str
    scenario_title: str
    scenario_difficulty: float
    difficulty_source: Literal["author", "crowd"]
    input_source: Literal["demo"] = "demo"
    server_sequence: int
    your_last_sequence: int
    server_time_ms: float
    started_at_ms: float | None
    duration_ms: int
    beat_ms: int = 1000
    total_beats: int
    participants: list[SessionPlayer]
    messages: list[SessionMessage]
    finalizing: bool
    completion_reason: str | None
    rating_events: list[RatingEvent]


class EventReply(ApiModel):
    type: Literal["snapshot"] = "snapshot"
    event_id: str | None = None
    disposition: Literal["accepted", "duplicate", "rejected", "snapshot"] = "snapshot"
    error: str | None = None
    snapshot: SessionSnapshot
