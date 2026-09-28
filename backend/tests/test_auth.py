"""
User story #67: server-side token verification and the admin/standard split.

Most tests swap firebase_admin's verify_id_token for a fake keyed by token
string, so they need no network or credentials. The forged-token tests run the
real verifier, which rejects them before it would fetch Google's signing keys.
"""

import base64
import json
from collections.abc import Iterator

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth

from app import dependencies
from app.config import get_settings
from app.dependencies import AdminUserDep, CurrentUserDep
from app.schemas import CurrentUser, Role

VALID_TOKENS = {
    "standard-token": {"uid": "user-1", "email": "user@example.com"},
    "admin-token": {"uid": "admin-1", "email": "admin@example.com", "role": "admin"},
    "moderator-token": {"uid": "mod-1", "role": "moderator"},
    "odd-role-token": {"uid": "user-2", "role": "superuser"},
}


def fake_verify_id_token(token: str, *args: object, **kwargs: object) -> dict:
    if token == "expired-token":
        raise firebase_auth.ExpiredIdTokenError("Token expired", cause=None)
    if token == "revoked-token":
        raise firebase_auth.RevokedIdTokenError("Token revoked")
    if token in VALID_TOKENS:
        return VALID_TOKENS[token]
    raise firebase_auth.InvalidIdTokenError("Invalid token")


# Test-only routes: the app has no admin endpoint yet, and these expose exactly
# what the auth dependencies resolved.
probe = APIRouter(prefix="/api/v1/_test")


@probe.get("/whoami")
def whoami(user: CurrentUserDep) -> dict:
    return {"uid": user.uid, "email": user.email, "role": user.role, "isAdmin": user.is_admin}


@probe.post("/admin-only")
def admin_only(user: AdminUserDep) -> dict:
    return {"uid": user.uid}


def make_client(monkeypatch: pytest.MonkeyPatch, *, auth_disabled: bool) -> Iterator[TestClient]:
    monkeypatch.setenv("AUTH_DISABLED", "true" if auth_disabled else "false")
    get_settings.cache_clear()

    from app.main import create_app

    app = create_app()
    app.include_router(probe)
    with TestClient(app) as test_client:
        yield test_client

    get_settings.cache_clear()


@pytest.fixture
def auth_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Auth enabled, with the Admin SDK's verifier faked."""
    monkeypatch.setattr(dependencies, "_ensure_firebase", lambda settings: None)
    monkeypatch.setattr(firebase_auth, "verify_id_token", fake_verify_id_token)
    yield from make_client(monkeypatch, auth_disabled=False)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------ sessions


def test_valid_token_resolves_the_caller(auth_client: TestClient) -> None:
    response = auth_client.get("/api/v1/_test/whoami", headers=bearer("standard-token"))

    assert response.status_code == 200
    assert response.json() == {
        "uid": "user-1",
        "email": "user@example.com",
        "role": "user",
        "isAdmin": False,
    }


def test_valid_token_reaches_a_real_protected_route(auth_client: TestClient) -> None:
    created = auth_client.post(
        "/api/v1/scenarios",
        json={"title": "Scales", "instrument": "piano"},
        headers=bearer("standard-token"),
    )

    assert created.status_code == 201
    assert created.json()["authorUid"] == "user-1"


@pytest.mark.parametrize("token", ["expired-token", "revoked-token", "garbage"])
def test_invalid_or_expired_token_is_rejected(auth_client: TestClient, token: str) -> None:
    response = auth_client.get("/api/v1/scenarios", headers=bearer(token))

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_missing_token_is_rejected(auth_client: TestClient) -> None:
    response = auth_client.get("/api/v1/scenarios")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_non_bearer_scheme_is_rejected(auth_client: TestClient) -> None:
    response = auth_client.get("/api/v1/scenarios", headers={"Authorization": "Basic abc"})

    assert response.status_code == 401


def test_request_after_sign_out_is_rejected(auth_client: TestClient) -> None:
    """Signing out drops the token client-side, so the next call carries none."""
    signed_in = auth_client.get("/api/v1/scenarios", headers=bearer("standard-token"))
    assert signed_in.status_code == 200

    signed_out = auth_client.get("/api/v1/scenarios")
    assert signed_out.status_code == 401


def test_health_needs_no_token(auth_client: TestClient) -> None:
    assert auth_client.get("/health").status_code == 200


# ----------------------------------------------------------------- roles


@pytest.mark.parametrize(
    ("token", "role", "is_admin"),
    [
        ("admin-token", "admin", True),
        ("moderator-token", "moderator", True),
        ("standard-token", "user", False),
        ("odd-role-token", "user", False),
    ],
)
def test_role_claim_resolves_admin_or_standard(
    auth_client: TestClient, token: str, role: str, is_admin: bool
) -> None:
    body = auth_client.get("/api/v1/_test/whoami", headers=bearer(token)).json()

    assert body["role"] == role
    assert body["isAdmin"] is is_admin


def test_standard_user_is_denied_an_admin_operation(auth_client: TestClient) -> None:
    response = auth_client.post("/api/v1/_test/admin-only", headers=bearer("standard-token"))

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin role required"


def test_admin_may_call_an_admin_operation(auth_client: TestClient) -> None:
    response = auth_client.post("/api/v1/_test/admin-only", headers=bearer("admin-token"))

    assert response.status_code == 200
    assert response.json() == {"uid": "admin-1"}


def test_admin_operation_without_a_token_is_401_not_403(auth_client: TestClient) -> None:
    assert auth_client.post("/api/v1/_test/admin-only").status_code == 401


def test_current_user_defaults_to_standard() -> None:
    user = CurrentUser(uid="someone")
    assert user.role is Role.USER
    assert not user.is_admin


def test_dev_role_setting_applies_when_auth_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH_DEV_ROLE", "admin")
    for client in make_client(monkeypatch, auth_disabled=True):
        body = client.get("/api/v1/_test/whoami").json()
        assert body["role"] == "admin"
        assert client.post("/api/v1/_test/admin-only").status_code == 200


# -------------------------------------------------------- forged tokens


def _b64(data: dict) -> str:
    raw = json.dumps(data).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _forged_token(header: dict, signature: str = "") -> str:
    project = get_settings().firebase_project_id
    payload = {
        "iss": f"https://securetoken.google.com/{project}",
        "aud": project,
        "sub": "attacker",
        "uid": "attacker",
        "role": "admin",
        "iat": 1_700_000_000,
        "exp": 4_000_000_000,
    }
    return f"{_b64(header)}.{_b64(payload)}.{signature}"


@pytest.fixture
def real_verifier_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Auth enabled with the genuine Admin SDK verifier.

    A throwaway app with a fixed project id stands in for real credentials;
    the tokens below are rejected on their headers, before any key fetch.
    """
    import firebase_admin
    from firebase_admin import credentials

    class _NoCredential(credentials.Base):
        def get_credential(self) -> None:
            return None

    app = None
    if not firebase_admin._apps:
        app = firebase_admin.initialize_app(
            _NoCredential(), {"projectId": get_settings().firebase_project_id}
        )
    monkeypatch.setattr(dependencies, "_ensure_firebase", lambda settings: None)
    yield from make_client(monkeypatch, auth_disabled=False)
    if app is not None:
        firebase_admin.delete_app(app)


@pytest.mark.parametrize(
    "token",
    [
        _forged_token({"alg": "none", "typ": "JWT"}),
        _forged_token({"alg": "HS256", "kid": "forged", "typ": "JWT"}, "c2lnbmF0dXJl"),
        "not-even-a-jwt",
    ],
    ids=["unsigned", "wrong-algorithm", "malformed"],
)
def test_forged_token_fails_real_verification(real_verifier_client: TestClient, token: str) -> None:
    response = real_verifier_client.post("/api/v1/_test/admin-only", headers=bearer(token))

    assert response.status_code == 401
