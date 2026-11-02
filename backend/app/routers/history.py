"""Router for the history of previously played scenarios."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from google.cloud.firestore_v1.base_query import FieldFilter

from app.dependencies import CurrentUserDep
from app.firebase import firestore, get_firestore_client
from app.routers.leaderboards import _as_utc
from app.schemas import (
    PlayHistoryEntry,
    PlayHistoryResponse,
    RunValidation,
    ScenarioAttempt,
    ScenarioScoreHistory,
    ScenarioScoreStats,
    ScoreSummary,
    Visibility,
)

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


@router.get("/scenarios/{scenario_id}", response_model=ScenarioScoreHistory)
def get_scenario_score_history(
    user: CurrentUserDep,
    scenario_id: str,
    sort: Literal["date", "score"] = "date",
    order: Literal["asc", "desc"] = "desc",
) -> ScenarioScoreHistory:
    """all attempts of caller w/ summary stats"""
    snapshot = db.collection("scenarios").document(scenario_id).get()
    if not _is_visible(snapshot.to_dict() if snapshot.exists else None, user.uid):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    docs = (
        db.collection("runs")
        .where(filter=FieldFilter("userUid", "==", user.uid))
        .where(filter=FieldFilter("scenarioId", "==", scenario_id))
        .stream()
    )
    attempts = [_to_attempt(doc.id, doc.to_dict()) for doc in docs]

    # sorted by score, newest for consistency
    attempts.sort(key=lambda attempt: attempt.played_at, reverse=True)
    if sort == "score":
        attempts.sort(key=lambda attempt: attempt.final_score, reverse=order == "desc")
    elif order == "asc":
        attempts.reverse()

    return ScenarioScoreHistory(
        scenario_id=scenario_id, stats=summarize_attempts(attempts), attempts=attempts
    )


def summarize_attempts(attempts: list[ScenarioAttempt]) -> ScenarioScoreStats | None:
    """stats of all non-rejected runs"""
    counted = sorted(
        (attempt for attempt in attempts if attempt.validation != RunValidation.REJECTED),
        key=lambda attempt: attempt.played_at,
    )

    if not counted:
        return None

    scores = [attempt.final_score for attempt in counted]
    return ScenarioScoreStats(
        attempt_count=len(scores),
        best_score=max(scores),
        average_score=round(sum(scores) / len(scores), 2),
        most_recent_score=scores[-1],
        first_score=scores[0],
        improvement=round(scores[-1] - scores[0], 2) if len(scores) > 1 else None,
    )


def _is_visible(scenario: dict | None, uid: str) -> bool:
    """if scenario exists and the user can view it"""
    return scenario is not None and (
        scenario["visibility"] != Visibility.PRIVATE or scenario["authorUid"] == uid
    )


def _to_attempt(run_id: str, run: dict) -> ScenarioAttempt:
    return ScenarioAttempt(
        run_id=run_id,
        scenario_version_id=run["scenarioVersionId"],
        instrument=run["instrument"],
        final_score=run["finalScore"],
        played_at=run["playedAt"],
        validation=run["validation"],
        match_id=run.get("matchId"),
        # Pydantic ignores the extra noteResults key.
        breakdown=ScoreSummary.model_validate(run["breakdown"]),
    )


def _to_entry(run: dict, scenario: dict | None, uid: str) -> PlayHistoryEntry:
    available = _is_visible(scenario, uid)
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
