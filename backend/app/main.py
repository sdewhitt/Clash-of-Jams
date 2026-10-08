"""
Application entry point.

Run it with:

    uvicorn app.main:app --reload

Routers are mounted under settings.api_prefix; /health sits outside it so probes
do not have to track the API version.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from algs.matchmaking import MatchmakingPolicy
from app import __version__
from app.config import get_settings
from app.firebase import get_firestore_client
from app.routers import health, leaderboards, matchmaking, ratings, scenarios, skill_ratings
from app.services.matchmaking import MatchmakingService
from app.services.matchmaking_store import FirestoreMatchmakingStore


def create_app() -> FastAPI:
    settings = get_settings()

    matchmaker = MatchmakingService(
        lambda: FirestoreMatchmakingStore(get_firestore_client()),
        policy=MatchmakingPolicy(
            scenario_window=settings.matchmaking_scenario_window,
            difficulty_base_elo=settings.matchmaking_difficulty_base_elo,
            difficulty_elo_step=settings.matchmaking_difficulty_elo_step,
        ),
    )

    @asynccontextmanager
    async def lifespan(_app):
        async def match_queue():
            while True:
                try:
                    await run_in_threadpool(matchmaker.tick)
                except Exception:
                    logging.getLogger(__name__).exception("Matchmaking pass failed; queue retained")
                await asyncio.sleep(1)

        task = asyncio.create_task(match_queue())
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        debug=settings.debug,
        lifespan=lifespan,
    )
    app.state.matchmaking = matchmaker

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(scenarios.router, prefix=settings.api_prefix)
    app.include_router(ratings.router, prefix=settings.api_prefix)
    app.include_router(leaderboards.router, prefix=settings.api_prefix)
    app.include_router(skill_ratings.router, prefix=settings.api_prefix)
    app.include_router(matchmaking.router, prefix=settings.api_prefix)

    return app


app = create_app()
