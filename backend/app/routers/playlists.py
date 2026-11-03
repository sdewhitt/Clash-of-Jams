from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from google.cloud.firestore_v1.base_query import FieldFilter

from app.dependencies import CurrentUserDep
from app.firebase import get_firestore_client
from app.schemas import Playlist, PlaylistCreate, PlaylistUpdate

router = APIRouter(prefix="/playlists", tags=["playlists"])
db = get_firestore_client()


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
def get_playlist(playlist_id: str, user:CurrentUserDep) -> Playlist:
    return Playlist.model_validate(_readable(playlist_id, user.uid))


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