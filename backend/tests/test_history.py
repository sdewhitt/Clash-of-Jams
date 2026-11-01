"""
User story #34: the caller's play history.

Runs against the in-memory Firestore from conftest's fake_db.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from tests.fake_firestore import FakeFirestore

HISTORY = "/api/v1/history"


def day(dom: int) -> datetime:
    return datetime(2026, 9, dom, 16, tzinfo=UTC)


def add_scenario(db: FakeFirestore, scenario_id: str = "scn", *, version: str = "v2",
                 visibility: str = "public", author: str = "author") -> None:
    db.put(f"scenarios/{scenario_id}", {
        "title": "Warmup", "visibility": visibility, "authorUid": author,
        "currentVersionId": version,
    })


def add_run(db: FakeFirestore, uid: str, *, played: int = 10, scenario_id: str = "scn",
            version: str = "v2", score: float = 80_000, instrument: str = "piano",
            validation: str = "accepted", match_id: str | None = None) -> str:
    run_id = f"run{len(db.docs)}"
    db.put(f"runs/{run_id}", {
        "userUid": uid, "scenarioId": scenario_id, "scenarioVersionId": version,
        "instrument": instrument, "finalScore": score, "validation": validation,
        "matchId": match_id, "playedAt": day(played),
    })
    return run_id


def history(client: TestClient, **params) -> dict:
    response = client.get(HISTORY, params=params)
    assert response.status_code == 200
    return response.json()


def run_ids(body: dict) -> list[str]:
    return [entry["runId"] for entry in body["entries"]]


def test_no_runs_gives_an_empty_history(client, fake_db, me) -> None:
    assert history(client) == {"entries": [], "nextBefore": None}


def test_runs_come_back_newest_first_with_their_details(client, fake_db, me) -> None:
    add_scenario(fake_db)
    old = add_run(fake_db, me, played=3, score=50_000)
    new = add_run(fake_db, me, played=20, score=90_000, instrument="guitar")

    body = history(client)

    assert run_ids(body) == [new, old]
    latest = body["entries"][0]
    assert latest["scenarioTitle"] == "Warmup"
    assert latest["instrument"] == "guitar"
    assert latest["finalScore"] == 90_000
    assert latest["playedAt"].startswith("2026-09-20")
    assert latest["scenarioAvailable"] is True
    assert latest["isCurrentVersion"] is True


def test_only_the_callers_runs_are_returned(client, fake_db, me) -> None:
    add_scenario(fake_db)
    mine = add_run(fake_db, me)
    add_run(fake_db, "someone-else")

    assert run_ids(history(client)) == [mine]


def test_every_attempt_is_listed_including_rejected_and_match_runs(client, fake_db, me) -> None:
    add_scenario(fake_db)
    first = add_run(fake_db, me, played=1)
    rejected = add_run(fake_db, me, played=2, validation="rejected")
    match = add_run(fake_db, me, played=3, match_id="m1")

    body = history(client)

    assert run_ids(body) == [match, rejected, first]
    validations = [entry["validation"] for entry in body["entries"]]
    assert validations == ["accepted", "rejected", "accepted"]
    assert body["entries"][0]["matchId"] == "m1"


def test_deleted_and_hidden_scenarios_are_unavailable(client, fake_db, me) -> None:
    add_scenario(fake_db, "hidden", visibility="private")
    add_scenario(fake_db, "mine", visibility="private", author=me)
    add_run(fake_db, me, scenario_id="deleted", played=1)
    add_run(fake_db, me, scenario_id="hidden", played=2)
    add_run(fake_db, me, scenario_id="mine", played=3)

    entries = {entry["scenarioId"]: entry for entry in history(client)["entries"]}

    for scenario_id in ["deleted", "hidden"]:
        assert entries[scenario_id]["scenarioAvailable"] is False
        assert entries[scenario_id]["scenarioTitle"] is None
        assert entries[scenario_id]["isCurrentVersion"] is False
    assert entries["mine"]["scenarioAvailable"] is True
    assert entries["mine"]["scenarioTitle"] == "Warmup"


def test_runs_on_an_older_version_are_flagged(client, fake_db, me) -> None:
    add_scenario(fake_db, version="v2")
    add_run(fake_db, me, version="v1")

    entry = history(client)["entries"][0]

    assert entry["scenarioAvailable"] is True
    assert entry["isCurrentVersion"] is False


def test_history_pages_through_every_run(client, fake_db, me) -> None:
    add_scenario(fake_db)
    runs = [add_run(fake_db, me, played=dom) for dom in range(1, 6)]

    first = history(client, limit=2)
    second = history(client, limit=2, before=first["nextBefore"])
    last = history(client, limit=2, before=second["nextBefore"])

    assert run_ids(first) == [runs[4], runs[3]]
    assert run_ids(second) == [runs[2], runs[1]]
    assert run_ids(last) == [runs[0]]
    assert last["nextBefore"] is None


def test_limit_is_bounded(client, fake_db, me) -> None:
    assert client.get(HISTORY, params={"limit": 0}).status_code == 422
    assert client.get(HISTORY, params={"limit": 101}).status_code == 422
