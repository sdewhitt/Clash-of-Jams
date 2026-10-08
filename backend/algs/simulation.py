"""Reproducible synthetic-population evaluation; never accesses Firebase."""

from random import Random
from statistics import correlation, mean

from algs.elo import INITIAL_ELO, MODEL_VERSION, get_expected_score, updated_elos


def _ranks(values: list[float]) -> list[float]:
    result = [0.0] * len(values)
    ordered = sorted(range(len(values)), key=values.__getitem__)
    start = 0
    while start < len(values):
        end = start + 1
        while end < len(values) and values[ordered[end]] == values[ordered[start]]:
            end += 1
        for i in ordered[start:end]:
            result[i] = (start + end - 1) / 2
        start = end
    return result


def _ranking_correlation(latent: list[float], ratings: list[float]) -> float:
    if len(set(ratings)) < 2:
        return 0.0
    return correlation(_ranks(latent), _ranks(ratings))


def simulate_population(players: int = 500, matches: int = 20000, seed: int = 42) -> dict:
    if players < 2 or matches < 1:
        raise ValueError("At least two players and one match are required")
    rng = Random(seed)
    latent = [rng.uniform(100, 2800) for _ in range(players)]
    # Include established and new players so the existing 2200 boundary is exercised.
    initial = [
        INITIAL_ELO if i % 5 == 0 else max(0, skill + rng.gauss(0, 200))
        for i, skill in enumerate(latent)
    ]
    history = []
    for _ in range(matches):
        a, b = rng.sample(range(players), 2)
        probability = get_expected_score(latent[a], latent[b])[0]
        winner = 0 if rng.random() < 0.02 else (1 if rng.random() < probability else 2)
        history.append((a, b, winner))
    reports = {}
    for policy in ("elo-v1", "fixed-k32"):
        ratings = initial.copy()
        squared_errors, movement, curve = [], [], []
        calibration = [[] for _ in range(10)]
        for n, (a, b, winner) in enumerate(history, 1):
            expected = get_expected_score(ratings[a], ratings[b])[0]
            actual = 0.5 if winner == 0 else float(winner == 1)
            squared_errors.append((expected - actual) ** 2)
            calibration[min(9, int(expected * 10))].append((expected, actual))
            before = ratings[a]
            if policy == "elo-v1":
                new_a, new_b = updated_elos(ratings[a], ratings[b], winner)
            else:
                delta = 32 * (actual - expected)
                new_a, new_b = ratings[a] + delta, ratings[b] - delta
            ratings[a], ratings[b] = round(new_a, 6), round(new_b, 6)
            movement.append(abs(ratings[a] - before))
            if n % max(1, matches // 10) == 0 or n == matches:
                curve.append(
                    {
                        "matches": n,
                        "rankCorrelation": round(_ranking_correlation(latent, ratings), 6),
                        "recentBrierScore": round(mean(squared_errors[-1000:]), 6),
                    }
                )
        calibration_error = sum(
            len(bucket) / matches * abs(mean(p for p, _ in bucket) - mean(s for _, s in bucket))
            for bucket in calibration
            if bucket
        )
        reports[policy] = {
            "rankCorrelation": round(_ranking_correlation(latent, ratings), 6),
            "brierScore": round(mean(squared_errors), 6),
            "calibrationError": round(calibration_error, 6),
            "meanAbsoluteRatingChange": round(mean(movement), 6),
            "convergence": curve,
        }
    return {
        "seed": seed,
        "players": players,
        "matches": matches,
        "modelVersion": MODEL_VERSION,
        "workload": (
            "Synthetic latent skills 100-2800; 20% new at 400; "
            "80% noisy established ratings; 2% draws"
        ),
        "limitations": [
            "Synthetic evaluation does not establish accuracy for real musicians.",
            "No uncertainty model or provisional K-factor is implemented.",
        ],
        "policies": reports,
    }
