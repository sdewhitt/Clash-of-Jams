"""Explicitly synthetic Sprint #32 examples, also used by the interactive explorer."""

from algs.difficulty import Observation


def difficulty_examples() -> list[tuple[str, str, str, list[Observation]]]:
    examples = []
    for scenario_id, title, target, per_band in (
        ("gentle-warmup", "Gentle warm-up", 450, 36),
        ("steady-groove", "Steady groove", 1100, 36),
        ("fast-passage", "Fast passage", 2100, 36),
        ("new-composition", "New composition", 1100, 1),
    ):
        observations = []
        for band, center in enumerate((550, 1100, 1750)):
            for player in range(per_band):
                rating = center + ((player % 5) - 2) * 20
                score = 1 / (1 + 10 ** ((target - rating) / 400))
                observations.append(
                    Observation(
                        id=f"{scenario_id}-{band}-{player}",
                        uid=f"synthetic-{band}-{player}",
                        score=score,
                        elo=rating,
                    )
                )
        examples.append(
            (
                scenario_id,
                title,
                "Controlled synthetic scores across three Elo bands; no real performances.",
                observations,
            )
        )
    examples.append(
        (
            "repeated-attempts",
            "Repeated attempts",
            "One synthetic player repeats 100 times. Repetition cannot replace community evidence.",
            [
                Observation(id=f"repeat-{i:03}", uid="one-player", score=0.8, elo=550, order=i)
                for i in range(100)
            ],
        )
    )
    return examples
