"""Reproducible queue-policy demo; no accounts, credentials or database writes.

Run from the repo root: PYTHONPATH=backend python backend/scripts/simulate_matchmaking.py
"""

import argparse
import json
from collections import Counter
from dataclasses import asdict, replace
from pathlib import Path
from random import Random
from statistics import mean
from time import perf_counter

from algs.elo import rating_tier
from algs.matchmaking import (
    MatchDecision,
    MatchmakingPolicy,
    QueuePlayer,
    ScenarioCandidate,
    rating_window,
    select_matches,
    suitable_scenarios,
)


def fixtures(seed: int):
    random = Random(seed)

    def players(count, *, sparse=False, provisional=False, arrivals=False, repeats=False):
        result = []
        for i in range(count):
            elo = 400 + (i % 10) * 180 if sparse else random.randint(400, 2200)
            result.append(
                QueuePlayer(
                    uid=f"p-{i:04}",
                    instrument="guitar" if sparse and i % 3 == 0 else "piano",
                    elo=elo,
                    games_played=0 if provisional and i % 2 == 0 else 20,
                    joined_at=(i // 100) * 4 if arrivals else 0,
                    ticket=f"fixture-{seed}-{i}",
                    recent_opponents=frozenset([f"p-{i ^ 1:04}"]) if repeats else frozenset(),
                )
            )
        return result

    dense = [replace(p, elo=400) for p in players(500)]
    cases = {
        "dense-500": dense,
        "unequal-skills-500": players(500),
        "provisional-mix-500": players(500, provisional=True),
        "recent-opponents-500": [replace(p, elo=400) for p in players(500, repeats=True)],
        "arrivals-500": players(500, arrivals=True),
        "sparse-odd-127": players(127, sparse=True, provisional=True),
        "rematch-only-2": [replace(p, elo=400) for p in players(2, repeats=True)],
        "missing-scenario-2": [replace(p, instrument="vocals", elo=400) for p in players(2)],
    }
    scenarios = [
        ScenarioCandidate(
            f"{instrument}-{level}", "v1", f"Fixture {level}", instrument, level, "author"
        )
        for instrument in ("piano", "guitar")
        for level in range(1, 11)
    ]
    return cases, scenarios


def baseline(players, scenarios, now, policy, strategy):
    """FIFO: earliest eligible; fixed-window: closest, no widening. Both allow repeats.

    Both retain instrument and shared scenario constraints; the fixed baseline
    retains provisional windows too. This isolates opponent ordering, expansion
    and repeat avoidance instead of permitting unplayable benchmark matches.
    """
    active_policy = replace(policy, expansion_step=0) if strategy == "fixed-window" else policy
    ordered = sorted(players, key=lambda p: (p.joined_at, p.uid))
    used = set()
    decisions = []
    for a in ordered:
        if a.uid in used:
            continue
        options = []
        for b in ordered:
            if b.uid == a.uid or b.uid in used or a.instrument != b.instrument:
                continue
            gap = abs(a.elo - b.elo)
            windows = (rating_window(a, now, active_policy), rating_window(b, now, active_policy))
            if gap > min(windows):
                continue
            available = suitable_scenarios(a, b, scenarios, policy)
            if not available:
                continue
            key = (gap, b.joined_at, b.uid) if strategy == "fixed-window" else (b.joined_at, b.uid)
            options.append((key, b, windows, available))
        if options:
            _, b, windows, available = min(options, key=lambda item: item[0])
            decisions.append(
                MatchDecision(
                    players=(a, b),
                    scenario=available[0],
                    wait_seconds=(now - a.joined_at, now - b.joined_at),
                    rating_windows=windows,
                    is_rematch=b.uid in a.recent_opponents or a.uid in b.recent_opponents,
                )
            )
            used.update((a.uid, b.uid))
    return decisions


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))], 3)


def metrics(arrived, waiting, decisions):
    waits = [wait for decision in decisions for wait in decision.wait_seconds]
    gaps = [decision.rating_gap for decision in decisions]
    assigned = [p.uid for decision in decisions for p in decision.players]
    assert len(assigned) == len(set(assigned)), "A simulated player was matched twice"
    assert len(assigned) + len(waiting) == len(arrived), "Queue conservation failed"
    groups = {}
    for label, key in (
        ("provisional", lambda p: "provisional" if p.provisional else "established"),
        ("tier", lambda p: rating_tier(p.elo)),
        ("instrument", lambda p: p.instrument),
    ):
        total, left = Counter(map(key, arrived)), Counter(map(key, waiting))
        groups[label] = {
            group: {
                "arrived": count,
                "waiting": left[group],
                "unmatchedPercent": round(100 * left[group] / count, 2),
            }
            for group, count in sorted(total.items())
        }
    return {
        "arrivedPlayers": len(arrived),
        "matches": len(decisions),
        "matchedPlayers": len(assigned),
        "waitingPlayers": len(waiting),
        "meanWaitSeconds": round(mean(waits), 3) if waits else None,
        "p95WaitSeconds": percentile(waits, 0.95),
        "oldestWaitingSeconds": None,  # Filled using the snapshot's simulated clock.
        "meanRatingGap": round(mean(gaps), 3) if gaps else None,
        "p95RatingGap": percentile(gaps, 0.95),
        "rematches": sum(d.is_rematch for d in decisions),
        "groups": groups,
    }


def simulate(players, scenarios, policy, strategy, seed, horizon=60):
    waiting, completed, arrived = [], [], []
    snapshots = {}
    timings = []
    for second in range(horizon + 1):
        newcomers = [p for p in players if p.joined_at == second]
        waiting.extend(newcomers)
        arrived.extend(newcomers)
        start = perf_counter()
        if strategy == "queue-policy":
            decisions = select_matches(waiting, scenarios, second, policy, seed)
        else:
            decisions = baseline(waiting, scenarios, second, policy, strategy)
        timings.append((perf_counter() - start) * 1000)
        matched = {p.uid for d in decisions for p in d.players}
        waiting = [p for p in waiting if p.uid not in matched]
        completed.extend(decisions)
        if second in (5, horizon):
            snapshot = metrics(arrived, waiting, completed)
            snapshot["oldestWaitingSeconds"] = max(
                (second - p.joined_at for p in waiting), default=0
            )
            snapshots[str(second)] = snapshot
    return {
        "snapshots": snapshots,
        "algorithmComputeMs": {
            "total": round(sum(timings), 3),
            "slowestPass": round(max(timings), 3),
        },
    }


def build_report(seed=20261008):
    policy = MatchmakingPolicy()
    cases, scenarios = fixtures(seed)
    return {
        "seed": seed,
        "policy": asdict(policy),
        "snapshotSeconds": [5, 60],
        "measurement": (
            "Pure policy simulation with synthetic arrivals; "
            "excludes HTTP, Firestore, leases and network latency."
        ),
        "difficultyMapping": (
            "Provisional configuration: 400 + (difficulty - 1) * 200, not empirical calibration."
        ),
        "cases": {
            name: {
                strategy: simulate(players, scenarios, policy, strategy, seed)
                for strategy in ("queue-policy", "fifo", "fixed-window")
            }
            for name, players in cases.items()
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=20261008)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = build_report(args.seed)
    print(
        "Case                       Strategy       Matched/arrived @5s   "
        "Waiting @60s   Gap mean @60s"
    )
    for name, strategies in report["cases"].items():
        for strategy, value in strategies.items():
            early, final = value["snapshots"]["5"], value["snapshots"]["60"]
            print(
                f"{name:26} {strategy:14} {early['matchedPlayers']:4}/{early['arrivedPlayers']:<4}"
                f"             {final['waitingPlayers']:4}           {final['meanRatingGap']}"
            )
    print(report["measurement"])
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(f"Full report: {args.output}")


if __name__ == "__main__":
    main()
