"""Queue rules and orchestration use controlled clocks and explicit test storage."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from algs.matchmaking import (
    MatchmakingPolicy,
    QueuePlayer,
    ScenarioCandidate,
    rating_window,
    select_matches,
)
from app.dependencies import get_current_user
from app.routers.matchmaking import router
from app.schemas import CurrentUser
from app.services.matchmaking import MatchmakingService
from app.services.matchmaking_models import LobbyPlayer, MatchedLobby


def player(uid, elo=400, *, games=20, instrument="piano", joined=0, recent=()):
    return QueuePlayer(
        uid,
        instrument,
        elo,
        games,
        joined,
        ticket=uid + "-ticket",
        display_name=uid,
        recent_opponents=frozenset(recent),
    )


def catalog(instrument="piano"):
    return [
        ScenarioCandidate(
            f"s-{level}", f"v-{level}", f"Scenario {level}", instrument, level, "author"
        )
        for level in range(1, 11)
    ]


def test_oldest_player_gets_closest_eligible_opponent():
    players = [player("old", 400, joined=-10), player("far", 490), player("near", 410)]
    (decision,) = select_matches(players, catalog(), 0)
    assert [p.uid for p in decision.players] == ["old", "near"]


def test_window_expands_on_boundary_and_requires_both_players_acceptance():
    policy = MatchmakingPolicy()
    a, b = player("a"), player("b", 550)
    assert rating_window(a, 9.999, policy) == 100
    assert rating_window(a, 10, policy) == 150
    assert not select_matches([a, b], catalog(), 9.999)
    assert len(select_matches([a, b], catalog(), 10)) == 1
    assert not select_matches([a, replace(b, joined_at=10)], catalog(), 10)
    assert rating_window(a, 1000, policy) == 400


def test_provisional_players_have_documented_narrower_initial_window():
    a, b = player("a", games=0), player("b", 480)
    assert not select_matches([a, b], catalog(), 0)
    assert len(select_matches([a, b], catalog(), 10)) == 1
    assert len(select_matches([replace(a, games_played=10), b], catalog(), 0)) == 1


def test_instruments_are_hard_boundaries_but_display_tiers_are_not():
    assert not select_matches([player("a"), player("b", instrument="guitar")], catalog(), 30)
    assert len(select_matches([player("a", 799), player("b", 800)], catalog(), 0)) == 1


def test_rematch_avoided_and_fallback_waits_for_both_players():
    a = player("a", recent=["b"])
    (decision,) = select_matches([a, player("b", 401), player("c", 450)], catalog(), 40)
    assert decision.players[1].uid == "c" and not decision.is_rematch
    assert not select_matches([a, player("b")], catalog(), 29.999)
    assert select_matches([a, player("b")], catalog(), 30)[0].is_rematch


def test_scenarios_must_be_compatible_with_both_ratings():
    assert not select_matches([player("a"), player("b")], catalog("guitar"), 0)
    assert not select_matches([player("a"), player("b")], catalog()[8:], 0)
    (decision,) = select_matches([player("a", 600), player("b", 700)], catalog(), 0)
    assert decision.scenario.difficulty in (2, 3)


def test_random_scenario_selection_is_reproducible_and_uses_multiple_candidates():
    players = [player("a", 600), player("b", 600)]
    first = select_matches(players, catalog(), 0, seed=123)
    assert first == select_matches(list(reversed(players)), list(reversed(catalog())), 0, seed=123)
    assert (
        len({select_matches(players, catalog(), 0, seed=seed)[0].scenario.id for seed in range(30)})
        > 1
    )
    record = first[0].record(MatchmakingPolicy())
    assert record["players"][0]["opponentUid"] == "b"
    assert record["players"][0]["ratingWindow"] == 100


def test_500_compatible_players_have_250_matches_with_no_duplicate_assignments():
    players = [player(f"p-{i:04}") for i in range(500)]
    matches = select_matches(players, catalog(), 0)
    assert len(matches) == 250
    assigned = [p.uid for match in matches for p in match.players]
    assert len(assigned) == len(set(assigned)) == 500
    assert all(match.players[0].uid != match.players[1].uid for match in matches)


def test_odd_queue_leaves_exactly_one_player_and_never_self_matches():
    assert len(select_matches([player(str(i)) for i in range(501)], catalog(), 0)) == 250
    assert not select_matches([player("alone")], catalog(), 0)


@pytest.mark.parametrize("elo", [float("nan"), float("inf")])
def test_malformed_ratings_are_rejected(elo):
    with pytest.raises(ValueError):
        player("a", elo)


def test_duplicate_queue_identity_is_rejected():
    with pytest.raises(ValueError, match="unique"):
        select_matches([player("a"), player("a")], catalog(), 0)


class MemoryStore:
    """Test double only. Firestore transaction behavior has separate emulator tests."""

    def __init__(self):
        self.active = {}
        self.lobbies = {}
        self.fail = False

    def load_player(self, uid, instrument, joined_at, ticket):
        return replace(
            player(uid, instrument=instrument or "piano"), joined_at=joined_at, ticket=ticket
        )

    def load_scenarios(self):
        return catalog()

    def find_active(self, uid):
        return self.active.get(uid)

    def create_lobby(self, match_id, decision, _policy):
        if self.fail:
            raise RuntimeError("Injected commit failure")
        if any(p.uid in self.active for p in decision.players):
            return False
        lobby = MatchedLobby(
            id=match_id,
            state="lobby",
            instrument="piano",
            scenario_id=decision.scenario.id,
            scenario_version_id=decision.scenario.version_id,
            scenario_title=decision.scenario.title,
            scenario_difficulty=decision.scenario.difficulty,
            difficulty_source="author",
            participants=[
                LobbyPlayer(
                    uid=p.uid,
                    display_name=p.display_name,
                    elo=p.elo,
                    is_provisional=p.provisional,
                )
                for p in decision.players
            ],
        )
        self.lobbies[match_id] = lobby
        for p in decision.players:
            self.active[p.uid] = lobby, p.ticket
        return True

    def abandon_lobby(self, uid, ticket):
        if uid not in self.active or self.active[uid][1] != ticket:
            return
        lobby, _ = self.active[uid]
        self.lobbies.pop(lobby.id)
        for p in lobby.participants:
            self.active.pop(p.uid, None)


@pytest.fixture
def service():
    store = MemoryStore()
    clock = [0.0]
    return MatchmakingService(lambda: store, clock=lambda: clock[0]), store, clock


def test_duplicate_join_preserves_ticket_and_wait_age(service):
    matchmaker, _, clock = service
    first = matchmaker.join("a")
    clock[0] = 10
    again = matchmaker.join("a")
    assert first.queue_id == again.queue_id and again.wait_seconds == 10


def test_cancellation_and_stale_ticket_do_not_cancel_a_newer_entry(service):
    matchmaker, _, _ = service
    first = matchmaker.join("a")
    assert matchmaker.cancel("a", first.queue_id).state == "idle"
    second = matchmaker.join("a")
    assert second.queue_id != first.queue_id
    assert matchmaker.cancel("a", first.queue_id).queue_id == second.queue_id


def test_lease_expiry_and_heartbeat(service):
    matchmaker, _, clock = service
    matchmaker.join("a")
    clock[0] = 20
    assert matchmaker.status("a").state == "queued"
    clock[0] = 49
    assert matchmaker.status("a").state == "queued"
    clock[0] = 79
    assert matchmaker.status("a").state == "idle"


def test_concurrent_joins_claim_every_player_once(service):
    matchmaker, store, _ = service
    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(matchmaker.join, [f"p-{i}" for i in range(50)] * 2))
    matchmaker.tick()
    assert len(store.lobbies) == 25 and len(store.active) == 50
    assert len(matchmaker.decisions) == 25


def test_commit_failure_retains_queue_for_retry(service):
    matchmaker, store, _ = service
    first = matchmaker.join("a")
    matchmaker.join("b")
    store.fail = True
    with pytest.raises(RuntimeError):
        matchmaker.tick()
    assert matchmaker.status("a").queue_id == first.queue_id
    store.fail = False
    matchmaker.tick()
    assert matchmaker.status("a").state == "matched"


def test_refresh_preserves_lobby_explicit_leave_releases_both_players(service):
    matchmaker, _, _ = service
    joined = matchmaker.join("a")
    matchmaker.join("b")
    matchmaker.tick()
    assert matchmaker.cancel("a", joined.queue_id).state == "matched"
    assert matchmaker.join("a").match.id == matchmaker.status("b").match.id
    assert matchmaker.cancel("a", joined.queue_id, True).state == "idle"
    assert matchmaker.status("b").state == "idle"


def test_api_identity_is_derived_from_authentication_and_errors_are_visible(service):
    matchmaker, store, _ = service
    app = FastAPI()
    app.state.matchmaking = matchmaker
    app.include_router(router, prefix="/api/v1")

    def identity(request: Request):
        return CurrentUser(uid=request.headers.get("x-test-user", "a"))

    app.dependency_overrides[get_current_user] = identity
    with TestClient(app) as client:
        first = client.post("/api/v1/matchmaking/queue", json={"uid": "b"}).json()
        assert matchmaker.status("b").state == "idle"
        assert client.get("/api/v1/matchmaking/queue").json()["queueId"] == first["queueId"]
        assert (
            client.post("/api/v1/matchmaking/queue", json={"instrument": "invalid"}).status_code
            == 422
        )
        assert client.delete("/api/v1/matchmaking/queue").status_code == 422
        assert (
            client.request(
                "DELETE",
                "/api/v1/matchmaking/queue",
                json={
                    "queueId": first["queueId"],
                },
                headers={"x-test-user": "b"},
            ).json()["state"]
            == "idle"
        )
        assert matchmaker.status("a").state == "queued"
        store.find_active = lambda _uid: (_ for _ in ()).throw(RuntimeError("Database offline"))
        response = client.get("/api/v1/matchmaking/queue")
        assert (
            response.status_code == 503 and "temporarily unavailable" in response.json()["detail"]
        )


def test_queue_requires_authentication(service, monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "false")
    from app.config import get_settings

    get_settings.cache_clear()
    app = FastAPI()
    app.state.matchmaking = service[0]
    app.include_router(router)
    with TestClient(app) as client:
        assert client.post("/matchmaking/queue", json={}).status_code == 401
    get_settings.cache_clear()
