from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.schemas import Scenario, ScenarioReview, ReviewUpsert, Visibility
from app.firebase import get_firestore_client, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

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


@router.get("/elo", response_model = )
def get_elo_leaderboard(user: CurrentUserDep) -> # I would like to return a list of leaderboardResponse, the users skill rating, and either their rank or percentile tbd
# get all skill rating items and sort descending
# for skillRating in that list, get the user doc for that uid:
#   if uid == user.uid:
#       save the users info (ranking and what not)
#    elif account is public:
#       we can add them to the list
#  
# question: should we compute the percentile and rank here or on the frontend? I think here it will be easier to account for ties, will handle that in implmentation
#
# TODO: handle if the user is not in the leaderboard (they should be with elo, but they won't be with the other one)
#

# also want to do a score leaderboard for each scenario so will handle that later

# TODO: on front end we should be able to choose only instruments that are eligible to be played on that scenario.  if it is a guitar scenario i dont want to see the piano leaderboard