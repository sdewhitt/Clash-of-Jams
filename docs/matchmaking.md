# Matchmaking implementation and demo

Branch: `matchmaking`. Home → **Online Play** opens `/multiplayer_connect` and
automatically joins the queue using the player's saved instrument. The panel
says “Finding a suitable opponent…”. Once paired, both players see the same
opponent assignment and pinned scenario version. Refresh preserves the lobby;
Home offers **Rejoin Multiplayer**. **Cancel** removes an unmatched ticket;
**Leave lobby** abandons the lobby and releases both players. A player still on
the queue screen automatically queues again when the opponent leaves.

This branch ends at a persistent `lobby`. Gameplay, ready/start, synchronized
progress, messages, resignation and the agreed 20-second disconnect forfeit
belong to the multiplayer session server. Queue/lobby operations do not change
Elo. The existing trusted `finalize_match` integration remains available for
that server after authoritative scoring.

## Policy

The pure policy lives in `backend/algs/matchmaking.py`; queue orchestration and
Firestore storage are separate services. An oldest-first greedy pass gives
each player their closest eligible fresh opponent. This is a bounded quadratic
scan for the current 500-player target. It does not claim a globally optimal
pairing or stable-roommates solution. Those objectives add complexity and can
conflict with queue waiting-time priorities.

| Rule                           | Default                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| Instrument                     | Same instrument only                                            |
| Established initial rating gap | 100 Elo                                                         |
| Provisional initial rating gap | 75 Elo; fewer than 10 rated matches                             |
| Expansion                      | +50 every 10 seconds, capped at 400                             |
| Acceptance                     | Gap must fit both players' current windows                      |
| Recent opponents               | Last five rated opponents within two minutes                    |
| Repeat fallback                | Both wait at least 30 seconds; prefer a fresh eligible opponent |
| Background matching pass       | Once per second                                                 |
| Client polling                 | Every 1.5 seconds; no overlapping polls                         |
| Unmatched queue lease          | 30 seconds without a join/status heartbeat                      |
| Scenario catalog refresh       | Every 10 seconds, invalidated on failed scenario validation     |

Tiers remain Elo display bands. Players near a tier boundary can match across
it; the rating-gap rule determines compatibility. Provisional handling uses
the existing rating and match count, without introducing a new uncertainty
model or changing the Elo K factor.

Eligible scenarios must be public, have a current playable version, match the
instrument and provide valid notes, tempo and scoring rules. Choose randomly
among compatible versions, using a seed and queue tickets for reproducibility.
Both players receive the identical version, part and scoring rules.

The existing difficulty scale is 1–10; player ratings are Elo. Until difficulty
calibration is implemented, the explicit provisional mapping is
`targetElo = 400 + (difficulty - 1) * 200`, within 250 Elo of **each** player.
Use valid `crowdDifficulty` first, otherwise `authorDifficulty`. This conversion
is a configurable bridge, not an academically derived difficulty estimate.
With no compatible scenario, players stay queued instead of receiving an
unplayable or unsuitable match. Settings in `backend/.env.example` configure
the conversion and scenario window.

## Server and database

Run the existing FastAPI service with **one worker and one replica**. The queue
and heartbeat leases live in process memory. A restart clears unmatched queue
entries; the open client detects `idle` and rejoins. Assigned lobbies survive
restarts because they are in Firestore. Multiple replicas would require a
shared queue/coordinator; transactional reservations alone do not coordinate
their separate queues. No additional hosting service, migration or composite
index is required for this implementation.

| Endpoint under `/api/v1`    | Behavior                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| `POST /matchmaking/queue`   | Join idempotently; optional instrument, default saved preference |
| `GET /matchmaking/queue`    | Current caller's queue/lobby snapshot and queue heartbeat        |
| `DELETE /matchmaking/queue` | `{queueId, leaveLobby}`; ticket-scoped cancellation              |

All endpoints derive identity from the verified Firebase token. Ratings and
scenario data come from the server, not the request body. A stale queue ticket
cannot cancel a newer one. Navigation/unload uses `leaveLobby: false` to preserve
an already assigned lobby; the explicit leave button uses `true`.

Assignment is one Firestore transaction:

1. Read both `matchmakingReservations/{uid}` claims and reject any active assignment.
2. Revalidate profiles, bans, ratings, scenario visibility, difficulty and current version.
3. Create one `matches/{matchId}` document with `state: lobby`, pinned rules and decision metadata.
4. Create two `matches/{matchId}/participants/{uid}` documents with assigned part and queue-time identity/rating.
5. Set both reservations to `{uid, matchId, queueId, createdAt}`.

The reservation path is server-only under the existing default-deny Firestore
rules. Clients use the authenticated API. The transaction prevents partial or
double assignment if matching workers compete or a write fails. Lobby leave
atomically marks the match `abandoned` and releases its two claims. A future
session server owns the transition to `in_progress`, forfeit and completion;
queue cancellation rejects an already running game.

## Verification and tomorrow's demo

For a manual demo, run frontend/backend with the same Firebase project and real
authentication. Two browser profiles or devices need distinct signed-in accounts
with the same preferred instrument and similar Elo. Publish at least one
playable scenario with suitable difficulty through the existing editor. Open
Online Play on each, show the shared scenario/opponent, refresh one, return to
Home and rejoin, then leave the lobby and show the other returning to queue.
Start the shared backend from `backend/`:

```bash
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run `npm run dev` from `frontend/`. By default, browser API requests use the
frontend's `/api` proxy, which reaches this backend at `127.0.0.1:8000`.
Both accounts must use the same backend. If both devices open one frontend
server's LAN URL, no API override is needed. If each device runs its own
frontend, set `API_PROXY_TARGET=http://<backend-computer-LAN-IP>:8000` in
each frontend's `.env.local` and restart Vite. Leave `VITE_API_BASE_URL` empty
for proxy mode; an explicit origin remains available for deployed frontends.
`localhost` on two different computers is not a shared server.

The Home Elo badge opens an instrument selector and explanation. Selection is
saved to the existing `userSettings.preferredInstrument`, so reloads and
matchmaking use the same instrument. Recent Matches is a separate Home entry
under Online Play at `/recent_matches`; old `/ratings` links redirect there.

The existing Playwright harness can run the demo against isolated Auth and
Firestore emulators, including local fixture accounts and a published chart:

```bash
cd frontend
npm run test:e2e -- tests/e2e/matchmaking/queue.spec.ts
```

It tests Chrome desktop, Safari desktop and Chrome mobile. Screenshots and
traces are attached to the Playwright report. If reusing a virtual environment
installed from another checkout, set `PYTHONPATH` to this checkout's absolute
`backend` directory so the API imports the branch being tested.

From the repo root, run the deterministic policy comparisons without any database:

```bash
PYTHONPATH=backend backend/.venv/bin/python backend/scripts/simulate_matchmaking.py \
  --output docs/matchmaking-simulation-report.json
```

The seeded report covers 500 dense, uneven, provisional, repeat and staggered
players, sparse odd populations, a repeat-only pair and absent compatible
content. It compares the queue policy with FIFO and a fixed window. Each has
five- and sixty-second simulated snapshots, matched/waiting counts, mean/p95
waits and rating gaps, repeat counts, and unmatched proportions by provisional
status, instrument and tier. It checks unique assignment and conservation.
Waiting players are reported explicitly; greedy selection need not pair
everyone even when an alternative global pairing could do so.

For **actual Firestore queue/store integration** with 500 temporary players,
start the local emulator first (Java 21+), then run:

```bash
# Terminal 1, repo root
npx -y firebase-tools@15.32.1 emulators:start \
  --config firebase/firebase.e2e.json --project demo-clash-of-jams-ui --only auth,firestore

# Terminal 2, repo root
PYTHONPATH=backend FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 \
  backend/.venv/bin/python backend/scripts/demo_matchmaking.py \
  --players 500 --output docs/matchmaking-emulator-report.json

PYTHONPATH=backend FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 \
  backend/.venv/bin/python -m pytest \
  backend/tests/test_matchmaking.py backend/tests/test_matchmaking_emulator.py -q

cd frontend
npm test
npm run build
```

The load demo refuses cloud endpoints, creates an isolated `demo-` project
fixture, joins through 20 concurrent service threads and runs a full matching
pass. It queries durable assignments after about five seconds and at completion,
then removes only its own documents. It measures service/Firestore integration,
excluding fixture setup, HTTP/Auth/browser latency and multiplayer gameplay.
Its final counts also expose a lease expiry or unmatched odd player. It does
not establish a production capacity or session fault-tolerance benchmark.

Tests cover policy boundaries, duplicate joins, concurrent assignments, stale
tickets, leases, compatible random scenarios, changed ratings/scenarios,
moderation at commit, rollback, reload recovery, account isolation, pending-join
cancellation and real authenticated two-browser flows. Saved results are in
[policy report](matchmaking-simulation-report.json) and
[emulator report](matchmaking-emulator-report.json).
