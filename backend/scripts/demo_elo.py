"""Seed local emulator users; optionally finalize one clearly synthetic match."""

import argparse
import json
import os
from datetime import UTC, datetime
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client

from algs.elo import INITIAL_ELO
from app.services.skill_ratings import FinalMatchResult, finalize_match

PROJECT = "demo-clash-of-jams"
PASSWORD = "EloDemo123!"
INSTRUMENTS = ("piano", "guitar", "woodwind", "vocals", "midi")


def auth_request(host: str, operation: str, email: str):
    request = Request(
        "http://"
        + host
        + "/identitytoolkit.googleapis.com/v1/accounts:"
        + operation
        + "?key=demo-key",
        data=json.dumps(
            {
                "email": email,
                "password": PASSWORD,
                "returnSecureToken": True,
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def seed_users(db, auth_host):
    now = datetime.now(UTC)
    uids = []
    for name, email in (
        ("Elo Demo", "elo-demo@example.test"),
        ("Elo Opponent", "elo-opponent@example.test"),
    ):
        try:
            account = auth_request(auth_host, "signInWithPassword", email)
        except HTTPError as error:
            message = json.loads(error.read()).get("error", {}).get("message", "")
            if message not in ("EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS"):
                raise
            account = auth_request(auth_host, "signUp", email)
        uid = account["localId"]
        uids.append(uid)
        user = db.collection("users").document(uid)
        if user.get().exists:
            continue
        username = name.lower().replace(" ", "_")
        batch = db.batch()
        batch.set(
            user,
            {
                "uid": uid,
                "username": username,
                "usernameLower": username,
                "displayName": name,
                "avatarUrl": None,
                "bio": "Local emulator fixture",
                "role": "user",
                "isBanned": False,
                "isSocialRestricted": False,
                "isProfilePublic": True,
                "createdAt": now,
                "updatedAt": now,
            },
        )
        batch.set(
            db.collection("usernames").document(username),
            {
                "uid": uid,
                "username": username,
                "createdAt": now,
            },
        )
        batch.set(
            db.collection("userSettings").document(uid),
            {
                "uid": uid,
                "theme": "default",
                "reduceFlashing": False,
                "publicBio": True,
                "preferredInstrument": "piano",
                "publicInstrument": True,
                "preferredGenres": [],
                "publicGenres": [],
                "publicElos": list(INSTRUMENTS),
                "inputLatencyOffsetMs": 0,
                "masterVolume": 1,
                "metronomeEnabled": True,
                "updatedAt": now,
            },
        )
        for instrument in INSTRUMENTS:
            batch.set(
                user.collection("skillRatings").document(instrument),
                {
                    "uid": uid,
                    "instrument": instrument,
                    "elo": INITIAL_ELO,
                    "tier": "bronze",
                    "gamesPlayed": 0,
                    "isProvisional": True,
                    "updatedAt": now,
                },
            )
        batch.commit()
    return tuple(uids)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result", choices=("win", "loss", "draw", "resign", "disconnect"))
    args = parser.parse_args()
    store_host = os.getenv("FIRESTORE_EMULATOR_HOST", "")
    auth_host = os.getenv("FIREBASE_AUTH_EMULATOR_HOST", "")
    if not all(host.startswith(("127.0.0.1:", "localhost:")) for host in (store_host, auth_host)):
        parser.error(
            "Both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must target localhost."
        )
    db = Client(project=PROJECT, credentials=AnonymousCredentials())
    uids = seed_users(db, auth_host)
    print("Local emulator fixtures only. Sign in as elo-demo@example.test / " + PASSWORD)
    if args.result:
        match_id = "elo-demo-" + uuid4().hex
        scenario_id = "elo-demo-scenario"
        now = datetime.now(UTC)
        db.collection("scenarios").document(scenario_id).set(
            {
                "id": scenario_id,
                "authorUid": uids[0],
                "title": "Synthetic Elo test fixture",
                "description": "Result data only; no gameplay.",
                "instrument": "piano",
                "genres": [],
                "visibility": "private",
                "tags": [],
                "authorDifficulty": 1,
                "playCount": 0,
                "avgRating": None,
                "crowdDifficulty": None,
                "ratingCount": 0,
                "currentVersionId": None,
                "currentVersionNumber": 0,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        ref = db.collection("matches").document(match_id)
        ref.set(
            {
                "id": match_id,
                "mode": "versus_1v1",
                "state": "in_progress",
                "scenarioId": scenario_id,
                "scenarioVersionId": "elo-demo-v1",
                "participantUids": list(uids),
                "hostUid": uids[0],
                "createdAt": now,
                "startedAt": now,
                "endedAt": None,
                "winnerUid": None,
                "speedMultiplier": 1,
                "scoringRules": {
                    "pitchWeight": 0.4,
                    "rhythmWeight": 0.4,
                    "completenessWeight": 0.2,
                    "hitWindowMs": 120,
                    "pitchToleranceCents": 50,
                },
            }
        )
        for uid in uids:
            ref.collection("participants").document(uid).set(
                {
                    "uid": uid,
                    "matchId": match_id,
                    "partId": "lead",
                    "team": None,
                    "isReady": True,
                    "outcome": None,
                    "finalScore": None,
                    "runId": None,
                    "eloDelta": None,
                    "joinedAt": now,
                }
            )
        scores = {"win": (0.9, 0.7), "loss": (0.7, 0.9), "draw": (0.8, 0.8)}
        reason = {"resign": "resigned", "disconnect": "disconnected"}.get(args.result, "completed")
        result = FinalMatchResult(
            match_id=match_id,
            instrument="piano",
            participant_uids=uids,
            normalized_scores=scores.get(args.result, (0.9, 0.7)),
            reason=reason,
            forfeiting_uid=uids[0] if reason != "completed" else None,
        )
        events = finalize_match(db, result)
        assert events == finalize_match(db, result), "Duplicate replay changed its result"
        print(
            json.dumps([event.model_dump(by_alias=True, mode="json") for event in events], indent=2)
        )
        print("Duplicate finalization verified: applied once.")
    db.close()


if __name__ == "__main__":
    main()
