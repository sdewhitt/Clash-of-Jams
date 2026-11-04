from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from google.cloud.firestore_v1.base_query import FieldFilter

from app.dependencies import CurrentUserDep
from app.firebase import get_firestore_client
from app.routers.history import _is_visible
from app.schemas import (
    Playlist,
    PlaylistAdd,
    PlaylistCreate,
    PlaylistDetail,
    PlaylistEntry,
    PlaylistReorder,
    PlaylistUpdate,
)
router = APIRouter(prefix="/playlists", tags=["playlists"])
db = get_firestore_client()

MAX_SCENARIOS = 200

@router.post("", response_model=Playlist, status_code=status.HTTP_201_CREATED)
def create_playlist(user: CurrentUserDep, payload: PlaylistCreate) -> Playlist:
    """new playlist owned by caller, no scenarios yet"""
    ref = db.collection("playlists").document()
    now = datetime.now(UTC)
    playlist = Playlist(
        id=ref.id,
        owner_uid=user.uid,
        name=payload.name,
        description=payload.description,
        is_public=payload.is_public,
        scenario_ids=[], # init with no songs
        created_at=now,
        updated_at=now,
    )
    ref.set(playlist.model_dump(by_alias=True))
    return playlist


@router.get("", response_model=list[Playlist])
def list_my_playlists(user: CurrentUserDep) -> list[Playlist]:
    """callers playlist, alphabetical"""
    docs = db.collection("playlists").where(filter=FieldFilter("ownerUid", "==", user.uid)).stream()
    playlists = [Playlist.model_validate(doc.to_dict()) for doc in docs]
    playlists.sort(key=lambda playlist: playlist.name)
    return playlists


@router.get("/{playlist_id}")
def get_playlist(playlist_id: str, user:CurrentUserDep) -> PlaylistDetail:
    return _with_entries(_readable(playlist_id, user.uid), user.uid)


@router.patch("/{playlist_id}", response_model=Playlist)
def update_playlist(playlist_id: str, user: CurrentUserDep, payload: PlaylistUpdate) -> Playlist:
    playlist = _owned(playlist_id, user.uid)
    changes = payload.model_dump(by_alias=True, exclude_none=True) # ignore what we're not updating
    changes["updatedAt"] = datetime.now(UTC)
    db.collection("playlists").document(playlist_id).update(changes)
    return Playlist.model_validate({**playlist, **changes})


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(playlist_id: str, user: CurrentUserDep) -> None:
    _owned(playlist_id, user.uid)
    db.collection("playlists").document(playlist_id).delete()


@router.post(
        "/{playlist_id}/scenarios",
        response_model=PlaylistDetail,
        status_code=status.HTTP_201_CREATED,
)
def add_scenario(playlist_id: str, user: CurrentUserDep, payload: PlaylistAdd) -> PlaylistDetail:
    """add scenario at end of playlist"""
    playlist = _owned(playlist_id, user.uid)
    scenario_id = payload.scenario_id
    if scenario_id in playlist["scenarioIds"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Scenario is already in this playlist"
        )

    if len(playlist["scenarioIds"]) >= MAX_SCENARIOS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A playlist can hold at most {MAX_SCENARIOS} scenarios",
        )

    # only playable scenarios can be added
    scenario = None
    if "/" not in scenario_id:
        snapshot = db.collection("scenarios").document(scenario_id).get()
        scenario = snapshot.to_dict() if snapshot.exists else None
    if not _is_visible(scenario, user.uid):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    return _save_order(playlist, [*playlist["scenarioIds"], scenario_id], user.uid)


@router.delete("/{playlist_id}/scenarios/{scenario_id}", response_model=PlaylistDetail)
def remove_scenario(playlist_id: str, scenario_id: str, user: CurrentUserDep) -> PlaylistDetail:
    playlist = _owned(playlist_id, user.uid)
    if scenario_id not in playlist["scenarioIds"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scenario is not in this playlist"
        )

    remaining_scenarios = [scenario for scenario in playlist["scenarioIds"] is scenario != scenario_id]
    return _save_order(playlist, remaining_scenarios, user.uid)


@router.put("/{playlist_id}/scenarios", response_model=PlaylistDetail)
def reorder_playlist(playlist_id: str, user: CurrentUserDep, payload: PlaylistReorder) -> PlaylistDetail:
    """reorder the playlist"""
    playlist = _owned(playlist_id, user.uid)
    current = playlist["scenarioIds"]
    # a reorder should have additions or removals
    if len(payload.scenario_ids) != len(current) or set(payload.scenario_ids) != set(current):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new order must contain exactly the playlist's scenarios",
        )
    return _save_order(playlist, payload.scenario_ids, user.uid)



def _readable(playlist_id: str, uid: str) -> dict:
    """playlist if user can read it else 404"""
    snapshot = db.collection("playlists").document(playlist_id).get()
    playlist = snapshot.to_dict() if snapshot.exists else None
    if playlist is None or (playlist["ownerUid"] != uid and not playlist["isPublic"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return playlist


def _owned(playlist_id: str, uid: str) -> dict:
    """playlist only if caller owns it, else 403"""
    playlist = _readable(playlist_id, uid)
    if playlist["ownerUid"] != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your playlist")
    return playlist


def _save_order(playlist: dict, scenario_ids: list[str], uid: str) -> PlaylistDetail:
    changes = {"scenarioIds": scenario_ids, "updatedAt": datetime.now(UTC)}
    db.collection("playlists").document(playlist["id"]).update(changes)
    return _with_entries({**playlist, **changes}, uid)

def _with_entries(playlist: dict, uid: str) -> PlaylistDetail:
    """look up each scenario"""
    ids = [scenario_id for scenario_id in playlist["scenarioIds"] if "/" not in scenario_id]
    refs = [db.collection("scenarios").document(scenario_id) for scenario_id in ids]
    scenarios = {snap.id: snap.to_dict() for snap in db.get_all(refs) if snap.exists}

    entries = []
    for scenario_id in playlist["scenarioIds"]:
        scenario = scenarios.get(scenario_id)
        available = _is_visible(scenario, uid)
        entries.append(PlaylistEntry(
            scenario_id=scenario_id,
            title=scenario["title"] if available else None,
            available=available,
        ))
    return PlaylistDetail.model_validate({**playlist, "entries": entries})