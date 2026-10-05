from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.schemas import Scenario, ScenarioReview, ReviewUpsert, Visibility
from app.firebase import get_firestore_client

router = APIRouter(prefix="/ratings", tags=["ratings"])

# needed api routes:

# fetch the current rating for the current user and scenario 

db = get_firestore_client()

# upsert review
@router.put("/{scenario_id}", response_model=ScenarioReview)
def upsert_review(scenario_id: str, user: CurrentUserDep, payload: ReviewUpsert) -> ScenarioReview:
    # first, get the scenario and make sure it exists and is public
    scenario_doc = db.collection("scenarios").document(scenario_id).get()
    if not scenario_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    scenario = Scenario(**scenario_doc.to_dict())

    if scenario.visibility == Visibility.PRIVATE: #private scenarios cannot be rated
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    if scenario.author_uid == user.uid: # authors can't rate their own scenarios
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authors cannot rate their own scenario")
    
    # second, see if the user already has a review. we know have a scenario we know we can rate
    doc = db.collection("scenarioReviews").document(f"{scenario_id}_{user.uid}").get()

    if not doc.exists: # add a new review
        timestamp = datetime.now(UTC)
        scenario_review = ScenarioReview(
            id=f"{scenario_id}_{user.uid}", 
            scenario_id=scenario.id,
            reviewer_uid=user.uid,
            rating=payload.rating,
            comment=payload.comment,
            created_at=timestamp,
            updated_at=timestamp
        )
        db.collection("scenarioReviews").document(scenario_review.id).set(scenario_review.model_dump(by_alias=True))

        new_rating_count = scenario.rating_count + 1
        curr_avg_rating = scenario.avg_rating if scenario.avg_rating is not None else 0
        new_avg_rating = (payload.rating + (scenario.rating_count * scenario.avg_rating)) / new_rating_count

        db.collection("scenarios").document(scenario_id).update({
            "avgRating": new_avg_rating,
            "ratingCount": new_rating_count
        })
    else: #update existing review
        old_rating = doc.get("rating")
        doc.reference.update({
            "rating": payload.rating,
            "comment": payload.comment,
            "updatedAt": datetime.now(UTC)
        })

        new_avg_rating = ((scenario.rating_count * scenario.avg_rating) - old_rating + payload.rating) / scenario.rating_count
        db.collection("scenarios").document(scenario_id).update({
            "avgRating": new_avg_rating
        })
        
    doc = db.collection("scenarioReviews").document(doc.id).get()
    return ScenarioReview(**doc.to_dict())


@router.get("/{scenario_id}/my-rating", response_model=ScenarioReview | None)
def get_user_scenario_review(scenario_id: str, user: CurrentUserDep) -> ScenarioReview | None:
    # I am only going to allow users to view their own ratings with this endpoint
    # I will use this to pre-populate fields when re-rating

    #TODO: how do we handle private scenarios?  Ans: we don't allow them to write a review unless they have access so it will just return None

    doc = db.collection("scenarioReviews").document(f"{scenario_id}_{user.uid}").get()

    if not doc.exists: # there is not yet a rating
        return None

    return ScenarioReview(**doc.to_dict())


@router.get("/{scenario_id}", response_model=list[ScenarioReview])
def get_scenario_reviews(scenario_id: str) -> list[ScenarioReview]:
    # note: only see review
    return []



# i think we just do add / update rating within one route.  We will receive a rating 