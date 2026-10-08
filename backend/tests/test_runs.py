"""Run validation, against an in-memory stand-in for the Firestore client."""

import copy

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.firebase import firestore
from app.routers import runs
from app.routers.runs import check_run


class FakeSnapshot:
    def __init__(self, data: dict | None) -> None:
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict | None:
        return copy.deepcopy(self._data)


class FakeRef:
    def __init__(self, store: dict, path: str) -> None:
        self.store = store
        self.path = path

    def collection(self, name: str) -> "FakeCollection":
        return FakeCollection(self.store, f"{self.path}/{name}")

    def get(self) -> FakeSnapshot:
        return FakeSnapshot(self.store.get(self.path))


class FakeCollection:
    def __init__(self, store: dict, path: str) -> None:
        self.store = store
        self.path = path

    def document(self, doc_id: str) -> FakeRef:
        return FakeRef(self.store, f"{self.path}/{doc_id}")


class FakeBatch:
    def __init__(self, store: dict) -> None:
        self.store = store
        self.pending: list[tuple[str, dict]] = []

    def update(self, ref: FakeRef, data: dict) -> None:
        self.pending.append((ref.path, data))

    def commit(self) -> None:
        for path, data in self.pending:
            for key, value in data.items():
                if isinstance(value, firestore.Increment):
                    value = self.store[path].get(key, 0) + value.value
                self.store[path][key] = value


class FakeDb:
    def __init__(self) -> None:
        self.store: dict[str, dict] = {}

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self.store, name)

    def batch(self) -> FakeBatch:
        return FakeBatch(self.store)


def make_version() -> dict:
    return {
        "chart": {
            "parts": [
                {
                    "partId": "lead",
                    "notes": [{"index": i, "midiPitch": 60 + i, "startBeat": i} for i in range(4)],
                }
            ]
        },
        "scoringRules": {"pitchWeight": 0.4, "rhythmWeight": 0.4, "completenessWeight": 0.2},
    }


def make_run(uid: str = "someone") -> dict:
    """Three of four notes matched: two clean hits, one out of tune, one missed."""
    return {
        "id": "run1",
        "userUid": uid,
        "scenarioId": "s1",
        "scenarioVersionId": "v1",
        "partId": "lead",
        "speedMultiplier": 1,
        "validation": "pending",
        "finalScore": 65.0,  # 50 * 0.4 + 75 * 0.4 + 75 * 0.2
        "breakdown": {
            "pitchAccuracy": 50.0,
            "rhythmAccuracy": 75.0,
            "completeness": 75.0,
            "notesHit": 2,
            "notesMissed": 1,
            "extraNotes": 0,
            "noteResults": [
                {"expectedNoteIndex": 0, "verdict": "hit"},
                {"expectedNoteIndex": 1, "verdict": "hit"},
                {"expectedNoteIndex": 2, "verdict": "wrong_pitch"},
                {"expectedNoteIndex": 3, "verdict": "missed"},
            ],
        },
    }


def test_consistent_run_passes() -> None:
    assert check_run(make_run(), make_version()) is None


def test_missing_version_is_rejected() -> None:
    assert check_run(make_run(), None) == "Scenario version not found"


def test_inflated_score_is_rejected() -> None:
    run = make_run()
    run["finalScore"] = 100.0
    assert check_run(run, make_version()) == "Final score does not match the breakdown"


def test_note_results_must_cover_the_chart() -> None:
    run = make_run()
    run["breakdown"]["noteResults"].pop()
    assert check_run(run, make_version()) == "Note results do not match the chart"


def test_counts_must_match_the_verdicts() -> None:
    run = make_run()
    run["breakdown"]["notesMissed"] = 0
    assert check_run(run, make_version()) == "Note counts do not match the note results"


def test_unknown_part_is_rejected() -> None:
    run = make_run()
    run["partId"] = "bass"
    assert check_run(run, make_version()) == "Part is not in this scenario version"


def test_malformed_breakdown_is_rejected() -> None:
    run = make_run()
    run["breakdown"] = {}
    assert check_run(run, make_version()) == "Run is malformed"


@pytest.fixture
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    fake = FakeDb()
    monkeypatch.setattr(runs, "get_firestore_client", lambda: fake)
    return fake


def seed(db: FakeDb, run: dict) -> None:
    db.store["runs/run1"] = run
    db.store["scenarios/s1"] = {"id": "s1", "playCount": 3}
    db.store["scenarios/s1/versions/v1"] = make_version()


def test_validate_accepts_and_counts_the_play(client: TestClient, db: FakeDb) -> None:
    seed(db, make_run(get_settings().auth_dev_uid))

    response = client.post("/api/v1/runs/run1/validate")

    assert response.status_code == 200
    assert response.json() == {"runId": "run1", "validation": "accepted", "reason": None}
    assert db.store["runs/run1"]["validation"] == "accepted"
    assert db.store["scenarios/s1"]["playCount"] == 4


def test_validate_rejects_without_counting_the_play(client: TestClient, db: FakeDb) -> None:
    run = make_run(get_settings().auth_dev_uid)
    run["finalScore"] = 100.0
    seed(db, run)

    response = client.post("/api/v1/runs/run1/validate")

    assert response.json()["validation"] == "rejected"
    assert response.json()["reason"] == "Final score does not match the breakdown"
    assert db.store["scenarios/s1"]["playCount"] == 3


def test_validate_is_idempotent(client: TestClient, db: FakeDb) -> None:
    seed(db, make_run(get_settings().auth_dev_uid))

    client.post("/api/v1/runs/run1/validate")
    again = client.post("/api/v1/runs/run1/validate")

    assert again.json()["validation"] == "accepted"
    assert db.store["scenarios/s1"]["playCount"] == 4


def test_validate_refuses_someone_elses_run(client: TestClient, db: FakeDb) -> None:
    seed(db, make_run("another-player"))

    assert client.post("/api/v1/runs/run1/validate").status_code == 403
    assert db.store["runs/run1"]["validation"] == "pending"


def test_validate_unknown_run_is_404(client: TestClient, db: FakeDb) -> None:
    assert client.post("/api/v1/runs/nope/validate").status_code == 404
