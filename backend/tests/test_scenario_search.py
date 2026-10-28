"""
User story #15: the scenario search listing. Public scenarios are cached briefly and shared
by every caller; the caller's own are read fresh so a publish shows up for its author at once.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from tests.fake_firestore import FakeFirestore

T0 = datetime(2026, 9, 1, tzinfo=UTC)
URL = "/api/v1/scenarios/scenario_with_author"


def add_user(db: FakeFirestore, uid: str) -> None:
    db.put(f"users/{uid}", {"uid": uid, "displayName": f"Player {uid}"})


def add_scenario(db: FakeFirestore, sid: str, *, author: str, visibility: str = "public") -> None:
    db.put(f"scenarios/{sid}", {
        "id": sid, "authorUid": author, "title": f"Song {sid}", "description": "",
        "instrument": "piano", "genres": [], "visibility": visibility, "tags": [],
        "authorDifficulty": 4, "playCount": 0, "createdAt": T0, "updatedAt": T0,
        "avgRating": None, "crowdDifficulty": None, "ratingCount": 0,
        "currentVersionId": "v1", "currentVersionNumber": 1,
    })


def listed(client: TestClient) -> dict[str, str]:
    response = client.get(URL)
    assert response.status_code == 200
    return {row["scenario"]["id"]: row["authorName"] for row in response.json()}


def test_lists_public_and_own_with_author_names(
    client: TestClient, fake_db: FakeFirestore, me: str
):
    add_user(fake_db, "ada")
    add_user(fake_db, me)
    add_scenario(fake_db, "a1", author="ada")
    add_scenario(fake_db, "a2", author="ada")
    add_scenario(fake_db, "hidden", author="ada", visibility="private")
    add_scenario(fake_db, "mine", author=me, visibility="private")

    assert listed(client) == {"a1": "Player ada", "a2": "Player ada", "mine": f"Player {me}"}


def test_drops_scenarios_whose_author_has_no_profile(client: TestClient, fake_db: FakeFirestore):
    add_scenario(fake_db, "orphan", author="gone")

    assert listed(client) == {}


def test_public_list_is_cached_but_own_scenarios_are_fresh(
    client: TestClient, fake_db: FakeFirestore, me: str
):
    add_user(fake_db, "ada")
    add_user(fake_db, me)
    add_scenario(fake_db, "a1", author="ada")
    assert listed(client) == {"a1": "Player ada"}

    add_scenario(fake_db, "a2", author="ada")
    add_scenario(fake_db, "mine", author=me, visibility="private")

    assert listed(client) == {"a1": "Player ada", "mine": f"Player {me}"}
