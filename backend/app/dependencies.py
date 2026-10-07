"""
Shared FastAPI dependencies.

The only one so far is authentication: the frontend signs in with the Firebase
Web SDK and sends the resulting ID token as `Authorization: Bearer <token>`;
this module verifies it and hands routes the caller's uid and role.

The role comes from a `role` custom claim on the token, set with the Admin
SDK's set_custom_user_claims. A token without one is a standard user, and an
unrecognised value is treated the same way rather than failing the request.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.firebase import ensure_firebase
from app.schemas import CurrentUser, Role

# auto_error=False so a missing header produces our own 401 rather than a 403.
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    """Resolve the caller, or raise 401."""
    if settings.auth_disabled:
        return CurrentUser(uid=settings.auth_dev_uid, role=_parse_role(settings.auth_dev_role))

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from firebase_admin import auth as firebase_auth

    ensure_firebase()
    try:
        claims = firebase_auth.verify_id_token(credentials.credentials)
    except Exception as exc:  # invalid signature, expired, wrong project, ...
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return CurrentUser(
        uid=claims["uid"], email=claims.get("email"), role=_parse_role(claims.get("role"))
    )


def _parse_role(value: object) -> Role:
    try:
        return Role(value)
    except ValueError:
        return Role.USER


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_admin(user: CurrentUserDep) -> CurrentUser:
    """Resolve the caller, or raise 403 unless they hold an admin role."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


AdminUserDep = Annotated[CurrentUser, Depends(require_admin)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
