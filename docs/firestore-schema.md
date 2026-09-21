# Firestore Schema

Implements the _Design Details → Primary Database and Class Design_ and _Social
Database Diagram_ sections of the design document (user story #74).

The authoritative definitions live in code, not here:

| File                                     | Holds                                                            |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `frontend/src/lib/schema/types.ts`       | One TypeScript interface per document shape                      |
| `frontend/src/lib/schema/collections.ts` | Collection paths, derived-id helpers, default-document factories |
| `frontend/scripts/init-firestore.ts`     | Writes one template document per collection and reads it back    |
| `firebase/firestore.rules`               | Ownership and moderation rules                                   |
| `firebase/firestore.indexes.json`        | Composite indexes for the queries listed below                   |

## Running the init script

From `frontend/`:

```bash
npm run db:init -- --dry-run   # list what would be written, touch nothing
npm run db:init                # write the template documents, then verify
npm run db:init -- --verify    # re-check an existing database without writing
npm run db:init -- --purge     # delete the template documents again
npm run db:init -- --emulator  # target 127.0.0.1:8080 instead of the cloud
```

Config comes from `VITE_FIREBASE_*` (or bare `FIREBASE_*`) in the environment or
in `frontend/.env.local` — the same values the browser app uses. See
`frontend/.env.example`.

Every template document uses a `seed_` id prefix, so re-running overwrites the
same documents instead of accumulating new ones, and `--purge` removes exactly
what the script wrote.

**Writes need permission.** The rules in `firebase/firestore.rules` deny the seed writes
on purpose (they are not owned by any signed-in user). Pick one:

- run against the emulator (`--emulator`), which is the normal path for testing;
- leave the database in test mode while seeding;
- set `FIREBASE_SEED_EMAIL` / `FIREBASE_SEED_PASSWORD` to an account whose
  `users/{uid}.role` is `admin`, and relax the seed-owned paths accordingly.

## Deploying rules and indexes

The CLI looks for `firebase.json` in the directory it runs from, so these run
from `firebase/`, not the repo root. The package is `firebase-tools` — plain
`npx firebase` picks up the Firebase SDK in `frontend/`, which has no binary.

```bash
cd firebase
npx -y firebase-tools login
npx -y firebase-tools deploy --only firestore:indexes
npx -y firebase-tools deploy --only firestore:rules
npx -y firebase-tools firestore:indexes        # check build progress
npx -y firebase-tools emulators:start --only firestore
```

Index builds are asynchronous: the deploy returns before they finish, and until
they do, the leaderboard and browse queries fail with a "needs an index" error.

## Collections

### Primary

| Path                                          | Document              | Notes                                                                         |
| --------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `users/{uid}`                                 | `UserProfile`         | Id is the Firebase Auth uid. No credentials, ever — Firebase Auth owns those. |
| `users/{uid}/skillRatings/{instrument}`       | `SkillRating`         | One per instrument. Server-written only.                                      |
| `usernames/{usernameLower}`                   | `UsernameReservation` | Reservation doc; the key is what makes usernames unique.                      |
| `userSettings/{uid}`                          | `UserSettings`        | Theme, accessibility, instrument preferences.                                 |
| `scenarios/{scenarioId}`                      | `Scenario`            | Ownership, metadata and aggregates.                                           |
| `scenarios/{scenarioId}/versions/{versionId}` | `ScenarioVersion`     | Immutable musical content.                                                    |
| `mediaAssets/{assetId}`                       | `MediaAsset`          | Pointer into Cloud Storage plus its owner.                                    |
| `runs/{runId}`                                | `Run`                 | One completed attempt, with its embedded `ScoreBreakdown`.                    |
| `matches/{matchId}`                           | `GameMatch`           | Mode, rules, timings, speed multiplier.                                       |
| `matches/{matchId}/participants/{uid}`        | `MatchParticipant`    | Part, team, readiness, outcome.                                               |

### Social

| Path                                      | Document              | Notes                                     |
| ----------------------------------------- | --------------------- | ----------------------------------------- |
| `friendships/{idA_idB}`                   | `Friendship`          | One doc per pair, `idA < idB`.            |
| `communities/{communityId}`               | `Community`           |                                           |
| `communities/{communityId}/members/{uid}` | `CommunityMembership` |                                           |
| `playlists/{playlistId}`                  | `Playlist`            |                                           |
| `playlists/{playlistId}/items/{itemId}`   | `PlaylistItem`        | `position` orders the list.               |
| `scenarioReviews/{scenarioId}_{uid}`      | `ScenarioReview`      |                                           |
| `userReports/{reportId}`                  | `UserReport`          |                                           |
| `moderationActions/{actionId}`            | `ModerationAction`    |                                           |
| `matchInvitations/{invitationId}`         | `MatchInvitation`     |                                           |
| `recordingShares/{shareId}`               | `RecordingShare`      |                                           |
| `importJobs/{jobId}`                      | `ImportJob`           | MIDI, MusicXML and sheet-image ingestion. |

`_schema/meta` holds the schema version and the collection list the script last
wrote. It is bookkeeping, not application data.

## Design decisions worth knowing

**Leaderboards are not a collection.** The design document is explicit that
leaderboard entries are derived from accepted runs rather than stored a second
time. The top of a leaderboard is:

```ts
query(
  collection(db, COLLECTIONS.runs),
  where('scenarioVersionId', '==', versionId),
  where('validation', '==', 'accepted'),
  orderBy('finalScore', 'desc'),
  limit(50),
)
```

Scoping to `scenarioVersionId` rather than `scenarioId` is what makes the
ranking meaningful — every run on one board was scored against identical notes.
The composite indexes in `firebase/firestore.indexes.json` back this and the other
listed queries.

**Musical content is embedded.** `NoteChart` → `ChartPart` → `ExpectedNote` all
live inside the scenario version document, as the design document requires.
They are always read and written whole, so splitting them into documents would
only add reads. Firestore's 1 MiB document limit caps a chart at roughly 10k
notes, which is far beyond anything playable; a scenario approaching it should
be split into parts.

**Onsets are in beats, not milliseconds.** `ExpectedNote.startBeat` plus the
version's `tempoMap` is what keeps the speed multiplier a presentation setting
rather than a change to the chart.

**Scoring rules are copied, not referenced.** `Run.scoringRules` is a snapshot
of the rules in force when the run happened, so changing a scenario's rules
later cannot silently rewrite old scores.

## How the invariants are enforced

| Design document invariant                     | Mechanism                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Usernames unique                           | `usernames/{usernameLower}` reservation; claim it in the same transaction as the profile write. Profanity filtering is a separate check at sign-up. |
| 2. Scenario version numbers unique            | `versionNumber` is assigned from `scenarios/{id}.currentVersionNumber + 1` inside a transaction that also advances the parent.                      |
| 3. One review per user per scenario           | The review's document id is `{scenarioId}_{uid}`, and `firebase/firestore.rules` requires the id to match the body.                                 |
| 4. Foreign keys required                      | Every reference field is non-optional in `types.ts`; the factories in `collections.ts` cannot produce a document that omits one.                    |
| 5. Match finalization and elo commit together | Both are server-side writes in a single Firestore transaction — the client is denied writes to `matches/{id}` and to any `skillRatings` document.   |

Invariants 1, 2 and 5 need transactional writes that do not exist yet; they
belong to the data access layer, not to the schema. Until that lands, the
factories and rules here are what keep the shapes honest.
