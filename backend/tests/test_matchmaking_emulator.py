"""Lobby claims use real Firestore transactions in the local demo emulator."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from google.cloud.firestore_v1.transaction import Transaction

from algs.matchmaking import MatchmakingPolicy, select_matches
from app.services.matchmaking import MatchmakingService
from app.services.matchmaking_store import FirestoreMatchmakingStore, MatchmakingError, StalePlayer

pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Requires the Firestore emulator"
)


@pytest.fixture
def arena():
    host = os.environ["FIRESTORE_EMULATOR_HOST"]
    assert host.startswith(("127.0.0.1:", "localhost:")), "Tests require a local emulator"
    db = Client(project="demo-clash-of-jams-matchmaking", credentials=AnonymousCredentials())
    prefix = "queue-test-" + uuid4().hex
    owned = []

    def document(path, value):
        ref = db.document(path)
        ref.set(value)
        owned.append(ref)
        return ref

    now = datetime.now(UTC)
    uids = [prefix + "-" + letter for letter in "abc"]
    for uid in uids:
        document("users/" + uid, {"uid": uid, "displayName": uid, "isBanned": False})
        document("userSettings/" + uid, {"preferredInstrument": "piano"})
        document(
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
        )
    scenario = document(
        "scenarios/" + prefix,
        {
            "instrument": "piano",
            "visibility": "public",
            "title": "Queue test",
            "authorDifficulty": 1,
            "crowdDifficulty": None,
            "currentVersionId": "v1",
        },
    )
    version = document(
        scenario.path + "/versions/v1",
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
                            {"midiPitch": 60, "startBeat": 0, "durationBeats": 1},
                        ],
                    }
                ],
            },
        },
    )
    store = FirestoreMatchmakingStore(db)
    tracked_matches = []

    def match_id():
        value = prefix + "-match-" + uuid4().hex
        tracked_matches.append(value)
        return value

    def decision(pair=None):
        players = [store.load_player(uid, None, 0, uid + "-ticket") for uid in (pair or uids[:2])]
        catalog = [s for s in store.load_scenarios() if s.id == prefix]
        return select_matches(players, catalog, 0)[0]

    yield db, store, uids, scenario, version, document, match_id, decision
    # Only this fixture's documents, including subcollections, are removed.
    assigned = {store.find_active(uid)[0].id for uid in uids if store.find_active(uid)}
    for value in set(tracked_matches) | assigned:
        db.recursive_delete(db.collection("matches").document(value))
    for uid in uids:
        db.collection("matchmakingReservations").document(uid).delete()
    for ref in reversed(owned):
        db.recursive_delete(ref)
    db.close()


def test_shared_lobby_survives_new_service_and_does_not_change_elo(arena):
    db, store, uids, scenario, version, _, match_id, decision = arena
    value = match_id()
    assert store.create_lobby(value, decision(), MatchmakingPolicy())
    first = MatchmakingService(lambda: store).join(uids[0])
    second = MatchmakingService(lambda: FirestoreMatchmakingStore(db)).join(uids[1])
    assert first.match == second.match
    assert first.match.scenario_version_id == version.id
    persisted = db.collection("matches").document(value).get().to_dict()
    assert persisted["state"] == "lobby" and persisted["scenarioId"] == scenario.id
    assert persisted["scoringRules"] == version.get().to_dict()["scoringRules"]
    assert persisted["matchmaking"]["ratingGap"] == 0
    assert (
        len(list(db.collection("matches").document(value).collection("participants").stream())) == 2
    )
    for uid in uids[:2]:
        assert db.document(f"users/{uid}/skillRatings/piano").get().to_dict()["gamesPlayed"] == 0


def test_competing_workers_cannot_assign_one_player_twice(arena):
    db, store, uids, _, _, _, match_id, decision = arena
    choices = [decision(uids[:2]), decision([uids[0], uids[2]])]
    ids = [match_id(), match_id()]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda item: store.create_lobby(*item, MatchmakingPolicy()),
                zip(ids, choices, strict=True),
            )
        )
    assert sorted(results) == [False, True]
    assert sum(db.document("matches/" + value).get().exists for value in ids) == 1
    assert store.find_active(uids[0])[0].id == ids[results.index(True)]


def test_commit_failure_has_no_partial_claims_and_retry_succeeds(arena, monkeypatch):
    db, store, uids, _, _, _, match_id, decision = arena
    value, chosen = match_id(), decision()
    original = Transaction._commit

    def fail(_self):
        raise RuntimeError("Injected queue commit failure")

    monkeypatch.setattr(Transaction, "_commit", fail)
    with pytest.raises(RuntimeError, match="Injected"):
        store.create_lobby(value, chosen, MatchmakingPolicy())
    assert not db.document("matches/" + value).get().exists
    assert not list(db.document("matches/" + value).collection("participants").stream())
    assert all(store.find_active(uid) is None for uid in uids)
    monkeypatch.setattr(Transaction, "_commit", original)
    assert store.create_lobby(value, chosen, MatchmakingPolicy())


@pytest.mark.parametrize(
    "change",
    [
        {"visibility": "private"},
        {"currentVersionId": "missing"},
        {"authorDifficulty": 9},
        {"crowdDifficulty": 1.1},
        {"instrument": "guitar"},
    ],
)
def test_changed_scenario_is_rejected_before_any_claim(arena, change):
    db, store, uids, scenario, _, _, match_id, decision = arena
    chosen, value = decision(), match_id()
    scenario.update(change)
    assert not store.create_lobby(value, chosen, MatchmakingPolicy())
    assert not db.document("matches/" + value).get().exists
    assert all(store.find_active(uid) is None for uid in uids)


def test_rating_change_and_ban_are_checked_at_commit(arena):
    db, store, uids, _, _, _, match_id, decision = arena
    chosen = decision()
    db.document(f"users/{uids[0]}/skillRatings/piano").update({"elo": 401})
    with pytest.raises(StalePlayer):
        store.create_lobby(match_id(), chosen, MatchmakingPolicy())
    chosen = decision()
    db.document("users/" + uids[1]).update({"isBanned": True})
    with pytest.raises(MatchmakingError, match="participant"):
        store.create_lobby(match_id(), chosen, MatchmakingPolicy())
    assert all(store.find_active(uid) is None for uid in uids)


def test_stale_leave_is_ignored_and_explicit_leave_releases_both_players(arena):
    db, store, uids, _, _, _, match_id, decision = arena
    value, chosen = match_id(), decision()
    store.create_lobby(value, chosen, MatchmakingPolicy())
    store.abandon_lobby(uids[0], "stale-ticket")
    assert store.find_active(uids[0])
    store.abandon_lobby(uids[0], chosen.players[0].ticket)
    assert db.document("matches/" + value).get().to_dict()["state"] == "abandoned"
    assert all(store.find_active(uid) is None for uid in uids)
    next_value = match_id()
    assert store.create_lobby(next_value, decision(), MatchmakingPolicy())
    db.document("matches/" + next_value).update({"state": "in_progress"})
    with pytest.raises(MatchmakingError, match="session server"):
        store.abandon_lobby(uids[0], chosen.players[0].ticket)
    assert store.find_active(uids[0])[0].state == "in_progress"


@pytest.mark.parametrize(
    "change",
    [
        {"chart": None},
        {"chart": {"tempoMap": [], "parts": []}},
        {"scoringRules": {"pitchWeight": -1}},
        {"chart": {"tempoMap": [{"atBeat": 0, "bpm": -1}], "parts": []}},
    ],
)
def test_malformed_or_unplayable_versions_are_not_candidates(arena, change):
    _, store, _, scenario, version, _, _, _ = arena
    version.update(change)
    assert scenario.id not in {s.id for s in store.load_scenarios()}


def test_missing_version_and_private_scenario_are_not_candidates(arena):
    _, store, _, scenario, version, _, _, _ = arena
    scenario.update({"visibility": "private"})
    assert scenario.id not in {s.id for s in store.load_scenarios()}
    scenario.update({"visibility": "public"})
    version.delete()
    assert scenario.id not in {s.id for s in store.load_scenarios()}


def test_crowd_difficulty_and_recent_opponents_are_loaded(arena):
    _, store, uids, scenario, _, document, _, _ = arena
    scenario.update({"crowdDifficulty": 1.5})
    candidate = next(s for s in store.load_scenarios() if s.id == scenario.id)
    assert candidate.difficulty == 1.5 and candidate.difficulty_source == "crowd"
    document(
        f"users/{uids[0]}/skillRatings/piano/history/recent",
        {
            "appliedAt": datetime.now(UTC),
            "opponentUid": uids[1],
        },
    )
    assert uids[1] in store.load_player(uids[0], None, 0, "ticket").recent_opponents


def test_queue_reloads_changed_rating_preserving_age_and_ticket(arena):
    db, store, uids, _, _, _, _, _ = arena
    clock = [0.0]
    service = MatchmakingService(lambda: store, clock=lambda: clock[0])
    first = service.join(uids[0])
    service.join(uids[1])
    db.document(f"users/{uids[0]}/skillRatings/piano").update({"elo": 410})
    clock[0] = 10
    service.tick()
    refreshed = service.status(uids[0])
    assert refreshed.state == "queued" and refreshed.queue_id == first.queue_id
    assert refreshed.wait_seconds == 10
    service.tick()
    assert service.status(uids[0]).match.participants[0].elo == 410


def test_banned_participant_does_not_remove_eligible_opponents_ticket(arena):
    db, store, uids, _, _, _, _, _ = arena
    service = MatchmakingService(lambda: store)
    first = service.join(uids[0])
    service.join(uids[1])
    db.document("users/" + uids[1]).update({"isBanned": True})
    service.tick()
    assert service.status(uids[0]).queue_id == first.queue_id
    assert service.status(uids[0]).state == "queued"
    assert service.status(uids[1]).state == "idle"
