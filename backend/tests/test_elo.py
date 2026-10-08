from datetime import UTC, datetime
from math import isfinite

import pytest
from pydantic import ValidationError

from algs.elo import get_expected_score, get_k_factor, rating_tier, updated_elos
from app.schemas import SkillRating
from app.services.skill_ratings import FinalMatchResult, calculate_rating_events

AT = datetime(2026, 10, 7, tzinfo=UTC)


def rating(uid, elo=400, games=0):
    return SkillRating(uid=uid, instrument="piano", elo=elo, games_played=games, updated_at=AT)


def result(**overrides):
    return FinalMatchResult(
        **{
            "match_id": "match-1",
            "instrument": "piano",
            "participant_uids": ("a", "b"),
            "normalized_scores": (0.9, 0.7),
            **overrides,
        }
    )


def test_equal_ratings_and_win_loss():
    assert get_expected_score(400, 400) == (0.5, 0.5)
    assert updated_elos(400, 400, 1) == (416, 384)
    assert updated_elos(400, 400, 2) == (384, 416)


def test_draw_adjusts_unequal_ratings_and_preserves_equal_ratings():
    assert updated_elos(400, 400, 0) == (400, 400)
    high, low = updated_elos(800, 400, 0)
    assert high < 800 and low > 400
    assert high + low == pytest.approx(1200)


def test_upset_is_rewarded_more_than_expected_win():
    low, high = updated_elos(400, 800, 1)
    assert low - 400 > 16
    assert low + high == pytest.approx(1200)
    assert get_expected_score(400, 800)[0] == pytest.approx(1 / 11)


@pytest.mark.parametrize("a,b,k", [(2199, 2199, 32), (2200, 400, 16), (400, 2200, 16)])
def test_existing_k_policy(a, b, k):
    assert get_k_factor(a, b) == k


@pytest.mark.parametrize("winner", [-1, 3, True, None, "1", 1.0])
def test_invalid_winner_is_not_silently_a_draw(winner):
    with pytest.raises(ValueError):
        updated_elos(400, 400, winner)


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), -float("inf"), True, "400"])
def test_invalid_ratings(invalid):
    with pytest.raises(ValueError):
        get_expected_score(invalid, 400)


def test_extreme_finite_ratings_do_not_overflow():
    assert get_expected_score(1e300, -1e300) == (1, 0)
    assert all(isfinite(value) for value in updated_elos(-1e300, 1e300, 1))


@pytest.mark.parametrize(
    "elo,tier",
    [
        (799.99, "bronze"),
        (800, "silver"),
        (999.99, "silver"),
        (1000, "gold"),
        (1200, "platinum"),
        (1400, "diamond"),
    ],
)
def test_existing_tier_boundaries(elo, tier):
    assert rating_tier(elo) == tier


def test_events_include_reproducible_breakdown_and_provisional_boundary():
    events = calculate_rating_events(result(), (rating("a", games=9), rating("b")), AT)
    a, b = events
    assert (a.outcome, b.outcome) == ("win", "loss")
    assert (a.elo_after, b.elo_after) == (416, 384)
    assert a.games_played_after == 10 and not a.is_provisional
    assert b.is_provisional
    assert a.expected_score == 0.5 and a.actual_score == 1 and a.k_factor == 32
    assert a.applied_at == AT and a.model_version == "elo-v1"
    assert events == calculate_rating_events(result(), (rating("a", games=9), rating("b")), AT)


@pytest.mark.parametrize("reason", ["resigned", "disconnected"])
def test_forfeit_overrides_performance_score(reason):
    events = calculate_rating_events(
        result(reason=reason, forfeiting_uid="a"),
        (rating("a"), rating("b")),
        AT,
    )
    assert events[0].outcome == "forfeit" and events[0].elo_after == 384
    assert events[1].outcome == "win" and events[1].elo_after == 416


@pytest.mark.parametrize(
    "overrides",
    [
        {"participant_uids": ("a", "a")},
        {"participant_uids": ("a/b", "c")},
        {"normalized_scores": (1.01, 0.5)},
        {"normalized_scores": (float("nan"), 0)},
        {"reason": "resigned"},
        {"forfeiting_uid": "a"},
        {"match_id": "../bad"},
    ],
)
def test_malformed_final_result(overrides):
    with pytest.raises(ValidationError):
        result(**overrides)


def test_rating_history_replay():
    def replay():
        ratings = (rating("a"), rating("b"))
        history = []
        for i, scores in enumerate(((0.9, 0.7), (0.5, 0.5), (0.2, 0.8), (0.8, 0.7))):
            events = calculate_rating_events(
                result(match_id="match-" + str(i), normalized_scores=scores),
                ratings,
                AT,
            )
            history.extend(events)
            ratings = tuple(
                r.model_copy(
                    update={
                        "elo": event.elo_after,
                        "games_played": event.games_played_after,
                    }
                )
                for r, event in zip(ratings, events, strict=True)
            )
        return ratings, history

    assert replay() == replay()
