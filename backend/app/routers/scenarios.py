"""
Scenario routes.

A worked example of the shape every router should take: a prefix and tag, typed
request/response models, and the caller injected through CurrentUserDep. Storage
is a module-level dict so the endpoints run end to end today; replace _STORE
with Firestore reads and writes when the persistence layer lands.
"""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.schemas import Scenario, ScenarioCreate

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

# Placeholder for Firestore. Process-local, so it empties on restart.
_STORE: dict[str, Scenario] = {}


@router.get("", response_model=list[Scenario])
def list_scenarios(user: CurrentUserDep) -> list[Scenario]:
    """Every scenario the caller can see. For now: the ones they authored."""
    return [s for s in _STORE.values() if s.author_uid == user.uid]


@router.post("", response_model=Scenario, status_code=status.HTTP_201_CREATED)
def create_scenario(payload: ScenarioCreate, user: CurrentUserDep) -> Scenario:
    scenario = Scenario(
        id=uuid4().hex,
        author_uid=user.uid,
        created_at=datetime.now(UTC),
        **payload.model_dump(),
    )
    _STORE[scenario.id] = scenario
    return scenario


@router.get("/{scenario_id}", response_model=Scenario)
def get_scenario(scenario_id: str, user: CurrentUserDep) -> Scenario:
    scenario = _STORE.get(scenario_id)
    if scenario is None or scenario.author_uid != user.uid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    return scenario
