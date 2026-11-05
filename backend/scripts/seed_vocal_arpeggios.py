"""
Vocal seventh-chord arpeggio scenarios with a strict 20-cent pitch tolerance.

    python scripts/seed_vocal_arpeggios.py                 # (re)write the scenarios
    python scripts/seed_vocal_arpeggios.py --author <uid>  # author them as someone else
    python scripts/seed_vocal_arpeggios.py --clean         # remove them

Run from backend/ with the venv active. Every document id starts with "arp_".
Each chart climbs the chord to the octave and back down, in A3, C4 and D4,
so it stays inside a comfortable vocal range (A3 to D5).
"""

import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from seed_demo import DEMO_UID, chart  # noqa: E402

from app.firebase import get_firestore_client  # noqa: E402

PREFIX = "arp_"
ROOTS = [57, 60, 62]  # A3, C4, D4

SCORING_RULES = {
    "pitchWeight": 0.4,
    "rhythmWeight": 0.4,
    "completenessWeight": 0.2,
    "hitWindowMs": 120,
    "pitchToleranceCents": 20,
}

SCENARIOS = [
    # id suffix, title, difficulty, tags, description, chord intervals
    ("maj7", "Major 7 Arpeggios", 5, ["arpeggio", "maj7", "ear training"],
     "Root, 3, 5, 7 up to the octave and back, in A, C and D. Within 20 cents counts.",
     [0, 4, 7, 11]),
    ("dom7", "Dominant 7 Arpeggios", 5, ["arpeggio", "dominant 7", "ear training"],
     "Root, 3, 5, b7 up to the octave and back, in A, C and D. Within 20 cents counts.",
     [0, 4, 7, 10]),
    ("dim7", "Diminished 7 Arpeggios", 7, ["arpeggio", "diminished 7", "ear training"],
     "Root, b3, b5, bb7 up to the octave and back, in A, C and D. Within 20 cents counts.",
     [0, 3, 6, 9]),
]


def arpeggio_pitches(intervals: list[int]) -> list[int]:
    up = [*intervals, 12]
    shape = up + up[-2::-1]
    return [root + i for root in ROOTS for i in shape]


def seed(author_uid: str) -> None:
    db = get_firestore_client()
    now = datetime.now(UTC)
    for key, title, difficulty, tags, description, intervals in SCENARIOS:
        sid = f"{PREFIX}scn_{key}"
        version_id = f"{sid}_v1"
        body, duration_ms = chart("vocals", arpeggio_pitches(intervals), bpm=80, beats=1)
        ref = db.collection("scenarios").document(sid)
        ref.collection("versions").document(version_id).set({
            "id": version_id, "scenarioId": sid, "versionNumber": 1, "chart": body,
            "scoringRules": SCORING_RULES, "durationMs": duration_ms, "mediaAssetIds": [],
            "createdByUid": author_uid, "createdAt": now,
        })
        ref.set({
            "id": sid, "authorUid": author_uid, "title": title, "description": description,
            "instrument": "vocals", "genres": [], "visibility": "public", "tags": tags,
            "authorDifficulty": difficulty, "crowdDifficulty": None,
            "avgRating": None, "ratingCount": 0, "playCount": 0,
            "currentVersionId": version_id, "currentVersionNumber": 1,
            "createdAt": now, "updatedAt": now,
        })
        print(f"Wrote {sid}: {title} ({duration_ms / 1000:.0f}s)")


def clean() -> None:
    db = get_firestore_client()
    for key, *_ in SCENARIOS:
        ref = db.collection("scenarios").document(f"{PREFIX}scn_{key}")
        for version in ref.collection("versions").stream():
            version.reference.delete()
        ref.delete()
    print("Deleted the arpeggio scenarios.")


if __name__ == "__main__":
    if "--clean" in sys.argv:
        clean()
    else:
        args = sys.argv[1:]
        seed(args[args.index("--author") + 1] if "--author" in args else DEMO_UID)
