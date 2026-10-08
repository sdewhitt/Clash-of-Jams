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
from app.routers import (
    health,
    leaderboards,
    matchmaking,
    multiplayer,
    ratings,
    runs,
    scenario_difficulty,
    scenarios,
    skill_ratings,
)
from app.services.matchmaking import MatchmakingService
from app.services.matchmaking_store import FirestoreMatchmakingStore
from app.services.multiplayer import SessionService
from app.services.multiplayer_store import FirestoreSessionStore
from app.services.multiplayer_transport import SessionHub


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

    sessions = SessionService(
        lambda: FirestoreSessionStore(get_firestore_client()),
        duration_seconds=settings.multiplayer_duration_seconds,
        recovery_seconds=settings.multiplayer_recovery_seconds,
        countdown_seconds=settings.multiplayer_countdown_seconds,
    )
    hub = SessionHub(sessions)

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

        async def update_sessions():
            while True:
                try:
                    await run_in_threadpool(sessions.tick)
                    for match_id in {channel.match_id for channel in hub.channels.values()}:
                        await hub.broadcast(match_id)
                except Exception:
                    logging.getLogger(__name__).exception("Session update failed")
                await asyncio.sleep(0.5)

        session_task = asyncio.create_task(update_sessions())
        try:
            yield
        finally:
            task.cancel()
            session_task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            await asyncio.gather(session_task, return_exceptions=True)

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        debug=settings.debug,
        lifespan=lifespan,
    )
    app.state.matchmaking = matchmaker
    app.state.sessions = sessions
    app.state.session_hub = hub

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(scenarios.router, prefix=settings.api_prefix)
    app.include_router(scenario_difficulty.router, prefix=settings.api_prefix)
    app.include_router(ratings.router, prefix=settings.api_prefix)
    app.include_router(leaderboards.router, prefix=settings.api_prefix)
    app.include_router(runs.router, prefix=settings.api_prefix)
    app.include_router(skill_ratings.router, prefix=settings.api_prefix)
    app.include_router(matchmaking.router, prefix=settings.api_prefix)
    app.include_router(multiplayer.router, prefix=settings.api_prefix)

    return app


app = create_app()
