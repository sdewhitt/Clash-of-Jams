"""Recoverable deletion state and retryable cleanup of a Firebase account."""

import logging
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from firebase_admin import auth, storage
from google.api_core.exceptions import NotFound
from google.cloud.firestore import ArrayRemove, transactional
from google.cloud.firestore_v1.base_query import FieldFilter

from app.config import get_settings
from app.firebase import get_firestore_client

ACCOUNTS = "accountDeletions"
GRACE_PERIOD = timedelta(days=30)
LOG = logging.getLogger(__name__)


class AccountDeletionError(Exception):
    pass


def status_for(uid):
    return get_firestore_client().collection(ACCOUNTS).document(uid).get().to_dict() or {}


def allows_access(account, auth_time):
    return not account or (
        account["state"] == "active" and auth_time > account["authAfter"]
    )


def schedule(uid, auth_time, now):
    db = get_firestore_client()
    marker = db.collection(ACCOUNTS).document(uid)
    backup = marker.collection("private").document("profile")
    user = db.collection("users").document(uid)
    public = db.collection("publicProfile").document(uid)

    @transactional
    def commit(tx):
        existing = marker.get(transaction=tx).to_dict()
        if existing and existing["state"] == "pending_deletion" and existing["purgeAt"] > now:
            return existing["purgeAt"], False
        if not allows_access(existing, auth_time):
            raise AccountDeletionError("The recovery window has ended.")

        profile = user.get(transaction=tx).to_dict()
        projection = public.get(transaction=tx).to_dict()
        deadline = now + GRACE_PERIOD
        if projection is not None:
            projection.pop("friends", None)
            projection.pop("communities", None)
        tx.set(backup, {
            "wasPublic": (profile or {}).get("isProfilePublic", False),
            "publicProfile": projection,
        })
        if profile:
            tx.update(user, {"isProfilePublic": False})
        tx.delete(public)
        tx.delete(db.collection("userStatus").document(uid))
        tx.set(marker, {
            "state": "pending_deletion",
            "purgeAt": deadline,
            "authAfter": int(now.timestamp()),
        })
        return deadline, True

    deadline, created = commit(db.transaction())
    if not created:
        return deadline
    try:
        auth.revoke_refresh_tokens(uid)
    except Exception:
        # The marker already blocks application access, including existing ID tokens.
        LOG.exception("Could not revoke refresh tokens after scheduling account deletion")
    return deadline


def restore(uid, auth_time, now):
    db = get_firestore_client()
    marker = db.collection(ACCOUNTS).document(uid)
    backup = marker.collection("private").document("profile")
    user = db.collection("users").document(uid)

    @transactional
    def commit(tx):
        account = marker.get(transaction=tx).to_dict()
        if not account or allows_access(account, auth_time):
            return
        if account["state"] != "pending_deletion" or account["purgeAt"] <= now:
            raise AccountDeletionError("The recovery window has ended.")
        if auth_time <= account["authAfter"]:
            raise AccountDeletionError("Sign out and sign in again before restoring your account.")
        saved = backup.get(transaction=tx).to_dict()
        profile = user.get(transaction=tx)
        if profile.exists:
            tx.update(user, {"isProfilePublic": saved["wasPublic"]})
        if saved["publicProfile"] is not None:
            projection = saved["publicProfile"]
            current = profile.to_dict() or {}
            projection["friends"] = current.get("friends", [])
            projection["communities"] = current.get("communities", [])
            tx.set(db.collection("publicProfile").document(uid), projection)
        tx.delete(backup)
        tx.set(marker, {"state": "active", "authAfter": account["authAfter"]})

    commit(db.transaction())


def _where(collection, field, op, value):
    return collection.where(filter=FieldFilter(field, op, value)).stream()


def _erase_tree(ref):
    # Use synchronous deletes so a failed descendant is retried before the parent
    # disappears. Firestore does not cascade deletes.
    for collection in ref.collections():
        for child in collection.list_documents():
            _erase_tree(child)
    ref.delete()


def _erase_matches(db, uid):
    for snapshot in _where(db.collection("matches"), "participantUids", "array_contains", uid):
        match = snapshot.reference
        participants = match.collection("participants")
        old = participants.document(uid)
        anonymous_id = "deleted-" + uuid4().hex

        @transactional
        def scrub(tx):
            data = match.get(transaction=tx).to_dict() or {}
            if uid not in data.get("participantUids", []):
                return
            other_uids = [player for player in data["participantUids"] if player != uid]
            old_data = old.get(transaction=tx).to_dict() or {}
            instrument = data.get("matchmaking", {}).get("instrument", "piano")
            histories = [
                db.collection("users").document(player).collection("skillRatings")
                .document(instrument).collection("history").document(match.id)
                for player in other_uids if not player.startswith("deleted-")
            ]
            histories = [ref for ref in histories if ref.get(transaction=tx).exists]
            if data.get("state") == "complete" and any(
                not player.startswith("deleted-") for player in other_uids
            ):
                tx.set(participants.document(anonymous_id), {
                    "uid": anonymous_id, "matchId": match.id, "displayName": "Deleted Player",
                    "partId": old_data.get("partId", "lead"), "team": None, "isReady": False,
                    "joinedAt": data["createdAt"], "outcome": old_data.get("outcome"),
                    "finalScore": old_data.get("finalScore"), "runId": None, "eloDelta": None,
                })
                tx.update(match, {
                    "participantUids": [anonymous_id if player == uid else player
                                        for player in data["participantUids"]],
                    "hostUid": anonymous_id if data.get("hostUid") == uid else data["hostUid"],
                    "winnerUid": anonymous_id if data.get("winnerUid") == uid else data.get("winnerUid"),
                    "matchmaking": {"instrument": data.get("matchmaking", {}).get("instrument", "piano"),
                                    "scenarioTitle": "Past match"},
                })
                for history in histories:
                    tx.update(history, {"opponentUid": anonymous_id})
            else:
                for player in other_uids:
                    tx.delete(participants.document(player))
                tx.delete(match)
            tx.delete(old)

        scrub(db.transaction())


def _erase_review(db, review):
    @transactional
    def commit(tx):
        data = review.reference.get(transaction=tx).to_dict()
        if data is None:
            return
        scenario = db.collection("scenarios").document(data["scenarioId"])
        current = scenario.get(transaction=tx).to_dict()
        if current and current.get("ratingCount", 0) > 0:
            count = current["ratingCount"] - 1
            total = (current.get("avgRating") or 0) * current["ratingCount"]
            average = max(1, min(5, (total - data["rating"]) / count)) if count else None
            tx.update(scenario, {"ratingCount": count, "avgRating": average})
        tx.delete(review.reference)

    commit(db.transaction())


def _erase_storage(db, uid):
    assets = list(_where(db.collection("mediaAssets"), "ownerUid", "==", uid))
    paths = {path for item in assets if (path := item.to_dict().get("storagePath"))}
    prefix = f"users/{uid}/"
    if any(not path.startswith(prefix) for path in paths):
        raise RuntimeError("Media path is outside the account's storage prefix.")
    if paths:
        if os.getenv("FIRESTORE_EMULATOR_HOST") and not os.getenv("STORAGE_EMULATOR_HOST"):
            raise RuntimeError("A local Storage emulator is required to delete emulator files.")
        bucket_name = get_settings().firebase_storage_bucket
        if not bucket_name:
            raise RuntimeError("FIREBASE_STORAGE_BUCKET is required to delete owned files.")
        bucket = storage.bucket(bucket_name)
        for path in paths:
            try:
                bucket.blob(path).delete()
            except NotFound:
                pass
    for item in assets:
        item.reference.delete()


def _purge(db, uid):
    owned = {
        "runs": ("userUid", "matchParticipantUid"),
        "playlists": ("ownerUid",), "recordingShares": ("ownerUid",),
        "importJobs": ("ownerUid",), "notifications": ("notifierUid", "notifiedUid"),
        "matchInvitations": ("fromUid", "toUid"), "userReports": ("reporterUid", "targetId"),
        "moderationActions": ("moderatorUid",), "friendships": ("uidA", "uidB"),
        "friendRequests": ("initiatorUid",), "communities": ("ownerUid",),
        "friendMatchInvitationLocks": ("fromUid", "toUid", "uidA", "uidB"),
    }
    _erase_storage(db, uid)
    _erase_matches(db, uid)
    for item in _where(db.collection("scenarioReviews"), "reviewerUid", "==", uid):
        _erase_review(db, item)
    for item in _where(db.collection("scenarios"), "authorUid", "==", uid):
        for review in _where(db.collection("scenarioReviews"), "scenarioId", "==", item.id):
            review.reference.delete()
        _erase_tree(item.reference)
    for collection, fields in owned.items():
        for field in fields:
            for item in _where(db.collection(collection), field, "==", uid):
                _erase_tree(item.reference)

    for collection, field in (("users", "friends"), ("publicProfile", "friends"),
                              ("communities", "members"), ("friendRequests", "potentialFriends"),
                              ("friendships", "friends")):
        for item in _where(db.collection(collection), field, "array_contains", uid):
            if collection in {"friendRequests", "friendships"}:
                item.reference.delete()
            else:
                item.reference.update({field: ArrayRemove([uid])})
                if collection == "communities":
                    item.reference.collection("members").document(uid).delete()

    for collection in ("users", "userSettings", "userPreferences", "userStatus",
                       "publicProfile", "matchmakingReservations"):
        _erase_tree(db.collection(collection).document(uid))
    try:
        auth.delete_user(uid)
    except auth.UserNotFoundError:
        pass

    for item in _where(db.collection("usernames"), "uid", "==", uid):
        item.reference.delete()


def purge_due_accounts():
    db = get_firestore_client()
    now = datetime.now(UTC)
    due = db.collection(ACCOUNTS).where(filter=FieldFilter("purgeAt", "<=", now)).limit(10)

    for item in due.stream():
        ref = item.reference

        @transactional
        def claim(tx):
            account = ref.get(transaction=tx).to_dict()
            if not account or account.get("purgeAt", now + GRACE_PERIOD) > now:
                return False
            if account["state"] == "purged":
                tx.delete(ref)
                return False
            tx.update(ref, {"state": "purging", "purgeAt": now + timedelta(minutes=15)})
            return True

        try:
            if not claim(db.transaction()):
                continue
            _purge(db, item.id)
            _erase_tree(ref.collection("private").document("profile"))
            # Retain a temporary block for previously issued Firebase ID tokens.
            ref.set({"state": "purged", "purgeAt": datetime.now(UTC) + timedelta(hours=2)})
        except Exception:
            LOG.exception("Account cleanup failed and will retry after its lease expires")
