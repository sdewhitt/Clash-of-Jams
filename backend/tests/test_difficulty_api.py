"""The synthetic demo uses the real HTTP contract without requiring a database."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.dependencies import get_current_user
from app.routers.scenario_difficulty import router
from app.schemas import CurrentUser


def application():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


def test_examples_require_authentication(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "false")
    get_settings.cache_clear()
    try:
        with TestClient(application()) as client:
            assert client.get("/api/v1/scenario-difficulty/examples").status_code == 401
    finally:
        get_settings.cache_clear()


def test_examples_are_explicitly_synthetic_and_cannot_be_published():
    app = application()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(uid="test-only")
    with TestClient(app) as client:
        url = "/api/v1/scenario-difficulty/examples"
        response = client.get(url)
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 5
        assert all(row["source"] == "synthetic" and not row["canPublish"] for row in rows)
        assert [row["estimate"]["label"] for row in rows] == [
            "Easy",
            "Medium",
            "Hard",
            "Provisional",
            "Provisional",
        ]
        assert rows == client.get(url).json()
        assert client.post(url).status_code == 405
