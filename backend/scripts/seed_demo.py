"""
Sprint 1 demo data: a demo_1_user login plus everything the demo script walks through.

    python scripts/seed_demo.py          # (re)build the demo data, then print the numbers to expect
    python scripts/seed_demo.py --check  # only print the numbers to expect
    python scripts/seed_demo.py --clean  # remove everything this script added, login included

Run from backend/ with the venv active. Every document it creates has an id
starting with "demo_", which is how --clean finds them. Seeding starts with a
clean, so re-running resets the demo: a review demo_1_user left while
rehearsing is removed and the scenario's average goes back to what it was.

Sign in as DEMO_EMAIL / DEMO_PASSWORD. Unlike seed_leaderboards.py, every date
here is fixed, so the ranks below don't drift between now and the demo.

What demo_1_user sees:

  ELO leaderboard
    piano   outside the top 100 (105 demo players are above), so the bar shows a percentile;
            two players tie for #2, so the board reads #1, #2, #2, #4
    guitar  #9, inside the top 100, so their own row is highlighted in the list
    vocals  no rating at all, so "Play an online vocals match to get ranked."

  Scenario leaderboards
    Moonlight Sonata - Opening  #31 of 41 all time; #16 with the slider at 9/16 - 9/24.
                                Two players tie for #6, then #8. A banned, a private and
                                a restricted player, plus a half-speed, a pending and a
                                rejected run, all score higher and are all left off.
    Smoke on the Water - Riff   14 players, demo_1_user hasn't played it
    Clair de Lune - Intro       no runs and no reviews: "No scores yet", "Not yet rated"

  Rating
    Fur Elise - Main Theme      demo_1_user has played it but not reviewed it; three
                                existing reviews average 4.3
    Boogie Woogie Warmup        authored by demo_1_user, who has played it, so rating it
                                fails with "Authors cannot rate their own scenario"

Plus eight more scenarios across every instrument, with plays and ratings, so
the search page has something to sort and filter.

Like seed_leaderboards.py, it finishes by recounting every scenario's playCount.
"""

import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from firebase_admin import auth  # noqa: E402
from seed_leaderboards import recount_play_counts  # noqa: E402

from app.firebase import get_firestore_client  # noqa: E402

PREFIX = "demo_"
DEMO_UID = "demo_1_user"
DEMO_USERNAME = "demo_1_user"
DEMO_EMAIL = "demo_1_user@clashofjams.dev"
DEMO_PASSWORD = "ClashDemo2026!"

SCORING_RULES = {
    "pitchWeight": 0.4,
    "rhythmWeight": 0.4,
    "completenessWeight": 0.2,
    "hitWindowMs": 120,
    "pitchToleranceCents": 50,
}

FIRST_NAMES = [
    "Aria", "Ben", "Caleb", "Dana", "Eli", "Farah", "Gabe", "Hana", "Ivan", "Jade",
    "Kofi", "Lena", "Marco", "Nadia", "Omar", "Priya", "Quinn", "Rosa", "Sami", "Tara",
    "Uri", "Vera", "Wade", "Ximena", "Yusuf", "Zara", "Amir", "Bella", "Cyrus", "Daria",
    "Emeka", "Fiona", "Gio", "Hugo", "Iris", "Jonah", "Kira", "Leo", "Maya", "Nico",
]
LAST_NAMES = [
    "Bennett", "Chen", "Diaz", "Evans", "Fischer", "Garcia", "Hughes", "Ito", "Jensen",
    "Kim", "Lopez", "Moreau", "Nakamura", "Okafor", "Patel", "Rossi", "Silva", "Tanaka",
    "Usman", "Vargas", "Walsh", "Xu", "Young", "Zhou", "Novak",
]
PLAYER_COUNT = 125


def day(month: int, dom: int, hour: int = 16) -> datetime:
    """A fixed 2026 date. 16:00 UTC is midday across the US, so the local day matches."""
    return datetime(2026, month, dom, hour, tzinfo=UTC)


def tier_for(elo: float) -> str:
    tiers = [(1400, "diamond"), (1200, "platinum"), (1000, "gold"), (800, "silver")]
    return next((name for floor, name in tiers if elo >= floor), "bronze")


# --------------------------------------------------------------- documents


def profile(uid: str, username: str, display_name: str, created: datetime, *,
            public: bool = True, banned: bool = False, restricted: bool = False) -> dict:
    return {
        "uid": uid,
        "username": username,
        "usernameLower": username.lower(),
        "displayName": display_name,
        "avatarUrl": None,
        "bio": "",
        "role": "user",
        "isBanned": banned,
        "isSocialRestricted": restricted,
        "isProfilePublic": public,
        "createdAt": created,
        "updatedAt": created,
    }


def skill_rating(uid: str, instrument: str, elo: int, games: int) -> dict:
    return {
        "uid": uid,
        "instrument": instrument,
        "elo": elo,
        "tier": tier_for(elo),
        "gamesPlayed": games,
        "isProvisional": games < 10,
        "updatedAt": day(10, 6),
    }


def chart(instrument: str, pitches: list[int], bpm: int = 100,
          beats: float = 0.5) -> tuple[dict, int]:
    """A one-part chart that plays `pitches` in order, plus its length in ms."""
    notes = [
        {"index": i, "midiPitch": p, "startBeat": i * beats, "durationBeats": beats, "velocity": 80}
        for i, p in enumerate(pitches)
    ]
    body = {
        "keySignature": 0,
        "tempoMap": [{"atBeat": 0, "bpm": bpm, "timeSigNum": 4, "timeSigDen": 4}],
        "parts": [{"partId": "lead", "name": "Lead", "instrument": instrument, "notes": notes}],
    }
    return body, round(len(pitches) * beats * 60_000 / bpm)


def run(run_id: str, uid: str, scenario: dict, score: int, played_at: datetime, *,
        speed: float = 1, validation: str = "accepted") -> dict:
    return {
        "id": run_id,
        "userUid": uid,
        "scenarioId": scenario["id"],
        "scenarioVersionId": scenario["currentVersionId"],
        "instrument": scenario["instrument"],
        "partId": "lead",
        "speedMultiplier": speed,
        "scoringRules": SCORING_RULES,
        "finalScore": score,
        "breakdown": {
            "pitchAccuracy": round(score / 100_000, 2),
            "rhythmAccuracy": round(score / 100_000, 2),
            "completeness": 1,
            "notesHit": 8,
            "notesMissed": 0,
            "extraNotes": 0,
            "noteResults": [],
        },
        "validation": validation,
        "matchId": None,
        "matchParticipantUid": None,
        "playedAt": played_at,
    }


# ---------------------------------------------------------------- the data


def build_players(rng: random.Random) -> list[tuple[str, str, str]]:
    """(uid, username, display name) for each demo player, the same every run."""
    pairs = [(f, s) for f in FIRST_NAMES for s in LAST_NAMES]
    rng.shuffle(pairs)
    return [
        (f"{PREFIX}player_{i:03d}", f"{first}_{last}".lower(), f"{first} {last}")
        for i, (first, last) in enumerate(pairs[:PLAYER_COUNT])
    ]


# Players who score at the top but must never appear on a board.
HIDDEN_PLAYERS = [
    (f"{PREFIX}banned", "banned_bryce", "Banned Bryce", {"banned": True}),
    (f"{PREFIX}private", "private_paige", "Private Paige", {"public": False}),
    (f"{PREFIX}restricted", "restricted_rhea", "Restricted Rhea", {"restricted": True}),
]

SCENARIOS = [
    # id suffix, title, instrument, difficulty, genres, tags, author (player index or DEMO_UID),
    # description, pitches
    ("moonlight", "Moonlight Sonata - Opening", "piano", 6, [], ["classical", "beethoven"], 3,
     "The famous triplet arpeggios from the first movement. Keep the left hand soft.",
     [56, 61, 64, 56, 61, 64, 56, 61, 64, 57, 61, 64]),
    ("smoke", "Smoke on the Water - Riff", "guitar", 3, ["rock"], ["riff", "classic rock"], 61,
     "Four bars of the riff everybody learns first.",
     [43, 46, 48, 43, 46, 49, 48, 43, 46, 48, 46, 43]),
    ("clair", "Clair de Lune - Intro", "piano", 7, [], ["classical", "debussy"], 5,
     "The opening bars of Debussy's nocturne, slow and expressive.",
     [77, 73, 77, 73, 75, 72, 75, 72]),
    ("furelise", "Fur Elise - Main Theme", "piano", 4, [], ["classical", "beethoven"], 7,
     "The A section of Beethoven's bagatelle.",
     [76, 75, 76, 75, 76, 71, 74, 72, 69]),
    ("boogie", "Boogie Woogie Warmup", "piano", 3, ["blues"], ["warmup", "left hand"], DEMO_UID,
     "A walking left-hand bass line to loosen up before a session.",
     [48, 52, 55, 57, 58, 57, 55, 52]),
    ("twinkle", "Twinkle Twinkle - Warmup", "piano", 1, ["pop"], ["beginner"], 110,
     "The very first tune: steady quarter notes, no surprises.",
     [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60]),
    ("twelvebar", "12-Bar Blues in E", "guitar", 4, ["blues"], ["shuffle", "rhythm"], 75,
     "A shuffle through the I-IV-V changes in E.",
     [40, 44, 47, 49, 45, 49, 52, 54, 47, 51, 54, 56]),
    ("grace", "Amazing Grace - Melody", "vocals", 2, ["folk"], ["hymn", "beginner"], 101,
     "Sing the first verse; mind the long notes.",
     [55, 60, 64, 60, 64, 62, 60, 57, 55]),
    ("takefive", "Take Five - Head", "woodwind", 8, ["jazz"], ["5/4", "saxophone"], 124,
     "Brubeck's melody in 5/4. Count it out.",
     [63, 66, 68, 70, 73, 70, 68, 66, 63]),
    ("chiptune", "Chiptune Boss Battle", "midi", 9, ["electronic"], ["fast", "8-bit"], 119,
     "Sixteenth-note arpeggios at full speed. Good luck.",
     [72, 76, 79, 84, 79, 76, 72, 76, 79, 84, 88, 84]),
    ("wonderwall", "Wonderwall - Strumming", "guitar", 2, ["rock", "alternative"], ["chords"], 70,
     "The strumming pattern from the intro.",
     [42, 45, 50, 54, 45, 50, 52, 55]),
    ("superstition", "Superstition - Clav Riff", "piano", 5, ["r&b"], ["funk", "riff"], 12,
     "The clavinet riff, syncopated and tight.",
     [63, 63, 66, 63, 68, 63, 70, 68, 66, 63]),
]

# Moonlight's board, written out so every rank in the demo script is visible here.
# (player index, best score, date); "window" is 9/16 - 9/24 on the slider, i.e. runs on 9/16-9/23.
# No run anywhere on this board falls on 9/15, 9/16, 9/24 or 9/25, so landing a thumb one
# day off still gives the same ranks.
MOONLIGHT_BEST = [
    (10, 99_150, day(9, 12)),   # 1
    (11, 98_700, day(9, 18)),   # 2   window
    (12, 98_250, day(9, 27)),   # 3
    (13, 97_850, day(9, 21)),   # 4   window
    (14, 97_400, day(10, 2)),   # 5
    (15, 96_900, day(9, 19)),   # 6   window   tied
    (16, 96_900, day(9, 11)),   # 6            tied
    (17, 96_350, day(9, 29)),   # 8
    (18, 95_800, day(9, 22)),   # 9   window
    (19, 95_150, day(10, 4)),   # 10
    (20, 94_600, day(9, 17)),   # 11  window
    (21, 94_100, day(9, 13)),   # 12
    (22, 93_550, day(9, 20)),   # 13  window
    (23, 93_000, day(9, 23)),   # 14  window
    (24, 92_450, day(9, 26)),   # 15
    (25, 91_900, day(9, 18)),   # 16  window
    (26, 91_300, day(10, 6)),   # 17
    (27, 90_750, day(9, 21)),   # 18  window
    (28, 90_200, day(9, 10)),   # 19
    (29, 89_600, day(9, 19)),   # 20  window
    (30, 89_050, day(9, 30)),   # 21
    (31, 88_500, day(9, 22)),   # 22  window
    (32, 87_900, day(9, 8)),    # 23
    (33, 87_300, day(9, 20)),   # 24  window
    (34, 86_750, day(10, 3)),   # 25
    (35, 86_200, day(9, 17)),   # 26  window
    (36, 85_650, day(9, 14)),   # 27
    (37, 85_100, day(9, 23)),   # 28  window
    (38, 84_800, day(9, 21)),   # 29  window
    (39, 84_550, day(10, 7)),   # 30
    # demo_1_user's 84_350 on 9/20 is #31 all time, and #16 in the window (15 window rows above)
    (40, 83_700, day(10, 1)),
    (41, 82_900, day(9, 20)),   #     window
    (42, 81_450, day(9, 9)),
    (43, 80_100, day(9, 23)),   #     window
    (44, 78_600, day(9, 28)),
    (45, 76_250, day(9, 17)),   #     window
    (46, 73_900, day(10, 6)),
    (47, 70_300, day(9, 21)),   #     window
    (48, 66_800, day(9, 13)),
    (49, 61_500, day(9, 19)),   #     window
]
MOONLIGHT_DEMO_RUNS = [(84_350, day(9, 20)), (71_200, day(9, 10)), (79_900, day(10, 5))]
# Worse runs that the best-run-per-player rule should hide. The three inside the
# window are below demo_1_user's score, so they show "your best run in the range
# counts" without changing the demo's #16.
MOONLIGHT_EXTRA = [
    (10, 82_000, day(9, 19)),
    (19, 79_500, day(9, 22)),
    (30, 83_900, day(9, 18)),
    (11, 90_050, day(9, 9)),
    (13, 91_000, day(10, 1)),
    (18, 88_000, day(9, 12)),
]
# Runs that must not count: (player index, score, date, speed, validation).
MOONLIGHT_IGNORED = [
    (12, 99_990, day(9, 20), 0.5, "accepted"),
    (14, 99_980, day(9, 22), 1, "pending"),
    (17, 99_970, day(9, 18), 1, "rejected"),
]


# ------------------------------------------------------------------- seed


class Writer:
    """A WriteBatch that commits itself before it hits Firestore's 500-write cap."""

    def __init__(self, db) -> None:
        self.db = db
        self.batch = db.batch()
        self.pending = 0
        self.total = 0

    def set(self, ref, data: dict) -> None:
        self.batch.set(ref, data)
        self.pending += 1
        self.total += 1
        if self.pending >= 400:
            self.commit()

    def commit(self) -> None:
        if self.pending:
            self.batch.commit()
        self.batch = self.db.batch()
        self.pending = 0


def ensure_demo_login() -> None:
    try:
        auth.get_user(DEMO_UID)
        auth.update_user(DEMO_UID, email=DEMO_EMAIL, password=DEMO_PASSWORD,
                         display_name=DEMO_USERNAME, disabled=False)
    except auth.UserNotFoundError:
        auth.create_user(uid=DEMO_UID, email=DEMO_EMAIL, password=DEMO_PASSWORD,
                         display_name=DEMO_USERNAME)


def seed() -> None:
    db = get_firestore_client()
    clean(db, keep_login=True)
    ensure_demo_login()

    rng = random.Random(1009)  # fixed seed: same data every time
    out = Writer(db)
    users = db.collection("users")

    def add_user(uid: str, username: str, display_name: str, **flags) -> None:
        created = day(9, 1)
        out.set(users.document(uid), profile(uid, username, display_name, created, **flags))
        out.set(db.collection("usernames").document(username.lower()),
                {"uid": uid, "username": username, "createdAt": created})

    def add_rating(uid: str, instrument: str, elo: int) -> None:
        out.set(users.document(uid).collection("skillRatings").document(instrument),
                skill_rating(uid, instrument, elo, rng.randint(4, 120)))

    # demo_1_user: piano and guitar ratings, deliberately none for vocals.
    add_user(DEMO_UID, DEMO_USERNAME, DEMO_USERNAME)
    out.set(db.collection("userSettings").document(DEMO_UID), {
        "uid": DEMO_UID, "theme": "default", "reduceFlashing": False, "publicBio": True,
        "preferredInstrument": "piano", "publicInstrument": True, "preferredGenres": [],
        "publicGenres": [], "publicElos": ["piano", "guitar"], "inputLatencyOffsetMs": 0,
        "masterVolume": 0.8, "metronomeEnabled": True, "updatedAt": day(9, 1),
    })
    add_rating(DEMO_UID, "piano", 1180)
    add_rating(DEMO_UID, "guitar", 1460)

    players = build_players(rng)
    for uid, username, name in players:
        add_user(uid, username, name)
    for uid, username, name, flags in HIDDEN_PLAYERS:
        add_user(uid, username, name, **flags)
        add_rating(uid, "piano", 2600)  # would top the piano board if they counted

    # Piano: 105 players above demo_1_user's 1180 (#2 is a tie), 15 below.
    piano_top = [2412, 2368, 2368, *sorted(rng.sample(range(1200, 2350), 102), reverse=True)]
    piano_low = rng.sample(range(500, 1150), 15)
    for (uid, _, _), elo in zip(players[:120], piano_top + piano_low, strict=True):
        add_rating(uid, "piano", elo)
    # Guitar: 8 players above demo_1_user's 1460, so they're #9.
    guitar_top = sorted(rng.sample(range(1480, 1950), 8), reverse=True)
    for (uid, _, _), elo in zip(players[60:100], guitar_top + rng.sample(range(450, 1440), 32),
                                strict=True):
        add_rating(uid, "guitar", elo)
    # Vocals: a dozen ranked players; demo_1_user isn't one of them.
    for (uid, _, _), elo in zip(players[100:112], rng.sample(range(550, 1600), 12), strict=True):
        add_rating(uid, "vocals", elo)

    scenarios: dict[str, dict] = {}
    for key, title, instrument, difficulty, genres, tags, author, description, pitches in SCENARIOS:
        sid = f"{PREFIX}scn_{key}"
        version_id = f"{sid}_v1"
        author_uid = author if author == DEMO_UID else players[author][0]
        created = day(9, 1, 12)
        body, duration_ms = chart(instrument, pitches)
        scenario = {
            "id": sid, "authorUid": author_uid, "title": title, "description": description,
            "instrument": instrument, "genres": genres, "visibility": "public", "tags": tags,
            "authorDifficulty": difficulty, "crowdDifficulty": None,
            "avgRating": None, "ratingCount": 0, "playCount": 0,
            "currentVersionId": version_id, "currentVersionNumber": 1,
            "createdAt": created, "updatedAt": created,
        }
        scenarios[key] = scenario
        versions = db.collection("scenarios").document(sid).collection("versions")
        out.set(versions.document(version_id), {
            "id": version_id, "scenarioId": sid, "versionNumber": 1, "chart": body,
            "scoringRules": SCORING_RULES, "durationMs": duration_ms, "mediaAssetIds": [],
            "createdByUid": author_uid, "createdAt": created,
        })

    run_count = 0

    def add_run(uid: str, key: str, score: int, played_at: datetime, **kwargs) -> None:
        nonlocal run_count
        run_count += 1
        run_id = f"{PREFIX}run_{run_count:04d}"
        out.set(db.collection("runs").document(run_id),
                run(run_id, uid, scenarios[key], score, played_at, **kwargs))

    def player(index: int) -> str:
        return players[index][0]

    # Moonlight: the date-filter board.
    for index, score, played_at in MOONLIGHT_BEST + MOONLIGHT_EXTRA:
        add_run(player(index), "moonlight", score, played_at)
    for score, played_at in MOONLIGHT_DEMO_RUNS:
        add_run(DEMO_UID, "moonlight", score, played_at)
    for index, score, played_at, speed, validation in MOONLIGHT_IGNORED:
        add_run(player(index), "moonlight", score, played_at, speed=speed, validation=validation)
    for (uid, _, _, _), score, dom in zip(HIDDEN_PLAYERS, [99_950, 99_900, 99_850], [20, 19, 21],
                                          strict=True):
        add_run(uid, "moonlight", score, day(9, dom))

    def random_runs(key: str, indices: range | list[int], low: int, high: int) -> None:
        for index in indices:
            add_run(player(index), key, rng.randint(low, high) // 50 * 50,
                    day(9, 5) + timedelta(days=rng.randint(0, 31), hours=rng.randint(-3, 3)))

    random_runs("smoke", range(60, 74), 58_000, 98_000)        # demo_1_user hasn't played it
    random_runs("furelise", range(80, 88), 62_000, 97_000)
    add_run(DEMO_UID, "furelise", 91_200, day(10, 2))           # played, not reviewed yet
    random_runs("boogie", range(90, 94), 60_000, 95_000)
    add_run(DEMO_UID, "boogie", 88_000, day(9, 25))             # the author's own run
    random_runs("twinkle", range(105, 120), 75_000, 99_500)
    random_runs("twelvebar", range(64, 73), 55_000, 94_000)
    random_runs("grace", range(100, 106), 60_000, 96_000)
    random_runs("takefive", range(120, 124), 40_000, 85_000)
    random_runs("chiptune", range(121, 124), 20_000, 70_000)
    random_runs("wonderwall", range(70, 77), 65_000, 97_000)
    random_runs("superstition", range(10, 15), 50_000, 92_000)
    # clair: no runs at all

    # Reviews come from players who have a run on the scenario and didn't author it.
    reviews = {
        "furelise": [(80, 5, "Lovely piece to learn, the left hand finally clicked."),
                     (82, 4, "Great practice for the B section."),
                     (85, 4, "Fun, but the tempo ramps up fast.")],
        "boogie": [(90, 5, "Perfect warmup before practice."),
                   (92, 4, "Simple but it gets the left hand moving.")],
        "moonlight": [(11, 5, "Gorgeous. Took me a week to get the triplets even."),
                      (15, 4, "Hard to keep quiet enough!"),
                      (22, 5, "")],
        "smoke": [(60, 4, "Classic."), (63, 3, "A bit short.")],
        "twinkle": [(105, 5, "Great first song."), (107, 5, ""), (108, 4, "Easy and fun."),
                    (112, 5, "My kid loves it."), (115, 4, "")],
        "twelvebar": [(64, 4, "Nice shuffle feel."), (66, 3, ""), (69, 4, "")],
        "grace": [(100, 5, "Beautiful melody to sing."), (102, 4, "")],
        "takefive": [(120, 3, "5/4 is hard!"), (121, 3, "")],
        "chiptune": [(121, 1, "Way too fast for me."), (122, 1, "")],
        "superstition": [(10, 3, "Funky."), (13, 2, "The syncopation keeps tripping me up.")],
        # wonderwall and clair: not yet rated
    }
    for key, entries in reviews.items():
        scenario = scenarios[key]
        for index, stars, comment in entries:
            uid = player(index)
            review_id = f"{scenario['id']}_{uid}"
            out.set(db.collection("scenarioReviews").document(review_id), {
                "id": review_id, "scenarioId": scenario["id"], "reviewerUid": uid,
                "rating": stars, "comment": comment,
                "createdAt": day(10, 1), "updatedAt": day(10, 1),
            })
        scenario["ratingCount"] = len(entries)
        scenario["avgRating"] = sum(stars for _, stars, _ in entries) / len(entries)

    for scenario in scenarios.values():
        out.set(db.collection("scenarios").document(scenario["id"]), scenario)

    out.commit()
    print(f"Wrote {out.total} documents: {len(players) + len(HIDDEN_PLAYERS)} players, "
          f"{len(scenarios)} scenarios, {run_count} runs.")
    recount_play_counts(db)
    print(f"\nSign in as {DEMO_EMAIL} / {DEMO_PASSWORD}\n")
    report()


# ------------------------------------------------------------------ clean


def clean(db=None, *, keep_login: bool = False) -> None:
    db = db or get_firestore_client()
    deleted = 0

    def delete(ref) -> None:
        nonlocal deleted
        ref.delete()
        deleted += 1

    for doc in db.collection("runs").stream():
        if doc.id.startswith(PREFIX):
            delete(doc.reference)
    # Every review of a demo scenario, including any demo_1_user left while rehearsing.
    for doc in db.collection("scenarioReviews").stream():
        if doc.id.startswith(PREFIX):
            delete(doc.reference)
    for doc in db.collection("scenarios").stream():
        if doc.id.startswith(PREFIX):
            for version in doc.reference.collection("versions").stream():
                delete(version.reference)
            delete(doc.reference)
    for doc in db.collection("users").stream():
        if doc.id.startswith(PREFIX):
            for rating in doc.reference.collection("skillRatings").stream():
                delete(rating.reference)
            delete(doc.reference)
    for doc in db.collection("usernames").stream():
        if (doc.to_dict() or {}).get("uid", "").startswith(PREFIX):
            delete(doc.reference)
    settings = db.collection("userSettings").document(DEMO_UID)
    if settings.get().exists:
        delete(settings)

    if not keep_login:
        try:
            auth.delete_user(DEMO_UID)
            print(f"Deleted the {DEMO_EMAIL} login.")
        except auth.UserNotFoundError:
            pass

    print(f"Deleted {deleted} demo documents.")
    if not keep_login:
        recount_play_counts(db)


# ----------------------------------------------------------------- report


def report() -> None:
    """Ask the real leaderboard routes what demo_1_user will see, so the numbers are never stale."""
    from app.routers.leaderboards import get_elo_leaderboard, get_scenario_leaderboard
    from app.schemas import CurrentUser, Instrument

    me = CurrentUser(uid=DEMO_UID)

    def standing(board) -> str:
        if board.my_entry is None:
            return "not ranked"
        return (f"#{board.my_entry.ranking} of {board.total_players} "
                f"(top {board.percentile * 100:.1f}%)")

    def top_ranks(board, n: int = 8) -> str:
        return ", ".join(f"#{e.ranking}" for e in board.entries[:n])

    print("ELO leaderboard")
    for instrument in [Instrument.PIANO, Instrument.GUITAR, Instrument.VOCALS]:
        board = get_elo_leaderboard(me, instrument, limit=100)
        visible = board.my_entry is not None and board.my_entry.ranking <= 100
        print(f"  {instrument.value:7} {standing(board):30} "
              f"{'row visible in list' if visible else 'shown in bottom bar'}; "
              f"top: {top_ranks(board, 5)}")

    db = get_firestore_client()
    print("\nScenario leaderboards")
    for key in ["moonlight", "smoke", "clair", "furelise", "boogie"]:
        sid = f"{PREFIX}scn_{key}"
        scenario = db.collection("scenarios").document(sid).get().to_dict()
        if scenario is None:
            print(f"  {sid}: missing, run the seed first")
            continue
        board = get_scenario_leaderboard(me, sid, f"{sid}_v1", limit=25)
        print(f"  {scenario['title']:30} {standing(board):30} "
              f"rating {scenario['avgRating'] or 'none'} ({scenario['ratingCount']}), "
              f"plays {scenario['playCount']}; top: {top_ranks(board)}")
        if key == "moonlight":
            # The slider's thumbs sit on local midnights; 04:00 UTC is midnight in US Eastern.
            window = get_scenario_leaderboard(me, sid, f"{sid}_v1", limit=25,
                                              played_after=day(9, 16, 4),
                                              played_before=day(9, 24, 4))
            print(f"  {'  slider at 9/16 - 9/24':30} {standing(window)}")

    review_id = f"{PREFIX}scn_furelise_{DEMO_UID}"
    reviewed = db.collection("scenarioReviews").document(review_id).get().exists
    print(f"\ndemo_1_user's Fur Elise review: {'EXISTS' if reviewed else 'none yet (good)'}")


if __name__ == "__main__":
    if "--clean" in sys.argv:
        clean()
    elif "--check" in sys.argv:
        report()
    else:
        seed()
