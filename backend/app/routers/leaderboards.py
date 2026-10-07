from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.dependencies import CurrentUserDep
from app.schemas import LeaderboardEntry, LeaderboardResponse, RunSummary, SkillRating, Instrument
from app.firebase import get_firestore_client, firestore
from google.cloud.firestore_v1.base_query import FieldFilter, Or

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])
db = get_firestore_client()

# ELO Leaderboard
# will be its own page added to the home page
# we will display the top N users (25 init) and then highlight the current users profile
#   if the current user is outside the top 25, we will show what percentile they are in
#   each entry will have their elo and username, only will show public profiles
#       TODO: in the future, I would like to have it where we can click on a pfp in the leaderboard and it will take us to thier profile
#
#
#
# 1st route:


@router.get("/elo", response_model = LeaderboardResponse)
def get_elo_leaderboard(user: CurrentUserDep, instrument: Instrument, limit: Annotated[int, Query(ge=1, le=250)] = 100) -> LeaderboardResponse:
    docs = (
        db.collection("users")
        .where(filter=Or(
            [
                FieldFilter("isProfilePublic", "==", True),
                FieldFilter("uid", "==", user.uid)
            ]
        ))
        .where(filter=FieldFilter("isBanned", "==", False)) #users who are banned or social restricted cannot see themselves on leaderboards
        .where(filter=FieldFilter("isSocialRestricted", "==", False))
        .stream()
    )

    users = {doc.id: doc.to_dict() for doc in docs} #this gives us a bunch of users
    refs = [
        db.collection("users").document(uid).collection("skillRatings").document(instrument)
        for uid in users
    ]

    ratings: list[SkillRating] = []

    for snap in db.get_all(refs):
        if not snap.exists:
            continue
        ratings.append(SkillRating(**snap.to_dict()))

    ratings.sort(key=lambda rating: rating.elo, reverse=True)

    leaderboard_entries: list[LeaderboardEntry] = []
    my_entry = None
    position = 0 # index in the list
    rank = 1     # rank displayed on leaderboard (elo ties will have same rank)
    prev_elo = None

    for rating in ratings: # build Leaderboard entries and populate leaderboard response
        profile = users[rating.uid]

        #position is always position
        if (prev_elo is not None) and (rating.elo != prev_elo): # if no tie, we use their real position
            rank = position + 1


        entry = LeaderboardEntry(
            uid=profile["uid"],
            display_name=profile["displayName"],
            ranking=rank,
            key=rating.elo,
            skill_rating=rating
        )

        if profile["uid"] == user.uid:
            my_entry = entry
        leaderboard_entries.append(entry)

        position+=1
        prev_elo = rating.elo


    percentile = None
    if my_entry is not None:
        percentile = (my_entry.ranking / position) # position can't be zero if we have a user

    leaderboard_entries = leaderboard_entries[:limit] # get the top limit positions

    return LeaderboardResponse(
        entries=leaderboard_entries,
        my_entry=my_entry,
        total_players=len(ratings),
        percentile=percentile
    )

# also want to do a score leaderboard for each scenario so will handle that later


@router.get("/{scenario_id}/{version_id}", response_model=LeaderboardResponse)
def get_scenario_leaderboard(
    user: CurrentUserDep,
    scenario_id: str,
    version_id: str,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    played_after: datetime | None = None,  # optional date range; each player's best run *within* it counts
    played_before: datetime | None = None,
) -> LeaderboardResponse:

    def is_eligible(uid: str, profile: dict) -> bool:
        # same rules as the ELO query: no banned/restricted users, private profiles only see themselves
        if profile["isBanned"] or profile["isSocialRestricted"]:
            return False
        return profile["isProfilePublic"] or uid == user.uid

    # scenario_id isn't filtered on: version ids are unique, so the version already
    # pins the scenario, and these three fields are exactly the existing runs index
    docs = (
        db.collection("runs")
        .where(filter=FieldFilter("scenarioVersionId", "==", version_id))
        .where(filter=FieldFilter("validation", "==", "accepted"))
        .order_by("finalScore", direction=firestore.Query.DESCENDING)
        .stream()
    )

    # runs arrive highest score first, so the first run we see for a uid is their best
    played_after = _as_utc(played_after)
    played_before = _as_utc(played_before)
    earliest: datetime | None = None # bounds over every run, so the date slider's range doesn't
    latest: datetime | None = None   # shrink as the user narrows the filter

    best_runs: dict[str, dict] = {} # uid -> best run
    for doc in docs:
        run = doc.to_dict()
        if run["speedMultiplier"] != 1: # only full speed runs count
            continue

        played_at = run["playedAt"]
        earliest = played_at if earliest is None else min(earliest, played_at)
        latest = played_at if latest is None else max(latest, played_at)
        # date check comes before the best-run check, so a player's best run inside the range wins
        if (played_after and played_at < played_after) or (played_before and played_at > played_before):
            continue

        uid = run["userUid"]
        if uid not in best_runs:
            run["id"] = doc.id
            best_runs[uid] = run

    refs = [db.collection("users").document(uid) for uid in best_runs]
    profiles = {snap.id: snap.to_dict() for snap in db.get_all(refs) if snap.exists}

    leaderboard_entries: list[LeaderboardEntry] = []
    my_entry = None
    position = 0 # index in the list
    rank = 1     # rank displayed on leaderboard, ties will have the same rank
    prev_score = None

    for uid, run in best_runs.items(): # still in score order, so no sort needed
        if uid not in profiles or not is_eligible(uid, profiles[uid]):
            continue
        profile = profiles[uid]

        if (prev_score is not None) and (run["finalScore"] != prev_score): # if no tie, we use their real position
            rank = position + 1

        entry = LeaderboardEntry(
            uid=uid,
            display_name=profile["displayName"],
            ranking=rank,
            key=run["finalScore"],
            run=RunSummary(run_id=run["id"], played_at=run["playedAt"])
        )

        if uid == user.uid:
            my_entry = entry
        leaderboard_entries.append(entry)

        position+=1
        prev_score = run["finalScore"]


    percentile = None
    if my_entry is not None:
        percentile = (my_entry.ranking / position) # position can't be zero if we have a user

    return LeaderboardResponse(
        entries=leaderboard_entries[:limit], # get the top limit positions
        my_entry=my_entry,
        total_players=position,
        percentile=percentile,
        earliest_played_at=earliest,
        latest_played_at=latest,
    )


def _as_utc(value: datetime | None) -> datetime | None:
    """Treat a timezone-less query param as UTC, so it can be compared with Firestore timestamps."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value
