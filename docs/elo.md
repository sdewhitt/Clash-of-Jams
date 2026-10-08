# Elo implementation and demo

## Rating policy

- Start at 400 independently for each instrument.
- Preserve the existing K policy: 32 when both pre-match ratings are below 2200; otherwise 16 for both players.
- Compare the two normalized scores (0–1): higher score wins, equal scores draw. Standard Elo uses an actual result of 1, 0.5 or 0; there is no absolute success/failure threshold and score margin does not scale the update.
- Resignation and a server-confirmed disconnect forfeit override the score comparison. The session layer must enforce the agreed 20-second disconnect grace period before finalization.
- Store ratings and deltas to six decimal places; display up to two. Preserve the existing seed-script tiers: bronze below 800, silver from 800, gold from 1000, platinum from 1200, diamond from 1400.
- Fewer than ten rated matches is provisional. This is a flag only; the existing K factor remains unchanged.

Sprint #63's uncertainty model and special provisional-update criteria are intentionally outstanding under the chosen policy. The simulator evaluates this Elo policy; it does not claim those criteria are met.

## Server integration

`backend/app/services/skill_ratings.py` exposes `FinalMatchResult` and `finalize_match(db, result)` for the trusted multiplayer/scoring server. There is no client-accessible endpoint for submitting a winner or changing Elo.

```python
from app.services.skill_ratings import FinalMatchResult, finalize_match

events = finalize_match(db, FinalMatchResult(
    match_id=match_id,
    instrument="piano",
    participant_uids=(player_a_uid, player_b_uid),  # registered match order
    normalized_scores=(score_a, score_b),         # trusted final scores
    reason="completed",
))
```

For forfeits, supply `reason="resigned"` or `"disconnected"` and `forfeiting_uid`. The normalized scores remain useful in the explanation, but do not determine the winner of a forfeit.

One Firestore transaction completes the active versus match, updates both participant results and instrument ratings, and creates two immutable history events. Repeating the same result returns its original events without updating again. Conflicting results, incorrect participants/instruments, inactive matches and missing ratings are rejected. Shared-rating transactions retry when concurrent matches race.

Matches and both instrument ratings must already exist. The [multiplayer session server](multiplayer.md) now calls this function on natural completion, resignation, or disconnect expiry. Its current gameplay input is explicitly synthetic demo taps.

Authenticated GET routes expose only the caller's rating and history:

- `/api/v1/skill-ratings/{instrument}`
- `/api/v1/skill-ratings/{instrument}/history?limit=20` (1–100)

## UI and persistence

The home header shows the preferred instrument's live rating beside the username. Clicking it opens an instrument selector and a brief Elo explanation; instrument changes save to the existing account preference and survive reloads. Recent Matches has its own protected page at `/recent_matches`, reached from the button below Online Play. The old `/ratings` route redirects there. The profile's ratings also update live. Recent Matches supports all instruments and shows the latest 20 results with before/after Elo, delta, normalized scores, expected result, K factor and provisional status. `RatingResult` can be reused on the upcoming multiplayer end screen.

History lives at `users/{uid}/skillRatings/{instrument}/history/{matchId}`. Each event includes the rating inputs, model version and transaction timestamp for replay. Only its owner can read history; clients cannot write it. No extra composite index is needed for the per-instrument `appliedAt` ordering.

The Firestore history rules must be deployed before using the history UI against the cloud project. Firestore read permissions on a rating document do not extend to its history subcollection. If live rules omit the nested owner-only history read, the page can show the current Elo while its history query fails.

The cloud `clash-of-jams` rules were updated on October 8, 2026 to match the repository rules and restore owner-only history reads. The deployment targeted rules only; no match, rating, or history records were changed. After a terminal subscription error, Recent Matches offers **Try again** to create a new listener without reloading. The underlying Firestore error code and message are logged for diagnosis.

Deploy future rule changes explicitly from the repository root:

```bash
npx -y firebase-tools@15.32.1 deploy --config firebase/firebase.json --project clash-of-jams --only firestore:rules
```

For history fixes, verify an owner's descending `appliedAt` query succeeds, other players and signed-out reads fail, and client history writes remain denied. A missing composite index is not the cause of this per-instrument query.

## Local demo

Use Node >=22.22 and Java >=21. The preview at port 5180 and both emulators
were left running after verification. On this machine, a compatible JDK is
already prepared at `/tmp/coj-jdk21/jdk-21.0.12.1+1/Contents/Home`; set
`JAVA_HOME` to that path when restarting the emulators. The bundled Node at
`/Users/adityagandhi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
is version 24.19. The system `firebase` executable has an architecture mismatch;
use the npm CLI below instead.

Keep the Firebase emulators running in one terminal:

```bash
cd firebase
npx -y firebase-tools emulators:start --only auth,firestore --project demo-clash-of-jams
```

Seed disposable accounts in a second terminal (install backend dependencies first with `pip install -e '.[dev]'`):

```bash
cd backend
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
.venv/bin/python scripts/demo_elo.py
```

Start the isolated frontend in a third terminal. These environment overrides keep the existing `.env` and cloud account separate:

```bash
cd frontend
VITE_FIREBASE_API_KEY=demo-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-clash-of-jams.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-clash-of-jams \
VITE_FIREBASE_APP_ID=demo-app \
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

Open `http://127.0.0.1:5180/login`, sign in as `elo-demo@example.test` with `EloDemo123!`, and leave Home open. Generate an explicitly synthetic result:

```bash
cd backend
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
.venv/bin/python scripts/demo_elo.py --result win
```

A fresh account changes from 400 to 416 without refreshing. Click its Elo badge to see the 90% versus 70% breakdown. The script finalizes the same match twice and verifies that it applies once. Other options are `loss`, `draw`, `resign` and `disconnect`. The script rejects non-local emulator hosts and uses only `demo-clash-of-jams`.

These are result fixtures, not a musical playthrough or a queue/concurrency demo. Emulator data is temporary and needs reseeding after restarting.

## Verification

With the emulators running:

```bash
cd backend
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-clash-of-jams .venv/bin/pytest -q
.venv/bin/python scripts/simulate_elo.py --players 500 --matches 20000 --seed 42 --output ../docs/elo-simulation-report.json
# From frontend/:
npm test
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ./node_modules/.bin/vitest run --project rules
npm run typecheck
npm run build
npm run lint
```

Verified: 79 backend tests, 148 frontend unit tests and 55 security-rule tests pass. Backend coverage includes both-player atomicity, rollback, concurrent duplicate and distinct matches, conflicting retries, replay after later data changes, malformed results, K/tier boundaries, forfeits and authenticated-user API scoping. Browser checks confirmed 400→416 without reload, persisted history after reopening, instrument-specific empty history and narrow/desktop header layouts.

The saved seed-42 report has 500 simulated players and 20,000 matches: rank correlation 0.949452, Brier score 0.131727, calibration error 0.080201 and mean absolute rating change 5.999289. A fixed-K=32 baseline is included on the same workload. Synthetic outcomes do not validate ratings for real musicians or establish production latency/concurrency capacity.

Frontend lint exits successfully with existing warnings; the build reports its existing bundle-size warning. New Elo Python modules pass Ruff. Full backend Ruff still reports 30 pre-existing issues (31 on the original revision) in Firebase setup, scenario/review/leaderboard code, shared schemas and the leaderboard seeder.
