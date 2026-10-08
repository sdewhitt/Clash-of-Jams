"""Authoritative, single-process sessions with replaceable storage and clocks.

The demo input adapter counts one synthetic tap per server beat. It is not
musical transcription/scoring and never accepts a client-provided score.
"""

import logging
from collections import deque
from dataclasses import dataclass, field
from math import ceil
from threading import RLock
from time import monotonic, time
from uuid import uuid4

from app.services.matchmaking_store import MatchmakingError
from app.services.multiplayer_models import (
    PHRASES,
    EventReply,
    SessionEvent,
    SessionMessage,
    SessionPlayer,
    SessionSnapshot,
)
from app.services.skill_ratings import FinalMatchResult

logger = logging.getLogger(__name__)


@dataclass
class Player:
    uid: str
    name: str
    elo: float
    ready: bool = False
    connection: str | None = None
    last_seen: float = 0
    recover_until: float | None = None
    sequence: int = 0
    event_ids: set[str] = field(default_factory=set)
    hit_slots: set[int] = field(default_factory=set)
    last_emote: float = float("-inf")


@dataclass
class Session:
    id: str
    data: dict
    players: dict[str, Player]
    created: float
    duration_ms: int
    state: str = "lobby"
    sequence: int = 0
    started: float | None = None
    started_epoch_ms: float | None = None
    messages: deque = field(default_factory=lambda: deque(maxlen=20))
    pending: FinalMatchResult | str | None = None
    reason: str | None = None
    rating_events: tuple = ()
    retry_at: float = 0
    terminal_at: float | None = None
    lock: RLock = field(default_factory=RLock)

    @property
    def total_beats(self):
        return ceil(self.duration_ms / 1000)

    def score(self, player):
        return len(player.hit_slots) / self.total_beats


class SessionService:
    def __init__(
        self,
        store_factory,
        *,
        clock=monotonic,
        wall_clock=time,
        duration_seconds=60,
        recovery_seconds=20,
        countdown_seconds=3,
        heartbeat_seconds=10,
        retention_seconds=300,
    ):
        self._factory = store_factory
        self._store = None
        self.clock, self.wall_clock = clock, wall_clock
        self.duration_ms = round(duration_seconds * 1000)
        self.recovery = recovery_seconds
        self.countdown = countdown_seconds
        self.heartbeat = heartbeat_seconds
        self.retention = retention_seconds
        self.owner = uuid4().hex
        self.sessions: dict[str, Session] = {}
        self._registry_lock = RLock()

    @property
    def store(self):
        with self._registry_lock:
            if self._store is None:
                self._store = self._factory()
            return self._store

    def _get(self, match_id, uid):
        with self._registry_lock:
            existing = self.sessions.get(match_id)
        if existing:
            if uid not in existing.players:
                raise MatchmakingError("You are not a participant in this match.", 403)
            return existing
        data = self.store.load(match_id, uid)
        with self._registry_lock:
            existing = self.sessions.get(match_id)
        if existing:
            return existing
        if data["state"] == "in_progress":
            # RAM state cannot be reconstructed honestly after a process restart.
            self.store.abandon(match_id, "server_restarted")
            data["state"] = "abandoned"
            data["completionReason"] = "server_restarted"
        now = self.clock()
        players = {
            p["uid"]: Player(
                p["uid"],
                p.get("displayName", "Player"),
                p.get("eloAtQueue", 400),
                last_seen=now,
                recover_until=now + self.recovery,
            )
            for p in data["participants"]
        }
        session = Session(match_id, data, players, now, data.get("durationMs", self.duration_ms))
        session.state = data["state"]
        session.reason = data.get("completionReason")
        session.rating_events = tuple(data.get("ratingEvents", []))
        if session.state in ("complete", "abandoned"):
            session.terminal_at = now
        with self._registry_lock:
            return self.sessions.setdefault(match_id, session)

    def connect(self, match_id, uid, connection):
        session = self._get(match_id, uid)
        with session.lock:
            self._advance(session)
            player = session.players[uid]
            player.connection = connection
            player.last_seen = self.clock()
            player.recover_until = None
            session.sequence += 1
            self._start_if_ready(session)
            return self._snapshot(session, uid)

    def disconnect(self, match_id, uid, connection):
        with self._registry_lock:
            session = self.sessions.get(match_id)
        if session is None:
            return
        with session.lock:
            player = session.players[uid]
            # Closing a replaced tab must not disconnect the replacement connection.
            if player.connection == connection:
                player.connection = None
                if session.state in ("lobby", "in_progress") and session.pending is None:
                    player.recover_until = self.clock() + self.recovery
                session.sequence += 1

    def ping(self, match_id, uid, connection):
        session = self._get(match_id, uid)
        with session.lock:
            player = session.players[uid]
            if player.connection != connection:
                raise MatchmakingError("This connection was replaced.", 409)
            self._advance(session)
            player.last_seen = self.clock()
            return self._snapshot(session, uid)

    def snapshot(self, match_id, uid):
        session = self._get(match_id, uid)
        with session.lock:
            return self._snapshot(session, uid)

    def lobby_left(self, match_id):
        """Called after matchmaking's transactional lobby cancellation succeeds."""
        with self._registry_lock:
            session = self.sessions.get(match_id)
        if session is not None:
            with session.lock:
                if session.state == "lobby":
                    session.pending = "lobby_left"
                    self._commit(session)

    def event(self, match_id, uid, connection, event: SessionEvent):
        session = self._get(match_id, uid)
        with session.lock:
            self._advance(session)
            player = session.players[uid]
            error = None
            disposition = "accepted"
            if player.connection != connection:
                error = "This connection was replaced."
            elif session.state in ("complete", "abandoned") or session.pending is not None:
                error = "This match has ended."
            elif event.event_id in player.event_ids:
                disposition = "duplicate"
            elif event.sequence <= player.sequence:
                error = "Stale event. Use the current state snapshot."
            elif len(player.event_ids) >= 8192:
                error = "Session event limit reached."
            elif event.kind == "ready":
                if session.state != "lobby":
                    error = "The match has already started."
                else:
                    player.ready = True
                    try:
                        self._start_if_ready(session)
                    except Exception:
                        player.ready = False
                        raise
            elif event.kind == "demo_hit":
                now = self.clock()
                if (
                    session.state != "in_progress"
                    or session.started is None
                    or now < session.started
                ):
                    error = "Wait for the match to start."
                else:
                    slot = int((now - session.started) * 1000 // 1000)
                    if slot in player.hit_slots:
                        error = "This beat has already been played."
                    elif slot >= session.total_beats:
                        error = "The playthrough has ended."
                    else:
                        player.hit_slots.add(slot)
            elif event.kind == "emote":
                if event.phrase not in PHRASES:
                    error = "Choose a preset message."
                elif self.clock() - player.last_emote < 0.8:
                    error = "Wait a moment before sending another message."
                else:
                    player.last_emote = self.clock()
                    session.messages.append(
                        SessionMessage(
                            id=session.sequence + 1,
                            uid=uid,
                            text=PHRASES[event.phrase],
                            at_ms=self.wall_clock() * 1000,
                        )
                    )
            elif event.kind == "resign":
                if session.state != "in_progress":
                    error = "Leave the lobby before the match starts."
                else:
                    self._finish(session, "resigned", uid)
            if error:
                disposition = "rejected"
            elif disposition == "accepted":
                player.sequence = event.sequence
                player.event_ids.add(event.event_id)
                player.last_seen = self.clock()
                session.sequence += 1
            return EventReply(
                event_id=event.event_id,
                disposition=disposition,
                error=error,
                snapshot=self._snapshot(session, uid),
            )

    def _start_if_ready(self, session):
        if session.state == "lobby" and all(
            p.ready and p.connection for p in session.players.values()
        ):
            started_ms = (self.wall_clock() + self.countdown) * 1000
            started = self.clock() + self.countdown
            self.store.start(session.id, started_ms, self.duration_ms, self.owner)
            session.state = "in_progress"
            session.duration_ms = self.duration_ms
            session.started = started
            session.started_epoch_ms = started_ms

    def _finish(self, session, reason, forfeiting_uid=None):
        uids = tuple(session.players)
        session.pending = FinalMatchResult(
            match_id=session.id,
            instrument=session.data["matchmaking"]["instrument"],
            participant_uids=uids,
            normalized_scores=tuple(session.score(session.players[uid]) for uid in uids),
            reason=reason,
            forfeiting_uid=forfeiting_uid,
        )
        self._commit(session)

    def _commit(self, session):
        # Freeze the final score while persistence retries; don't expose uncommitted Elo.
        try:
            if isinstance(session.pending, str):
                self.store.abandon(session.id, session.pending)
                session.reason = session.pending
                session.state = "abandoned"
            else:
                session.rating_events = tuple(self.store.finalize(session.pending))
                session.reason = session.pending.reason
                session.state = "complete"
        except Exception:
            logger.exception("Could not finalize session %s; retrying", session.id)
            session.retry_at = self.clock() + 1
            return
        session.pending = None
        session.terminal_at = self.clock()
        session.sequence += 1

    def _advance(self, session):
        now = self.clock()
        if session.pending is not None:
            if now >= session.retry_at:
                self._commit(session)
            return
        if session.state not in ("lobby", "in_progress"):
            return
        for player in session.players.values():
            if player.connection and now - player.last_seen >= self.heartbeat:
                player.connection = None
                player.recover_until = now + self.recovery
                session.sequence += 1
        expired = [
            p
            for p in session.players.values()
            if p.recover_until is not None and now >= p.recover_until
        ]
        deadline = (
            session.started + session.duration_ms / 1000
            if session.started is not None
            else float("inf")
        )
        expired_before_end = [p for p in expired if p.recover_until <= deadline]
        if expired_before_end:
            if session.state == "lobby" or not any(p.connection for p in session.players.values()):
                session.pending = (
                    "lobby_timeout" if session.state == "lobby" else "both_disconnected"
                )
                self._commit(session)
            else:
                self._finish(
                    session,
                    "disconnected",
                    min(expired_before_end, key=lambda p: (p.recover_until, p.uid)).uid,
                )
        elif now >= deadline:
            self._finish(session, "completed")

    def tick(self):
        with self._registry_lock:
            sessions = list(self.sessions.values())
        for session in sessions:
            with session.lock:
                self._advance(session)
                if (
                    session.terminal_at is not None
                    and self.clock() - session.terminal_at >= self.retention
                    and not any(p.connection for p in session.players.values())
                ):
                    with self._registry_lock:
                        self.sessions.pop(session.id, None)

    def _snapshot(self, session, uid):
        meta = session.data["matchmaking"]
        now = self.clock()
        server_ms = (
            session.started_epoch_ms + (now - session.started) * 1000
            if session.started is not None
            else self.wall_clock() * 1000
        )
        events = {event.uid: event for event in session.rating_events}
        return SessionSnapshot(
            id=session.id,
            state=session.state,
            instrument=meta["instrument"],
            scenario_id=session.data["scenarioId"],
            scenario_version_id=session.data["scenarioVersionId"],
            scenario_title=meta["scenarioTitle"],
            scenario_difficulty=meta["scenarioDifficulty"],
            difficulty_source=meta["difficultySource"],
            server_sequence=session.sequence,
            your_last_sequence=session.players[uid].sequence,
            server_time_ms=server_ms,
            started_at_ms=session.started_epoch_ms,
            duration_ms=session.duration_ms,
            total_beats=session.total_beats,
            participants=[
                SessionPlayer(
                    uid=p.uid,
                    display_name=p.name,
                    elo=p.elo,
                    is_ready=p.ready,
                    connected=p.connection is not None,
                    reconnect_until_ms=server_ms + max(0, p.recover_until - now) * 1000
                    if p.recover_until is not None
                    else None,
                    score=events[p.uid].score if p.uid in events else session.score(p),
                    beats_hit=len(p.hit_slots),
                )
                for p in session.players.values()
            ],
            messages=list(session.messages),
            finalizing=session.pending is not None,
            completion_reason=session.reason,
            rating_events=list(session.rating_events),
        )
