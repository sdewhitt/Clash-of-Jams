"""Local-only authenticated WebSocket load/fault benchmark; removes owned fixtures.

Run against a fresh serve_ui_tests-equivalent API process on a local port.
Reports accepted event receipt-to-response-enqueue latency, not internet latency.
"""

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

import firebase_admin
from demo_matchmaking import batch_write
from firebase_admin import auth, firestore
from google.auth.credentials import AnonymousCredentials
from websockets.asyncio.client import connect

from algs.matchmaking import MatchmakingPolicy, select_matches
from app.services.matchmaking_store import FirestoreMatchmakingStore

PROJECT = "demo-clash-of-jams-ui"


def request_json(url, *, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(
        url, data=json.dumps(body).encode() if body is not None else None, headers=headers
    )
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def sign_in(email):
    host = os.environ["FIREBASE_AUTH_EMULATOR_HOST"]
    return request_json(
        f"http://{host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
        body={"email": email, "password": "Benchmark123!", "returnSecureToken": True},
    )["idToken"]


class Client:
    def __init__(self, url, token):
        self.url, self.token = url, token
        self.socket = None
        self.sequence = 0
        self.snapshot = None

    async def open(self):
        self.socket = await connect(self.url)
        await self.socket.send(json.dumps({"token": self.token}))
        self.snapshot = (await self.receive())["snapshot"]

    async def receive(self, predicate=lambda _reply: True):
        async with asyncio.timeout(15):
            while True:
                reply = json.loads(await self.socket.recv())
                self.snapshot = reply["snapshot"]
                if predicate(reply):
                    return reply

    async def send(self, kind, *, replay=None, sequence=None, **extra):
        if replay is None:
            self.sequence += 1
            replay = {
                "eventId": uuid4().hex,
                "sequence": sequence or self.sequence,
                "kind": kind,
                **extra,
            }
        await self.socket.send(json.dumps(replay))
        reply = await self.receive(lambda value: value["eventId"] == replay["eventId"])
        return reply, replay

    async def close(self):
        if self.socket is not None:
            await self.socket.close()


async def run(count, base_url):
    if count < 2 or count % 2:
        raise SystemExit("Player count must be an even number of at least two.")
    parsed = urlsplit(base_url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost"):
        raise SystemExit("The benchmark requires a local HTTP API.")
    for key in ("FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"):
        if urlsplit("http://" + os.getenv(key, "")).hostname not in ("127.0.0.1", "localhost"):
            raise SystemExit("Both local Firebase emulators must be explicitly configured.")
    if os.getenv("FIREBASE_PROJECT_ID") != PROJECT:
        raise SystemExit("Use the dedicated demo-clash-of-jams-ui test project.")
    firebase_admin.initialize_app(AnonymousCredentials(), {"projectId": PROJECT})
    db = firestore.client()
    prefix = "session-bench-" + uuid4().hex
    accounts, matches, documents, clients = [], [], [], []
    now = datetime.now(UTC)
    try:
        # Serial account setup is excluded from measured live events.
        for index in range(count + 1):
            uid = prefix + f"-{index:03}"
            email = uid + "@example.test"
            auth.create_user(uid=uid, email=email, password="Benchmark123!")
            accounts.append(uid)
            if index == count:
                auth.set_custom_user_claims(uid, {"role": "admin"})
                admin_token = sign_in(email)
                break
            documents.extend(
                [
                    (
                        "users/" + uid,
                        {"uid": uid, "displayName": "Benchmark player", "isBanned": False},
                    ),
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
                        "title": "Synthetic benchmark riff",
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
                            "tempoMap": [{"atBeat": 0, "bpm": 100}],
                            "parts": [
                                {
                                    "partId": "lead",
                                    "instrument": "piano",
                                    "notes": [
                                        {"midiPitch": 60, "startBeat": 0, "durationBeats": 1}
                                    ],
                                }
                            ],
                        },
                    },
                ),
            ]
        )
        batch_write(db, documents)
        store = FirestoreMatchmakingStore(db)
        players = [store.load_player(uid, "piano", 0, uid + "-ticket") for uid in accounts[:-1]]
        catalog = [scenario for scenario in store.load_scenarios() if scenario.id == prefix]
        policy = MatchmakingPolicy()
        tokens = {}
        for decision in select_matches(players, catalog, 0, policy):
            match_id = prefix + "-" + uuid4().hex
            matches.append(match_id)
            assert store.create_lobby(match_id, decision, policy)
            for player in decision.players:
                tokens[player.uid] = sign_in(player.uid + "@example.test")
                socket_url = (
                    base_url.replace("http://", "ws://") + f"/api/v1/multiplayer/{match_id}/socket"
                )
                clients.append(Client(socket_url, tokens[player.uid]))
        metrics_url = base_url + "/api/v1/multiplayer/metrics"
        before = request_json(metrics_url, token=admin_token)
        if before["sampleCount"]:
            raise SystemExit("Restart the local API before benchmarking so metrics are isolated.")
        assert len(clients) == count
        await asyncio.gather(*(client.open() for client in clients))
        await asyncio.gather(*(client.send("ready") for client in clients))
        for _ in range(5):
            await asyncio.sleep(1.1)
            replies = await asyncio.gather(
                *(client.send("emote", phrase="thanks") for client in clients)
            )
            assert all(reply["disposition"] == "accepted" for reply, _event in replies)
        # Concurrent duplicate and out-of-order delivery must never add a score twice.
        hits = await asyncio.gather(*(client.send("demo_hit") for client in clients))
        assert all(reply["disposition"] == "accepted" for reply, _event in hits)
        duplicates = await asyncio.gather(
            *(
                client.send("demo_hit", replay=hit[1])
                for client, hit in zip(clients, hits, strict=True)
            )
        )
        stale = await asyncio.gather(*(client.send("demo_hit", sequence=1) for client in clients))
        assert all(reply["disposition"] == "duplicate" for reply, _event in duplicates)
        assert all(reply["disposition"] == "rejected" for reply, _event in stale)
        recover = clients[::2]
        await asyncio.gather(*(client.close() for client in recover))
        await asyncio.sleep(0.2)
        await asyncio.gather(*(client.open() for client in recover))
        assert all(
            any(player["beatsHit"] == 1 for player in client.snapshot["participants"])
            for client in recover
        )
        await asyncio.gather(*(client.send("resign") for client in recover))
        report = request_json(metrics_url, token=admin_token)
        report.update(
            players=count,
            simultaneousMatches=len(matches),
            recoveredPlayers=len(recover),
            duplicateEvents=len(duplicates),
            staleEvents=len(stale),
            completedMatches=sum(
                db.document("matches/" + value).get().get("state") == "complete"
                for value in matches
            ),
            inputSource="synthetic demo taps",
            environment="local Firebase emulators",
        )
        return report
    finally:
        await asyncio.gather(*(client.close() for client in clients), return_exceptions=True)
        for match_id in matches:
            db.recursive_delete(db.document("matches/" + match_id))
        for uid in accounts:
            db.recursive_delete(db.document("users/" + uid))
            db.document("userSettings/" + uid).delete()
            db.document("matchmakingReservations/" + uid).delete()
            auth.delete_user(uid)
        db.recursive_delete(db.document("scenarios/" + prefix))
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--players", type=int, default=50)
    parser.add_argument("--api", default="http://127.0.0.1:8290")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = asyncio.run(run(args.players, args.api.rstrip("/")))
    output = json.dumps(report, indent=2) + "\n"
    print(output, end="")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output)
    raise SystemExit(0 if report["passes50Ms"] else 1)
