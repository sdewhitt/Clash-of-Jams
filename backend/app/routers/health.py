"""Liveness probe. No auth, so deployment checks can hit it directly."""

from fastapi import APIRouter

from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    from app import __version__
    from app.config import get_settings

    return HealthResponse(status="ok", app=get_settings().app_name, version=__version__)
