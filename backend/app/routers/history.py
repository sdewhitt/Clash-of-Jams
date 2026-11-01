"""Router for the history of previously played scenarios."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from google.cloud.firestore_v1.base_query import FieldFilter

from app.dependencies import CurrentUserDep
from app.firebase import firestore, get_firestore_client
from app.routers.leaderboards import _as_utc
from app.schemas import PlayHistoryEntry, PlayHistoryResponse, Visibility

router = APIRouter(prefix="/history", tags=["history"])
db = get_firestore_client()

@router.get("", response_model=PlayHistoryResponse)
def get_play_history(
    user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    before: datetime | None = None
) -> PlayHistoryResponse:
    """history of runs, sorted by newest"""
    query = db.collection("runs").where(filter=FieldFilter("userUid", "==", user.uid))
    if before is not None:
        query = query.where(filter=FieldFilter("playedAt", "<", _as_utc(before)))
    docs = (
        query.order_by("playedAt", direction=firestore.Query.DESCENDING)
        .limit(limit + 1)
        .stream()
    )

    runs = [{**doc.to_dict(), "id": doc.id} for doc in docs]
    has_more = len(runs) > limit
    runs = runs[:limit]

    scenario_ids = {run["scenarioId"] for run in runs if "/" not in run["scenarioId"]}
    refs = [db.collection("scenarios").document(scenario_id) for scenario_id in scenario_ids]
    scenarios = {snap.id: snap.to_dict() for snap in db.get_all(refs) if snap.exists}

    entries = [_to_entry(run, scenarios.get(run["scenarioId"]), user.uid) for run in runs]
    return PlayHistoryResponse(
        entries=entries,
        next_before=entries[-1].played_at if has_more else None,
    )

def _to_entry(run: dict, scenario: dict | None, uid: str) -> PlayHistoryEntry:
    available = scenario is not None and (
        scenario["visibility"] != Visibility.PRIVATE or scenario["authorUid"] == uid
    )
    return PlayHistoryEntry(
        run_id=run["id"],
        scenario_id=run["scenarioId"],
        scenario_version_id=run["scenarioVersionId"],
        scenario_title=scenario["title"] if available else None,
        instrument=run["instrument"],
        final_score=run["finalScore"],
        played_at=run["playedAt"],
        validation=run["validation"],
        match_id=run.get("matchId"),
        scenario_available=available,
        is_current_version=available and scenario["currentVersionId"] == run["scenarioVersionId"],
    )
