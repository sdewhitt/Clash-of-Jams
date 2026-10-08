"""Authenticated snapshots and first-frame WebSocket authentication."""

import asyncio
import json
import logging
from time import perf_counter
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.dependencies import AdminUserDep, CurrentUserDep, get_current_user
from app.services.matchmaking_store import MatchmakingError
from app.services.multiplayer_models import EventReply, SessionEvent, SessionSnapshot
from app.services.multiplayer_transport import Channel

router = APIRouter(prefix="/multiplayer", tags=["multiplayer"])
logger = logging.getLogger(__name__)


def get_sessions(request: Request):
    return request.app.state.sessions


@router.get("/metrics")
def metrics(_user: AdminUserDep, request: Request):
    return request.app.state.session_hub.metrics.report()


@router.get("/{match_id}", response_model=SessionSnapshot)
def snapshot(
    match_id: str, user: CurrentUserDep, sessions: Annotated[object, Depends(get_sessions)]
):
    try:
        return sessions.snapshot(match_id, user.uid)
    except MatchmakingError as error:
        raise HTTPException(error.status, str(error)) from error


@router.websocket("/{match_id}/socket")
async def session_socket(socket: WebSocket, match_id: str):
    settings = get_settings()
    origin = socket.headers.get("origin")
    if origin is not None and origin not in settings.cors_origins:
        await socket.close(code=1008)
        return
    await socket.accept()
    hub = socket.app.state.session_hub
    sessions = socket.app.state.sessions
    channel = writer = None
    try:
        # Browser WebSockets cannot set Authorization headers. Never put tokens in URLs.
        raw = await asyncio.wait_for(socket.receive_text(), timeout=10)
        if len(raw) > 4096:
            await socket.close(code=1009)
            return
        auth = json.loads(raw)
        token = auth.get("token") if isinstance(auth, dict) else None
        if not isinstance(token, str) or not token:
            await socket.close(code=4401)
            return
        user = await run_in_threadpool(
            get_current_user,
            HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
            settings,
        )
        candidate = Channel(socket, match_id, user.uid, uuid4().hex)
        await run_in_threadpool(sessions.connect, match_id, user.uid, candidate.connection_id)
        channel = candidate
        await hub.register(channel)
        writer = asyncio.create_task(hub.write(channel))
        hub.metrics.count("connections")
        await hub.broadcast(match_id)
        while True:
            raw = await socket.receive_text()
            received = perf_counter()
            if len(raw) > 8192:
                await socket.close(code=1009)
                return
            try:
                payload = json.loads(raw)
                if isinstance(payload, dict) and payload.get("type") == "ping":
                    state = await run_in_threadpool(
                        sessions.ping,
                        match_id,
                        user.uid,
                        channel.connection_id,
                    )
                    hub.enqueue(
                        channel,
                        EventReply(snapshot=state).model_dump(
                            mode="json",
                            by_alias=True,
                        ),
                    )
                    continue
                event = SessionEvent.model_validate(payload)
                reply = await run_in_threadpool(
                    sessions.event,
                    match_id,
                    user.uid,
                    channel.connection_id,
                    event,
                )
            except (ValidationError, ValueError) as error:
                reason = (
                    str(error) if isinstance(error, MatchmakingError) else "Invalid session event."
                )
                reply = EventReply(
                    disposition="rejected",
                    error=reason,
                    snapshot=await run_in_threadpool(sessions.snapshot, match_id, user.uid),
                )
            except Exception:
                logger.exception("Session event failed")
                reply = EventReply(
                    disposition="rejected",
                    error="Could not save the action. Please retry.",
                    snapshot=await run_in_threadpool(sessions.snapshot, match_id, user.uid),
                )
            completed = perf_counter()
            await hub.broadcast(match_id, reply=reply, sender=channel)
            hub.record(reply, received, completed)
    except (HTTPException, MatchmakingError) as error:
        code = 4401 if isinstance(error, HTTPException) and error.status_code == 401 else 4403
        await socket.close(code=code)
    except WebSocketDisconnect:
        pass
    except (TimeoutError, json.JSONDecodeError):
        await socket.close(code=4401)
    finally:
        if writer is not None:
            writer.cancel()
            await asyncio.gather(writer, return_exceptions=True)
        if channel is not None:
            hub.unregister(channel)
            await run_in_threadpool(
                sessions.disconnect, match_id, channel.uid, channel.connection_id
            )
            hub.metrics.count("disconnects")
            await hub.broadcast(match_id)
