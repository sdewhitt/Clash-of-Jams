"""Deterministic synthetic difficulty demo; no Firebase connection or writes."""

import argparse
import json
from pathlib import Path

from app.services.scenario_difficulty import example_details


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--full", action="store_true", help="Include the complete HTTP fixture")
    args = parser.parse_args()
    details = example_details()
    if args.full:
        report = [item.model_dump(by_alias=True, mode="json") for item in details]
    else:
        report = {
            "source": "synthetic",
            "modelVersion": details[0].estimate.model_version,
            "examples": [
                {
                    "title": item.scenario.title,
                    "grade": item.estimate.value,
                    "label": item.estimate.label,
                    "confidence": item.estimate.confidence,
                    "distinctPlayers": item.estimate.distinct_players,
                    "countedAttempts": item.estimate.effective_attempts,
                    "representedBands": item.estimate.represented_bands,
                    "cappedAttempts": item.estimate.capped_attempts,
                }
                for item in details
            ],
        }
    output = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output)
    print(output)


if __name__ == "__main__":
    main()
