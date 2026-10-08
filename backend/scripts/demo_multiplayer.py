"""Seed two reusable local demo accounts and one public shared piano scenario."""

import os
from datetime import UTC, datetime
from urllib.parse import urlsplit

from demo_elo import PROJECT, seed_users
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client


def main():
    for key in ("FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"):
        if urlsplit("http://" + os.getenv(key, "")).hostname not in ("127.0.0.1", "localhost"):
            raise SystemExit("Explicit local Auth and Firestore emulator hosts are required.")
    db = Client(project=PROJECT, credentials=AnonymousCredentials())
    try:
        uids = seed_users(db, os.environ["FIREBASE_AUTH_EMULATOR_HOST"])
        scenario_id = "multiplayer-demo-piano"
        scenario = db.document("scenarios/" + scenario_id)
        if not scenario.get().exists:
            now = datetime.now(UTC)
            batch = db.batch()
            batch.set(
                scenario,
                {
                    "id": scenario_id,
                    "title": "Piano warmup · Multiplayer demo",
                    "description": "Shared demo fixture with synthetic multiplayer beat taps.",
                    "authorUid": uids[0],
                    "instrument": "piano",
                    "visibility": "public",
                    "authorDifficulty": 1,
                    "crowdDifficulty": None,
                    "currentVersionId": "v1",
                    "currentVersionNumber": 1,
                    "createdAt": now,
                    "updatedAt": now,
                },
            )
            batch.set(
                scenario.collection("versions").document("v1"),
                {
                    "id": "v1",
                    "scenarioId": scenario_id,
                    "versionNumber": 1,
                    "createdByUid": uids[0],
                    "createdAt": now,
                    "durationMs": 60_000,
                    "scoringRules": {
                        "pitchWeight": 0.4,
                        "rhythmWeight": 0.4,
                        "completenessWeight": 0.2,
                        "hitWindowMs": 100,
                        "pitchToleranceCents": 50,
                    },
                    "chart": {
                        "keySignature": 0,
                        "tempoMap": [{"atBeat": 0, "bpm": 60, "timeSigNum": 4, "timeSigDen": 4}],
                        "parts": [
                            {
                                "partId": "lead",
                                "name": "Piano",
                                "instrument": "piano",
                                "notes": [
                                    {
                                        "index": index,
                                        "midiPitch": 60 + index % 8,
                                        "startBeat": index,
                                        "durationBeats": 1,
                                        "velocity": 90,
                                    }
                                    for index in range(60)
                                ],
                            }
                        ],
                    },
                },
            )
            batch.commit()
        for uid in uids:
            db.document("userSettings/" + uid).update({"preferredInstrument": "piano"})
        print("Local multiplayer demo ready. Existing Elo/history were preserved.")
        print("Accounts: elo-demo@example.test and elo-opponent@example.test")
        print("Password for both disposable demo accounts: EloDemo123!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
