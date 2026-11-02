"""Authenticated queue entry, heartbeat/status, and ticket-scoped cancellation."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencies import CurrentUserDep
from app.services.matchmaking import MatchmakingService
from app.services.matchmaking_models import QueueCancel, QueueJoin, QueueStatus
from app.services.matchmaking_store import MatchmakingError

from app.services.matchmaking_models import (
    AcceptFriendMatchRequest,
    DeclineFriendMatchRequest,
    CreateFriendMatchRequest,
    FriendMatchInvitationResponse,
    QueueCancel,
    QueueJoin,
    QueueStatus,
)

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

@router.post("/friends/invitations", response_model=FriendMatchInvitationResponse,)
def create_friend_invitation(
    payload: CreateFriendMatchRequest,
    user: CurrentUserDep,
    matchmaker: MatchmakerDep,
):
    invitation_id = _call(
        matchmaker.create_friend_invitation,
        user.uid,
        payload.to_uid,
        payload.scenario_id,
        payload.scenario_version_id,
    )

    return FriendMatchInvitationResponse(
        invitation_id=invitation_id,
        match_id=None,
        state="pending",
    )


@router.post("/friends/invitations/accept", response_model=FriendMatchInvitationResponse,)
def accept_friend_invitation(
    payload: AcceptFriendMatchRequest,
    user: CurrentUserDep,
    matchmaker: MatchmakerDep,
):
    match_id = _call(
        matchmaker.accept_friend_invitation,
        user.uid,
        payload.invitation_id,
        payload.scenario_id,
        payload.scenario_version_id,
    )

    # The store returns None when the invitation has expired.
    if match_id is None:
        return FriendMatchInvitationResponse(
            invitation_id=payload.invitation_id,
            match_id=None,
            state="expired",
        )

    return FriendMatchInvitationResponse(
        invitation_id=payload.invitation_id,
        match_id=match_id,
        state="accepted",
    )

@router.post("/friends/invitations/decline", response_model=FriendMatchInvitationResponse,)
def decline_friend_invitation(
    payload: DeclineFriendMatchRequest,
    user: CurrentUserDep,
    matchmaker: MatchmakerDep,
):
    state = _call(
        matchmaker.decline_friend_invitation,
        user.uid,
        payload.invitation_id,
    )

    return FriendMatchInvitationResponse(
        invitationId=payload.invitation_id,
        matchId=None,
        state=state,
    )