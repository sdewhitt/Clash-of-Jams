"""Server-only match finalization. Clients can read ratings, never submit a winner."""

from datetime import UTC, datetime
from typing import Literal

from firebase_admin import firestore
from pydantic import Field, FiniteFloat, model_validator

from algs.elo import (
    MODEL_VERSION,
    PROVISIONAL_MATCHES,
    RATING_PRECISION,
    get_expected_score,
    get_k_factor,
    rating_tier,
    updated_elos,
)
from app.schemas import ApiModel, Instrument, RankTier, SkillRating


class MatchRatingError(ValueError):
    """An invalid or conflicting authoritative result; transaction stays unchanged."""


class FinalMatchResult(ApiModel):
    """Constructed by the trusted session/scoring server; no public POST route."""

    match_id: str = Field(min_length=1, max_length=128, pattern=r"^[^/]+$")
    instrument: Instrument
    participant_uids: tuple[str, str]
    normalized_scores: tuple[FiniteFloat, FiniteFloat]
    reason: Literal["completed", "resigned", "disconnected"] = "completed"
    forfeiting_uid: str | None = None

    @model_validator(mode="after")
    def validate_result(self) -> "FinalMatchResult":
        a, b = self.participant_uids
        if not a or not b or "/" in a or "/" in b or a == b:
            raise ValueError("A versus match requires two distinct valid user IDs")
        if any(score < 0 or score > 1 for score in self.normalized_scores):
            raise ValueError("Normalized scores must be between 0 and 1")
        if self.reason == "completed" and self.forfeiting_uid is not None:
            raise ValueError("A completed performance cannot name a forfeiting player")
        if self.reason != "completed" and self.forfeiting_uid not in self.participant_uids:
            raise ValueError("A forfeit must identify one participant")
        return self

    def winner_number(self) -> int:
        if self.forfeiting_uid is not None:
            return 2 if self.forfeiting_uid == self.participant_uids[0] else 1
        a, b = self.normalized_scores
        return 0 if a == b else (1 if a > b else 2)


class RatingEvent(ApiModel):
    """users/{uid}/skillRatings/{instrument}/history/{matchId}."""

    match_id: str
    uid: str
    opponent_uid: str
    instrument: Instrument
    outcome: Literal["win", "loss", "draw", "forfeit"]
    reason: Literal["completed", "resigned", "disconnected"]
    score: FiniteFloat
    opponent_score: FiniteFloat
    elo_before: FiniteFloat
    opponent_elo_before: FiniteFloat
    elo_after: FiniteFloat
    elo_delta: FiniteFloat
    expected_score: FiniteFloat
    actual_score: FiniteFloat
    k_factor: int
    games_played_before: int
    games_played_after: int
    is_provisional: bool
    tier_after: RankTier
    model_version: str
    applied_at: datetime


def calculate_rating_events(
    result: FinalMatchResult, ratings: tuple[SkillRating, SkillRating], at: datetime
) -> tuple[RatingEvent, RatingEvent]:
    """Pure transformation used by the transaction and replay tests."""
    a, b = ratings
    if (a.uid, b.uid) != result.participant_uids:
        raise MatchRatingError("Rating identities do not match the participants")
    if any(r.instrument != result.instrument or r.games_played < 0 for r in ratings):
        raise MatchRatingError("Invalid instrument rating")
    winner = result.winner_number()
    new_elos = updated_elos(a.elo, b.elo, winner)
    expectations = get_expected_score(a.elo, b.elo)
    k = get_k_factor(a.elo, b.elo)
    events = []
    for i, rating in enumerate(ratings):
        opponent = ratings[1 - i]
        actual = 0.5 if winner == 0 else float(winner == i + 1)
        outcome = "draw" if winner == 0 else ("win" if actual == 1 else "loss")
        if rating.uid == result.forfeiting_uid:
            outcome = "forfeit"
        after = round(new_elos[i], RATING_PRECISION)
        games = rating.games_played + 1
        events.append(
            RatingEvent(
                match_id=result.match_id,
                uid=rating.uid,
                opponent_uid=opponent.uid,
                instrument=result.instrument,
                outcome=outcome,
                reason=result.reason,
                score=result.normalized_scores[i],
                opponent_score=result.normalized_scores[1 - i],
                elo_before=rating.elo,
                opponent_elo_before=opponent.elo,
                elo_after=after,
                elo_delta=round(after - rating.elo, RATING_PRECISION),
                expected_score=expectations[i],
                actual_score=actual,
                k_factor=k,
                games_played_before=rating.games_played,
                games_played_after=games,
                is_provisional=games < PROVISIONAL_MATCHES,
                tier_after=rating_tier(after),
                model_version=MODEL_VERSION,
                applied_at=at,
            )
        )
    return tuple(events)


def finalize_match(db, result: FinalMatchResult) -> tuple[RatingEvent, RatingEvent]:
    """Atomically persist the result, both ratings, and immutable history.

    A retry returns the original history; a conflicting retry is rejected.
    Read every document before writing so Firestore can safely retry races.
    """
    at = datetime.now(UTC)
    match_ref = db.collection("matches").document(result.match_id)
    rating_refs = [
        db.collection("users")
        .document(uid)
        .collection("skillRatings")
        .document(result.instrument.value)
        for uid in result.participant_uids
    ]
    history_refs = [ref.collection("history").document(result.match_id) for ref in rating_refs]
    participant_refs = [
        match_ref.collection("participants").document(uid) for uid in result.participant_uids
    ]

    @firestore.transactional
    def commit(transaction):
        match = match_ref.get(transaction=transaction)
        if not match.exists:
            raise MatchRatingError("Match does not exist")
        data = match.to_dict()
        if data.get("mode") != "versus_1v1" or data.get("participantUids") != list(
            result.participant_uids
        ):
            raise MatchRatingError("Result does not match the registered versus participants")
        histories = [ref.get(transaction=transaction) for ref in history_refs]
        if data.get("state") == "complete":
            if not all(history.exists for history in histories):
                raise MatchRatingError("Completed match is missing its rating history")
            events = tuple(RatingEvent(**history.to_dict()) for history in histories)
            for i, event in enumerate(events):
                if (
                    event.uid != result.participant_uids[i]
                    or event.match_id != result.match_id
                    or event.instrument != result.instrument
                    or event.opponent_uid != result.participant_uids[1 - i]
                    or event.score != result.normalized_scores[i]
                    or event.opponent_score != result.normalized_scores[1 - i]
                    or event.reason != result.reason
                    or (event.outcome == "forfeit") != (event.uid == result.forfeiting_uid)
                ):
                    raise MatchRatingError("Match has already been finalized with another result")
            return events
        if data.get("state") != "in_progress" or any(history.exists for history in histories):
            raise MatchRatingError("Only an active, unfinalized match may update ratings")
        scenario = (
            db.collection("scenarios").document(data["scenarioId"]).get(transaction=transaction)
        )
        if not scenario.exists or scenario.to_dict().get("instrument") != result.instrument.value:
            raise MatchRatingError("Result instrument does not match the scenario")
        stored_ratings = [ref.get(transaction=transaction) for ref in rating_refs]
        participants = [ref.get(transaction=transaction) for ref in participant_refs]
        if not all(snapshot.exists for snapshot in stored_ratings + participants):
            raise MatchRatingError("Both participants and instrument ratings must exist")
        for uid, participant in zip(result.participant_uids, participants, strict=True):
            if participant.to_dict().get("uid") != uid:
                raise MatchRatingError("Participant identity mismatch")
        ratings = tuple(SkillRating(**snapshot.to_dict()) for snapshot in stored_ratings)
        events = calculate_rating_events(result, ratings, at)
        for i, event in enumerate(events):
            updated = ratings[i].model_copy(
                update={
                    "elo": event.elo_after,
                    "tier": event.tier_after,
                    "games_played": event.games_played_after,
                    "is_provisional": event.is_provisional,
                    "updated_at": at,
                }
            )
            transaction.set(rating_refs[i], updated.model_dump(by_alias=True))
            transaction.create(history_refs[i], event.model_dump(by_alias=True))
            transaction.update(
                participant_refs[i],
                {
                    "outcome": event.outcome,
                    "finalScore": event.score,
                    "eloDelta": event.elo_delta,
                    "eloBefore": event.elo_before,
                    "eloAfter": event.elo_after,
                },
            )
        winner = result.winner_number()
        transaction.update(
            match_ref,
            {
                "state": "complete",
                "winnerUid": None if winner == 0 else result.participant_uids[winner - 1],
                "endedAt": at,
                "completionReason": result.reason,
                "ratingModelVersion": MODEL_VERSION,
            },
        )
        return events

    return commit(db.transaction())
