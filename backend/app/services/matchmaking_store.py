"""Firestore adapter. Queue policy stays independent of this persistence layer."""

from datetime import UTC, datetime, timedelta
from math import isfinite

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from algs.matchmaking import MatchDecision, MatchmakingPolicy, QueuePlayer, ScenarioCandidate
from app.schemas import Instrument, SkillRating
from app.services.matchmaking_models import LobbyPlayer, MatchedLobby

ACTIVE_STATES = ("lobby", "in_progress")
RESERVATIONS = "matchmakingReservations"


class MatchmakingError(ValueError):
    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


class StalePlayer(MatchmakingError):
    """A queued rating changed; reload it before making another decision."""


def _finite(value) -> bool:
    return type(value) in (int, float) and isfinite(value)


def _playable_part(version: dict, instrument: str) -> str | None:
    rules = version.get("scoringRules", {})
    weights = [rules.get(name) for name in ("pitchWeight", "rhythmWeight", "completenessWeight")]
    if not all(_finite(value) and value >= 0 for value in weights) or sum(weights) <= 0:
        return None
    if not all(
        _finite(rules.get(name)) and rules[name] > 0
        for name in ("hitWindowMs", "pitchToleranceCents")
    ):
        return None
    chart = version.get("chart", {})
    tempo = chart.get("tempoMap", [])
    if not tempo or not any(entry.get("atBeat") == 0 for entry in tempo):
        return None
    if not all(_finite(entry.get("bpm")) and entry["bpm"] > 0 for entry in tempo):
        return None
    for part in chart.get("parts", []):
        notes = part.get("notes", [])
        if part.get("instrument") != instrument or not part.get("partId") or not notes:
            continue
        if all(
            type(note.get("midiPitch")) is int
            and 0 <= note["midiPitch"] <= 127
            and _finite(note.get("startBeat"))
            and note["startBeat"] >= 0
            and _finite(note.get("durationBeats"))
            and note["durationBeats"] > 0
            for note in notes
        ):
            return part["partId"]
    return None


class FirestoreMatchmakingStore:
    def __init__(self, database):
        self.db = database

    def load_player(self, uid: str, instrument: str | None, joined_at: float, ticket: str):
        user_ref = self.db.collection("users").document(uid)
        profile = user_ref.get()
        if not profile.exists:
            raise MatchmakingError("Create your profile before joining multiplayer.", 404)
        data = profile.to_dict()
        if data.get("isBanned"):
            raise MatchmakingError("This account cannot join multiplayer.", 403)
        if instrument is None:
            settings = self.db.collection("userSettings").document(uid).get()
            instrument = (settings.to_dict() or {}).get("preferredInstrument", "piano")
        try:
            instrument = Instrument(instrument).value
        except ValueError as error:
            raise MatchmakingError("Choose a supported instrument in Settings.", 422) from error
        rating_ref = user_ref.collection("skillRatings").document(instrument)
        stored_rating = rating_ref.get()
        if not stored_rating.exists:
            raise MatchmakingError("Your instrument rating is unavailable.", 404)
        rating = SkillRating(**stored_rating.to_dict())
        if rating.uid != uid or rating.instrument.value != instrument:
            raise MatchmakingError("Your instrument rating is invalid.", 409)
        cutoff = datetime.now(UTC) - timedelta(minutes=2)
        recent = set()
        for snapshot in (
            rating_ref.collection("history")
            .order_by("appliedAt", direction="DESCENDING")
            .limit(5)
            .stream()
        ):
            history = snapshot.to_dict()
            applied_at = history.get("appliedAt")
            if isinstance(applied_at, datetime) and applied_at >= cutoff:
                recent.add(history["opponentUid"])
        return QueuePlayer(
            uid=uid,
            instrument=instrument,
            elo=rating.elo,
            games_played=rating.games_played,
            joined_at=joined_at,
            ticket=ticket,
            display_name=data.get("displayName") or data.get("username") or "Player",
            recent_opponents=frozenset(recent),
        )

    def load_scenarios(self) -> list[ScenarioCandidate]:
        documents = list(
            self.db.collection("scenarios")
            .where(filter=FieldFilter("visibility", "==", "public"))
            .stream()
        )
        references = [
            snapshot.reference.collection("versions").document(version)
            for snapshot in documents
            if isinstance(version := snapshot.to_dict().get("currentVersionId"), str)
            and version
            and "/" not in version
        ]
        versions = (
            {
                snapshot.reference.path: snapshot.to_dict()
                for snapshot in self.db.get_all(references)
            }
            if references
            else {}
        )
        candidates = []
        for snapshot in documents:
            data = snapshot.to_dict()
            version_id = data.get("currentVersionId")
            version = versions.get(f"scenarios/{snapshot.id}/versions/{version_id}")
            if not version or data.get("instrument") not in Instrument:
                continue
            try:
                part_id = _playable_part(version, data["instrument"])
            except (AttributeError, TypeError):
                continue  # Malformed published content cannot break the queue.
            if not part_id:
                continue
            crowd = data.get("crowdDifficulty")
            source = "crowd" if _finite(crowd) and 1 <= crowd <= 10 else "author"
            difficulty = crowd if source == "crowd" else data.get("authorDifficulty")
            if not _finite(difficulty) or not 1 <= difficulty <= 10:
                continue
            candidates.append(
                ScenarioCandidate(
                    id=snapshot.id,
                    version_id=version_id,
                    title=data.get("title") or "Scenario",
                    instrument=data["instrument"],
                    difficulty=difficulty,
                    difficulty_source=source,
                    part_id=part_id,
                    scoring_rules=version["scoringRules"],
                )
            )
        return candidates

    def find_active(self, uid: str) -> tuple[MatchedLobby, str] | None:
        reservation = self.db.collection(RESERVATIONS).document(uid).get()
        if not reservation.exists:
            return None
        match_id = reservation.to_dict()["matchId"]
        match_ref = self.db.collection("matches").document(match_id)
        match = match_ref.get()
        if not match.exists:
            return None
        data = match.to_dict()
        if data.get("state") not in ACTIVE_STATES or uid not in data.get("participantUids", []):
            return None
        meta = data["matchmaking"]
        participants = [
            ref.to_dict()
            for ref in self.db.get_all(
                [
                    match_ref.collection("participants").document(player_uid)
                    for player_uid in data["participantUids"]
                ]
            )
        ]
        by_uid = {participant["uid"]: participant for participant in participants}
        return MatchedLobby(
            id=match_id,
            state=data["state"],
            instrument=meta["instrument"],
            scenario_id=data["scenarioId"],
            scenario_version_id=data["scenarioVersionId"],
            scenario_title=meta["scenarioTitle"],
            scenario_difficulty=meta["scenarioDifficulty"],
            difficulty_source=meta["difficultySource"],
            participants=[
                LobbyPlayer(
                    uid=player_uid,
                    display_name=by_uid[player_uid]["displayName"],
                    elo=by_uid[player_uid]["eloAtQueue"],
                    is_provisional=by_uid[player_uid]["isProvisionalAtQueue"],
                )
                for player_uid in data["participantUids"]
            ],
        ), reservation.to_dict()["queueId"]

    def create_lobby(self, match_id: str, decision: MatchDecision, policy: MatchmakingPolicy):
        """One transaction claims both identities and writes the lobby + participants.

        Reservations protect against competing matching processes as well as
        local concurrent requests. Finished/abandoned reservations can be replaced.
        """
        now = datetime.now(UTC)
        players = decision.players
        reservations = [self.db.collection(RESERVATIONS).document(player.uid) for player in players]
        match_ref = self.db.collection("matches").document(match_id)
        scenario_ref = self.db.collection("scenarios").document(decision.scenario.id)

        @firestore.transactional
        def commit(transaction):
            claims = [ref.get(transaction=transaction) for ref in reservations]
            for claim in claims:
                if claim.exists:
                    existing = (
                        self.db.collection("matches")
                        .document(claim.to_dict()["matchId"])
                        .get(transaction=transaction)
                    )
                    if existing.exists and existing.to_dict().get("state") in ACTIVE_STATES:
                        return False
            scenario = scenario_ref.get(transaction=transaction)
            version = (
                scenario_ref.collection("versions")
                .document(decision.scenario.version_id)
                .get(transaction=transaction)
            )
            if not scenario.exists or not version.exists:
                return False
            data = scenario.to_dict()
            crowd = data.get("crowdDifficulty")
            source = "crowd" if _finite(crowd) and 1 <= crowd <= 10 else "author"
            difficulty = crowd if source == "crowd" else data.get("authorDifficulty")
            if (
                data.get("visibility") != "public"
                or data.get("instrument") != players[0].instrument
                or data.get("currentVersionId") != decision.scenario.version_id
                or source != decision.scenario.difficulty_source
                or difficulty != decision.scenario.difficulty
            ):
                return False
            if (
                _playable_part(version.to_dict(), players[0].instrument)
                != decision.scenario.part_id
            ):
                return False
            for player in players:
                profile = (
                    self.db.collection("users").document(player.uid).get(transaction=transaction)
                )
                if not profile.exists or profile.to_dict().get("isBanned"):
                    raise MatchmakingError("A participant can no longer join multiplayer.", 403)
                rating = (
                    self.db.collection("users")
                    .document(player.uid)
                    .collection("skillRatings")
                    .document(player.instrument)
                    .get(transaction=transaction)
                )
                if not rating.exists or (
                    rating.to_dict().get("elo"),
                    rating.to_dict().get("gamesPlayed"),
                ) != (player.elo, player.games_played):
                    raise StalePlayer("Queued rating changed")
            meta = {
                **decision.record(policy),
                "instrument": decision.scenario.instrument,
                "scenarioTitle": decision.scenario.title,
            }
            transaction.create(
                match_ref,
                {
                    "id": match_id,
                    "mode": "versus_1v1",
                    "state": "lobby",
                    "scenarioId": decision.scenario.id,
                    "scenarioVersionId": decision.scenario.version_id,
                    "speedMultiplier": 1,
                    "scoringRules": decision.scenario.scoring_rules,
                    "hostUid": players[0].uid,
                    "participantUids": [player.uid for player in players],
                    "winnerUid": None,
                    "createdAt": now,
                    "startedAt": None,
                    "endedAt": None,
                    "matchmaking": meta,
                },
            )
            for player, reservation in zip(players, reservations, strict=True):
                transaction.set(
                    reservation,
                    {
                        "uid": player.uid,
                        "matchId": match_id,
                        "queueId": player.ticket,
                        "createdAt": now,
                    },
                )
                transaction.create(
                    match_ref.collection("participants").document(player.uid),
                    {
                        "uid": player.uid,
                        "matchId": match_id,
                        "partId": decision.scenario.part_id,
                        "team": None,
                        "isReady": False,
                        "outcome": None,
                        "finalScore": None,
                        "runId": None,
                        "eloDelta": None,
                        "joinedAt": now,
                        "displayName": player.display_name,
                        "eloAtQueue": player.elo,
                        "isProvisionalAtQueue": player.provisional,
                    },
                )
            return True

        return commit(self.db.transaction())

    def abandon_lobby(self, uid: str, ticket: str) -> None:
        """A stale page cannot cancel a newer queue/lobby belonging to the same user."""
        reservation_ref = self.db.collection(RESERVATIONS).document(uid)

        @firestore.transactional
        def commit(transaction):
            reservation = reservation_ref.get(transaction=transaction)
            if not reservation.exists or reservation.to_dict().get("queueId") != ticket:
                return
            match_id = reservation.to_dict()["matchId"]
            match_ref = self.db.collection("matches").document(match_id)
            match = match_ref.get(transaction=transaction)
            if not match.exists or match.to_dict().get("state") not in ACTIVE_STATES:
                return
            data = match.to_dict()
            if uid not in data["participantUids"]:
                raise MatchmakingError("You are not a participant.", 403)
            if data["state"] != "lobby":
                raise MatchmakingError("An active game must be left through the session server.")
            refs = [
                self.db.collection(RESERVATIONS).document(player_uid)
                for player_uid in data["participantUids"]
            ]
            claims = [ref.get(transaction=transaction) for ref in refs]
            transaction.update(match_ref, {"state": "abandoned", "endedAt": datetime.now(UTC)})
            for ref, claim in zip(refs, claims, strict=True):
                if claim.exists and claim.to_dict().get("matchId") == match_id:
                    transaction.delete(ref)

        commit(self.db.transaction())
