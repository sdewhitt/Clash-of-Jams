# Scenario difficulty — Sprint I #32

The Home **Scenario Difficulty** button opens `/scenario_difficulty`. Select a
scenario tab to see its grade, normalized-score chart by player Elo band, sample
coverage, and an interactive rating illustration. Arrow keys switch tabs; the
URL retains the selected scenario on reload. The page uses the existing React
UI, authenticated FastAPI backend, and Standard-edition Firestore. No new hosting
service, deployment, or composite index is required.

## Demo tomorrow

1. Start the existing backend and frontend, sign in, and open **Scenario Difficulty**.
2. **Demo examples** works without creating hundreds of database records. Show
   **Gentle warm-up**, **Steady groove**, and **Fast passage**: comparable synthetic
   players produce increasing difficulty grades.
3. Select an Elo-band card to explain average versus smoothed scores. Move the
   rating slider to illustrate how the same challenge differs by player skill.
4. Show **New composition**: insufficient independent evidence stays provisional.
5. Show **Repeated attempts**: 100 attempts from one player retain only the latest
   three, exclude 97, and cannot manufacture confidence.
6. **Scenario library** reads public and owned scenarios from Firestore. Authors
   can **Recompute and save estimate** when a playable current version exists.
   The emulator browser test demonstrates this path using controlled accepted
   MIDI-run fixtures; those fixtures are test data, not real performances.

Examples are prominently labeled synthetic, never persisted, and never used by
matchmaking or Elo. Their names describe controlled populations; they are not
new playable songs. An existing playable library scenario without eligible
evidence displays a provisional empty state.

For an offline, reproducible numerical demo, from `backend/`:

```bash
.venv/bin/python scripts/demo_difficulty.py --output ../docs/scenario-difficulty-report.json
```

## Estimator contract

`backend/algs/difficulty.py` is a pure, deterministic function over observations
`(run ID, player UID, normalized score, Elo at play, timestamp)`. It uses the
whole score range `[0,1]`; no pass/fail threshold is defined.

1. Reject malformed/non-finite scores and missing identities. Deduplicate IDs;
   conflicting copies are excluded. Sort by timestamp and ID, then average each
   player's latest three eligible attempts. Each player contributes one vote.
2. Group the player's average historical Elo into `<800`, `800–1399`, or `1400+`.
3. For each represented band with `n` players, smooth its mean score `s` using two
   neutral player equivalents: `p = (n*s + 2*0.5)/(n+2)`.
4. Infer a challenge rating `d = meanElo - 400*log10(p/(1-p))` per band and average
   represented bands equally. No-data bands are omitted. Smoothing keeps all-zero
   and all-perfect evidence finite.
5. Map that rating to the existing matchmaking bridge:
   `grade = clamp(1 + (d - baseElo)/eloStep, 1, 10)`, rounded to two decimals.
   Defaults remain `baseElo=400`, `eloStep=200`; backend configuration is shared
   with matchmaking.

**Provisional** requires fewer than 12 distinct players or fewer than two bands.
Otherwise **Easy** is below 4, **Medium** is below 7, and **Hard** is 7 or above.
Confidence is low for provisional estimates, high with at least 30 players across
all three bands, and medium otherwise. These are configurable policy choices,
not measured musical-grade boundaries or statistical confidence intervals.
Equal band weighting reduces domination by a populous skill band; it does not
remove selection bias or account for practice history between players.

The slider renders the inverse curve using the returned challenge rating. It is
an explanation of this heuristic, not a calibrated prediction of a musician's
score. The frontend does not compute or publish difficulty itself.

## Trusted performance evidence and gameplay handoff

The store reads `runs` for a scenario using a single-field equality query. It
accepts only the current immutable version, the first nonempty part for the
scenario's instrument (the same part selection convention as matchmaking),
original speed `1`, and identical scoring rules. It also requires:

| Field              | Required server-validated value                                      |
| ------------------ | -------------------------------------------------------------------- |
| `validation`       | `accepted`                                                           |
| `inputSource`      | `midi` or `audio`                                                    |
| `completionReason` | `completed`                                                          |
| `ratingAtPlay`     | Finite instrument Elo captured when play starts                      |
| `normalizedScore`  | Finite score in `[0,1]`; preferred representation                    |
| `finalScore`       | Fallback only for the current musical scorer's known `[0,100]` scale |
| `playedAt`         | Firestore timestamp                                                  |

Unknown source/rating/completion, tap-demo input, pending/rejected runs, forfeits,
other versions/parts, modified speed, and incompatible rules do not count.
Missing historical Elo is not replaced by a player's current rating. Queries
over 10,000 runs fail explicitly with HTTP 413 instead of silently truncating an
estimate; an offline recomputation path would be needed beyond this limit.

**Current limitation:** solo gameplay currently scores locally and does not
submit an accepted musical run with this metadata. The input/scoring acceptance
pipeline must populate these fields using the Admin SDK before real gameplay
feeds this estimator. Browser clients cannot forge the accepted-run metadata.
This work supplies the consumer, visualization, publication endpoint, and tested
integration contract; it does not replace the team's gameplay work.

## API and persistence

All endpoints require Firebase authentication under `/api/v1/scenario-difficulty`:

| Method/path                      | Behavior                                                               |
| -------------------------------- | ---------------------------------------------------------------------- |
| `GET /examples`                  | Deterministic synthetic examples; no database access                   |
| `GET /scenarios`                 | Public plus caller-owned scenario summaries                            |
| `GET /scenarios/{id}`            | Read-only aggregate computation; private scenarios require owner/admin |
| `POST /scenarios/{id}/recompute` | Owner/admin-only server recomputation and atomic publication           |

The POST takes no score or grade inputs. In one Firestore transaction it checks
the version/owner again, saves `scenarios/{id}/difficultyEstimates/{versionId}`
(model version, band aggregates, coverage, part/speed, and computation timestamp),
and updates `crowdDifficulty` and optional `crowdDifficultyVersionId` on the parent.
Provisional estimates save metadata but leave `crowdDifficulty=null`, preserving
the author-grade fallback. Aggregates contain no raw performances or player UIDs.

The new marker is optional for legacy documents. Newly published estimates are
used by matchmaking only while the marker matches `currentVersionId`; editing
the arrangement therefore invalidates them. Existing unversioned crowd grades
retain their previous behavior. Browser clients cannot write aggregate documents;
their reads follow parent visibility. Authors cannot change published parent
grade/marker fields. There is no automatic recompute trigger in this sprint:
authors/admins explicitly publish, making demo behavior reproducible.

## Research context

Piano difficulty depends on the performer and tempo. Nakamura and Yoshii's
[2018 study](https://arxiv.org/abs/1808.05006) develops score/fingering models and
studies their relationship to performance errors. That supports comparing
performances at a fixed arrangement and speed; it does not validate our Elo
curve or chosen thresholds. [ABRSM](https://www.abrsm.org/en-gb/piano) uses graded
repertoire and assessment criteria; our 1–10 scale is not an ABRSM grade.

This implementation follows Sprint #32's outcome-based scope. A predictive model
from note density, rhythm, hand span or fingering would need separate musical
features and labeled evaluation data, rather than inventing weights for tomorrow.

## Verification

Verified locally on 2026-10-08: **184 backend tests**, **297 frontend unit tests**,
**62 Firestore rules tests**, and **6 difficulty browser tests** passed. The
production build, TypeScript check, and lint passed; existing lint warnings and
the existing large-bundle warning remain. Browser screenshots were reviewed at
desktop and mobile sizes. No cloud deployment or production fixture writes were
performed.

- Backend: deterministic labels/order, continuous scores, invalid/extreme values,
  duplicate evidence, repeat caps, sample confidence, HTTP authentication, filtering,
  private visibility, publication authorization, real Firestore transactions,
  version races, rollback, and matchmaking fallback.
- Frontend: loading/error/empty states, keyboard selection, URL state, band details,
  rating slider, publication/error handling, and stale responses.
- Rules: aggregate privacy and client-write denial (including admin browser
  clients), marker immutability, legacy author edits, and fabricated run evidence.
- Playwright: real Auth, Firestore and FastAPI in desktop Chromium, WebKit and
  mobile Chromium, including actual publication and another user's read-only view.

From `frontend/`, use the existing `npm test`, `npm run test:rules`,
`npm run typecheck`, `npm run lint`, `npm run build`, and:

```bash
npm run test:e2e -- tests/e2e/difficulty/explorer.spec.ts
```

See [the UI testing guide](ui-testing.md) for the emulator environment. Rules
tests can use another local emulator via `FIRESTORE_EMULATOR_HOST` and a separate
`RULES_TEST_PROJECT_ID=demo-...`, without clearing another project's data.

The unit HTTP fixture can be regenerated from `backend/` with:

```bash
.venv/bin/python scripts/demo_difficulty.py --full --output ../frontend/src/test/difficulty-examples.json
```
