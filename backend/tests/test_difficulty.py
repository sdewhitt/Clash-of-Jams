"""Sprint #32: continuous scores, independence, coverage, malformed data and repeatability."""

from dataclasses import replace
from random import Random

import pytest

from algs.difficulty import DifficultyPolicy, Observation, estimate_difficulty
from app.services.matchmaking_store import scenario_difficulty
from app.services.scenario_difficulty import example_details


def population(score=0.5, count=12):
    return [
        Observation(
            id=str(i), uid="player-" + str(i), elo=500 if i % 2 == 0 else 1100, score=score, order=i
        )
        for i in range(count)
    ]


def test_fixture_grades_and_metadata():
    examples = example_details()
    assert [item.estimate.label for item in examples] == [
        "Easy",
        "Medium",
        "Hard",
        "Provisional",
        "Provisional",
    ]
    assert all(item.source == "synthetic" and not item.can_publish for item in examples)
    assert all(item.estimate.model_version == "score-bands-v1" for item in examples)


def test_lower_scores_from_comparable_players_mean_higher_difficulty():
    easier = estimate_difficulty(population(0.8))
    harder = estimate_difficulty(population(0.2))
    assert harder.value > easier.value
    assert harder.distinct_players == easier.distinct_players == 12


def test_continuous_scores_are_not_reduced_to_binary_outcomes():
    assert estimate_difficulty(population(0.61)).value > estimate_difficulty(population(0.69)).value


def test_higher_rated_players_with_identical_scores_imply_harder_content():
    rows = population(0.5)
    assert estimate_difficulty([replace(item, elo=item.elo + 300) for item in rows]).value > (
        estimate_difficulty(rows).value
    )


def test_distinct_player_and_band_thresholds():
    assert estimate_difficulty(population(count=11)).is_provisional
    result = estimate_difficulty(population(count=12))
    assert not result.is_provisional and result.confidence == "medium"
    assert estimate_difficulty(
        [replace(item, elo=400) for item in population(count=40)]
    ).is_provisional


def test_repeated_player_has_one_vote_and_latest_attempt_cap():
    rows = [Observation(id=str(i), uid="same", score=i / 99, elo=400, order=i) for i in range(100)]
    result = estimate_difficulty(rows)
    assert result.distinct_players == 1 and result.effective_attempts == 3
    assert result.capped_attempts == 97 and result.is_provisional
    assert result.bands[0].mean_score == pytest.approx((97 + 98 + 99) / 297)


def test_repetition_does_not_outvote_other_players():
    rows = population()
    repeated = [
        Observation(id="repeat-" + str(i), uid="player-0", score=0.5, elo=500, order=i)
        for i in range(100)
    ]
    result = estimate_difficulty(rows + repeated)
    assert result.value == estimate_difficulty(rows).value
    assert result.distinct_players == 12


def test_shuffling_produces_identical_results():
    rows = population() + [
        Observation(id="repeat-" + str(i), uid="player-0", score=0.9, elo=500, order=i)
        for i in range(20)
    ]
    expected = estimate_difficulty(rows)
    Random(321).shuffle(rows)
    assert estimate_difficulty(rows) == expected


def test_duplicate_ids_count_once_and_conflicting_duplicates_are_excluded():
    rows = population()
    assert estimate_difficulty(rows + rows).value == estimate_difficulty(rows).value
    result = estimate_difficulty(rows + [replace(rows[0], score=0.1)])
    assert result.distinct_players == 11 and result.invalid_observations == 2
    assert estimate_difficulty(list(reversed(rows + [replace(rows[0], score=0.1)]))) == result


@pytest.mark.parametrize(
    "change",
    [
        {"score": -0.1},
        {"score": 1.1},
        {"score": float("nan")},
        {"score": True},
        {"elo": None},
        {"elo": float("inf")},
        {"uid": ""},
        {"id": ""},
        {"order": float("nan")},
    ],
)
def test_invalid_observations_are_excluded(change):
    rows = population()
    result = estimate_difficulty(rows + [replace(rows[0], **change)])
    assert result.invalid_observations == 1
    assert result.value == estimate_difficulty(rows).value


@pytest.mark.parametrize("score", [0, 1])
def test_extreme_scores_are_finite_and_bounded(score):
    result = estimate_difficulty(population(score))
    assert 1 <= result.value <= 10
    assert all(band.target_elo is not None for band in result.bands[:2])


def test_empty_data_never_presents_a_confident_grade():
    result = estimate_difficulty([])
    assert result.value is None and result.target_elo is None
    assert result.label == "Provisional" and result.confidence == "low"


def test_more_independent_players_increase_coverage_confidence():
    rows = population(count=12)
    assert estimate_difficulty(rows).confidence == "medium"
    rows += [
        Observation(id="advanced-" + str(i), uid="advanced-" + str(i), score=0.7, elo=1700)
        for i in range(18)
    ]
    assert estimate_difficulty(rows).confidence == "high"


@pytest.mark.parametrize(
    "change",
    [
        {"attempts_per_player": 0},
        {"min_players": 0},
        {"min_bands": 4},
        {"smoothing_players": 0},
        {"elo_step": float("nan")},
        {"base_elo": float("inf")},
    ],
)
def test_invalid_policy_is_rejected(change):
    with pytest.raises(ValueError):
        DifficultyPolicy(**change)


def test_matchmaking_uses_only_current_version_estimates_and_keeps_legacy_compatibility():
    data = {"authorDifficulty": 2, "crowdDifficulty": 6, "currentVersionId": "v2"}
    assert scenario_difficulty(data) == (6, "crowd")
    assert scenario_difficulty({**data, "crowdDifficultyVersionId": "v1"}) == (2, "author")
    assert scenario_difficulty({**data, "crowdDifficultyVersionId": "v2"}) == (6, "crowd")
    assert scenario_difficulty({**data, "crowdDifficulty": None}) == (2, "author")
