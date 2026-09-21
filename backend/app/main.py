"""
Application entry point.

Run it with:

    uvicorn app.main:app --reload

Routers are mounted under settings.api_prefix; /health sits outside it so probes
do not have to track the API version.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.routers import health, scenarios


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        debug=settings.debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(scenarios.router, prefix=settings.api_prefix)

    return app


app = create_app()
