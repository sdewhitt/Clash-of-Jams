"""500 temporary Firestore players + concurrent service joins, local emulator only.

Measures queue/store integration, excluding browser/Auth/HTTP and gameplay.
All fixture documents are removed on exit; never clears the emulator database.
"""

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from time import monotonic
from uuid import uuid4

from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client

from app.services.matchmaking import MatchmakingService
from app.services.matchmaking_store import FirestoreMatchmakingStore


def batch_write(db, documents, *, delete=False):
    for offset in range(0, len(documents), 400):
        batch = db.batch()
        for path, value in documents[offset : offset + 400]:
            if delete:
                batch.delete(db.document(path))
            else:
                batch.set(db.document(path), value)
        batch.commit()


def run(count=500):
    host = os.getenv("FIRESTORE_EMULATOR_HOST", "")
    if not host.startswith(("127.0.0.1:", "localhost:")):
        raise SystemExit("Set FIRESTORE_EMULATOR_HOST to a local running emulator first.")
    db = Client(project="demo-clash-of-jams-load", credentials=AnonymousCredentials())
    prefix = "queue-demo-" + uuid4().hex
    uids = [prefix + f"-{i:04}" for i in range(count)]
    now = datetime.now(UTC)
    documents = []
    for uid in uids:
        documents.extend(
            [
                ("users/" + uid, {"uid": uid, "displayName": "Demo Player", "isBanned": False}),
                ("userSettings/" + uid, {"preferredInstrument": "piano"}),
                (
                    f"users/{uid}/skillRatings/piano",
                    {
                        "uid": uid,
                        "instrument": "piano",
                        "elo": 400,
                        "tier": "bronze",
                        "gamesPlayed": 0,
                        "isProvisional": True,
                        "updatedAt": now,
                    },
                ),
            ]
        )
    documents.extend(
        [
            (
                "scenarios/" + prefix,
                {
                    "instrument": "piano",
                    "visibility": "public",
                    "title": "Demo shared riff",
                    "authorDifficulty": 1,
                    "crowdDifficulty": None,
                    "currentVersionId": "v1",
                },
            ),
            (
                f"scenarios/{prefix}/versions/v1",
                {
                    "scoringRules": {
                        "pitchWeight": 0.4,
                        "rhythmWeight": 0.4,
                        "completenessWeight": 0.2,
                        "hitWindowMs": 100,
                        "pitchToleranceCents": 50,
                    },
                    "chart": {
                        "keySignature": 0,
                        "tempoMap": [{"atBeat": 0, "bpm": 100, "timeSigNum": 4, "timeSigDen": 4}],
                        "parts": [
                            {
                                "partId": "lead",
                                "name": "Piano",
                                "instrument": "piano",
                                "notes": [
                                    {
                                        "index": 0,
                                        "midiPitch": 60,
                                        "startBeat": 0,
                                        "durationBeats": 1,
                                        "velocity": 90,
                                    },
                                ],
                            }
                        ],
                    },
                },
            ),
        ]
    )
    reservation_refs = [db.document("matchmakingReservations/" + uid) for uid in uids]

    def claims():
        return [snapshot.to_dict() for snapshot in db.get_all(reservation_refs) if snapshot.exists]

    def snapshot(start):
        assigned = claims()
        return {
            "observedAtSeconds": round(monotonic() - start, 3),
            "matchedPlayers": len(assigned),
            "unassignedPlayers": count - len(assigned),
            "matches": len({item["matchId"] for item in assigned}),
        }

    try:
        batch_write(db, documents)
        service = MatchmakingService(lambda: FirestoreMatchmakingStore(db))
        start = monotonic()

        def execute():
            with ThreadPoolExecutor(max_workers=20) as clients:
                list(clients.map(service.join, uids))
            joined = monotonic() - start
            service.tick()
            return joined, monotonic() - start

        with ThreadPoolExecutor(max_workers=1) as worker:
            completion = worker.submit(execute)
            # A five-second observation runs independently of the service lock.
            from threading import Event

            Event().wait(max(0, 5 - (monotonic() - start)))
            at_five = snapshot(start)
            join_seconds, completed_seconds = completion.result()
        final = snapshot(start)
        persisted = [
            item.to_dict()
            for item in db.get_all(
                [
                    db.document("matches/" + match_id)
                    for match_id in {claim["matchId"] for claim in claims()}
                ]
            )
            if item.exists
        ]
        assigned = [uid for match in persisted for uid in match["participantUids"]]
        assert len(assigned) == len(set(assigned)), "Duplicate assignment"
        assert all(len(match["participantUids"]) == 2 for match in persisted)
        report = {
            "fixturePlayers": count,
            "concurrentJoinThreads": 20,
            "measurement": (
                "Concurrent service joins followed by one full matching pass with real "
                "Firestore transactions; excludes HTTP/Auth/browser/gameplay and fixture setup."
            ),
            "fiveSecondSnapshot": at_five,
            "finalSnapshot": final,
            "joinSeconds": round(join_seconds, 3),
            "completionSeconds": round(completed_seconds, 3),
            "meanRatingGap": mean(m["matchmaking"]["ratingGap"] for m in persisted)
            if persisted
            else None,
            "meanWaitSeconds": mean(
                p["waitSeconds"] for m in persisted for p in m["matchmaking"]["players"]
            )
            if persisted
            else None,
            "rematches": sum(m["matchmaking"]["isRematch"] for m in persisted),
            "uniqueAssignments": len(assigned) == len(set(assigned)),
            "cleanup": (
                "Only this run's temporary users, settings, ratings, scenario, "
                "matches and reservations."
            ),
        }
    finally:
        assigned = claims()
        match_ids = {claim["matchId"] for claim in assigned}
        cleanup = list(documents)
        cleanup.extend((ref.path, None) for ref in reservation_refs)
        for match_id in match_ids:
            cleanup.append(("matches/" + match_id, None))
        for claim in assigned:
            cleanup.append((f"matches/{claim['matchId']}/participants/{claim['uid']}", None))
        batch_write(db, cleanup, delete=True)
        db.close()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--players", type=int, default=500)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 2 <= args.players <= 1000:
        parser.error("--players must be between 2 and 1000")
    report = run(args.players)
    rendered = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered)
    print(rendered, end="")


if __name__ == "__main__":
    main()
