"""Deterministic Elo arithmetic. No Firebase, clock, or UI dependencies."""

from math import isfinite

INITIAL_ELO = 400
initial_elo = INITIAL_ELO  # Preserve the original public name.
PROVISIONAL_MATCHES = 10
MODEL_VERSION = "elo-v1"
RATING_PRECISION = 6


def _check_rating(rating: float) -> None:
    if isinstance(rating, bool) or not isinstance(rating, (int, float)) or not isfinite(rating):
        raise ValueError("Elo must be a finite number")


def get_expected_score(a_elo: float, b_elo: float) -> tuple[float, float]:
    """Classic Elo expected scores, evaluated without exponent overflow."""
    _check_rating(a_elo)
    _check_rating(b_elo)
    difference = (a_elo - b_elo) / 400
    power = 10 ** -abs(difference)
    expected_a = 1 / (1 + power) if difference >= 0 else power / (1 + power)
    return expected_a, 1 - expected_a


def get_k_factor(a_elo: float, b_elo: float) -> int:
    """Retain the existing policy: 32 below 2200 for both players, otherwise 16."""
    _check_rating(a_elo)
    _check_rating(b_elo)
    return 32 if a_elo < 2200 and b_elo < 2200 else 16


def updated_elos(a_elo: float, b_elo: float, winner: int) -> tuple[float, float]:
    """winner: 1 for A, 2 for B, 0 for a draw. Invalid outcomes are rejected."""
    if type(winner) is not int or winner not in (0, 1, 2):
        raise ValueError("winner must be 0 (draw), 1, or 2")
    expected_a, expected_b = get_expected_score(a_elo, b_elo)
    k = get_k_factor(a_elo, b_elo)
    actual_a = 0.5 if winner == 0 else float(winner == 1)
    return a_elo + k * (actual_a - expected_a), b_elo + k * (1 - actual_a - expected_b)


def rating_tier(elo: float) -> str:
    """Use the tier thresholds already established in seed_leaderboards.py."""
    _check_rating(elo)
    for floor, tier in ((1400, "diamond"), (1200, "platinum"), (1000, "gold"), (800, "silver")):
        if elo >= floor:
            return tier
    return "bronze"
