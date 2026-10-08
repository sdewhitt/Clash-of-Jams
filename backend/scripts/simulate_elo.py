"""Usage: python scripts/simulate_elo.py --players 500 --matches 20000 --seed 42."""

import argparse
import json
from pathlib import Path

from algs.simulation import simulate_population


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--players", type=int, default=500)
    parser.add_argument("--matches", type=int, default=20000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = simulate_population(args.players, args.matches, args.seed)
    output = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output)
    print(output)


if __name__ == "__main__":
    main()
