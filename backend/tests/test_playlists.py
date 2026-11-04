"""
User story #36: creating, renaming, sharing and deleting playlists.

Runs against the in-memory Firestore from conftest's fake_db.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from tests.fake_firestore import FakeFirestore

PLAYLISTS = "/api/v1/playlists"


def create(client: TestClient, name: str = "Warmups", **fields) -> dict:
    response = client.post(PLAYLISTS, json={"name": name, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def add_playlist(db: FakeFirestore, playlist_id: str, owner: str, *, public: bool = False,
                 updated: int = 1, scenarios: list[str] | None = None) -> None:
    when = datetime(2026, 9, updated, tzinfo=UTC)
    db.put(f"playlists/{playlist_id}", {
        "id": playlist_id, "ownerUid": owner, "name": playlist_id, "description": "",
        "isPublic": public, "scenarioIds": scenarios or [], "createdAt": when, "updatedAt": when,
    })


def add_scenario(db: FakeFirestore, scenario_id: str, *, visibility: str = "public",
                 author: str = "author") -> None:
    db.put(f"scenarios/{scenario_id}", {
        "title": scenario_id.title(), "visibility": visibility, "authorUid": author,
    })


def order(db: FakeFirestore, playlist_id: str = "mine") -> list[str]:
    return db.data(f"playlists/{playlist_id}")["scenarioIds"]


# ------------------------------------------------------------- create


def test_creating_a_playlist_stores_it_under_the_caller_with_no_scenarios(
    client, fake_db, me
) -> None:
    body = create(client, "Warmups", description="Before practice")

    assert (body["ownerUid"], body["name"], body["scenarioIds"]) == (me, "Warmups", [])
    assert body["isPublic"] is False
    stored = fake_db.data(f"playlists/{body['id']}")
    assert (stored["ownerUid"], stored["scenarioIds"]) == (me, [])
    assert stored["description"] == "Before practice"


def test_playlist_names_are_trimmed(client, me) -> None:
    assert create(client, "  Warmups  ")["name"] == "Warmups"


@pytest.mark.parametrize("name", ["", "   "])
def test_a_playlist_with_an_empty_name_is_rejected(client, fake_db, me, name) -> None:
    response = client.post(PLAYLISTS, json={"name": name})

    assert response.status_code == 422
    assert fake_db.paths("playlists") == []


def test_a_playlist_name_over_60_characters_is_rejected(client, me) -> None:
    assert client.post(PLAYLISTS, json={"name": "x" * 61}).status_code == 422


# ------------------------------------------------------------- read


def test_listing_shows_only_my_playlists_alphabetically(client, fake_db, me) -> None:
    # Updated order (zebra newest) differs from name order, so only a name sort passes.
    add_playlist(fake_db, "zebra", me, updated=5)
    add_playlist(fake_db, "apple", me, updated=1)
    add_playlist(fake_db, "mango", me, updated=3)
    add_playlist(fake_db, "theirs", "someone-else", public=True)

    body = client.get(PLAYLISTS).json()

    assert [playlist["id"] for playlist in body] == ["apple", "mango", "zebra"]


def test_anyone_can_open_a_shared_playlist(client, fake_db, me) -> None:
    add_playlist(fake_db, "shared", "someone-else", public=True)

    response = client.get(f"{PLAYLISTS}/shared")

    assert response.status_code == 200
    assert response.json()["ownerUid"] == "someone-else"


def test_someone_elses_private_playlist_is_404(client, fake_db, me) -> None:
    add_playlist(fake_db, "private", "someone-else")

    assert client.get(f"{PLAYLISTS}/private").status_code == 404


def test_a_missing_playlist_is_404(client, me) -> None:
    assert client.get(f"{PLAYLISTS}/nope").status_code == 404


# ------------------------------------------------------------- update


def test_renaming_changes_only_the_name(client, fake_db, me) -> None:
    playlist = create(client, "Warmups", description="Before practice")

    response = client.patch(f"{PLAYLISTS}/{playlist['id']}", json={"name": "Cooldowns"})

    assert response.status_code == 200
    stored = fake_db.data(f"playlists/{playlist['id']}")
    assert (stored["name"], stored["description"]) == ("Cooldowns", "Before practice")
    assert response.json()["name"] == "Cooldowns"
    assert stored["updatedAt"] >= stored["createdAt"]


def test_sharing_a_playlist_makes_it_public(client, fake_db, me) -> None:
    playlist = create(client)

    client.patch(f"{PLAYLISTS}/{playlist['id']}", json={"isPublic": True})

    assert fake_db.data(f"playlists/{playlist['id']}")["isPublic"] is True


def test_renaming_to_an_empty_name_is_rejected(client, fake_db, me) -> None:
    playlist = create(client, "Warmups")

    response = client.patch(f"{PLAYLISTS}/{playlist['id']}", json={"name": "  "})

    assert response.status_code == 422
    assert fake_db.data(f"playlists/{playlist['id']}")["name"] == "Warmups"


def test_i_cannot_edit_someone_elses_shared_playlist(client, fake_db, me) -> None:
    add_playlist(fake_db, "shared", "someone-else", public=True)

    response = client.patch(f"{PLAYLISTS}/shared", json={"name": "Mine now"})

    assert response.status_code == 403
    assert fake_db.data("playlists/shared")["name"] == "shared"


def test_i_cannot_edit_someone_elses_private_playlist(client, fake_db, me) -> None:
    add_playlist(fake_db, "private", "someone-else")

    assert client.patch(f"{PLAYLISTS}/private", json={"name": "Mine now"}).status_code == 404


# ------------------------------------------------------------- delete


def test_deleting_my_playlist_removes_it(client, fake_db, me) -> None:
    playlist = create(client)

    response = client.delete(f"{PLAYLISTS}/{playlist['id']}")

    assert response.status_code == 204
    assert fake_db.paths("playlists") == []


def test_i_cannot_delete_someone_elses_playlist(client, fake_db, me) -> None:
    add_playlist(fake_db, "shared", "someone-else", public=True)

    assert client.delete(f"{PLAYLISTS}/shared").status_code == 403
    assert fake_db.data("playlists/shared") is not None


# ------------------------------------------------------------- add


def test_adding_a_scenario_appends_it_to_the_end(client, fake_db, me) -> None:
    add_scenario(fake_db, "warmup")
    add_scenario(fake_db, "scales")
    add_playlist(fake_db, "mine", me, scenarios=["warmup"])

    response = client.post(f"{PLAYLISTS}/mine/scenarios", json={"scenarioId": "scales"})

    assert response.status_code == 201
    assert order(fake_db) == ["warmup", "scales"]
    assert [entry["title"] for entry in response.json()["entries"]] == ["Warmup", "Scales"]


def test_adding_the_same_scenario_twice_is_rejected(client, fake_db, me) -> None:
    add_scenario(fake_db, "warmup")
    add_playlist(fake_db, "mine", me, scenarios=["warmup"])

    response = client.post(f"{PLAYLISTS}/mine/scenarios", json={"scenarioId": "warmup"})

    assert response.status_code == 409
    assert order(fake_db) == ["warmup"]


@pytest.mark.parametrize("visibility", ["private", None])
def test_only_a_scenario_i_can_play_can_be_added(client, fake_db, me, visibility) -> None:
    if visibility:
        add_scenario(fake_db, "hidden", visibility=visibility)
    add_playlist(fake_db, "mine", me)

    response = client.post(f"{PLAYLISTS}/mine/scenarios", json={"scenarioId": "hidden"})

    assert response.status_code == 404
    assert order(fake_db) == []


def test_i_can_add_my_own_private_scenario(client, fake_db, me) -> None:
    add_scenario(fake_db, "draft", visibility="private", author=me)
    add_playlist(fake_db, "mine", me)

    response = client.post(f"{PLAYLISTS}/mine/scenarios", json={"scenarioId": "draft"})

    assert response.status_code == 201


def test_i_cannot_add_to_someone_elses_playlist(client, fake_db, me) -> None:
    add_scenario(fake_db, "warmup")
    add_playlist(fake_db, "theirs", "someone-else", public=True)

    response = client.post(f"{PLAYLISTS}/theirs/scenarios", json={"scenarioId": "warmup"})

    assert response.status_code == 403
    assert order(fake_db, "theirs") == []


# ------------------------------------------------------------- remove


def test_removing_a_scenario_keeps_the_order_of_the_rest(client, fake_db, me) -> None:
    add_playlist(fake_db, "mine", me, scenarios=["a", "b", "c", "d"])

    response = client.delete(f"{PLAYLISTS}/mine/scenarios/b")

    assert response.status_code == 200
    assert order(fake_db) == ["a", "c", "d"]


def test_removing_a_scenario_that_is_not_there_is_404(client, fake_db, me) -> None:
    add_playlist(fake_db, "mine", me, scenarios=["a"])

    assert client.delete(f"{PLAYLISTS}/mine/scenarios/zzz").status_code == 404
    assert order(fake_db) == ["a"]


def test_i_cannot_remove_from_someone_elses_playlist(client, fake_db, me) -> None:
    add_playlist(fake_db, "theirs", "someone-else", public=True, scenarios=["a"])

    assert client.delete(f"{PLAYLISTS}/theirs/scenarios/a").status_code == 403
    assert order(fake_db, "theirs") == ["a"]


# ------------------------------------------------------------- reorder


def test_reordering_saves_the_new_order(client, fake_db, me) -> None:
    add_playlist(fake_db, "mine", me, scenarios=["a", "b", "c"])

    response = client.put(f"{PLAYLISTS}/mine/scenarios", json={"scenarioIds": ["c", "a", "b"]})

    assert response.status_code == 200
    assert order(fake_db) == ["c", "a", "b"]


@pytest.mark.parametrize("new_order", [
    ["a", "b"],            # drops one
    ["a", "b", "c", "x"],  # adds one
    ["a", "a", "b"],       # duplicates one
])
def test_a_reorder_must_keep_exactly_the_same_scenarios(client, fake_db, me, new_order) -> None:
    add_playlist(fake_db, "mine", me, scenarios=["a", "b", "c"])

    response = client.put(f"{PLAYLISTS}/mine/scenarios", json={"scenarioIds": new_order})

    assert response.status_code == 400
    assert order(fake_db) == ["a", "b", "c"]


# ------------------------------------------------------------- entries


def test_a_deleted_or_private_scenario_still_loads_as_unavailable(client, fake_db, me) -> None:
    add_scenario(fake_db, "warmup")
    add_scenario(fake_db, "secret", visibility="private")
    add_playlist(fake_db, "mine", me, scenarios=["warmup", "gone", "secret"])

    response = client.get(f"{PLAYLISTS}/mine")

    assert response.status_code == 200
    assert response.json()["entries"] == [
        {"scenarioId": "warmup", "title": "Warmup", "available": True},
        {"scenarioId": "gone", "title": None, "available": False},
        {"scenarioId": "secret", "title": None, "available": False},
    ]


def test_an_empty_playlist_has_no_entries(client, fake_db, me) -> None:
    add_playlist(fake_db, "mine", me)

    assert client.get(f"{PLAYLISTS}/mine").json()["entries"] == []
