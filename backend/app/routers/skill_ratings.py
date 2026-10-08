"""Authenticated read-only access to the caller's instrument rating and history."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import CurrentUserDep
from app.firebase import get_firestore_client
from app.schemas import Instrument, SkillRating
from app.services.skill_ratings import RatingEvent

router = APIRouter(prefix="/skill-ratings", tags=["skill-ratings"])
DatabaseDep = Annotated[object, Depends(get_firestore_client)]


@router.get("/{instrument}", response_model=SkillRating)
def get_rating(instrument: Instrument, user: CurrentUserDep, db: DatabaseDep):
    snapshot = (
        db.collection("users")
        .document(user.uid)
        .collection("skillRatings")
        .document(instrument.value)
        .get()
    )
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Instrument rating not found")
    return SkillRating(**snapshot.to_dict())


@router.get("/{instrument}/history", response_model=list[RatingEvent])
def get_history(
    instrument: Instrument,
    user: CurrentUserDep,
    db: DatabaseDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    history = (
        db.collection("users")
        .document(user.uid)
        .collection("skillRatings")
        .document(instrument.value)
        .collection("history")
        .order_by("appliedAt", direction="DESCENDING")
        .limit(limit)
    )
    return [RatingEvent(**snapshot.to_dict()) for snapshot in history.stream()]
