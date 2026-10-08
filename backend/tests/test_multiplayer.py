"""Session invariants use an explicit test store and controlled clocks."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime

import pytest

from app.schemas import SkillRating
from app.services.matchmaking_store import MatchmakingError
from app.services.multiplayer import SessionService
from app.services.multiplayer_models import SessionEvent
from app.services.multiplayer_transport import SessionMetrics
from app.services.skill_ratings import calculate_rating_events


class SessionTestStore:
    """Not a production persistence substitute; real transactions are emulator-tested."""

    def __init__(self):
        self.data = {
            "state": "lobby",
            "scenarioId": "riff",
            "scenarioVersionId": "v1",
            "matchmaking": {
                "instrument": "piano",
                "scenarioTitle": "Shared riff",
                "scenarioDifficulty": 1,
                "difficultySource": "author",
            },
            "participants": [
                {"uid": uid, "displayName": uid, "eloAtQueue": 400} for uid in ("a", "b")
            ],
        }
        self.commits = []
        self.fail = False
        self.starts = 0

    def load(self, _match_id, uid):
        if uid not in ("a", "b"):
            raise MatchmakingError("Not a participant", 403)
        return deepcopy(self.data)

    def start(self, _match_id, _at, _duration, _owner):
        if self.data["state"] != "lobby" or self.fail:
            raise MatchmakingError("Start failed")
        self.data["state"] = "in_progress"
        self.starts += 1

    def abandon(self, _match_id, reason):
        self.data.update(state="abandoned", completionReason=reason)

    def finalize(self, result):
        if self.fail:
            raise RuntimeError("Injected storage failure")
        if not self.commits:
            self.commits.append(result)
        ratings = tuple(
            SkillRating(uid=uid, instrument="piano", updated_at=datetime.now(UTC))
            for uid in ("a", "b")
        )
        events = calculate_rating_events(result, ratings, datetime.now(UTC))
        self.data.update(state="complete", ratingEvents=events, completionReason=result.reason)
        return events


@pytest.fixture
def arena():
    now = [0.0]
    store = SessionTestStore()
    service = SessionService(
        lambda: store,
        clock=lambda: now[0],
        wall_clock=lambda: 1_700_000_000 + now[0],
        countdown_seconds=0,
        heartbeat_seconds=1000,
    )
    for uid in ("a", "b"):
        service.connect("match", uid, uid)
    return service, store, now


def event(service, uid, kind, seq=1, event_id=None, **extra):
    return service.event(
        "match",
        uid,
        uid,
        SessionEvent(event_id=event_id or f"{uid}-{seq}", sequence=seq, kind=kind, **extra),
    )


def start(service):
    event(service, "a", "ready")
    event(service, "b", "ready")


def test_ready_and_both_clients_share_clock_scenario_and_state(arena):
    service, store, _ = arena
    assert event(service, "a", "ready").snapshot.state == "lobby"
    reply = event(service, "b", "ready")
    assert reply.snapshot.state == "in_progress" and store.starts == 1
    a, b = (service.snapshot("match", uid) for uid in ("a", "b"))
    assert a.model_dump(exclude={"your_last_sequence"}) == b.model_dump(
        exclude={"your_last_sequence"}
    )
    assert a.scenario_version_id == "v1" and a.duration_ms == 60_000


def test_concurrent_ready_starts_only_once(arena):
    service, store, _ = arena
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(lambda uid: event(service, uid, "ready"), ("a", "b")))
    assert store.starts == 1


def test_live_clock_does_not_jump_with_system_wall_clock(arena):
    service, _, now = arena
    start(service)
    started_ms = service.snapshot("match", "a").started_at_ms
    service.wall_clock = lambda: 9_000_000_000
    now[0] = 5
    service.disconnect("match", "a", "a")
    snapshot = service.snapshot("match", "b")
    assert snapshot.server_time_ms == started_ms + 5000
    assert snapshot.participants[0].reconnect_until_ms == started_ms + 25_000


def test_start_failure_can_be_retried(arena):
    service, store, _ = arena
    event(service, "a", "ready")
    store.fail = True
    with pytest.raises(MatchmakingError):
        event(service, "b", "ready")
    assert not service.snapshot("match", "b").participants[1].is_ready
    store.fail = False
    assert event(service, "b", "ready").snapshot.state == "in_progress"


def test_duplicate_stale_and_same_beat_events_cannot_increase_score_twice(arena):
    service, _, now = arena
    start(service)
    original = event(service, "a", "demo_hit", 2)
    assert original.disposition == "accepted"
    assert event(service, "a", "demo_hit", 2).disposition == "duplicate"
    assert event(service, "a", "demo_hit", 1, "different-id").disposition == "rejected"
    assert event(service, "a", "demo_hit", 3).disposition == "rejected"
    assert service.snapshot("match", "a").participants[0].beats_hit == 1
    now[0] = 1.1
    assert event(service, "a", "demo_hit", 3).snapshot.participants[0].beats_hit == 2


def test_reconnect_restores_progress_and_sequence_and_old_tab_cannot_disconnect_it(arena):
    service, _, now = arena
    start(service)
    event(service, "a", "demo_hit", 2)
    service.disconnect("match", "a", "a")
    now[0] = 19.9
    state = service.connect("match", "a", "replacement")
    assert state.state == "in_progress" and state.your_last_sequence == 2
    assert state.participants[0].beats_hit == 1
    service.disconnect("match", "a", "a")
    assert service.snapshot("match", "a").participants[0].connected
    reply = service.event(
        "match", "a", "replacement", SessionEvent(event_id="stale", sequence=1, kind="demo_hit")
    )
    assert reply.disposition == "rejected"


def test_20_second_boundary_forfeits_once_and_rejects_later_events(arena):
    service, store, now = arena
    start(service)
    service.disconnect("match", "a", "a")
    now[0] = 19.999
    service.tick()
    assert service.snapshot("match", "b").state == "in_progress"
    now[0] = 20
    service.tick()
    result = service.snapshot("match", "b")
    assert result.state == "complete" and result.completion_reason == "disconnected"
    assert result.rating_events[0].outcome == "forfeit"
    assert result.rating_events[1].outcome == "win"
    assert event(service, "b", "demo_hit", 2).disposition == "rejected"
    service.tick()
    assert len(store.commits) == 1


def test_resign_and_natural_completion(arena):
    service, store, _ = arena
    start(service)
    reply = event(service, "a", "resign", 2)
    assert reply.snapshot.state == "complete"
    assert store.commits[0].forfeiting_uid == "a"
    assert event(service, "a", "resign", 2).disposition == "rejected"


def test_full_duration_uses_normalized_scores_and_tie_is_draw(arena):
    service, store, now = arena
    start(service)
    now[0] = 60
    service.tick()
    assert store.commits[0].normalized_scores == (0, 0)
    assert all(e.outcome == "draw" for e in service.snapshot("match", "a").rating_events)


def test_finalization_failure_freezes_result_and_retries(arena):
    service, store, now = arena
    start(service)
    event(service, "a", "demo_hit", 2)
    store.fail = True
    result = event(service, "a", "resign", 3)
    assert result.snapshot.finalizing and not result.snapshot.rating_events
    assert event(service, "b", "demo_hit", 2).disposition == "rejected"
    store.fail = False
    now[0] = 1
    service.tick()
    assert service.snapshot("match", "a").state == "complete"
    assert store.commits[0].normalized_scores == (1 / 60, 0)


def test_both_disconnects_abandon_without_rating_changes(arena):
    service, store, now = arena
    start(service)
    for uid in ("a", "b"):
        service.disconnect("match", uid, uid)
    now[0] = 20
    service.tick()
    assert service.snapshot("match", "a").state == "abandoned"
    assert not store.commits


def test_emotes_are_presets_rate_limited_and_deduplicated(arena):
    service, _, now = arena
    reply = event(service, "a", "emote", phrase="thanks")
    assert reply.snapshot.messages[0].text == "Thanks!"
    assert event(service, "a", "emote", phrase="thanks").disposition == "duplicate"
    assert event(service, "a", "emote", 2, phrase="good_game").disposition == "rejected"
    now[0] = 0.8
    assert event(service, "a", "emote", 2, phrase="good_game").disposition == "accepted"
    assert len(service.snapshot("match", "b").messages) == 2


def test_readied_players_start_when_the_missing_connection_returns(arena):
    service, _, _ = arena
    event(service, "a", "ready")
    service.disconnect("match", "a", "a")
    assert event(service, "b", "ready").snapshot.state == "lobby"
    assert service.connect("match", "a", "new").state == "in_progress"


def test_nonparticipants_cannot_join_or_read(arena):
    service, _, _ = arena
    with pytest.raises(MatchmakingError):
        service.connect("match", "outsider", "evil")
    with pytest.raises(MatchmakingError):
        service.snapshot("match", "outsider")


def test_heartbeat_timeout_and_terminal_cleanup():
    now, store = [0.0], SessionTestStore()
    service = SessionService(
        lambda: store,
        clock=lambda: now[0],
        countdown_seconds=0,
        heartbeat_seconds=10,
        retention_seconds=5,
    )
    for uid in ("a", "b"):
        service.connect("match", uid, uid)
    start(service)
    now[0] = 10
    service.tick()
    assert not any(p.connected for p in service.snapshot("match", "a").participants)
    now[0] = 30
    service.tick()
    assert service.snapshot("match", "a").state == "abandoned"
    now[0] = 35
    service.tick()
    assert not service.sessions


def test_instrumentation_excludes_duplicates_and_reports_regression():
    metrics = SessionMetrics()
    metrics.record("duplicate", 0, 1, 2)
    metrics.record("rejected", 0, 1, 2)
    assert metrics.report()["sampleCount"] == 0
    metrics.record("accepted", 1, 1.01, 1.02)
    assert metrics.report()["passes50Ms"]
    metrics.record("accepted", 2, 2.06, 2.1)
    report = metrics.report()
    assert not report["passes50Ms"] and report["p95Ms"] == pytest.approx(100)
    assert report["lastTiming"] == {"receipt": 2, "completion": 2.06, "responseEnqueue": 2.1}
