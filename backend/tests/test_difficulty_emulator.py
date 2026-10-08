"""Trusted evidence filtering and real, atomic publication in an isolated emulator."""

import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from google.cloud.firestore_v1.transaction import Transaction

from app.dependencies import get_current_user
from app.firebase import get_firestore_client
from app.routers.scenario_difficulty import router
from app.schemas import CurrentUser, Role
from app.services.matchmaking_store import scenario_difficulty
from app.services.scenario_difficulty import DifficultyError, FirestoreDifficultyStore

pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Requires the Firestore emulator"
)


@pytest.fixture
def evidence():
    db = Client(project="demo-clash-of-jams", credentials=AnonymousCredentials())
    scenario_id = "difficulty-test-" + uuid4().hex
    author = CurrentUser(uid=scenario_id + "-owner")
    scenario = db.collection("scenarios").document(scenario_id)
    version_id = "v1"
    rules = {"pitchWeight": 0.5, "rhythmWeight": 0.3, "completenessWeight": 0.2}
    scenario.set(
        {
            "title": "Difficulty fixture",
            "instrument": "piano",
            "authorUid": author.uid,
            "authorDifficulty": 2,
            "crowdDifficulty": None,
            "visibility": "private",
            "currentVersionId": version_id,
        }
    )
    scenario.collection("versions").document(version_id).set(
        {
            "chart": {"parts": [{"partId": "lead", "instrument": "piano", "notes": [60]}]},
            "scoringRules": rules,
        }
    )
    runs = []

    def add(label, **changes):
        ref = db.collection("runs").document(scenario_id + "-" + label)
        ref.set(
            {
                "userUid": scenario_id + "-" + label,
                "scenarioId": scenario_id,
                "scenarioVersionId": version_id,
                "partId": "lead",
                "instrument": "piano",
                "speedMultiplier": 1,
                "scoringRules": rules,
                "validation": "accepted",
                "ratingAtPlay": 1100,
                "finalScore": 65_000,
                "inputSource": "midi",
                "completionReason": "completed",
                "playedAt": datetime.now(UTC),
                **changes,
            }
        )
        runs.append(ref)
        return ref

    yield db, scenario, author, add
    for ref in runs:
        ref.delete()
    db.recursive_delete(scenario)
    db.close()


def test_filters_incomparable_untrusted_and_nonmusical_runs(evidence):
    db, scenario, author, add = evidence
    for label, changes in {
        "pending": {"validation": "pending"},
        "old": {"scenarioVersionId": "v0"},
        "part": {"partId": "bass"},
        "slow": {"speedMultiplier": 0.5},
        "rules": {"scoringRules": {}},
        "demo": {"inputSource": "demo"},
        "unknown-source": {"inputSource": None},
        "resigned": {"completionReason": "resigned"},
        "unknown-completion": {"completionReason": None},
        "unknown-elo": {"ratingAtPlay": None},
        "timestamp": {"playedAt": "not-a-timestamp"},
        "score": {"normalizedScore": 4},
    }.items():
        add(label, **changes)
    add("percent", finalScore=65_000)
    add("normalized", normalizedScore=0.65, finalScore=999)
    detail = FirestoreDifficultyStore(db).detail(scenario.id, author)
    assert detail.estimate.distinct_players == 2
    assert detail.estimate.bands[1].mean_score == pytest.approx(0.65)
    assert detail.estimate.invalid_observations == 1
    assert detail.excluded_runs == {
        "unvalidated": 1,
        "differentVersion": 1,
        "differentPart": 1,
        "differentScoring": 2,
        "nonMusicalOrUnknownInput": 2,
        "incomplete": 2,
        "unknownRating": 1,
        "invalidTimestamp": 1,
    }


def test_latest_attempt_cap_uses_saved_elo_and_not_current_user_rating(evidence):
    db, scenario, author, add = evidence
    for index, score in enumerate([0, 0, 0.6, 0.6, 0.6]):
        add(
            str(index),
            userUid="one-player",
            normalizedScore=score,
            ratingAtPlay=550,
            playedAt=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=index),
        )
    detail = FirestoreDifficultyStore(db).detail(scenario.id, author)
    assert detail.estimate.distinct_players == 1 and detail.estimate.capped_attempts == 2
    assert detail.estimate.bands[0].mean_score == pytest.approx(0.6)
    assert detail.estimate.bands[0].mean_elo == 550


def test_publication_is_atomic_version_scoped_and_used_by_matchmaking(evidence):
    db, scenario, author, add = evidence
    for index in range(12):
        add(str(index), ratingAtPlay=550 if index < 6 else 1100)
    store = FirestoreDifficultyStore(db)
    published = store.publish(scenario.id, author)
    assert published.published_at is not None and not published.estimate.is_provisional
    saved = scenario.get().to_dict()
    assert saved["crowdDifficulty"] == published.estimate.value
    assert saved["crowdDifficultyVersionId"] == "v1"
    aggregate = scenario.collection("difficultyEstimates").document("v1").get().to_dict()
    assert aggregate["distinctPlayers"] == 12 and aggregate["partId"] == "lead"
    assert "userUid" not in aggregate and aggregate["source"] == "performances"
    assert scenario_difficulty(saved) == (published.estimate.value, "crowd")
    scenario.update({"currentVersionId": "v2"})
    assert scenario_difficulty(scenario.get().to_dict()) == (2, "author")


def test_provisional_and_empty_evidence_do_not_replace_author_difficulty(evidence):
    db, scenario, author, add = evidence
    store = FirestoreDifficultyStore(db)
    for count in range(2):
        result = store.publish(scenario.id, author)
        assert result.estimate.is_provisional
        assert scenario.get().to_dict()["crowdDifficulty"] is None
        assert scenario_difficulty(scenario.get().to_dict()) == (2, "author")
        add(str(count))


def test_version_change_during_computation_rejects_publication(evidence, monkeypatch):
    db, scenario, author, _add = evidence
    store = FirestoreDifficultyStore(db)
    original = store._detail

    def change_version(*args):
        result = original(*args)
        scenario.update({"currentVersionId": "v2"})
        return result

    monkeypatch.setattr(store, "_detail", change_version)
    with pytest.raises(DifficultyError, match="changed") as error:
        store.publish(scenario.id, author)
    assert error.value.status == 409
    assert not scenario.collection("difficultyEstimates").document("v1").get().exists


def test_failed_commit_leaves_no_partial_difficulty(evidence, monkeypatch):
    db, scenario, author, _add = evidence

    def fail(_self):
        raise RuntimeError("Injected commit failure")

    monkeypatch.setattr(Transaction, "_commit", fail)
    with pytest.raises(RuntimeError, match="Injected"):
        FirestoreDifficultyStore(db).publish(scenario.id, author)
    assert scenario.get().to_dict()["crowdDifficulty"] is None
    assert not scenario.collection("difficultyEstimates").document("v1").get().exists


def test_empty_arrangement_cannot_publish(evidence):
    db, scenario, author, _add = evidence
    scenario.collection("versions").document("v1").update({"chart": {"parts": []}})
    store = FirestoreDifficultyStore(db)
    assert store.detail(scenario.id, author).estimate.value is None
    with pytest.raises(DifficultyError, match="playable"):
        store.publish(scenario.id, author)


def test_http_visibility_permissions_and_server_owned_estimate(evidence):
    db, scenario, author, add = evidence
    add("real-performance")
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_firestore_client] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: author
    url = "/api/v1/scenario-difficulty/scenarios/" + scenario.id
    with TestClient(app) as client:
        listing = client.get("/api/v1/scenario-difficulty/scenarios").json()
        assert scenario.id in [item["id"] for item in listing]
        result = client.post(url + "/recompute", json={"value": 10, "normalizedScore": 1})
        assert result.status_code == 200
        assert result.json()["estimate"]["distinctPlayers"] == 1
        assert result.json()["estimate"]["label"] == "Provisional"
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(uid="other")
        assert client.get(url).status_code == 404
        assert scenario.id not in [
            item["id"] for item in client.get("/api/v1/scenario-difficulty/scenarios").json()
        ]
        scenario.update({"visibility": "public"})
        assert client.get(url).status_code == 200
        assert client.post(url + "/recompute").status_code == 403
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            uid="admin", role=Role.ADMIN
        )
        assert client.post(url + "/recompute").status_code == 200
