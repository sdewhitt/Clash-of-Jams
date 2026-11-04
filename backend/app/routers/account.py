from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.dependencies import RecentClaimsDep, VerifiedClaimsDep
from app.services import account_deletion

router = APIRouter(prefix="/account", tags=["account"])


@router.get("")
def account_status(claims: VerifiedClaimsDep):
    account = account_deletion.status_for(claims["uid"])
    return {
        "state": account.get("state", "active"),
        "purgeAt": account.get("purgeAt") if account.get("state") == "pending_deletion" else None,
    }


@router.delete("", status_code=202)
async def schedule_deletion(claims: RecentClaimsDep, request: Request):
    now = datetime.now(UTC)
    try:
        deadline = await run_in_threadpool(account_deletion.schedule, claims["uid"], claims["auth_time"], now)
    except account_deletion.AccountDeletionError as error:
        raise HTTPException(409, str(error)) from error

    hub = request.app.state.session_hub
    for channel in list(hub.channels.values()):
        if channel.uid == claims["uid"]:
            await hub.close(channel, 4403, "Account access is unavailable.")
    return {"purgeAt": deadline}


@router.post("/restore", status_code=204)
def restore_account(claims: RecentClaimsDep):
    now = datetime.now(UTC)
    try:
        account_deletion.restore(claims["uid"], claims["auth_time"], now)
    except account_deletion.AccountDeletionError as error:
        raise HTTPException(409, str(error)) from error
