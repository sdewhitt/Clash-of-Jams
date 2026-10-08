"""Pure, reproducible 1v1 queue policy. No database, network, or wall clock."""

from dataclasses import dataclass, field
from math import isfinite
from random import Random

from algs.elo import PROVISIONAL_MATCHES


@dataclass(frozen=True)
class MatchmakingPolicy:
    version: str = "matchmaking-v1"
    initial_window: float = 100
    provisional_window: float = 75
    expansion_seconds: float = 10
    expansion_step: float = 50
    maximum_window: float = 400
    rematch_wait_seconds: float = 30
    scenario_window: float = 250
    difficulty_base_elo: float = 400
    difficulty_elo_step: float = 200

    def __post_init__(self):
        values = [value for value in vars(self).values() if not isinstance(value, str)]
        if any(not isfinite(value) or value < 0 for value in values):
            raise ValueError("Policy values must be finite and nonnegative")
        if self.expansion_seconds <= 0 or self.difficulty_elo_step <= 0:
            raise ValueError("Expansion interval and difficulty step must be positive")
        if self.maximum_window < max(self.initial_window, self.provisional_window):
            raise ValueError("Maximum window cannot be narrower than the initial window")


@dataclass(frozen=True)
class QueuePlayer:
    uid: str
    instrument: str
    elo: float
    games_played: int
    joined_at: float
    ticket: str = ""
    display_name: str = "Player"
    recent_opponents: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self):
        if not self.uid or not self.instrument or not isfinite(self.elo):
            raise ValueError("A player needs an identity, instrument, and finite rating")
        if not isfinite(self.joined_at) or self.games_played < 0:
            raise ValueError("Invalid queue time or games played")

    @property
    def provisional(self) -> bool:
        return self.games_played < PROVISIONAL_MATCHES


@dataclass(frozen=True)
class ScenarioCandidate:
    id: str
    version_id: str
    title: str
    instrument: str
    difficulty: float
    difficulty_source: str
    part_id: str = "lead"
    scoring_rules: dict = field(default_factory=dict)

    def __post_init__(self):
        if not isfinite(self.difficulty) or not 1 <= self.difficulty <= 10:
            raise ValueError("Scenario difficulty must be between 1 and 10")


@dataclass(frozen=True)
class MatchDecision:
    players: tuple[QueuePlayer, QueuePlayer]
    scenario: ScenarioCandidate
    wait_seconds: tuple[float, float]
    rating_windows: tuple[float, float]
    is_rematch: bool

    @property
    def rating_gap(self) -> float:
        return abs(self.players[0].elo - self.players[1].elo)

    def record(self, policy: MatchmakingPolicy) -> dict:
        return {
            "policyVersion": policy.version,
            "ratingGap": self.rating_gap,
            "isRematch": self.is_rematch,
            "scenarioDifficulty": self.scenario.difficulty,
            "difficultySource": self.scenario.difficulty_source,
            "scenarioTargetElo": difficulty_elo(self.scenario.difficulty, policy),
            "players": [
                {
                    "uid": player.uid,
                    "opponentUid": self.players[1 - index].uid,
                    "elo": player.elo,
                    "isProvisional": player.provisional,
                    "waitSeconds": self.wait_seconds[index],
                    "ratingWindow": self.rating_windows[index],
                }
                for index, player in enumerate(self.players)
            ],
        }


def rating_window(player: QueuePlayer, now: float, policy: MatchmakingPolicy) -> float:
    base = policy.provisional_window if player.provisional else policy.initial_window
    steps = int(max(0, now - player.joined_at) // policy.expansion_seconds)
    return min(policy.maximum_window, base + steps * policy.expansion_step)


def difficulty_elo(difficulty: float, policy: MatchmakingPolicy) -> float:
    """Configurable provisional scale conversion, not an empirical calibration."""
    return policy.difficulty_base_elo + (difficulty - 1) * policy.difficulty_elo_step


def suitable_scenarios(
    a: QueuePlayer, b: QueuePlayer, scenarios: list[ScenarioCandidate], policy: MatchmakingPolicy
) -> list[ScenarioCandidate]:
    return sorted(
        (
            scenario
            for scenario in scenarios
            if scenario.instrument == a.instrument == b.instrument
            and max(
                abs(a.elo - difficulty_elo(scenario.difficulty, policy)),
                abs(b.elo - difficulty_elo(scenario.difficulty, policy)),
            )
            <= policy.scenario_window
        ),
        key=lambda scenario: (scenario.id, scenario.version_id),
    )


def select_matches(
    players: list[QueuePlayer],
    scenarios: list[ScenarioCandidate],
    now: float,
    policy: MatchmakingPolicy | None = None,
    seed: int = 0,
) -> list[MatchDecision]:
    """Oldest first; closest fresh eligible opponent; seeded random shared scenario.

    Both players must accept the gap under their own active windows. Recent
    opponents are a fallback only after both have waited, and only when no
    fresh eligible opponent exists. At 500 players the bounded quadratic scan
    is deliberately simpler than maintaining a separate indexing framework.
    """
    policy = policy or MatchmakingPolicy()
    if not isfinite(now) or len({player.uid for player in players}) != len(players):
        raise ValueError("Queue requires a finite clock and unique players")
    ordered = sorted(players, key=lambda player: (player.joined_at, player.uid))
    windows = {player.uid: rating_window(player, now, policy) for player in ordered}
    selected: set[str] = set()
    decisions = []
    for a in ordered:
        if a.uid in selected:
            continue
        candidates = []
        for b in ordered:
            if b.uid == a.uid or b.uid in selected or b.instrument != a.instrument:
                continue
            gap = abs(a.elo - b.elo)
            if gap > min(windows[a.uid], windows[b.uid]):
                continue
            available = suitable_scenarios(a, b, scenarios, policy)
            if not available:
                continue
            repeat = b.uid in a.recent_opponents or a.uid in b.recent_opponents
            if repeat and min(now - a.joined_at, now - b.joined_at) < policy.rematch_wait_seconds:
                continue
            candidates.append((repeat, gap, b.joined_at, b.uid, b, available))
        if not candidates:
            continue
        repeat, _, _, _, b, available = min(candidates, key=lambda item: item[:4])
        random = Random(f"{seed}:{a.uid}:{a.ticket}:{b.uid}:{b.ticket}")
        scenario = random.choice(available)
        decisions.append(
            MatchDecision(
                players=(a, b),
                scenario=scenario,
                wait_seconds=(max(0, now - a.joined_at), max(0, now - b.joined_at)),
                rating_windows=(windows[a.uid], windows[b.uid]),
                is_rematch=repeat,
            )
        )
        selected.update((a.uid, b.uid))
    return decisions
