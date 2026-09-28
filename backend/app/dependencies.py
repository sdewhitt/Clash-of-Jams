"""
Shared FastAPI dependencies.

The only one so far is authentication: the frontend signs in with the Firebase
Web SDK and sends the resulting ID token as `Authorization: Bearer <token>`;
this module verifies it and hands routes the caller's uid.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.schemas import CurrentUser

# auto_error=False so a missing header produces our own 401 rather than a 403.
bearer_scheme = HTTPBearer(auto_error=False)

_firebase_ready = False


def _ensure_firebase(settings: Settings) -> None:
    """Initialize the Admin SDK once, on first use."""
    global _firebase_ready
    if _firebase_ready:
        return

    import firebase_admin
    from firebase_admin import credentials

    if not firebase_admin._apps:
        cred = (
            credentials.Certificate(settings.google_application_credentials)
            if settings.google_application_credentials
            else credentials.ApplicationDefault()
        )
        firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id})
    _firebase_ready = True


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    """Resolve the caller, or raise 401."""
    if settings.auth_disabled:
        return CurrentUser(uid=settings.auth_dev_uid)

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from firebase_admin import auth as firebase_auth

    _ensure_firebase(settings)
    try:
        claims = firebase_auth.verify_id_token(credentials.credentials)
    except Exception as exc:  # invalid signature, expired, wrong project, ...
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return CurrentUser(uid=claims["uid"], email=claims.get("email"))


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
