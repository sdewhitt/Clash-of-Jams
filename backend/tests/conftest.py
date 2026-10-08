"""Test fixtures. Auth is disabled here, so routes see a fixed dev uid, and every
router talks to an in-memory Firestore instead of the real database."""

import importlib
import pkgutil

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from tests.fake_firestore import FakeFirestore


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("AUTH_DISABLED", "true")
    get_settings.cache_clear()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client

    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def fake_db(monkeypatch: pytest.MonkeyPatch) -> FakeFirestore:
    """Point every router at an in-memory Firestore, so no test can write to the real one.

    Applies to every test automatically; ask for it by name to seed or inspect the data.
    """
    import app.routers
    from app.routers import ratings

    db = FakeFirestore()
    for module_info in pkgutil.iter_modules(app.routers.__path__):
        module = importlib.import_module(f"app.routers.{module_info.name}")
        if hasattr(module, "db"):
            monkeypatch.setattr(module, "db", db)
    # The real @transactional wrapper drives a server-side transaction; run its body directly.
    monkeypatch.setattr(
        ratings, "upsert_review_transaction", ratings.upsert_review_transaction.to_wrap
    )
    return db


@pytest.fixture
def me(client: TestClient) -> str:
    """The uid every request is made as, while auth is disabled."""
    return get_settings().auth_dev_uid
