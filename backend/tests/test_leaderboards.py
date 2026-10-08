"""
User stories #21 and #22: the scenario and ELO leaderboard routes.

Runs against the in-memory Firestore from conftest's fake_db.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from tests.fake_firestore import FakeFirestore

BOARD = "/api/v1/leaderboards/scn/scn_v1"


def day(dom: int) -> datetime:
    return datetime(2026, 9, dom, 16, tzinfo=UTC)


def add_user(db: FakeFirestore, uid: str, *, public: bool = True, banned: bool = False,
             restricted: bool = False) -> None:
    db.put(f"users/{uid}", {
        "uid": uid, "displayName": f"Player {uid}", "isProfilePublic": public,
        "isBanned": banned, "isSocialRestricted": restricted,
    })


def add_run(db: FakeFirestore, uid: str, score: int, played: int = 10, *, speed: float = 1,
            validation: str = "accepted") -> None:
    db.put(f"runs/run{len(db.docs)}", {
        "userUid": uid, "scenarioId": "scn", "scenarioVersionId": "scn_v1", "finalScore": score,
        "speedMultiplier": speed, "validation": validation, "playedAt": day(played),
    })


def add_elo(db: FakeFirestore, uid: str, elo: int, instrument: str = "piano") -> None:
    db.put(f"users/{uid}/skillRatings/{instrument}", {
        "uid": uid, "instrument": instrument, "elo": elo, "updatedAt": day(1),
    })


def ranks(body: dict) -> list[tuple[str, int]]:
    return [(e["uid"], e["ranking"]) for e in body["entries"]]


# ------------------------------------------------------ scenario leaderboard


def test_empty_board(client: TestClient, fake_db, me) -> None:
    body = client.get(BOARD).json()

    assert body["entries"] == []
    assert body["myEntry"] is None
    assert body["totalPlayers"] == 0
    assert body["percentile"] is None


def test_best_run_per_player_sorted_descending_ties_share_a_rank(client, fake_db, me) -> None:
    for uid in "abcd":
        add_user(fake_db, uid)
    add_run(fake_db, "a", 99_000)
    add_run(fake_db, "a", 80_000)  # a's worse run is hidden
    add_run(fake_db, "b", 95_000)
    add_run(fake_db, "c", 95_000)
    add_run(fake_db, "d", 90_000)

    body = client.get(BOARD).json()

    assert ranks(body) == [("a", 1), ("b", 2), ("c", 2), ("d", 4)]
    assert [e["key"] for e in body["entries"]] == [99_000, 95_000, 95_000, 90_000]


def test_hidden_players_and_runs_that_do_not_count_are_left_off(client, fake_db, me) -> None:
    add_user(fake_db, "ok")
    add_user(fake_db, "banned", banned=True)
    add_user(fake_db, "restricted", restricted=True)
    add_user(fake_db, "private", public=False)
    for uid in ["banned", "restricted", "private"]:
        add_run(fake_db, uid, 99_000)
    add_run(fake_db, "ok", 50_000)
    add_run(fake_db, "ok", 99_999, speed=0.5)
    add_run(fake_db, "ok", 99_998, validation="pending")
    add_run(fake_db, "ok", 99_997, validation="rejected")

    body = client.get(BOARD).json()

    assert ranks(body) == [("ok", 1)]
    assert body["entries"][0]["key"] == 50_000


def test_a_private_caller_still_sees_themselves(client, fake_db, me) -> None:
    add_user(fake_db, me, public=False)
    add_run(fake_db, me, 70_000)

    assert ranks(client.get(BOARD).json()) == [(me, 1)]


def test_caller_outside_the_top_25_gets_rank_and_percentile(client, fake_db, me) -> None:
    for i in range(30):
        add_user(fake_db, f"p{i}")
        add_run(fake_db, f"p{i}", 99_000 - i * 100)
    add_user(fake_db, me)
    add_run(fake_db, me, 10_000)

    body = client.get(BOARD).json()

    assert len(body["entries"]) == 25
    assert me not in [e["uid"] for e in body["entries"]]
    assert body["myEntry"]["ranking"] == 31
    assert body["totalPlayers"] == 31
    assert body["percentile"] == pytest.approx(31 / 31)


def test_date_range_ranks_each_players_best_run_inside_it(client, fake_db, me) -> None:
    for uid in ["a", "b", me]:
        add_user(fake_db, uid)
    add_run(fake_db, "a", 99_000, played=5)   # outside the range
    add_run(fake_db, "a", 60_000, played=18)  # a's best inside it
    add_run(fake_db, "b", 90_000, played=27)  # outside the range
    add_run(fake_db, me, 80_000, played=20)

    all_time = client.get(BOARD).json()
    ranged = client.get(BOARD, params={
        "played_after": "2026-09-16T00:00:00Z", "played_before": "2026-09-24T00:00:00Z",
    }).json()

    assert all_time["myEntry"]["ranking"] == 3
    assert ranks(ranged) == [(me, 1), ("a", 2)]
    assert ranged["entries"][1]["key"] == 60_000
    # The slider's bounds always cover every run, so they don't shrink as the range narrows.
    assert ranged["earliestPlayedAt"] == all_time["earliestPlayedAt"]
    assert ranged["latestPlayedAt"] == all_time["latestPlayedAt"]


# ----------------------------------------------------------- ELO leaderboard


def elo_board(client: TestClient, instrument: str = "piano", **params) -> dict:
    params = {"instrument": instrument, **params}
    return client.get("/api/v1/leaderboards/elo", params=params).json()


def test_elo_sorted_descending_with_ties_sharing_a_rank(client, fake_db, me) -> None:
    for uid, elo in [("a", 1200), ("b", 2400), ("c", 1800), ("d", 1800)]:
        add_user(fake_db, uid)
        add_elo(fake_db, uid, elo)

    body = elo_board(client)

    assert ranks(body) == [("b", 1), ("c", 2), ("d", 2), ("a", 4)]
    assert body["entries"][0]["skillRating"]["elo"] == 2400


def test_elo_board_only_counts_players_rated_on_that_instrument(client, fake_db, me) -> None:
    add_user(fake_db, me)
    add_elo(fake_db, me, 1500, "piano")
    add_user(fake_db, "singer")
    add_elo(fake_db, "singer", 900, "vocals")

    body = elo_board(client, "vocals")

    assert ranks(body) == [("singer", 1)]
    assert body["myEntry"] is None  # unrated on vocals, so "play a match to get ranked"
    assert body["percentile"] is None


def test_elo_board_leaves_off_banned_restricted_and_private_players(client, fake_db, me) -> None:
    add_user(fake_db, "ok")
    add_user(fake_db, "banned", banned=True)
    add_user(fake_db, "restricted", restricted=True)
    add_user(fake_db, "private", public=False)
    for uid in ["ok", "banned", "restricted", "private"]:
        add_elo(fake_db, uid, 1000)

    assert ranks(elo_board(client)) == [("ok", 1)]


def test_caller_outside_the_top_100_gets_rank_and_percentile(client, fake_db, me) -> None:
    for i in range(105):
        add_user(fake_db, f"p{i}")
        add_elo(fake_db, f"p{i}", 2400 - i)
    add_user(fake_db, me)
    add_elo(fake_db, me, 1000)
    add_user(fake_db, "below")
    add_elo(fake_db, "below", 500)

    body = elo_board(client)

    assert len(body["entries"]) == 100
    assert body["myEntry"]["ranking"] == 106
    assert body["totalPlayers"] == 107
    assert body["percentile"] == pytest.approx(106 / 107)


def test_elo_requires_a_known_instrument(client, fake_db, me) -> None:
    assert client.get("/api/v1/leaderboards/elo", params={"instrument": "kazoo"}).status_code == 422
