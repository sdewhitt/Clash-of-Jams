from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.schemas import Genre, Scenario


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_then_read_scenario(client: TestClient) -> None:
    created = client.post(
        "/api/v1/scenarios",
        json={"title": "Chromatic warmup", "instrument": "guitar", "genres": ["rock"]},
    )
    assert created.status_code == 201
    scenario_id = created.json()["id"]

    fetched = client.get(f"/api/v1/scenarios/{scenario_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Chromatic warmup"


def test_unknown_scenario_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/scenarios/nope").status_code == 404


def test_payloads_use_the_typescript_field_names(client: TestClient) -> None:
    """Requests and responses speak camelCase, matching schema/types.ts."""
    created = client.post(
        "/api/v1/scenarios",
        json={
            "title": "Ionian runs",
            "instrument": "piano",
            "authorDifficulty": 7,
        },
    )
    assert created.status_code == 201

    body = created.json()
    assert body["authorDifficulty"] == 7
    assert set(body) == {
        "id",
        "authorUid",
        "title",
        "description",
        "instrument",
        "genres",
        "visibility",
        "tags",
        "authorDifficulty",
        "playCount",
        "createdAt",
        "avgRating",
        "crowdDifficulty",
        "ratingCount",
        "currentVersionId",
        "currentVersionNumber",
        "updatedAt",
    }

    listed = client.get("/api/v1/scenarios")
    assert listed.status_code == 200
    assert all("authorUid" in scenario for scenario in listed.json())


def test_stored_scenario_with_unknown_genre_still_loads() -> None:
    """A stray genre in a Firestore document is dropped, not a 500 for the whole listing."""
    scenario = Scenario(
        id="abc",
        authorUid="uid",
        title="Blank genre",
        description="",
        instrument="piano",
        genres=["", "rock", "polka"],
        visibility="public",
        tags=[],
        authorDifficulty=1,
        createdAt=datetime.now(UTC),
        avgRating=None,
        crowdDifficulty=None,
        ratingCount=0,
        currentVersionId=None,
        currentVersionNumber=0,
        updatedAt=datetime.now(UTC),
    )
    assert scenario.genres == [Genre.ROCK]

    # Documents written before the field existed have no genres at all.
    stored = scenario.model_dump(by_alias=True)
    del stored["genres"]
    assert Scenario(**stored).genres == []


def test_create_rejects_unknown_genre(client: TestClient) -> None:
    response = client.post(
        "/api/v1/scenarios",
        json={"title": "Blank genre", "instrument": "piano", "genres": [""]},
    )
    assert response.status_code == 422


def test_openapi_advertises_the_camelcase_names(client: TestClient) -> None:
    """The generated client has to see the wire names, not the Python ones."""
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert "authorDifficulty" in schemas["ScenarioCreate"]["properties"]
    assert "authorUid" in schemas["Scenario"]["properties"]
