"""Matchmaking HTTP snapshots; session gameplay will consume the resulting lobby."""

from typing import Literal

from pydantic import Field

from app.schemas import ApiModel, Instrument


class QueueJoin(ApiModel):
    # Omission uses the player's persisted instrument preference.
    instrument: Instrument | None = None


class LobbyPlayer(ApiModel):
    uid: str
    display_name: str
    elo: float
    is_provisional: bool


class MatchedLobby(ApiModel):
    id: str
    state: Literal["lobby", "in_progress"]
    instrument: Instrument
    scenario_id: str
    scenario_version_id: str
    scenario_title: str
    scenario_difficulty: float
    difficulty_source: Literal["crowd", "author"]
    participants: list[LobbyPlayer]


class QueueStatus(ApiModel):
    state: Literal["idle", "queued", "matched"]
    queue_id: str | None = None
    instrument: Instrument | None = None
    wait_seconds: float = 0
    rating_window: float | None = None
    waiting_for: Literal["opponent", "scenario"] | None = None
    match: MatchedLobby | None = None
    policy_version: str = "matchmaking-v1"


class QueueCancel(ApiModel):
    queue_id: str = Field(min_length=1, max_length=128, pattern=r"^[^/]+$")
    leave_lobby: bool = False
