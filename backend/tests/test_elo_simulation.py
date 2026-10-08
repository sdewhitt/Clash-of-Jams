import pytest

from algs.simulation import simulate_population


def test_same_seed_replays_the_same_population_and_history():
    report = simulate_population(players=20, matches=400, seed=7)
    assert report == simulate_population(players=20, matches=400, seed=7)
    assert set(report["policies"]) == {"elo-v1", "fixed-k32"}
    for policy in report["policies"].values():
        assert -1 <= policy["rankCorrelation"] <= 1
        assert 0 <= policy["brierScore"] <= 1
        assert 0 <= policy["calibrationError"] <= 1
        assert policy["convergence"][-1]["matches"] == 400


def test_different_seed_changes_workload_results():
    assert simulate_population(20, 100, 1) != simulate_population(20, 100, 2)


@pytest.mark.parametrize("players,matches", [(1, 100), (20, 0)])
def test_invalid_workload(players, matches):
    with pytest.raises(ValueError):
        simulate_population(players, matches)
