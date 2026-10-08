"""Coarse session transitions in Firestore; no writes on the live input path."""

from datetime import UTC, datetime

from firebase_admin import firestore

from app.services.matchmaking_store import MatchmakingError
from app.services.skill_ratings import FinalMatchResult, RatingEvent, finalize_match


class FirestoreSessionStore:
    def __init__(self, database):
        self.db = database

    def load(self, match_id: str, uid: str) -> dict:
        ref = self.db.collection("matches").document(match_id)
        stored = ref.get()
        if not stored.exists:
            raise MatchmakingError("This match does not exist.", 404)
        data = stored.to_dict()
        if uid not in data.get("participantUids", []):
            raise MatchmakingError("You are not a participant in this match.", 403)
        if data.get("mode") != "versus_1v1" or len(set(data["participantUids"])) != 2:
            raise MatchmakingError("This is not a two-player session.")
        profile = self.db.collection("users").document(uid).get()
        if not profile.exists or profile.to_dict().get("isBanned"):
            raise MatchmakingError("This account cannot join multiplayer.", 403)
        data["participants"] = [
            ref.collection("participants").document(player_uid).get().to_dict()
            for player_uid in data["participantUids"]
        ]
        if not all(data["participants"]) or "matchmaking" not in data:
            raise MatchmakingError("This match has no multiplayer lobby.")
        data["ratingEvents"] = []
        if data["state"] == "complete":
            for player_uid in data["participantUids"]:
                event = self.db.document(
                    f"users/{player_uid}/skillRatings/{data['matchmaking']['instrument']}"
                    f"/history/{match_id}"
                ).get()
                if not event.exists:
                    raise MatchmakingError("Match results are temporarily unavailable.", 503)
                data["ratingEvents"].append(RatingEvent(**event.to_dict()))
        return data

    def start(self, match_id: str, started_at_ms: float, duration_ms: int, owner: str):
        ref = self.db.collection("matches").document(match_id)

        @firestore.transactional
        def commit(transaction):
            match = ref.get(transaction=transaction)
            if not match.exists or match.to_dict().get("state") != "lobby":
                raise MatchmakingError("The lobby is no longer available.")
            data = match.to_dict()
            transaction.update(
                ref,
                {
                    "state": "in_progress",
                    "startedAt": datetime.fromtimestamp(started_at_ms / 1000, UTC),
                    "durationMs": duration_ms,
                    "inputSource": "demo",
                    "sessionProtocolVersion": "multiplayer-v1",
                    "sessionServerId": owner,
                },
            )
            for uid in data["participantUids"]:
                transaction.update(ref.collection("participants").document(uid), {"isReady": True})

        commit(self.db.transaction())

    def abandon(self, match_id: str, reason: str):
        ref = self.db.collection("matches").document(match_id)

        @firestore.transactional
        def commit(transaction):
            match = ref.get(transaction=transaction)
            if match.exists and match.to_dict().get("state") in ("lobby", "in_progress"):
                transaction.update(
                    ref,
                    {
                        "state": "abandoned",
                        "endedAt": datetime.now(UTC),
                        "completionReason": reason,
                    },
                )

        commit(self.db.transaction())

    def finalize(self, result: FinalMatchResult):
        return finalize_match(self.db, result)
