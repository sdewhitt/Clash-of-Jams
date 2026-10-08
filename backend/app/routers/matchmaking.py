"""Authenticated queue entry, heartbeat/status, and ticket-scoped cancellation."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencies import CurrentUserDep
from app.services.matchmaking import MatchmakingService
from app.services.matchmaking_models import QueueCancel, QueueJoin, QueueStatus
from app.services.matchmaking_store import MatchmakingError

router = APIRouter(prefix="/matchmaking", tags=["matchmaking"])
logger = logging.getLogger(__name__)


def get_matchmaker(request: Request) -> MatchmakingService:
    return request.app.state.matchmaking


MatchmakerDep = Annotated[MatchmakingService, Depends(get_matchmaker)]


def _call(operation, *args):
    try:
        return operation(*args)
    except MatchmakingError as error:
        raise HTTPException(status_code=error.status, detail=str(error)) from error
    except Exception as error:
        logger.exception("Matchmaking persistence operation failed")
        raise HTTPException(
            status_code=503, detail="Multiplayer is temporarily unavailable. Try again."
        ) from error


@router.post("/queue", response_model=QueueStatus)
def join_queue(payload: QueueJoin, user: CurrentUserDep, matchmaker: MatchmakerDep):
    instrument = payload.instrument.value if payload.instrument else None
    return _call(matchmaker.join, user.uid, instrument)


@router.get("/queue", response_model=QueueStatus)
def queue_status(user: CurrentUserDep, matchmaker: MatchmakerDep):
    return _call(matchmaker.status, user.uid)


@router.delete("/queue", response_model=QueueStatus)
def cancel_queue(
    payload: QueueCancel, user: CurrentUserDep, matchmaker: MatchmakerDep, request: Request
):
    previous = _call(matchmaker.status, user.uid) if payload.leave_lobby else None
    status = _call(matchmaker.cancel, user.uid, payload.queue_id, payload.leave_lobby)
    sessions = getattr(request.app.state, "sessions", None)
    if sessions and previous and previous.match and status.state == "idle":
        sessions.lobby_left(previous.match.id)
    return status
