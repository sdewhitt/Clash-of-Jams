
import math
import pytest

from algs.matchmaking import (
    MatchmakingPolicy,
    QueuePlayer,
    ScenarioCandidate,
    difficulty_elo,
    rating_window,
    select_matches,
    suitable_scenarios,
)


@pytest.fixture
def policy():
    return MatchmakingPolicy()


def make_player(
    uid: str,
    elo: float = 400,
    joined_at: float = 0,
    games_played: int = 0,
    recent_opponents: frozenset[str] = frozenset(),
) -> QueuePlayer:
    return QueuePlayer(
        uid=uid,
        instrument="piano",
        elo=elo,
        games_played=games_played,
        joined_at=joined_at,
        ticket=f"ticket-{uid}",
        display_name=f"Player {uid}",
        recent_opponents=recent_opponents,
    )


def make_scenario(
    scenario_id: str = "scenario-1",
    difficulty: float = 1,
    instrument: str = "piano",
) -> ScenarioCandidate:
    return ScenarioCandidate(
        id=scenario_id,
        version_id="version-1",
        title=f"Scenario {scenario_id}",
        instrument=instrument,
        difficulty=difficulty,
        difficulty_source="author",
        part_id="lead",
        scoring_rules={"pitchWeight": 1},
    )


# -------------------------------------------------------------------
# Policy validation
# -------------------------------------------------------------------

def test_policy_rejects_negative_values():
    with pytest.raises(ValueError):
        MatchmakingPolicy(initial_window=-1)


def test_policy_rejects_non_finite_values():
    with pytest.raises(ValueError):
        MatchmakingPolicy(initial_window=math.inf)


def test_policy_requires_positive_expansion_interval():
    with pytest.raises(ValueError):
        MatchmakingPolicy(expansion_seconds=0)


def test_policy_requires_positive_difficulty_step():
    with pytest.raises(ValueError):
        MatchmakingPolicy(difficulty_elo_step=0)


def test_policy_maximum_window_cannot_be_too_small():
    with pytest.raises(ValueError):
        MatchmakingPolicy(
            initial_window=100,
            maximum_window=50,
        )


# -------------------------------------------------------------------
# QueuePlayer
# -------------------------------------------------------------------

def test_player_is_provisional_below_threshold():
    player = make_player("player-a", games_played=0)

    assert player.provisional is True


def test_player_recent_opponents_defaults_to_empty():
    player = make_player("player-a")

    assert player.recent_opponents == frozenset()


# -------------------------------------------------------------------
# Rating windows
# -------------------------------------------------------------------

def test_provisional_player_starts_with_provisional_window(policy):
    player = make_player("player-a", joined_at=100)

    assert rating_window(player, 100, policy) == policy.provisional_window


def test_rating_window_expands_after_waiting(policy):
    player = make_player("player-a", joined_at=100)

    # 25 seconds / 10-second expansion interval = 2 full steps.
    expected = policy.provisional_window + (2 * policy.expansion_step)

    assert rating_window(player, 125, policy) == expected


def test_rating_window_does_not_exceed_maximum(policy):
    player = make_player("player-a", joined_at=0)

    assert rating_window(player, 10_000, policy) == policy.maximum_window


def test_rating_window_does_not_shrink_below_base(policy):
    player = make_player("player-a", joined_at=100)

    assert rating_window(player, 90, policy) == policy.provisional_window


# -------------------------------------------------------------------
# Scenario difficulty
# -------------------------------------------------------------------

def test_difficulty_elo_uses_configured_scale(policy):
    assert difficulty_elo(1, policy) == 400
    assert difficulty_elo(2, policy) == 600
    assert difficulty_elo(5, policy) == 1200


def test_suitable_scenarios_filters_by_instrument_and_rating(policy):
    player_a = make_player("a", elo=400)
    player_b = make_player("b", elo=400)

    scenarios = [
        make_scenario("matching", difficulty=1, instrument="piano"),
        make_scenario("too-difficult", difficulty=3, instrument="piano"),
        make_scenario("wrong-instrument", difficulty=1, instrument="guitar"),
    ]

    result = suitable_scenarios(
        player_a,
        player_b,
        scenarios,
        policy,
    )

    assert [scenario.id for scenario in result] == ["matching"]


def test_suitable_scenarios_returns_sorted_results(policy):
    player_a = make_player("a")
    player_b = make_player("b")

    scenarios = [
        make_scenario("z-scenario"),
        make_scenario("a-scenario"),
    ]

    result = suitable_scenarios(
        player_a,
        player_b,
        scenarios,
        policy,
    )

    assert [scenario.id for scenario in result] == [
        "a-scenario",
        "z-scenario",
    ]


# -------------------------------------------------------------------
# Match selection
# -------------------------------------------------------------------

def test_select_matches_two_eligible_players(policy):
    players = [
        make_player("a", elo=400),
        make_player("b", elo=450),
    ]

    scenarios = [make_scenario()]

    decisions = select_matches(
        players,
        scenarios,
        now=0,
        policy=policy,
    )

    assert len(decisions) == 1
    assert {p.uid for p in decisions[0].players} == {"a", "b"}


def test_select_matches_prefers_closest_opponent(policy):
    players = [
        make_player("a", elo=400),
        make_player("b", elo=450),
        make_player("c", elo=500),
    ]

    decisions = select_matches(
        players,
        [make_scenario()],
        now=0,
        policy=policy,
    )

    assert len(decisions) == 1
    assert {p.uid for p in decisions[0].players} == {"a", "b"}


def test_select_matches_does_not_match_different_instruments(policy):
    players = [
        make_player("a"),
        QueuePlayer(
            uid="b",
            instrument="guitar",
            elo=400,
            games_played=0,
            joined_at=0,
        ),
    ]

    decisions = select_matches(
        players,
        [make_scenario()],
        now=0,
        policy=policy,
    )

    assert decisions == []


def test_select_matches_requires_a_suitable_scenario(policy):
    players = [
        make_player("a", elo=400),
        make_player("b", elo=400),
    ]

    decisions = select_matches(
        players,
        [make_scenario(difficulty=5)],
        now=0,
        policy=policy,
    )

    assert decisions == []


def test_select_matches_does_not_reuse_players(policy):
    players = [
        make_player("a", elo=400),
        make_player("b", elo=410),
        make_player("c", elo=420),
        make_player("d", elo=430),
    ]

    decisions = select_matches(
        players,
        [make_scenario()],
        now=0,
        policy=policy,
    )

    matched_uids = [
        player.uid
        for decision in decisions
        for player in decision.players
    ]

    assert len(matched_uids) == len(set(matched_uids))


def test_select_matches_is_deterministic(policy):
    players = [
        make_player("a", elo=400),
        make_player("b", elo=450),
    ]

    scenarios = [
        make_scenario("scenario-a"),
        make_scenario("scenario-b"),
    ]

    first = select_matches(
        players,
        scenarios,
        now=0,
        policy=policy,
        seed=42,
    )

    second = select_matches(
        players,
        scenarios,
        now=0,
        policy=policy,
        seed=42,
    )

    assert first == second


# -------------------------------------------------------------------
# Rematch prevention
# -------------------------------------------------------------------

def test_recent_opponents_are_initially_excluded(policy):
    player_a = make_player(
        "a",
        recent_opponents=frozenset({"b"}),
    )
    player_b = make_player(
        "b",
        recent_opponents=frozenset({"a"}),
    )

    decisions = select_matches(
        [player_a, player_b],
        [make_scenario()],
        now=29,
        policy=policy,
    )

    assert decisions == []


def test_recent_opponents_can_match_after_wait_threshold(policy):
    player_a = make_player(
        "a",
        recent_opponents=frozenset({"b"}),
    )
    player_b = make_player(
        "b",
        recent_opponents=frozenset({"a"}),
    )

    decisions = select_matches(
        [player_a, player_b],
        [make_scenario()],
        now=30,
        policy=policy,
    )

    assert len(decisions) == 1
    assert decisions[0].is_rematch is True


# -------------------------------------------------------------------
# Match decision metadata
# -------------------------------------------------------------------

def test_match_decision_record_contains_player_metadata(policy):
    players = [
        make_player("a", elo=400),
        make_player("b", elo=450),
    ]

    decision = select_matches(
        players,
        [make_scenario()],
        now=5,
        policy=policy,
    )[0]

    record = decision.record(policy)

    assert record["policyVersion"] == policy.version
    assert record["ratingGap"] == 50
    assert record["isRematch"] is False
    assert len(record["players"]) == 2
    assert record["players"][0]["uid"] == "a"
    assert record["players"][0]["opponentUid"] == "b"
