"""
User story #34: the caller's play history.

Runs against the in-memory Firestore from conftest's fake_db.
"""

from datetime import UTC, datetime

import pytest
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


def subscores(pitch: float = 80, rhythm: float = 70, completeness: float = 90) -> dict:
    return {
        "pitchAccuracy": pitch, "rhythmAccuracy": rhythm, "completeness": completeness,
        "notesHit": 9, "notesMissed": 1, "extraNotes": 2, "noteResults": [],
    }


def add_run(db: FakeFirestore, uid: str, *, played: int = 10, scenario_id: str = "scn",
            version: str = "v2", score: float = 80_000, instrument: str = "piano",
            validation: str = "accepted", match_id: str | None = None,
            breakdown: dict | None = None) -> str:
    run_id = f"run{len(db.docs)}"
    db.put(f"runs/{run_id}", {
        "userUid": uid, "scenarioId": scenario_id, "scenarioVersionId": version,
        "instrument": instrument, "finalScore": score, "validation": validation,
        "matchId": match_id, "playedAt": day(played),
        "breakdown": breakdown or subscores(),
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


# ------------------------------------------- score history for one scenario (#35)

SCENARIO_HISTORY = "/api/v1/history/scenarios/scn"


def scenario_history(client: TestClient, **params) -> dict:
    response = client.get(SCENARIO_HISTORY, params=params)
    assert response.status_code == 200
    return response.json()


def attempt_ids(body: dict) -> list[str]:
    return [attempt["runId"] for attempt in body["attempts"]]


def test_unknown_scenario_is_404(client, fake_db, me) -> None:
    assert client.get(SCENARIO_HISTORY).status_code == 404


def test_someone_elses_private_scenario_is_404(client, fake_db, me) -> None:
    add_scenario(fake_db, visibility="private")
    add_run(fake_db, me)

    assert client.get(SCENARIO_HISTORY).status_code == 404


def test_no_attempts_yet(client, fake_db, me) -> None:
    add_scenario(fake_db)

    assert scenario_history(client) == {"scenarioId": "scn", "stats": None, "attempts": []}


def test_only_the_callers_attempts_on_that_scenario(client, fake_db, me) -> None:
    add_scenario(fake_db)
    mine = add_run(fake_db, me)
    add_run(fake_db, me, scenario_id="other")
    add_run(fake_db, "someone-else")

    assert attempt_ids(scenario_history(client)) == [mine]


def test_each_attempt_carries_its_subscores(client, fake_db, me) -> None:
    add_scenario(fake_db)
    add_run(fake_db, me, breakdown=subscores(pitch=91.5, rhythm=72.25, completeness=100))

    attempt = scenario_history(client)["attempts"][0]

    assert attempt["breakdown"] == {
        "pitchAccuracy": 91.5, "rhythmAccuracy": 72.25, "completeness": 100,
        "notesHit": 9, "notesMissed": 1, "extraNotes": 2,
    }


def test_stats_match_hand_calculated_values(client, fake_db, me) -> None:
    add_scenario(fake_db)
    add_run(fake_db, me, played=1, score=60_000)
    add_run(fake_db, me, played=2, score=90_000)
    add_run(fake_db, me, played=3, score=80_000)
    add_run(fake_db, me, played=4, score=99_999, validation="rejected")  # listed, not counted

    body = scenario_history(client)

    assert len(body["attempts"]) == 4
    assert body["stats"] == {
        "attemptCount": 3,
        "bestScore": 90_000,
        "averageScore": 76_666.67,  # (60,000 + 90,000 + 80,000) / 3
        "mostRecentScore": 80_000,
        "firstScore": 60_000,
        "improvement": 20_000,  # 80,000 - 60,000
    }


def test_one_attempt_has_stats_but_no_improvement(client, fake_db, me) -> None:
    add_scenario(fake_db)
    add_run(fake_db, me, score=55_000)

    stats = scenario_history(client)["stats"]

    assert stats["attemptCount"] == 1
    assert stats["bestScore"] == stats["averageScore"] == stats["mostRecentScore"] == 55_000
    assert stats["improvement"] is None


@pytest.mark.parametrize(("sort", "order", "expected"), [
    ("date", "desc", ["c", "b", "a"]),
    ("date", "asc", ["a", "b", "c"]),
    ("score", "desc", ["b", "c", "a"]),
    ("score", "asc", ["a", "c", "b"]),
])
def test_sorting_by_date_and_score(client, fake_db, me, sort, order, expected) -> None:
    add_scenario(fake_db)
    ids = {
        "a": add_run(fake_db, me, played=1, score=70_000),
        "b": add_run(fake_db, me, played=2, score=90_000),
        "c": add_run(fake_db, me, played=3, score=80_000),
    }

    body = scenario_history(client, sort=sort, order=order)

    assert attempt_ids(body) == [ids[name] for name in expected]


def test_unknown_sort_is_rejected(client, fake_db, me) -> None:
    add_scenario(fake_db)

    assert client.get(SCENARIO_HISTORY, params={"sort": "instrument"}).status_code == 422


# ------------------------------------------------------ score trends over time (#33)

TRENDS = "/api/v1/history/trends"


def at(dom: int, hour: int = 16) -> datetime:
    return datetime(2026, 9, dom, hour, tzinfo=UTC)


def add_timed_run(db: FakeFirestore, uid: str, when: datetime, score: float, *,
                  scenario_id: str = "scn", instrument: str = "piano",
                  validation: str = "accepted") -> None:
    run_id = add_run(db, uid, scenario_id=scenario_id, score=score, instrument=instrument,
                     validation=validation)
    db.docs[f"runs/{run_id}"]["playedAt"] = when


def trends(client: TestClient, **params) -> dict:
    response = client.get(TRENDS, params=params)
    assert response.status_code == 200
    return response.json()


def points(body: dict) -> list[tuple[str, str, float]]:
    return [(p["scenarioId"], p["day"], p["bestScore"]) for p in body["points"]]


def test_no_runs_gives_no_points(client, fake_db, me) -> None:
    assert trends(client) == {"scenarios": [], "points": []}


def test_each_scenario_gets_its_best_and_average_per_day(client, fake_db, me) -> None:
    add_scenario(fake_db)
    add_timed_run(fake_db, me, at(1, 10), 60_000)
    add_timed_run(fake_db, me, at(1, 18), 90_000)
    add_timed_run(fake_db, me, at(1, 20), 75_000)
    add_timed_run(fake_db, me, at(3), 80_000)
    add_timed_run(fake_db, me, at(3), 99_999, validation="rejected")  # never counted
    add_timed_run(fake_db, "someone-else", at(2), 50_000)

    body = trends(client)

    assert body["points"] == [
        {"scenarioId": "scn", "day": "2026-09-01", "bestScore": 90_000,
         "averageScore": 75_000, "attempts": 3},
        {"scenarioId": "scn", "day": "2026-09-03", "bestScore": 80_000,
         "averageScore": 80_000, "attempts": 1},
    ]


def test_days_follow_the_players_timezone(client, fake_db, me) -> None:
    add_scenario(fake_db)
    add_timed_run(fake_db, me, at(2, 2), 70_000)  # 02:00 UTC is still the 1st in US Eastern

    assert points(trends(client)) == [("scn", "2026-09-02", 70_000)]
    assert points(trends(client, utc_offset_minutes=-240)) == [("scn", "2026-09-01", 70_000)]


def test_time_range_excludes_runs_outside_it(client, fake_db, me) -> None:
    add_scenario(fake_db)
    for dom in [1, 10, 20]:
        add_timed_run(fake_db, me, at(dom), dom * 1_000)

    body = trends(client, played_after="2026-09-05T00:00:00Z", played_before="2026-09-15T00:00:00Z")

    assert points(body) == [("scn", "2026-09-10", 10_000)]


def test_scenario_and_instrument_filters_keep_only_matching_runs(client, fake_db, me) -> None:
    add_scenario(fake_db, "a")
    add_scenario(fake_db, "b")
    add_timed_run(fake_db, me, at(1), 10_000, scenario_id="a", instrument="piano")
    add_timed_run(fake_db, me, at(2), 20_000, scenario_id="a", instrument="guitar")
    add_timed_run(fake_db, me, at(3), 30_000, scenario_id="b", instrument="piano")

    assert points(trends(client, scenario_id="a")) == [
        ("a", "2026-09-01", 10_000), ("a", "2026-09-02", 20_000),
    ]
    assert points(trends(client, instrument="piano")) == [
        ("a", "2026-09-01", 10_000), ("b", "2026-09-03", 30_000),
    ]
    assert points(trends(client, scenario_id="a", instrument="guitar")) == [
        ("a", "2026-09-02", 20_000),
    ]


def test_scenario_list_ignores_filters_and_lists_most_recent_first(client, fake_db, me) -> None:
    add_scenario(fake_db, "old")
    add_scenario(fake_db, "hidden", visibility="private")
    add_timed_run(fake_db, me, at(1), 10_000, scenario_id="old")
    add_timed_run(fake_db, me, at(5), 20_000, scenario_id="hidden")
    add_timed_run(fake_db, me, at(3), 30_000, scenario_id="deleted")

    body = trends(client, scenario_id="old")

    assert [(s["scenarioId"], s["title"]) for s in body["scenarios"]] == [
        ("hidden", None), ("deleted", None), ("old", "Warmup"),
    ]
    assert points(body) == [("old", "2026-09-01", 10_000)]


def test_unknown_instrument_is_rejected(client, fake_db, me) -> None:
    assert client.get(TRENDS, params={"instrument": "kazoo"}).status_code == 422

