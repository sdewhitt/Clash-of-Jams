from fastapi import APIRouter

from app.dependencies import CurrentUserDep
from app.schemas import LeaderboardEntry, LeaderboardResponse, SkillRating, Instrument
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
def get_elo_leaderboard(user: CurrentUserDep, instrument: Instrument) -> LeaderboardResponse:
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

    leaderboard_entries = leaderboard_entries[:25] # get the top 25 positions

    return LeaderboardResponse(
        entries=leaderboard_entries,
        my_entry=my_entry,
        total_players=len(ratings),
        percentile=percentile
    )

# also want to do a score leaderboard for each scenario so will handle that later

# TODO: on front end we should be able to choose only instruments that are eligible to be played on that scenario.  if it is a guitar scenario i dont want to see the piano leaderboard