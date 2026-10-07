"""
Fill Firestore with leaderboard test data, or remove it again.

    python scripts/seed_leaderboards.py          # add the data
    python scripts/seed_leaderboards.py --clean  # remove everything this script added

Run from backend/ with the venv active. Every document it creates has an id
starting with "lbtest_", which is how --clean finds them, so it never touches
real data.

What it adds, all on seed_scenario_v1 (the only scenario with a version):
  - 30 fake players with public profiles, plus one banned and one private
    player who should never appear on a board
  - a piano skillRating for each fake player, for the ELO board
  - 1-4 runs per fake player spread over the last 30 days, including a tie,
    a half-speed run and a pending run that should all be ignored
  - one or two runs for each real account, ranked low enough that most of you
    land outside the top 25 and see the "your standing" bar

Both modes finish by recounting every scenario's playCount from the runs that
exist. Until a run-submission route increments it, this is the only thing that
sets playCount.
"""

import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.firebase import get_firestore_client  # noqa: E402

PREFIX = "lbtest_"
SCENARIO_ID = "seed_scenario"
VERSION_ID = "seed_scenario_v1"
NOW = datetime.now(UTC)

FAKE_NAMES = [
    "Arpeggio Annie", "Bassline Ben", "Cadence Cleo", "Downbeat Dev", "Encore Eli",
    "Fermata Fay", "Glissando Gus", "Harmony Hal", "Interval Ivy", "Jazzhands Jo",
    "Key Change Kai", "Legato Lou", "Metronome Max", "Nocturne Nia", "Octave Otto",
    "Pizzicato Pia", "Quaver Quinn", "Riff Rory", "Staccato Sam", "Tempo Tess",
    "Unison Uma", "Vibrato Vic", "Waltz Wes", "Xylo Xena", "Yodel Yuri",
    "Zither Zoe", "Allegro Ash", "Bridge Bea", "Chorus Cal", "Duet Dot",
]

# Real accounts get a run or two so you can see your own highlighted row.
# Scores are mostly low so several of you land outside the top 25.
REAL_USERS = {
    "JIyGqxJhN0PC608Rj3UNzKg93XL2": [71_500, 64_000],
    "QdF0TLm9WNZI1KHUvTrFA8j0PwR2": [88_000],
    "XbZfh03jVjeH1tJoVmWWvVfgZnS2": [55_000],
    "Z566nD9eTfPXdMWpyWh1CmA4nRT2": [60_250],
    "geoFgNC2EiPI7IL3AhlaHSkHdRq2": [93_750, 80_000],
    "r1iBnxVU42VPox3SIVwgQK3R6UX2": [58_000, 49_500],
    "yELg0d2UiydoYYRlonVbQqe2vGx1": [76_000],
}

SCORING_RULES = {
    "pitchWeight": 0.4,
    "rhythmWeight": 0.4,
    "completenessWeight": 0.2,
    "hitWindowMs": 120,
    "pitchToleranceCents": 50,
}


def profile(uid: str, name: str, *, public: bool = True, banned: bool = False) -> dict:
    username = name.lower().replace(" ", "_")
    return {
        "uid": uid,
        "username": username,
        "usernameLower": username,
        "displayName": name,
        "avatarUrl": None,
        "bio": "Leaderboard test player",
        "role": "user",
        "isBanned": banned,
        "isSocialRestricted": False,
        "isProfilePublic": public,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def skill_rating(uid: str, elo: float, games: int) -> dict:
    tiers = [(1400, "diamond"), (1200, "platinum"), (1000, "gold"), (800, "silver")]
    tier = next((name for floor, name in tiers if elo >= floor), "bronze")
    return {
        "uid": uid,
        "instrument": "piano",
        "elo": elo,
        "tier": tier,
        "gamesPlayed": games,
        "isProvisional": games < 10,
        "updatedAt": NOW,
    }


def run(run_id: str, uid: str, score: float, played_at: datetime, *,
        speed: float = 1, validation: str = "accepted") -> dict:
    return {
        "id": run_id,
        "userUid": uid,
        "scenarioId": SCENARIO_ID,
        "scenarioVersionId": VERSION_ID,
        "instrument": "piano",
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


def days_ago(rng: random.Random, max_days: int = 30) -> datetime:
    return NOW - timedelta(days=rng.uniform(0, max_days))


def seed() -> None:
    db = get_firestore_client()
    rng = random.Random(407)  # fixed seed: same data every time
    batch = db.batch()
    run_count = 0

    def add_run(uid: str, score: float, **kwargs) -> None:
        nonlocal run_count
        run_count += 1
        run_id = f"{PREFIX}run_{run_count:03d}"
        played_at = kwargs.pop("played_at", None) or days_ago(rng)
        batch.set(db.collection("runs").document(run_id), run(run_id, uid, score, played_at, **kwargs))

    for i, name in enumerate(FAKE_NAMES):
        uid = f"{PREFIX}user_{i:02d}"
        user_ref = db.collection("users").document(uid)
        batch.set(user_ref, profile(uid, name))
        batch.set(
            user_ref.collection("skillRatings").document("piano"),
            skill_rating(uid, round(rng.uniform(450, 1500)), rng.randint(2, 40)),
        )
        best = rng.randint(65_000, 99_000)
        add_run(uid, best)
        for _ in range(rng.randint(0, 3)):  # older, worse attempts that dedup should hide
            add_run(uid, best - rng.randint(1_000, 20_000))

    # Two players tied on score: both should show the same rank.
    add_run(f"{PREFIX}user_00", 95_000, played_at=NOW - timedelta(days=2))
    add_run(f"{PREFIX}user_01", 95_000, played_at=NOW - timedelta(days=3))
    # Runs that should never count: half speed, and not yet validated.
    add_run(f"{PREFIX}user_02", 99_999, speed=0.5)
    add_run(f"{PREFIX}user_03", 99_998, validation="pending")

    # Players who should never appear on a board.
    for uid, name, kwargs in [
        (f"{PREFIX}banned", "Banned Bob", {"banned": True}),
        (f"{PREFIX}private", "Private Pat", {"public": False}),
    ]:
        user_ref = db.collection("users").document(uid)
        batch.set(user_ref, profile(uid, name, **kwargs))
        batch.set(user_ref.collection("skillRatings").document("piano"), skill_rating(uid, 1600, 50))
        add_run(uid, 99_500)

    for uid, scores in REAL_USERS.items():
        for score in scores:
            add_run(uid, score)

    batch.commit()
    print(f"Added {len(FAKE_NAMES) + 2} test players and {run_count} runs on {VERSION_ID}.")
    recount_play_counts(db)


def clean() -> None:
    db = get_firestore_client()
    deleted = 0
    for doc in db.collection("runs").stream():
        if doc.id.startswith(PREFIX):
            doc.reference.delete()
            deleted += 1
    for doc in db.collection("users").stream():
        if doc.id.startswith(PREFIX):
            for rating in doc.reference.collection("skillRatings").stream():
                rating.reference.delete()
                deleted += 1
            doc.reference.delete()
            deleted += 1
    print(f"Deleted {deleted} test documents.")
    recount_play_counts(db)


def recount_play_counts(db) -> None:
    """Set every scenario's playCount to its number of runs, whatever their validation state."""
    counts: dict[str, int] = {}
    for doc in db.collection("runs").stream():
        scenario_id = doc.get("scenarioId")
        counts[scenario_id] = counts.get(scenario_id, 0) + 1

    batch = db.batch()
    for scenario in db.collection("scenarios").stream():
        batch.update(scenario.reference, {"playCount": counts.get(scenario.id, 0)})
    batch.commit()
    print("Recounted playCount:", {sid: n for sid, n in counts.items()} or "no runs")


if __name__ == "__main__":
    clean() if "--clean" in sys.argv else seed()
