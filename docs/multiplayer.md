# Multiplayer implementation and demo

Home → Online Play → automatic queue → shared lobby → both Ready → 3-second countdown → 60-second demo → results. Matchmaking continues to choose one random compatible scenario/version for both players using its existing Elo/difficulty policy. No Elo or matchmaking algorithm was replaced.

The demo input is a button or Space, with one accepted tap per server second. Its normalized score is accepted beats / 60. This exercises multiplayer independently of the team's instrument/scoring work; it does not measure musical performance. Both screens show live scores and progress. Arrow keys or touch buttons send four fixed phrases; free-form chat is unavailable.

## Server and database

One FastAPI process owns live sessions in memory. Its monotonic clock controls countdown, beat slots, match completion, heartbeats, and disconnect deadlines. WebSockets publish personalized snapshots with a shared match state and server time. The browser derives its visual timer from that time.

Firestore remains the existing persistence platform:

| Location                                                         | Stored state                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `matches/{matchId}`                                              | Shared scenario/version, participant UIDs, state, start/end times, duration, demo input source, protocol/server identifier, final result |
| `matches/{matchId}/participants/{uid}`                           | Identity, starting Elo, readiness at start, final score/outcome and Elo delta                                                            |
| `matchmakingReservations/{uid}`                                  | Existing queue-to-match assignment used by Home's Rejoin button                                                                          |
| `users/{uid}/skillRatings/{instrument}` and `/history/{matchId}` | Existing atomic Elo update and immutable result history                                                                                  |

Input events, live progress, presence and the last 20 preset messages stay in memory. There is no database write per tap/message. Completion calls the existing `finalize_match` transaction; results are shown after both ratings/history records commit. Failed finalization freezes scores and retries once a second. Existing K policy is preserved.

Browsers cannot create matches, alter participants/readiness, or write scores/results in Firestore. Match reads require membership or admin status. Deploy the updated rules when using a cloud project; implementation/testing made no cloud deployment.

## Protocol and recovery

- `GET /api/v1/multiplayer/{matchId}` returns a participant-only snapshot. The client loads this when connecting so the reconnect screen can show the scenario, opponent, scores, and progress even when the socket is unavailable. Live actions stay disabled until the socket reconnects. A slower HTTP response cannot replace a live socket snapshot.
- `WS /api/v1/multiplayer/{matchId}/socket` authenticates the first JSON frame with `{ "token": firebaseIdToken }`. Tokens never appear in the URL. Browser origins must be in `CORS_ORIGINS`.
- Actions carry `eventId`, increasing `sequence`, and `kind`: `ready`, `demo_hit`, `emote` (preset `phrase`), or `resign`. The server deduplicates IDs and rejects older sequences. Clients replay unacknowledged IDs after reconnect.
- A replacement connection supersedes the old tab. Closing the old tab cannot disconnect the replacement. Heartbeats occur every three seconds; the server detects silent connections after ten seconds.
- Closing/navigating away starts a 20-second recovery window. Home offers Rejoin Multiplayer while the match is active. Rejoin restores current scores, messages, readiness and time. The connected opponent can continue playing.
- If one player's recovery window expires before the match ends, they forfeit. If both players are absent at expiry, abandon without changing Elo. A lobby timeout also abandons without Elo. Natural completion takes precedence when its deadline occurs before disconnect expiry.
- Resign requires a confirmation and commits a forfeit through the same Elo path.

This sprint supports browser reconnects to the same server process. Restarting that process abandons an encountered active match without Elo: the live input state was not persisted. Use one worker, without auto-reload during the demo. Completed results survive restarts. Multiple server instances and persistent live-session recovery are future work.

## Local demo

Use the existing local demo emulators at Auth 9099 and Firestore 8080 (`firebase/firebase.json`, project `demo-clash-of-jams`). Node >=22.22, Java >=21 and the backend virtual environment are required. Start them from the repository root if they are not already running:

```bash
npx -y firebase-tools@15.32.1 emulators:start --config firebase/firebase.json --project demo-clash-of-jams --only auth,firestore
```

Seed reusable demo accounts and a public piano exercise:

```bash
cd backend
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
.venv/bin/python scripts/demo_multiplayer.py
```

Start one backend in a separate terminal. This initializes explicit anonymous emulator credentials while keeping token verification enabled:

Restart any backend process that was already running before the multiplayer routes were added. An old process can still match players while rejecting the session socket; Reconnect cannot recover until the current backend code is running.

```bash
cd backend
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIREBASE_PROJECT_ID=demo-clash-of-jams AUTH_DISABLED=false \
.venv/bin/python -c 'import firebase_admin, uvicorn; from google.auth.credentials import AnonymousCredentials; firebase_admin.initialize_app(AnonymousCredentials(), {"projectId": "demo-clash-of-jams"}); uvicorn.run("app.main:app", host="127.0.0.1", port=8000)'
```

Start the frontend in another terminal:

```bash
cd frontend
VITE_FIREBASE_API_KEY=demo-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-clash-of-jams.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-clash-of-jams VITE_FIREBASE_APP_ID=demo-app \
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 VITE_API_BASE_URL='' \
API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev -- --port 5173 --strictPort
```

At `http://localhost:5173`, use two browser profiles (regular/private works): `elo-demo@example.test` and `elo-opponent@example.test`, password `EloDemo123!`. These are disposable emulator accounts. Existing ratings/history are preserved when reseeding.

1. Choose Online Play on both. Show the shared scenario and both Ready controls.
2. Ready both, wait for countdown, tap/Space on each side, and send arrow-key messages.
3. Close one tab, show the opponent's recovery countdown and continued play, then reopen Home and Rejoin within 20 seconds. Repeat for the other player.
4. Finish the minute, or Resign. Show the result breakdown, header Elo update and Recent Matches. In a separate match, leave a player absent for 20 seconds to show the forfeit.

For two computers, both frontends must proxy to the **same** backend. `localhost` refers to each computer separately. Bind the shared backend to `0.0.0.0`, point the second frontend's `API_PROXY_TARGET` to its LAN address, and include the browser origins in backend `CORS_ORIGINS`. Local Firebase emulator URLs also need to be reachable from both computers; using two browser profiles on one computer avoids that extra network setup. No additional hosting service is needed for this demo. A later deployment needs a WebSocket-capable backend and proxy; Firebase Hosting alone cannot run the session process.

## Verification

Verified locally: 143 backend tests, 180 frontend unit tests, 57 Firestore rule tests, frontend typecheck/build/lint, and 82 browser checks across desktop Chromium, desktop WebKit and mobile Chromium (16 specifically cover multiplayer/matchmaking). The shared-play check also verifies a fresh page load with an unavailable socket, HTTP-loaded reconnect details, disabled live controls, and manual recovery; that updated journey passed in all three browser projects. The full-minute check runs once in Chromium; its two other project instances are deliberately skipped. Existing frontend lint/bundle warnings remain.

Backend tests cover concurrent readiness, duplicate/out-of-order input, replay/replacement connections, the exact 20-second boundary, natural completion, draws, resignation, both disconnected, failed storage/retry, authorization, transport and real Firestore/Elo transactions. Browser tests use actual Firebase Auth and WebSockets; gameplay input is explicitly synthetic.

Focused browser command with the dedicated UI emulators running (see [ui-testing.md](ui-testing.md)):

```bash
cd frontend
npm run test:e2e:browser -- tests/e2e/multiplayer tests/e2e/matchmaking
```

`backend/scripts/benchmark_multiplayer.py` seeds and deletes its own local accounts, uses real matchmaking claims and authenticated sockets, and checks duplicate/stale delivery and reconnect recovery. Run it against a fresh local API on port 8290 using the dedicated UI emulator project (`demo-clash-of-jams-ui`, Auth 9199, Firestore 8180), with `MULTIPLAYER_COUNTDOWN_SECONDS=0`. `GET /api/v1/multiplayer/metrics` is admin-only and reports accepted-event receipt/completion/response-enqueue timings, p50/p95/p99, and the p95 <50 ms check.

Start that fresh benchmark API from the repository root in its own terminal:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 \
FIREBASE_PROJECT_ID=demo-clash-of-jams-ui GCLOUD_PROJECT=demo-clash-of-jams-ui \
AUTH_DISABLED=false MULTIPLAYER_COUNTDOWN_SECONDS=0 PYTHONPATH=backend \
backend/.venv/bin/python -c 'import firebase_admin, uvicorn; from google.auth.credentials import AnonymousCredentials; firebase_admin.initialize_app(AnonymousCredentials(), {"projectId": "demo-clash-of-jams-ui"}); uvicorn.run("app.main:app", host="127.0.0.1", port=8290)'
```

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 \
FIREBASE_PROJECT_ID=demo-clash-of-jams-ui PYTHONPATH=backend \
backend/.venv/bin/python backend/scripts/benchmark_multiplayer.py --players 50 --output docs/validation/multiplayer-50-players.json
```

The [saved report](validation/multiplayer-50-players.json) records 50 players / 25 concurrent matches, 375 accepted actions, 50 duplicate and 50 stale actions, 25 recovered players, and 25 completed matches. Receipt-to-response-enqueue latency: p50 **9.0 ms**, p95 **44.3 ms**, p99 **57.3 ms**. This short local emulator run passes the p95 target; it does not establish cloud latency, browser rendering latency, sustained capacity, musical scoring accuracy, or 500-player multiplayer capacity.
