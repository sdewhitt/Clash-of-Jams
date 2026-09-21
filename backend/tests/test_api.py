from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_then_read_scenario(client: TestClient) -> None:
    created = client.post(
        "/api/v1/scenarios",
        json={"title": "Chromatic warmup", "instrument": "guitar"},
    )
    assert created.status_code == 201
    scenario_id = created.json()["id"]

    fetched = client.get(f"/api/v1/scenarios/{scenario_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Chromatic warmup"


def test_unknown_scenario_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/scenarios/nope").status_code == 404
