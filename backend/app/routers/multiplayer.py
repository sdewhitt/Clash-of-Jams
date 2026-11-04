"""Authenticated snapshots and first-frame WebSocket authentication."""

import asyncio
import json
import logging
from time import perf_counter
from typing import Annotated
from uuid import uuid4

from anyio import CancelScope
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
)
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.dependencies import AdminUserDep, CurrentUserDep, get_current_user
from app.services import spectating
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


@router.get("/spectating")
def discover_spectating(user: CurrentUserDep, request: Request):
    try:
        return spectating.discover(request.app.state.sessions, user.uid)
    except MatchmakingError as error:
        raise HTTPException(error.status, str(error)) from error


async def socket_auth(socket, settings):
    raw = await asyncio.wait_for(socket.receive_text(), timeout=10)
    if len(raw) > 4096:
        raise WebSocketException(code=1009)
    auth = json.loads(raw)
    token = auth.get("token") if isinstance(auth, dict) else None
    if not isinstance(token, str) or not token:
        raise HTTPException(401, "Missing WebSocket token.")
    user = await run_in_threadpool(
        get_current_user,
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
        settings,
    )
    return user, auth


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
        user, auth = await socket_auth(socket, settings)
        candidate = Channel(socket, match_id, user.uid, uuid4().hex)
        await run_in_threadpool(
            sessions.connect,
            match_id,
            user.uid,
            candidate.connection_id,
            auth.get("allowSpectators") is True,
        )
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
    except WebSocketException as error:
        await socket.close(code=error.code)
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


@router.websocket("/{match_id}/spectate")
async def spectator_socket(socket: WebSocket, match_id: str):
    settings = get_settings()
    origin = socket.headers.get("origin")
    if origin is not None and origin not in settings.cors_origins:
        await socket.close(code=1008)
        return
    await socket.accept()
    sessions = socket.app.state.sessions
    metrics = socket.app.state.session_hub.metrics
    tasks = []
    close_code = 1000
    joined = False
    connection = uuid4().hex
    try:
        user, auth = await socket_auth(socket, settings)
        visit = auth.get("visit")
        if not isinstance(visit, str) or not 1 <= len(visit) <= 64:
            raise HTTPException(403, "Invalid spectator session.")
        session = sessions.find_session(match_id)
        if session is None:
            raise HTTPException(403, "This match is no longer available to spectate.")
        name, friends = await run_in_threadpool(sessions.store.spectator_identity, user.uid)
        generation = await run_in_threadpool(
            spectating.join, sessions, session, user.uid, visit, connection, name, friends
        )
        joined = True
        metrics.count("spectatorConnections")

        async def publish():
            while True:
                state = await run_in_threadpool(spectating.snapshot, sessions, session, generation)
                if state is None or generation != session.spectator_generation:
                    return 4410
                if session.spectator_connections.get(user.uid) != connection:
                    return 4009
                await asyncio.wait_for(socket.send_json(state), timeout=2)
                if state["state"] in ("complete", "abandoned"):
                    return 1000
                await asyncio.sleep(0.2)

        async def recheck_friendship():
            while True:
                await asyncio.sleep(10)
                _, friends = await run_in_threadpool(sessions.store.spectator_identity, user.uid)
                if not friends.intersection(session.players):
                    return 4403

        async def receive_reactions():
            last_reaction = float("-inf")
            while True:
                raw = await socket.receive_text()
                if len(raw) > 512:
                    return 1009
                now = sessions.clock()
                payload = json.loads(raw)
                if (
                    not isinstance(payload, dict)
                    or payload.get("type") != "reaction"
                    or type(payload.get("messageId")) is not int
                ):
                    return 1008
                if now - last_reaction < 1:
                    continue
                last_reaction = now
                await run_in_threadpool(
                    spectating.react,
                    session,
                    generation,
                    user.uid,
                    connection,
                    payload["messageId"],
                    payload.get("reaction"),
                )

        tasks = [
            asyncio.create_task(operation())
            for operation in (publish, recheck_friendship, receive_reactions)
        ]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        close_code = next(iter(done)).result()
    except WebSocketException as error:
        close_code = error.code
    except (HTTPException, MatchmakingError) as error:
        close_code = 4401 if getattr(error, "status_code", None) == 401 else 4403
    except WebSocketDisconnect:
        return
    except json.JSONDecodeError:
        close_code = 1008
    except TimeoutError:
        metrics.count("spectatorSlowConsumer")
        close_code = 1013
    finally:
        for task in tasks:
            task.cancel()
        with CancelScope(shield=True):
            await asyncio.gather(*tasks, return_exceptions=True)
            if joined:
                await run_in_threadpool(spectating.leave, session, user.uid, connection)
    try:
        await asyncio.wait_for(socket.close(code=close_code), timeout=2)
    except (RuntimeError, WebSocketDisconnect, OSError, TimeoutError):
        pass
