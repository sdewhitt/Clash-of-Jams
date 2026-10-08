"""Difficulty explorer: authenticated reads, author/admin-controlled publication."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from algs.difficulty import DifficultyPolicy
from app.config import get_settings
from app.dependencies import CurrentUserDep
from app.firebase import get_firestore_client
from app.services.scenario_difficulty import (
    DifficultyDetail,
    DifficultyError,
    DifficultyScenario,
    FirestoreDifficultyStore,
    example_details,
)

router = APIRouter(prefix="/scenario-difficulty", tags=["scenario-difficulty"])
DatabaseDep = Annotated[object, Depends(get_firestore_client)]


def policy() -> DifficultyPolicy:
    settings = get_settings()
    return DifficultyPolicy(
        base_elo=settings.matchmaking_difficulty_base_elo,
        elo_step=settings.matchmaking_difficulty_elo_step,
    )


@router.get("/examples", response_model=list[DifficultyDetail])
def examples(user: CurrentUserDep):
    return example_details(policy())


@router.get("/scenarios", response_model=list[DifficultyScenario])
def scenarios(user: CurrentUserDep, db: DatabaseDep):
    return FirestoreDifficultyStore(db, policy()).list_scenarios(user)


@router.get("/scenarios/{scenario_id}", response_model=DifficultyDetail)
def detail(scenario_id: str, user: CurrentUserDep, db: DatabaseDep):
    try:
        return FirestoreDifficultyStore(db, policy()).detail(scenario_id, user)
    except DifficultyError as error:
        raise HTTPException(error.status, str(error)) from error


@router.post("/scenarios/{scenario_id}/recompute", response_model=DifficultyDetail)
def recompute(scenario_id: str, user: CurrentUserDep, db: DatabaseDep):
    try:
        return FirestoreDifficultyStore(db, policy()).publish(scenario_id, user)
    except DifficultyError as error:
        raise HTTPException(error.status, str(error)) from error
