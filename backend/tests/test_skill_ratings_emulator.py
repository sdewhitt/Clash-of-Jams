"""Real Firestore transactions; run only against the isolated demo emulator."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from google.cloud.firestore_v1.transaction import Transaction

from app.services.skill_ratings import FinalMatchResult, MatchRatingError, finalize_match

pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"),
    reason="Requires the Firestore emulator",
)


@pytest.fixture
def match():
    db = Client(project="demo-clash-of-jams", credentials=AnonymousCredentials())
    prefix = "elo-test-" + uuid4().hex
    uids = (prefix + "-a", prefix + "-b")
    now = datetime.now(UTC)
    db.collection("scenarios").document(prefix).set({"instrument": "piano"})
    ref = db.collection("matches").document(prefix)
    ref.set(
        {
            "id": prefix,
            "scenarioId": prefix,
            "scenarioVersionId": prefix + "-v1",
            "participantUids": list(uids),
            "mode": "versus_1v1",
            "state": "in_progress",
        }
    )
    for uid in uids:
        db.collection("users").document(uid).set({"uid": uid})
        db.collection("users").document(uid).collection("skillRatings").document("piano").set(
            {
                "uid": uid,
                "instrument": "piano",
                "elo": 400,
                "tier": "bronze",
                "gamesPlayed": 0,
                "isProvisional": True,
                "updatedAt": now,
            }
        )
        ref.collection("participants").document(uid).set({"uid": uid})
    result = FinalMatchResult(
        match_id=prefix,
        instrument="piano",
        participant_uids=uids,
        normalized_scores=(0.9, 0.7),
    )
    yield db, result
    for uid in uids:
        db.recursive_delete(db.collection("users").document(uid))
    db.recursive_delete(ref)
    db.collection("scenarios").document(prefix).delete()
    db.close()


def rating_ref(db, uid):
    return db.collection("users").document(uid).collection("skillRatings").document("piano")


def test_atomic_finalization_and_duplicate_replay(match):
    db, result = match
    first = finalize_match(db, result)
    assert first == finalize_match(db, result)
    for uid, expected in zip(result.participant_uids, (416, 384), strict=True):
        ref = rating_ref(db, uid)
        assert ref.get().to_dict()["elo"] == expected
        assert ref.get().to_dict()["gamesPlayed"] == 1
        assert len(list(ref.collection("history").stream())) == 1
    stored = db.collection("matches").document(result.match_id).get().to_dict()
    assert stored["state"] == "complete" and stored["winnerUid"] == result.participant_uids[0]


def test_concurrent_duplicate_finalization_is_applied_once(match):
    db, result = match
    with ThreadPoolExecutor(max_workers=4) as pool:
        events = list(pool.map(lambda _: finalize_match(db, result), range(4)))
    assert all(event == events[0] for event in events)
    assert rating_ref(db, result.participant_uids[0]).get().to_dict()["gamesPlayed"] == 1


def test_two_concurrent_matches_do_not_lose_a_rating_update(match):
    db, result = match
    original = db.collection("matches").document(result.match_id)
    second = db.collection("matches").document(result.match_id + "-second")
    second.set({**original.get().to_dict(), "id": second.id})
    for uid in result.participant_uids:
        second.collection("participants").document(uid).set({"uid": uid})
    try:
        next_result = result.model_copy(update={"match_id": second.id})
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda item: finalize_match(db, item), [result, next_result]))
        for uid in result.participant_uids:
            rating = rating_ref(db, uid)
            stored = rating.get().to_dict()
            events = [item.to_dict() for item in rating.collection("history").stream()]
            assert stored["gamesPlayed"] == 2 and len(events) == 2
            assert stored["elo"] == pytest.approx(400 + sum(e["eloDelta"] for e in events))
    finally:
        db.recursive_delete(second)


def test_replay_uses_original_history_after_ratings_or_scenario_change(match):
    db, result = match
    events = finalize_match(db, result)
    rating_ref(db, result.participant_uids[0]).update({"elo": 900})
    db.collection("scenarios").document(result.match_id).delete()
    assert finalize_match(db, result) == events
    assert rating_ref(db, result.participant_uids[0]).get().to_dict()["elo"] == 900


def test_rating_api_is_scoped_to_the_authenticated_player(match):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.dependencies import get_current_user
    from app.firebase import get_firestore_client
    from app.routers.skill_ratings import router
    from app.schemas import CurrentUser

    db, result = match
    finalize_match(db, result)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_firestore_client] = lambda: db
    # Test-only identity; token verification is covered separately in test_auth.py.
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(uid=result.participant_uids[0])
    with TestClient(app) as client:
        assert client.get("/api/v1/skill-ratings/piano").json()["elo"] == 416
        history = client.get("/api/v1/skill-ratings/piano/history?limit=1").json()
        assert len(history) == 1 and history[0]["uid"] == result.participant_uids[0]
        assert client.get("/api/v1/skill-ratings/guitar").status_code == 404
        assert client.get("/api/v1/skill-ratings/piano/history?limit=0").status_code == 422
        assert client.post("/api/v1/skill-ratings/piano", json={"elo": 9999}).status_code == 405
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(uid="unrelated-test-user")
        assert client.get("/api/v1/skill-ratings/piano").status_code == 404
        assert client.get("/api/v1/skill-ratings/piano/history").json() == []


def test_conflicting_retry_is_rejected(match):
    db, result = match
    finalize_match(db, result)
    conflict = result.model_copy(update={"normalized_scores": (0.1, 0.9)})
    with pytest.raises(MatchRatingError, match="another result"):
        finalize_match(db, conflict)
    assert rating_ref(db, result.participant_uids[0]).get().to_dict()["elo"] == 416


def test_commit_failure_rolls_back_every_write_and_retry_succeeds(match, monkeypatch):
    db, result = match
    original = Transaction._commit

    def fail_commit(_self):
        raise RuntimeError("Injected commit failure")

    monkeypatch.setattr(Transaction, "_commit", fail_commit)
    with pytest.raises(RuntimeError, match="Injected"):
        finalize_match(db, result)
    assert rating_ref(db, result.participant_uids[0]).get().to_dict()["elo"] == 400
    assert not list(rating_ref(db, result.participant_uids[0]).collection("history").stream())
    assert (
        db.collection("matches").document(result.match_id).get().to_dict()["state"] == "in_progress"
    )
    monkeypatch.setattr(Transaction, "_commit", original)
    assert finalize_match(db, result)[0].elo_after == 416


@pytest.mark.parametrize("state", ["lobby", "abandoned", "complete"])
def test_nonactive_match_cannot_change_ratings(match, state):
    db, result = match
    db.collection("matches").document(result.match_id).update({"state": state})
    with pytest.raises(MatchRatingError):
        finalize_match(db, result)
    assert rating_ref(db, result.participant_uids[0]).get().to_dict()["elo"] == 400


def test_wrong_participant_or_instrument_cannot_change_ratings(match):
    db, result = match
    with pytest.raises(MatchRatingError):
        finalize_match(
            db,
            result.model_copy(
                update={
                    "participant_uids": tuple(reversed(result.participant_uids)),
                }
            ),
        )
    wrong = FinalMatchResult(
        match_id=result.match_id,
        instrument="guitar",
        participant_uids=result.participant_uids,
        normalized_scores=result.normalized_scores,
    )
    with pytest.raises(MatchRatingError, match="instrument"):
        finalize_match(db, wrong)


def test_missing_rating_is_rejected_without_partial_finalization(match):
    db, result = match
    rating_ref(db, result.participant_uids[1]).delete()
    with pytest.raises(MatchRatingError):
        finalize_match(db, result)
    assert rating_ref(db, result.participant_uids[0]).get().to_dict()["gamesPlayed"] == 0
    assert (
        db.collection("matches").document(result.match_id).get().to_dict()["state"] == "in_progress"
    )
