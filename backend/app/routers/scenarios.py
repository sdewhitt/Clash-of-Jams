"""
Scenario routes.

A worked example of the shape every router should take: a prefix and tag, typed
request/response models, and the caller injected through CurrentUserDep. Storage
is a module-level dict so the endpoints run end to end today; replace _STORE
with Firestore reads and writes when the persistence layer lands.
"""

import time
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.schemas import Scenario, ScenarioCreate, ScenarioWithAuthor
from app.firebase import get_firestore_client
from google.cloud.firestore_v1.base_query import FieldFilter

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

# Placeholder for Firestore. Process-local, so it empties on restart.
_STORE: dict[str, Scenario] = {}
db = get_firestore_client()


# How long one read of the public catalog serves every caller. Search lists the whole
# catalog, so without this each page view would read every public scenario again.
PUBLIC_CATALOG_TTL_S = 60.0
_public_catalog: tuple[float, list[ScenarioWithAuthor]] | None = None


def _with_authors(scenarios: list[Scenario]) -> list[ScenarioWithAuthor]:
    """Pair each scenario with its author's display name, reading each author once.

    One batched read for every author rather than one round trip per scenario.
    Scenarios whose author has no profile are dropped.
    """
    uids = {s.author_uid for s in scenarios}
    refs = [db.collection("users").document(uid) for uid in uids]
    names = {
        snap.id: snap.get("displayName")
        for snap in db.get_all(refs, field_paths=["displayName"])
        if snap.exists
    }
    return [
        ScenarioWithAuthor(scenario=s, author_name=names[s.author_uid])
        for s in scenarios
        if s.author_uid in names
    ]


def _public_scenarios() -> list[ScenarioWithAuthor]:
    """Every public scenario with its author, cached for PUBLIC_CATALOG_TTL_S."""
    global _public_catalog
    now = time.monotonic()
    if _public_catalog is None or now - _public_catalog[0] > PUBLIC_CATALOG_TTL_S:
        docs = db.collection("scenarios").where(
            filter=FieldFilter("visibility", "==", "public")
        ).stream()
        _public_catalog = (now, _with_authors([Scenario(**doc.to_dict()) for doc in docs]))
    return _public_catalog[1]


def _searchable_scenarios(uid: str) -> list[ScenarioWithAuthor]:
    """Every public scenario, plus the caller's own at any visibility.

    Two equality queries merged by id rather than one OR query, so neither
    needs a composite index. An author can then find and play what they made
    without publishing it first. Their own are read fresh, so an edit or a
    publish shows up for them straight away even while the public list is cached.
    """
    own_docs = db.collection("scenarios").where(filter=FieldFilter("authorUid", "==", uid)).stream()
    own = _with_authors([Scenario(**doc.to_dict()) for doc in own_docs])
    by_id = {row.scenario.id: row for row in [*_public_scenarios(), *own]}
    return list(by_id.values())


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


@router.get("/scenario_with_author", response_model=list[ScenarioWithAuthor])
def list_scenario_with_author(user: CurrentUserDep) -> list[ScenarioWithAuthor]:
    """List public scenarios and the caller's own, with their authors, for search feature"""
    return _searchable_scenarios(user.uid)


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