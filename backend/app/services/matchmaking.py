"""Single-process queue orchestration with transactional persistent lobby handoff."""

from collections import deque
from dataclasses import dataclass
from threading import RLock
from time import monotonic
from uuid import uuid4

from algs.matchmaking import MatchmakingPolicy, QueuePlayer, rating_window, select_matches
from app.services.matchmaking_models import QueueStatus
from app.services.matchmaking_store import MatchmakingError


@dataclass
class QueueEntry:
    player: QueuePlayer
    last_seen: float


class MatchmakingService:
    def __init__(self, store_factory, *, policy=None, clock=monotonic, lease_seconds=30, seed=0):
        self._store_factory = store_factory
        self._store = None
        self.policy = policy or MatchmakingPolicy()
        self.clock = clock
        self.lease_seconds = lease_seconds
        self.seed = seed
        self._lock = RLock()
        self._queue: dict[str, QueueEntry] = {}
        self._catalog = []
        self._catalog_at = float("-inf")
        self.decisions = deque(maxlen=1000)

    @property
    def store(self):
        if self._store is None:
            self._store = self._store_factory()
        return self._store

    def _expire(self, now):
        for uid, entry in list(self._queue.items()):
            if now - entry.last_seen >= self.lease_seconds:
                del self._queue[uid]

    def _refresh_catalog(self, now):
        if now - self._catalog_at >= 10:
            self._catalog = self.store.load_scenarios()
            self._catalog_at = now

    def _status(self, uid, now, *, heartbeat=False):
        active = self.store.find_active(uid)
        if active:
            self._queue.pop(uid, None)
            lobby, ticket = active
            return QueueStatus(
                state="matched",
                queue_id=ticket,
                instrument=lobby.instrument,
                match=lobby,
                policy_version=self.policy.version,
            )
        entry = self._queue.get(uid)
        if entry is None:
            return QueueStatus(state="idle", policy_version=self.policy.version)
        if heartbeat:
            entry.last_seen = now
        player = entry.player
        target_available = any(
            scenario.instrument == player.instrument
            and abs(
                player.elo
                - (
                    self.policy.difficulty_base_elo
                    + (scenario.difficulty - 1) * self.policy.difficulty_elo_step
                )
            )
            <= self.policy.scenario_window
            for scenario in self._catalog
        )
        return QueueStatus(
            state="queued",
            queue_id=player.ticket,
            instrument=player.instrument,
            wait_seconds=max(0, now - player.joined_at),
            rating_window=rating_window(player, now, self.policy),
            waiting_for="opponent" if target_available else "scenario",
            policy_version=self.policy.version,
        )

    def join(self, uid: str, instrument: str | None = None) -> QueueStatus:
        with self._lock:
            now = self.clock()
            self._expire(now)
            current = self._status(uid, now)
            if current.state == "matched":
                return current
            if current.state == "queued":
                if instrument is not None and instrument != current.instrument:
                    raise MatchmakingError("Leave the current queue before changing instruments.")
                self._queue[uid].last_seen = now
                return current
            player = self.store.load_player(uid, instrument, now, uuid4().hex)
            self._refresh_catalog(now)
            self._queue[uid] = QueueEntry(player=player, last_seen=now)
            return self._status(uid, now)

    def status(self, uid: str) -> QueueStatus:
        with self._lock:
            now = self.clock()
            self._expire(now)
            return self._status(uid, now, heartbeat=True)

    def cancel(self, uid: str, ticket: str, leave_lobby: bool = False) -> QueueStatus:
        with self._lock:
            entry = self._queue.get(uid)
            if entry is not None and entry.player.ticket == ticket:
                del self._queue[uid]
            elif leave_lobby:
                self.store.abandon_lobby(uid, ticket)
            return self._status(uid, self.clock())

    def tick(self) -> None:
        with self._lock:
            now = self.clock()
            self._expire(now)
            if not self._queue:
                return
            self._refresh_catalog(now)
            decisions = select_matches(
                [entry.player for entry in self._queue.values()],
                self._catalog,
                now,
                self.policy,
                self.seed,
            )
            for decision in decisions:
                match_id = uuid4().hex
                try:
                    created = self.store.create_lobby(match_id, decision, self.policy)
                except MatchmakingError:
                    # Preserve the eligible opponent's ticket and age if only one
                    # player became ineligible or a queued rating changed.
                    for player in decision.players:
                        try:
                            self._queue[player.uid].player = self.store.load_player(
                                player.uid, player.instrument, player.joined_at, player.ticket
                            )
                        except MatchmakingError:
                            self._queue.pop(player.uid, None)
                    continue
                if not created:
                    self._catalog_at = float("-inf")
                    for player in decision.players:
                        if self.store.find_active(player.uid):
                            self._queue.pop(player.uid, None)
                    continue
                for player in decision.players:
                    self._queue.pop(player.uid, None)
                self.decisions.append({"matchId": match_id, **decision.record(self.policy)})
