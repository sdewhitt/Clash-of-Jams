"""Real matchmaking, session transitions, and Elo transactions in local Firestore."""

import os

import pytest

from algs.matchmaking import MatchmakingPolicy
from app.services.matchmaking_store import MatchmakingError
from app.services.multiplayer import SessionService
from app.services.multiplayer_models import SessionEvent
from app.services.multiplayer_store import FirestoreSessionStore
from tests.test_matchmaking_emulator import arena  # noqa: F401 - shared isolated fixture

pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Requires the local Firestore emulator"
)


@pytest.fixture
def session_arena(request):
    return request.getfixturevalue("arena")


def test_match_ready_progress_resign_and_idempotent_results(session_arena):
    db, matcher, uids, scenario, version, _, match_id, decision = session_arena
    value = match_id()
    assert matcher.create_lobby(value, decision(), MatchmakingPolicy())
    now = [0.0]
    store = FirestoreSessionStore(db)
    service = SessionService(lambda: store, clock=lambda: now[0], countdown_seconds=0)
    for uid in uids[:2]:
        service.connect(value, uid, uid)
        service.event(value, uid, uid, SessionEvent(event_id=uid, sequence=1, kind="ready"))
    persisted = db.document("matches/" + value).get().to_dict()
    assert persisted["state"] == "in_progress"
    assert persisted["scenarioId"] == scenario.id
    assert persisted["scenarioVersionId"] == version.id
    assert persisted["inputSource"] == "demo"
    service.event(
        value, uids[0], uids[0], SessionEvent(event_id="hit", sequence=2, kind="demo_hit")
    )
    service.event(
        value, uids[1], uids[1], SessionEvent(event_id="resign", sequence=2, kind="resign")
    )
    final = service.snapshot(value, uids[0])
    assert final.state == "complete" and final.rating_events[0].outcome == "win"
    assert final.rating_events[0].score == pytest.approx(1 / 60)
    service.tick()
    for uid in uids[:2]:
        rating = db.document(f"users/{uid}/skillRatings/piano").get().to_dict()
        history = list(db.collection(f"users/{uid}/skillRatings/piano/history").stream())
        assert rating["gamesPlayed"] == 1 and len(history) == 1
        assert history[0].id == value
    assert matcher.find_active(uids[0]) is None
    restored = SessionService(lambda: store).snapshot(value, uids[0])
    assert restored.rating_events == final.rating_events
    with pytest.raises(MatchmakingError, match="participant"):
        store.load(value, uids[2])


def test_restarted_server_abandons_live_match_without_elo(session_arena):
    db, matcher, uids, _, _, _, match_id, decision = session_arena
    value = match_id()
    assert matcher.create_lobby(value, decision(), MatchmakingPolicy())
    store = FirestoreSessionStore(db)
    store.start(value, 1_700_000_000_000, 60_000, "old-server")
    restored = SessionService(lambda: store).connect(value, uids[0], "new")
    assert restored.state == "abandoned" and restored.completion_reason == "server_restarted"
    assert not restored.rating_events
    assert matcher.find_active(uids[0]) is None
    assert db.document(f"users/{uids[0]}/skillRatings/piano").get().get("gamesPlayed") == 0


def test_banned_user_and_cancelled_lobby_cannot_start(session_arena):
    db, matcher, uids, _, _, _, match_id, decision = session_arena
    value, chosen = match_id(), decision()
    assert matcher.create_lobby(value, chosen, MatchmakingPolicy())
    store = FirestoreSessionStore(db)
    db.document("users/" + uids[0]).update({"isBanned": True})
    with pytest.raises(MatchmakingError, match="account"):
        store.load(value, uids[0])
    matcher.abandon_lobby(uids[1], chosen.players[1].ticket)
    with pytest.raises(MatchmakingError, match="no longer"):
        store.start(value, 0, 60_000, "server")
