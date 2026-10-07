from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.schemas import Scenario, ScenarioReview, ReviewUpsert, Visibility, PublicReview
from app.firebase import get_firestore_client, firestore
from google.cloud.firestore_v1.base_query import FieldFilter


router = APIRouter(prefix="/ratings", tags=["ratings"])
db = get_firestore_client()

#TODO: fetch pfps and show them on each review and username ...

@firestore.transactional
def upsert_review_transaction(transaction, scenario_ref, review_ref, user_uid, payload: ReviewUpsert):
    scenario_doc = scenario_ref.get(transaction=transaction)
    review_doc = review_ref.get(transaction=transaction)

    if not scenario_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    scenario = Scenario(**scenario_doc.to_dict())

    if scenario.visibility == Visibility.PRIVATE: #private scenarios cannot be rated
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    if scenario.author_uid == user_uid: # authors can't rate their own scenarios
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authors cannot rate their own scenario")

    if not review_doc.exists: # add a new review
        timestamp = datetime.now(UTC)
        review = ScenarioReview(
            id=f"{scenario.id}_{user_uid}", 
            scenario_id=scenario.id,
            reviewer_uid=user_uid,
            rating=payload.rating,
            comment=payload.comment,
            created_at=timestamp,
            updated_at=timestamp
        )

        new_rating_count = scenario.rating_count + 1
        curr_avg_rating = scenario.avg_rating if scenario.avg_rating is not None else 0

        new_avg_rating = (payload.rating + (scenario.rating_count * curr_avg_rating)) / new_rating_count
    else:
        review = ScenarioReview(**review_doc.to_dict())
        old_rating = review.rating
        new_rating_count = scenario.rating_count
        new_avg_rating = ((scenario.rating_count * scenario.avg_rating) - old_rating + payload.rating) / scenario.rating_count

        review.rating = payload.rating
        review.comment = payload.comment
        review.updated_at = datetime.now(UTC)

    # write to the db transactionally

    transaction.update(scenario_ref, {
        "avgRating": new_avg_rating,
        "ratingCount": new_rating_count
    })
    transaction.set(review_ref, review.model_dump(by_alias=True))

    return review


@router.put("/{scenario_id}", response_model=ScenarioReview)
def upsert_review(scenario_id: str, user: CurrentUserDep, payload: ReviewUpsert) -> ScenarioReview:

    user_doc = db.collection("users").document(user.uid).get()
    if not user_doc.exists or user_doc.get("isBanned") or user_doc.get("isSocialRestricted"): # user doc has to exist.  If not, something is NOT okay
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not permitted to place reviews")

    runs = (
        db.collection("runs")
        .where(filter=FieldFilter("scenarioId", "==", scenario_id))
        .where(filter=FieldFilter("userUid", "==", user.uid))
        .limit(1)
        .get()
    )
    has_played = len(runs) > 0 and runs[0].get("validation") != "rejected"
    if not has_played:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot review a scenario you have not played")


    scenario_ref = db.collection("scenarios").document(scenario_id)
    review_ref = db.collection("scenarioReviews").document(f"{scenario_id}_{user.uid}")
    return upsert_review_transaction(db.transaction(), scenario_ref, review_ref, user.uid, payload)


@router.get("/{scenario_id}/my-rating", response_model=ScenarioReview | None)
def get_user_scenario_review(scenario_id: str, user: CurrentUserDep) -> ScenarioReview | None:
    # I am only going to allow users to view their own ratings with this endpoint
    # I will use this to pre-populate fields when re-rating 

    #TODO: how do we handle private scenarios?  Ans: we don't allow them to write a review unless they have access so it will just return None

    doc = db.collection("scenarioReviews").document(f"{scenario_id}_{user.uid}").get()

    if not doc.exists: # there is not yet a rating
        return None

    return ScenarioReview(**doc.to_dict())


@router.get("/{scenario_id}", response_model=list[PublicReview])
def get_scenario_reviews(scenario_id: str) -> list[PublicReview]:
    docs = (
        db.collection("scenarioReviews")
        .where(filter=FieldFilter("scenarioId", "==", scenario_id))
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(50)
        .stream()
    )

    scenario_reviews = [ScenarioReview(**doc.to_dict()) for doc in docs]

    refs = [db.collection("users").document(review.reviewer_uid) for review in scenario_reviews]
    profiles = {snap.id: snap.to_dict() for snap in db.get_all(refs) if snap.exists}

    filtered_reviews: list[PublicReview] = []

    for review in scenario_reviews:
        if review.reviewer_uid not in profiles: continue
        profile = profiles[review.reviewer_uid]
        if profile["isBanned"] or profile["isSocialRestricted"]:
            continue
        if not profile["isProfilePublic"]:
            display_name = "Anonymous"
        else:
            display_name = profile["displayName"]

        filtered_reviews.append(PublicReview(
            **review.model_dump(),
            display_name=display_name
        ))
    return filtered_reviews