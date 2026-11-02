"""Firestore adapter. Queue policy stays independent of this persistence layer."""

from datetime import UTC, datetime, timedelta
from math import isfinite

from secrets import choice
from uuid import uuid4

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from algs.matchmaking import MatchDecision, MatchmakingPolicy, QueuePlayer, ScenarioCandidate
from app.schemas import Instrument, SkillRating
from app.services.matchmaking_models import LobbyPlayer, MatchedLobby

ONLINE_TIMEOUT = timedelta(minutes=8)
ACTIVE_STATES = ("lobby", "in_progress")
RESERVATIONS = "matchmakingReservations"
FRIEND_INVITATION_LOCKS = "friendMatchInvitationLocks"


class MatchmakingError(ValueError):
    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


class StalePlayer(MatchmakingError):
    """A queued rating changed; reload it before making another decision."""


def _finite(value) -> bool:
    return type(value) in (int, float) and isfinite(value)


def scenario_difficulty(data: dict) -> tuple[float | None, str]:
    """Keep legacy estimates; new empirical estimates must match the playable version."""
    crowd = data.get("crowdDifficulty")
    current = data.get("crowdDifficultyVersionId", data.get("currentVersionId"))
    if _finite(crowd) and 1 <= crowd <= 10 and current == data.get("currentVersionId"):
        return crowd, "crowd"
    return data.get("authorDifficulty"), "author"


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

def _read_friend_scenario( transaction, db, uid: str, scenario_id: str, version_id: str, ) -> dict:
    """Read and validate a scenario selected by a particular player."""

    if ( not scenario_id or not version_id or "/" in scenario_id or "/" in version_id ):
        raise MatchmakingError("Invalid scenario selection.", 422)

    scenario_ref = db.collection("scenarios").document(scenario_id)
    version_ref = (scenario_ref.collection("versions").document(version_id))

    scenario_snapshot = scenario_ref.get(transaction=transaction)
    version_snapshot = version_ref.get(transaction=transaction)

    if not scenario_snapshot.exists or not version_snapshot.exists:
        raise MatchmakingError("The selected scenario no longer exists.", 404)

    scenario = scenario_snapshot.to_dict()
    version = version_snapshot.to_dict()

    # A player can select their own scenario or a public scenario.
    if ( scenario.get("authorUid") != uid and scenario.get("visibility") != "public" ):
        raise MatchmakingError(
            "You cannot use this scenario in a match.",
            403,
        )

    # Do not silently substitute a newer version.
    if scenario.get("currentVersionId") != version_id:
        raise MatchmakingError(
            "This scenario has been updated. Please select it again.",
            409,
        )

    instrument = scenario.get("instrument")

    try:
        instrument = Instrument(instrument).value
    except (ValueError, TypeError):
        raise MatchmakingError("Unsupported scenario instrument.", 422)

    try:
        part_id = _playable_part(version, instrument)
    except (AttributeError, TypeError):
        part_id = None

    if not part_id:
        raise MatchmakingError(
            "This scenario does not contain a playable part.",
            422,
        )

    difficulty, difficulty_source = scenario_difficulty(scenario)

    if not _finite(difficulty) or not 1 <= difficulty <= 10:
        raise MatchmakingError(
            "This scenario has an invalid difficulty.",
            422,
        )

    return {
        "id": scenario_snapshot.id,
        "version_id": version_id,
        "title": scenario.get("title") or "Scenario",
        "instrument": instrument,
        "difficulty": difficulty,
        "difficulty_source": difficulty_source,
        "part_id": part_id,
        "scoring_rules": version["scoringRules"],
    }

def is_user_online(status_data: dict | None) -> bool:
    if not status_data:
        return False

    last_heartbeat = status_data.get("lastHeartbeat")

    if last_heartbeat is None:
        return False

    # Firestore timestamps expose a datetime-compatible value.
    heartbeat_time = last_heartbeat

    if heartbeat_time.tzinfo is None:
        heartbeat_time = heartbeat_time.replace(tzinfo=UTC)

    return datetime.now(UTC) - heartbeat_time <= ONLINE_TIMEOUT

def validate_user_presence(status_data: dict | None) -> None:
    if not status_data:
        raise MatchmakingError(
            "This user is currently offline.",
            status=409,
        )

    last_heartbeat = status_data.get("lastHeartbeat")

    if last_heartbeat is None:
        raise MatchmakingError(
            "This user is currently offline.",
            status=409,
        )

    if last_heartbeat.tzinfo is None:
        last_heartbeat = last_heartbeat.replace(tzinfo=UTC)

    if datetime.now(UTC) - last_heartbeat > ONLINE_TIMEOUT:
        raise MatchmakingError(
            "This user is currently offline.",
            status=409,
        )

    if status_data.get("dnd", False):
        raise MatchmakingError(
            "This user is currently unavailable.",
            status=409,
        )

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
            difficulty, source = scenario_difficulty(data)
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
            difficulty, source = scenario_difficulty(data)
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

    def create_friend_invitation( self, from_uid: str, to_uid: str, scenario_id: str, scenario_version_id: str, ) -> str:
        """Create a pending invitation between two friends."""

        if from_uid == to_uid:
            raise MatchmakingError("You cannot challenge yourself.", 422)

        invitation_id = uuid4().hex

        invitation_ref = (
            self.db.collection("matchInvitations")
            .document(invitation_id)
        )

        friendship_id = "_".join(sorted([from_uid, to_uid]))
        friendship_ref = (
            self.db.collection("friendships")
            .document(friendship_id)
        )

        sender_ref = self.db.collection("users").document(from_uid)
        recipient_ref = self.db.collection("users").document(to_uid)
        notification_ref = self.db.collection("notifications").document()
        status_ref = self.db.collection("userStatus").document(to_uid)

        uid_a, uid_b = sorted([from_uid, to_uid])

        lock_ref = (
            self.db.collection(FRIEND_INVITATION_LOCKS)
            .document(f"{uid_a}_{uid_b}")
        )

        sender_reservation = (
            self.db.collection(RESERVATIONS).document(from_uid)
        )
        recipient_reservation = (
            self.db.collection(RESERVATIONS).document(to_uid)
        )

        now = datetime.now(UTC)

        @firestore.transactional
        def commit(transaction):

            # Read all documents before performing any writes.
            friendship = friendship_ref.get(transaction=transaction)
            sender = sender_ref.get(transaction=transaction)
            recipient = recipient_ref.get(transaction=transaction)

            sender_claim = sender_reservation.get(transaction=transaction)
            recipient_claim = recipient_reservation.get(transaction=transaction)

            lock_snapshot = lock_ref.get(transaction=transaction)

            previous_invitation_ref = None
            previous_invitation = None
            previous_notification_ref = None
            previous_notification_snapshot = None

            if lock_snapshot.exists:
                previous_id = lock_snapshot.to_dict().get("pendingInvitationId")

                if previous_id:
                    previous_invitation_ref = (
                        self.db.collection("matchInvitations")
                        .document(previous_id)
                    )

                    previous_invitation_snapshot = previous_invitation_ref.get(
                        transaction=transaction
                    )

                    if previous_invitation_snapshot.exists:
                        previous_invitation = previous_invitation_snapshot.to_dict()

                        previous_notification_id = previous_invitation.get(
                            "notificationId"
                        )

                        if previous_notification_id:
                            previous_notification_ref = (
                                self.db.collection("notifications")
                                .document(previous_notification_id)
                            )

                            previous_notification_snapshot = (
                                previous_notification_ref.get(
                                    transaction=transaction
                                )
                            )

            if not friendship.exists:
                raise MatchmakingError("You are not friends with this player.", 403)

            friendship_data = friendship.to_dict()

            if (
                friendship_data.get("uidA") != min(from_uid, to_uid)
                or friendship_data.get("uidB") != max(from_uid, to_uid)
            ):
                raise MatchmakingError("Invalid friendship record.", 409)

            if not sender.exists or not recipient.exists:
                raise MatchmakingError("A player profile could not be found.", 404)

            if sender.to_dict().get("isBanned") or recipient.to_dict().get("isBanned"):
                raise MatchmakingError("A participant cannot join multiplayer.", 403)
            
            status_snapshot = status_ref.get(transaction=transaction)

            status_data = (
                status_snapshot.to_dict()
                if status_snapshot.exists
                else None
            )

            validate_user_presence(status_data)

            if previous_invitation and previous_invitation.get("state") == "pending":
                previous_expires_at = previous_invitation.get("expiresAt")

                if previous_expires_at is not None and previous_expires_at > now:
                    raise MatchmakingError(
                        "There is already a pending invitation between these users.",
                        status=409,
                    )

            # Existing active matches prevent a new challenge.
            for claim in (sender_claim, recipient_claim):
                if claim.exists:
                    match_id = claim.to_dict().get("matchId")
                    if not match_id:
                        continue

                    existing = (
                        self.db.collection("matches")
                        .document(match_id)
                        .get(transaction=transaction)
                    )

                    if existing.exists and existing.to_dict().get("state") in ACTIVE_STATES:
                        raise MatchmakingError(
                            "A participant is already in an active match."
                        )

            # Validate the sender's scenario.
            scenario = _read_friend_scenario(
                transaction,
                self.db,
                from_uid,
                scenario_id,
                scenario_version_id,
            )

            if (
                previous_invitation
                and previous_invitation.get("state") == "pending"
            ):
                previous_expires_at = previous_invitation.get("expiresAt")

                # Expire the previous invitation if it has passed its expiration
                # time or is missing an expiration timestamp.
                if previous_expires_at is None or previous_expires_at <= now:
                    transaction.update(
                        previous_invitation_ref,
                        {
                            "state": "expired",
                            "updatedAt": now,
                        },
                    )

                    # Mark the old invitation notification as read.
                    if (
                        previous_notification_ref
                        and previous_notification_snapshot
                        and previous_notification_snapshot.exists
                    ):
                        transaction.update(
                            previous_notification_ref,
                            {"read": True},
                        )

            transaction.create(
                invitation_ref,
                {
                    "id": invitation_id,
                    "notificationId": notification_ref.id,
                    "matchId": None,
                    "fromUid": from_uid,
                    "toUid": to_uid,
                    "fromScenarioId": scenario["id"],
                    "fromScenarioVersionId": scenario["version_id"],
                    "toScenarioId": None,
                    "toScenarioVersionId": None,
                    "state": "pending",
                    "createdAt": now,
                    "updatedAt": now,
                    "expiresAt": now + timedelta(minutes=10),
                },
            )

            transaction.set(
                notification_ref, 
                {
                    "notifiedUid": to_uid,
                    "notifierUid": from_uid,
                    "notificationType": "friend_match_invitation",
                    "requestId": invitation_id,
                    "read": False,
                    "createdAt": now,
                }
            )

            transaction.set(
                lock_ref,
                {
                    "uidA": uid_a,
                    "uidB": uid_b,
                    "pendingInvitationId": invitation_id,
                    "updatedAt": now,
                },
            )

            return invitation_id

        return commit(self.db.transaction())
    

    def accept_friend_invitation( self, invitation_id: str, accepting_uid: str, scenario_id: str, scenario_version_id: str, ) -> str:
        """Accept a friend invitation and atomically create a multiplayer lobby."""

        if not invitation_id or "/" in invitation_id:
            raise MatchmakingError("Invalid invitation.", 422)

        now = datetime.now(UTC)

        invitation_ref = (
            self.db.collection("matchInvitations").document(invitation_id)
        )

        # Read the invitation initially to identify both players.
        invitation_snapshot = invitation_ref.get()

        if not invitation_snapshot.exists:
            raise MatchmakingError("Invitation not found.", 404)

        invitation_data = invitation_snapshot.to_dict()

        from_uid = invitation_data.get("fromUid")
        to_uid = invitation_data.get("toUid")

        uid_a, uid_b = sorted([from_uid, to_uid])

        lock_ref = (
            self.db.collection(FRIEND_INVITATION_LOCKS)
            .document(f"{uid_a}_{uid_b}")
        )

        notification_id = invitation_data.get("notificationId")

        notification_ref = (
            self.db.collection("notifications").document(notification_id)
            if notification_id
            else None
        )

        if accepting_uid != to_uid:
            raise MatchmakingError(
                "You are not the recipient of this invitation.",
                403,
            )

        if invitation_data.get("state") != "pending":
            raise MatchmakingError(
                "This invitation is no longer pending.",
                409,
            )

        # Determine the instrument so we can load both players.
        original_scenario_ref = (
            self.db.collection("scenarios")
            .document(invitation_data["fromScenarioId"])
        )

        original_scenario = original_scenario_ref.get()

        if not original_scenario.exists:
            raise MatchmakingError("The original scenario no longer exists.", 404)

        instrument = original_scenario.to_dict().get("instrument")

        try:
            instrument = Instrument(instrument).value
        except (ValueError, TypeError):
            raise MatchmakingError("Unsupported scenario instrument.", 422)

        # Reuse the existing matchmaking player-loading implementation.
        player_a = self.load_player(
            from_uid,
            instrument,
            now.timestamp(),
            str(uuid4()),
        )

        player_b = self.load_player(
            to_uid,
            instrument,
            now.timestamp(),
            str(uuid4()),
        )

        if player_a.instrument != player_b.instrument:
            raise MatchmakingError("Players must use the same instrument.", 422)

        # Prepare the documents that will be created.
        match_id = uuid4().hex
        match_ref = self.db.collection("matches").document(match_id)

        friendship_id = "_".join(sorted([from_uid, to_uid]))
        friendship_ref = (
            self.db.collection("friendships").document(friendship_id)
        )

        profiles = [
            self.db.collection("users").document(from_uid),
            self.db.collection("users").document(to_uid),
        ]

        ratings = [
            profiles[0].collection("skillRatings").document(instrument),
            profiles[1].collection("skillRatings").document(instrument),
        ]

        reservations = [
            self.db.collection(RESERVATIONS).document(from_uid),
            self.db.collection(RESERVATIONS).document(to_uid),
        ]

        recipient_status_ref = (
            self.db.collection("userStatus").document(to_uid)
        )

        @firestore.transactional
        def commit(transaction):

            # ---------------------------------------------------------
            # READ PHASE: Every Firestore read must happen before writes.
            # ---------------------------------------------------------

            invitation = invitation_ref.get(transaction=transaction)

            lock_snapshot = lock_ref.get(transaction=transaction)

            notification_snapshot = (
                notification_ref.get(transaction=transaction)
                if notification_ref
                else None
            )

            if not invitation.exists:
                raise MatchmakingError("Invitation not found.", 404)

            invitation_data = invitation.to_dict()

            if (
                invitation_data.get("state") != "pending"
                or invitation_data.get("fromUid") != from_uid
                or invitation_data.get("toUid") != to_uid
            ):
                raise MatchmakingError(
                    "This invitation is no longer available.",
                    409,
                )

            expires_at = invitation_data.get("expiresAt")

            if expires_at is None or expires_at <= now:
                transaction.update(
                    invitation_ref,
                    {
                        "state": "expired",
                        "updatedAt": now,
                    },
                )

                if notification_snapshot and notification_snapshot.exists:
                    transaction.update(
                        notification_ref,
                        {"read": True},
                    )

                if lock_snapshot.exists:
                    lock_data = lock_snapshot.to_dict()

                    if lock_data.get("pendingInvitationId") == invitation_id:
                        transaction.delete(lock_ref)

                return None

            friendship = friendship_ref.get(transaction=transaction)

            if not friendship.exists:
                raise MatchmakingError(
                    "You are no longer friends with this player.",
                    403,
                )

            friendship_data = friendship.to_dict()

            if (
                friendship_data.get("uidA") != min(from_uid, to_uid)
                or friendship_data.get("uidB") != max(from_uid, to_uid)
            ):
                raise MatchmakingError("Invalid friendship record.", 409)

            profile_snapshots = [
                ref.get(transaction=transaction) for ref in profiles
            ]

            if any(not profile.exists for profile in profile_snapshots):
                raise MatchmakingError("A player profile could not be found.", 404)

            for profile in profile_snapshots:
                if profile.to_dict().get("isBanned"):
                    raise MatchmakingError(
                        "A participant cannot join multiplayer.",
                        403,
                    )

            # The accepting player must still be online and available.
            status_snapshot = recipient_status_ref.get(
                transaction=transaction
            )

            status_data = (
                status_snapshot.to_dict() if status_snapshot.exists else None
            )

            validate_user_presence(status_data)

            # Read existing reservations and their associated matches.
            claims = [
                ref.get(transaction=transaction) for ref in reservations
            ]

            for claim in claims:
                if claim.exists:
                    existing_match_id = claim.to_dict().get("matchId")

                    if existing_match_id:
                        existing_match = (
                            self.db.collection("matches")
                            .document(existing_match_id)
                            .get(transaction=transaction)
                        )

                        if (
                            existing_match.exists
                            and existing_match.to_dict().get("state")
                            in ACTIVE_STATES
                        ):
                            raise MatchmakingError(
                                "A participant is already in an active match."
                            )

            # Validate both selected scenarios.
            scenario_a = _read_friend_scenario(
                transaction,
                self.db,
                from_uid,
                invitation_data["fromScenarioId"],
                invitation_data["fromScenarioVersionId"],
            )

            scenario_b = _read_friend_scenario(
                transaction,
                self.db,
                to_uid,
                scenario_id,
                scenario_version_id,
            )

            if scenario_a["instrument"] != scenario_b["instrument"]:
                raise MatchmakingError(
                    "Both scenarios must use the same instrument.",
                    422,
                )

            if scenario_a["instrument"] != instrument:
                raise MatchmakingError(
                    "The original scenario's instrument has changed.",
                    409,
                )

            # Verify that the ratings haven't changed since load_player().
            rating_snapshots = [
                ref.get(transaction=transaction) for ref in ratings
            ]

            for snapshot, player in zip(
                rating_snapshots,
                (player_a, player_b),
                strict=True,
            ):
                if not snapshot.exists:
                    raise StalePlayer("A participant's rating is unavailable.")

                rating_data = snapshot.to_dict()

                if (
                    rating_data.get("elo"),
                    rating_data.get("gamesPlayed"),
                ) != (player.elo, player.games_played):
                    raise StalePlayer("A participant's rating changed.")

            # ---------------------------------------------------------
            # WRITE PHASE: All validation reads have now completed.
            # ---------------------------------------------------------

            selected_scenario = choice([scenario_a, scenario_b])

            meta = {
                "instrument": selected_scenario["instrument"],
                "scenarioTitle": selected_scenario["title"],
                "scenarioDifficulty": selected_scenario["difficulty"],
                "difficultySource": selected_scenario["difficulty_source"],
                "matchOrigin": "friend",
                "friendInvitationId": invitation_id,
                "players": [
                    {
                        "uid": player.uid,
                        "elo": player.elo,
                        "isProvisional": player.provisional,
                    }
                    for player in (player_a, player_b)
                ],
            }

            transaction.create(
                match_ref,
                {
                    "id": match_id,
                    "mode": "versus_1v1",
                    "state": "lobby",
                    "scenarioId": selected_scenario["id"],
                    "scenarioVersionId": selected_scenario["version_id"],
                    "speedMultiplier": 1,
                    "scoringRules": selected_scenario["scoring_rules"],
                    "hostUid": from_uid,
                    "participantUids": [from_uid, to_uid],
                    "winnerUid": None,
                    "createdAt": now,
                    "startedAt": None,
                    "endedAt": None,
                    "matchOrigin": "friend",
                    "friendshipId": friendship_id,
                    "friendInvitationId": invitation_id,
                    "matchmaking": meta,
                },
            )

            for player, reservation in zip(
                (player_a, player_b),
                reservations,
                strict=True,
            ):
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
                        "partId": selected_scenario["part_id"],
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

            transaction.update(
                invitation_ref,
                {
                    "state": "accepted",
                    "matchId": match_id,
                    "toScenarioId": scenario_b["id"],
                    "toScenarioVersionId": scenario_b["version_id"],
                    "updatedAt": now,
                },
            )

            if notification_snapshot and notification_snapshot.exists:
                transaction.update(
                    notification_ref,
                    {"read": True},
                )

            if lock_snapshot.exists:
                lock_data = lock_snapshot.to_dict()

                if lock_data.get("pendingInvitationId") == invitation_id:
                    transaction.delete(lock_ref)

            return match_id

        return commit(self.db.transaction())
    
    def decline_friend_invitation(
        self,
        invitation_id: str,
        declining_uid: str,
    ) -> str:
        
        if not invitation_id or "/" in invitation_id:
            raise MatchmakingError("Invalid invitation.", 422)
        
        invitation_ref = (
            self.db.collection("matchInvitations")
            .document(invitation_id)
        )

        # Initial read: identify the friendship pair.
        invitation_snapshot = invitation_ref.get()

        if not invitation_snapshot.exists:
            raise MatchmakingError(
                "Invitation not found.",
                status=404,
            )

        initial_data = invitation_snapshot.to_dict()

        if initial_data.get("toUid") != declining_uid:
            raise MatchmakingError(
                "You cannot decline this invitation.",
                status=403,
            )

        from_uid = initial_data["fromUid"]
        to_uid = initial_data["toUid"]

        uid_a, uid_b = sorted([from_uid, to_uid])

        lock_ref = (
            self.db.collection(FRIEND_INVITATION_LOCKS)
            .document(f"{uid_a}_{uid_b}")
        )

        notification_id = initial_data.get("notificationId")
        notification_ref = (
            self.db.collection("notifications")
            .document(notification_id)
            if notification_id else None
        )

        now = datetime.now(UTC)

        @firestore.transactional
        def decline_transaction(transaction):
            current_snapshot = invitation_ref.get(
                transaction=transaction
            )
            lock_snapshot = lock_ref.get(
                transaction=transaction
            )

            notification_snapshot = None
            if notification_ref:
                notification_snapshot = notification_ref.get(
                    transaction=transaction
                )

            if not current_snapshot.exists:
                raise MatchmakingError(
                    "Invitation not found.",
                    status=404,
                )

            current = current_snapshot.to_dict()

            if current.get("toUid") != declining_uid:
                raise MatchmakingError(
                    "You cannot decline this invitation.",
                    status=403,
                )

            state = current.get("state")

            # Make repeated decline requests harmless.
            if state in ("declined", "expired"):
                return state

            if state != "pending":
                raise MatchmakingError(
                    "This invitation can no longer be declined.",
                    status=409,
                )

            expires_at = current.get("expiresAt")

            if expires_at is None or expires_at <= now:
                new_state = "expired"
            else:
                new_state = "declined"

            # All reads have completed. It is now safe to write.
            transaction.update(
                invitation_ref,
                {
                    "state": new_state,
                    "updatedAt": now,
                },
            )

            if notification_ref and notification_snapshot.exists:
                transaction.update(
                    notification_ref,
                    {"read": True},
                )

            if lock_snapshot.exists:
                lock_data = lock_snapshot.to_dict()

                if lock_data.get("pendingInvitationId") == invitation_id:
                    transaction.delete(lock_ref)

            return new_state

        transaction = self.db.transaction()
        return decline_transaction(transaction)
    
    def expire_friend_invitations(self, limit: int = 100) -> int:
        """Expire pending invitations and clean up their notifications and locks."""

        now = datetime.now(UTC)

        expired_query = (
            self.db.collection("matchInvitations")
            .where(filter=FieldFilter("state", "==", "pending"))
            .where(filter=FieldFilter("expiresAt", "<=", now))
            .limit(limit)
        )

        expired_count = 0

        for snapshot in expired_query.stream():
            invitation_ref = snapshot.reference
            invitation_data = snapshot.to_dict()

            from_uid = invitation_data.get("fromUid")
            to_uid = invitation_data.get("toUid")

            if not from_uid or not to_uid:
                continue

            uid_a, uid_b = sorted([from_uid, to_uid])

            lock_ref = (
                self.db.collection(FRIEND_INVITATION_LOCKS)
                .document(f"{uid_a}_{uid_b}")
            )

            notification_id = invitation_data.get("notificationId")

            notification_ref = (
                self.db.collection("notifications").document(notification_id)
                if notification_id
                else None
            )

            @firestore.transactional
            def expire_transaction(transaction):
                # Read phase
                current_snapshot = invitation_ref.get(
                    transaction=transaction
                )

                lock_snapshot = lock_ref.get(
                    transaction=transaction
                )

                notification_snapshot = (
                    notification_ref.get(transaction=transaction)
                    if notification_ref
                    else None
                )

                if not current_snapshot.exists:
                    return False

                current = current_snapshot.to_dict()

                # Another operation may have accepted or declined it.
                if current.get("state") != "pending":
                    return False

                expires_at = current.get("expiresAt")

                if expires_at is None or expires_at > now:
                    return False

                # Write phase
                transaction.update(
                    invitation_ref,
                    {
                        "state": "expired",
                        "updatedAt": now,
                    },
                )

                if notification_snapshot and notification_snapshot.exists:
                    transaction.update(
                        notification_ref,
                        {"read": True},
                    )

                if lock_snapshot.exists:
                    lock_data = lock_snapshot.to_dict()

                    if lock_data.get("pendingInvitationId") == snapshot.id:
                        transaction.delete(lock_ref)

                return True

            if expire_transaction(self.db.transaction()):
                expired_count += 1

        return expired_count