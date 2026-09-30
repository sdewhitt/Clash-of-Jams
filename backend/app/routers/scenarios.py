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
from app.schemas import Scenario, ScenarioCreate, FilterResponse, ScenarioWithAuthor
from app.firebase import get_firestore_client
from google.cloud.firestore_v1.base_query import FieldFilter

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

# Placeholder for Firestore. Process-local, so it empties on restart.
_STORE: dict[str, Scenario] = {}
db = get_firestore_client()

@router.get("", response_model=list[Scenario])
def list_scenarios(user: CurrentUserDep) -> list[Scenario]:
    """Every scenario the caller can see. For now: the ones they authored."""
    return [s for s in _STORE.values() if s.author_uid == user.uid]


@router.post("", response_model=Scenario, status_code=status.HTTP_201_CREATED)
def create_scenario(payload: ScenarioCreate, user: CurrentUserDep) -> Scenario:
    timestamp = datetime.now(UTC)
    scenario = Scenario(
        id=uuid4().hex,
        author_uid=user.uid,
        created_at=timestamp,
        **payload.model_dump(),
        avg_rating=None,
        crowd_difficulty=None,
        rating_count=0,
        current_version_id=None,
        current_version_number=0,
        updated_at=timestamp,
    )
    db.collection("scenarios").document(scenario.id).set(scenario.model_dump(by_alias=True))
    return scenario


# thinking I might add a check here to make sure user.uid is in our database to make sure they are registered
# implementation question: should I query once and send to client and filter or query several times with filter?

# need to change this one to return author usernames rather than ids
@router.get("/authors", response_model=list[str])
def list_authors() -> list[str]:
    """Get the authors who have public scenarios"""
    return list({s.author_uid for s in _STORE.values() if s.visibility == "public"})

@router.get("/public", response_model=list[Scenario])
def list_public_scenarios() -> list[Scenario]:
    """List all public scenarios for serach feature"""
    docs = (
        db.collection("scenarios")
        .where(filter=FieldFilter("visibility", "==", "public"))
        .stream()
    )
    return [Scenario(**doc.to_dict()) for doc in docs]


@router.get("/filter_items", response_model=FilterResponse)
def list_filter_items() -> FilterResponse:
    """Get the possible filters for scenarios to populate dropdowns and sliders"""
    docs = (
        db.collection("scenarios")
        .where(filter=FieldFilter("visibility", "==", "public"))
        .stream()
    )

    scenario_list = [Scenario(**doc.to_dict()) for doc in docs]
    filter_response = FilterResponse()

    for s in scenario_list:
        filter_response.instruments.add(s.instrument)
        if filter_response.max_difficulty is None or s.author_difficulty > filter_response.max_difficulty:
            filter_response.max_difficulty = s.author_difficulty
        if filter_response.min_difficulty is None or s.author_difficulty < filter_response.min_difficulty:
            filter_response.min_difficulty = s.author_difficulty
        if filter_response.max_plays is None or s.play_count > filter_response.max_plays:
            filter_response.max_plays = s.play_count
        if filter_response.min_plays is None or s.play_count < filter_response.min_plays:
            filter_response.min_plays = s.play_count

    return filter_response


@router.get("/scenario_with_author", response_model=list[ScenarioWithAuthor])
def list_scenario_with_author() -> list[ScenarioWithAuthor]:
    """List all public scenarios and their authors for search feature"""
    docs = (
        db.collection("scenarios")
        .where(filter=FieldFilter("visibility", "==", "public"))
        .stream()
    )
    scenario_list = [Scenario(**doc.to_dict()) for doc in docs]
    out_list = []
    for s in scenario_list:
        doc = db.collection("users").document(s.author_uid).get(field_paths=["displayName"])
        if not doc.exists:
            continue
        out_list.append(ScenarioWithAuthor(scenario=s, author_name=doc.get("displayName")))

    return out_list


@router.get("/{scenario_id}", response_model=Scenario)
def get_scenario(scenario_id: str, user: CurrentUserDep) -> Scenario:

    doc = db.collection("scenarios").document(scenario_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    scenario = Scenario(**doc.to_dict())

    if scenario.author_uid != user.uid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User does not own scenario")
    
    return scenario


"""Get all the instruments available for search"""

"""Get range of plays available for search"""