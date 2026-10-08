"""Deterministic, score-based scenario difficulty. No database or gameplay dependencies."""

from collections import defaultdict
from dataclasses import dataclass
from math import isfinite, log10
from statistics import mean
from typing import Literal

from app.schemas import ApiModel


@dataclass(frozen=True)
class DifficultyPolicy:
    version: str = "score-bands-v1"
    min_players: int = 12
    min_bands: int = 2
    high_confidence_players: int = 30
    attempts_per_player: int = 3
    smoothing_players: float = 2
    base_elo: float = 400
    elo_step: float = 200
    logistic_scale: float = 400

    def __post_init__(self):
        counts = (self.min_players, self.high_confidence_players, self.attempts_per_player)
        if any(type(n) is not int or n < 1 for n in counts):
            raise ValueError("Player thresholds and attempt cap must be positive integers")
        if (
            type(self.min_bands) is not int
            or not 1 <= self.min_bands <= 3
            or self.high_confidence_players < self.min_players
        ):
            raise ValueError("Invalid confidence thresholds")
        if not all(
            isfinite(n) and n > 0
            for n in (self.smoothing_players, self.elo_step, self.logistic_scale)
        ) or not isfinite(self.base_elo):
            raise ValueError("Invalid difficulty scale or smoothing")


@dataclass(frozen=True)
class Observation:
    id: str
    uid: str
    score: float
    elo: float
    order: float = 0


class BandEstimate(ApiModel):
    id: str
    label: str
    min_elo: float | None
    max_elo: float | None
    players: int
    attempts: int
    mean_elo: float | None = None
    mean_score: float | None = None
    smoothed_score: float | None = None
    target_elo: float | None = None


class DifficultyEstimate(ApiModel):
    model_version: str
    value: float | None
    target_elo: float | None
    label: Literal["Provisional", "Easy", "Medium", "Hard"]
    confidence: Literal["low", "medium", "high"]
    is_provisional: bool
    distinct_players: int
    effective_attempts: int
    represented_bands: int
    invalid_observations: int
    duplicate_observations: int
    capped_attempts: int
    minimum_players: int
    minimum_bands: int
    high_confidence_players: int
    attempts_per_player: int
    smoothing_players: float
    base_elo: float
    elo_step: float
    logistic_scale: float
    bands: list[BandEstimate]


DEFAULT_DIFFICULTY_POLICY = DifficultyPolicy()

BANDS = (
    ("below-800", "Below 800 Elo", None, 800),
    ("800-1399", "800–1399 Elo", 800, 1400),
    ("1400-plus", "1400+ Elo", 1400, None),
)


def _valid(item: Observation) -> bool:
    return (
        isinstance(item, Observation)
        and isinstance(item.id, str)
        and bool(item.id)
        and isinstance(item.uid, str)
        and bool(item.uid)
        and all(type(n) in (int, float) and isfinite(n) for n in (item.score, item.elo, item.order))
        and 0 <= item.score <= 1
    )


def estimate_difficulty(
    observations: list[Observation], policy: DifficultyPolicy = DEFAULT_DIFFICULTY_POLICY
) -> DifficultyEstimate:
    """Give each player one vote, then equally weight represented rating bands.

    The latest three attempts are averaged per player. A band is smoothed with
    neutral pseudo-players before inverting an Elo-shaped score curve. This is
    an explainable heuristic, not a calibrated probability of musical success.
    Conflicting duplicate IDs are excluded rather than resolved by input order.
    """
    by_id: dict[str, list[Observation]] = defaultdict(list)
    invalid = 0
    for item in observations:
        if _valid(item):
            by_id[item.id].append(item)
        else:
            invalid += 1
    by_player: dict[str, list[Observation]] = defaultdict(list)
    duplicates = 0
    for entries in by_id.values():
        if any(item != entries[0] for item in entries):
            invalid += len(entries)
        else:
            by_player[entries[0].uid].append(entries[0])
            duplicates += len(entries) - 1

    grouped: list[list[tuple[float, float, int]]] = [[], [], []]
    capped = 0
    for uid in sorted(by_player):
        entries = sorted(by_player[uid], key=lambda item: (item.order, item.id))
        retained = entries[-policy.attempts_per_player :]
        capped += len(entries) - len(retained)
        rating = mean(item.elo for item in retained)
        score = mean(item.score for item in retained)
        band = 0 if rating < 800 else (1 if rating < 1400 else 2)
        grouped[band].append((rating, score, len(retained)))

    bands = []
    for (band_id, label, lower, upper), entries in zip(BANDS, grouped, strict=True):
        band = BandEstimate(
            id=band_id,
            label=label,
            min_elo=lower,
            max_elo=upper,
            players=len(entries),
            attempts=sum(item[2] for item in entries),
        )
        if entries:
            band.mean_elo = mean(item[0] for item in entries)
            band.mean_score = mean(item[1] for item in entries)
            smoothed = (sum(item[1] for item in entries) + policy.smoothing_players * 0.5) / (
                len(entries) + policy.smoothing_players
            )
            band.smoothed_score = smoothed
            band.target_elo = band.mean_elo - policy.logistic_scale * log10(
                smoothed / (1 - smoothed)
            )
        bands.append(band)

    targets = [band.target_elo for band in bands if band.target_elo is not None]
    players = sum(band.players for band in bands)
    provisional = players < policy.min_players or len(targets) < policy.min_bands
    target = mean(targets) if targets else None
    value = (
        None
        if target is None
        else round(min(10, max(1, 1 + (target - policy.base_elo) / policy.elo_step)), 2)
    )
    label = (
        "Provisional"
        if provisional
        else ("Easy" if value < 4 else ("Medium" if value < 7 else "Hard"))
    )
    confidence = (
        "low"
        if provisional
        else (
            "high" if players >= policy.high_confidence_players and len(targets) == 3 else "medium"
        )
    )
    return DifficultyEstimate(
        model_version=policy.version,
        value=value,
        target_elo=None if target is None else round(target, 2),
        label=label,
        confidence=confidence,
        is_provisional=provisional,
        distinct_players=players,
        effective_attempts=sum(band.attempts for band in bands),
        represented_bands=len(targets),
        invalid_observations=invalid,
        duplicate_observations=duplicates,
        capped_attempts=capped,
        minimum_players=policy.min_players,
        minimum_bands=policy.min_bands,
        high_confidence_players=policy.high_confidence_players,
        attempts_per_player=policy.attempts_per_player,
        smoothing_players=policy.smoothing_players,
        base_elo=policy.base_elo,
        elo_step=policy.elo_step,
        logistic_scale=policy.logistic_scale,
        bands=bands,
    )
