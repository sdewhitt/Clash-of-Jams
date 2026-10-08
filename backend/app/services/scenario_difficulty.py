"""Read trusted performance evidence; publish version-scoped aggregate estimates."""

from collections import Counter
from datetime import UTC, datetime
from math import isfinite
from typing import Literal

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from algs.difficulty import (
    DEFAULT_DIFFICULTY_POLICY,
    DifficultyEstimate,
    DifficultyPolicy,
    Observation,
    estimate_difficulty,
)
from algs.difficulty_fixtures import difficulty_examples
from app.schemas import ApiModel, CurrentUser, Instrument


class DifficultyError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class DifficultyScenario(ApiModel):
    id: str
    title: str
    instrument: Instrument
    author_difficulty: float
    current_version_id: str | None


class DifficultyDetail(ApiModel):
    scenario: DifficultyScenario
    estimate: DifficultyEstimate
    source: Literal["performances", "synthetic"]
    description: str
    part_id: str | None = None
    excluded_runs: dict[str, int] = {}
    can_publish: bool = False
    published_at: datetime | None = None


def example_details(policy: DifficultyPolicy = DEFAULT_DIFFICULTY_POLICY) -> list[DifficultyDetail]:
    return [
        DifficultyDetail(
            scenario=DifficultyScenario(
                id=scenario_id,
                title=title,
                instrument=Instrument.PIANO,
                author_difficulty=1,
                current_version_id="synthetic-v1",
            ),
            estimate=estimate_difficulty(observations, policy),
            source="synthetic",
            description=description,
        )
        for scenario_id, title, description, observations in difficulty_examples()
    ]


def _number(value) -> bool:
    return type(value) in (int, float) and isfinite(value)


class FirestoreDifficultyStore:
    def __init__(self, database, policy: DifficultyPolicy = DEFAULT_DIFFICULTY_POLICY):
        self.db = database
        self.policy = policy

    def list_scenarios(self, user: CurrentUser) -> list[DifficultyScenario]:
        collection = self.db.collection("scenarios")
        visible = collection.where(filter=FieldFilter("visibility", "==", "public")).stream()
        own = collection.where(filter=FieldFilter("authorUid", "==", user.uid)).stream()
        documents = {snapshot.id: snapshot.to_dict() for snapshot in [*visible, *own]}
        return sorted(
            [self._summary(key, data) for key, data in documents.items()],
            key=lambda item: (item.title.casefold(), item.id),
        )

    @staticmethod
    def _summary(scenario_id, data) -> DifficultyScenario:
        return DifficultyScenario(
            id=scenario_id,
            title=data.get("title", "Untitled scenario"),
            instrument=data["instrument"],
            author_difficulty=data.get("authorDifficulty", 1),
            current_version_id=data.get("currentVersionId"),
        )

    def _scenario(self, scenario_id: str, user: CurrentUser):
        ref = self.db.collection("scenarios").document(scenario_id)
        snapshot = ref.get()
        if not snapshot.exists:
            raise DifficultyError("Scenario not found", 404)
        data = snapshot.to_dict()
        if (
            data.get("visibility") == "private"
            and data.get("authorUid") != user.uid
            and not user.is_admin
        ):
            raise DifficultyError("Scenario not found", 404)
        return ref, data

    def detail(self, scenario_id: str, user: CurrentUser) -> DifficultyDetail:
        ref, data = self._scenario(scenario_id, user)
        return self._detail(ref, data, user)

    def _detail(self, ref, data: dict, user: CurrentUser) -> DifficultyDetail:
        version_id = data.get("currentVersionId")
        version = ref.collection("versions").document(version_id).get() if version_id else None
        content = version.to_dict() if version and version.exists else None
        part = self._part(content, data["instrument"])
        observations, exclusions = self._observations(ref.id, version_id, content, data)
        return DifficultyDetail(
            scenario=self._summary(ref.id, data),
            estimate=estimate_difficulty(observations, self.policy),
            source="performances",
            part_id=part,
            description="Accepted musical performances at original speed, grouped by player Elo.",
            excluded_runs=exclusions,
            can_publish=bool(part) and (data.get("authorUid") == user.uid or user.is_admin),
        )

    @staticmethod
    def _part(content, instrument):
        parts = (content or {}).get("chart", {}).get("parts", [])
        return next(
            (
                p.get("partId")
                for p in parts
                if p.get("instrument") == instrument and p.get("notes")
            ),
            None,
        )

    def _observations(self, scenario_id, version_id, content, scenario):
        if not content or not self._part(content, scenario["instrument"]):
            return [], {}
        runs = list(
            self.db.collection("runs")
            .where(filter=FieldFilter("scenarioId", "==", scenario_id))
            .limit(10001)
            .stream()
        )
        if len(runs) > 10000:
            raise DifficultyError("This scenario needs an offline difficulty recomputation.", 413)
        # Compare one part/rules/speed regime. Different arrangements are not equivalent evidence.
        part = self._part(content, scenario["instrument"])
        excluded = Counter()
        observations = []
        for snapshot in runs:
            run = snapshot.to_dict()
            reason = None
            if run.get("validation") != "accepted":
                reason = "unvalidated"
            elif run.get("scenarioVersionId") != version_id:
                reason = "differentVersion"
            elif run.get("instrument") != scenario["instrument"] or run.get("partId") != part:
                reason = "differentPart"
            elif run.get("speedMultiplier") != 1 or run.get("scoringRules") != content.get(
                "scoringRules"
            ):
                reason = "differentScoring"
            elif run.get("inputSource") not in ("midi", "audio"):
                reason = "nonMusicalOrUnknownInput"
            elif run.get("completionReason") != "completed":
                reason = "incomplete"
            elif not _number(run.get("ratingAtPlay")):
                reason = "unknownRating"
            if reason:
                excluded[reason] += 1
                continue
            score = run.get("normalizedScore")
            if score is None and _number(run.get("finalScore")):
                score = run["finalScore"] / 100_000  # Current musical scorer is explicitly 0–100,000.
            played_at = run.get("playedAt")
            if not isinstance(played_at, datetime):
                excluded["invalidTimestamp"] += 1
                continue
            observations.append(
                Observation(
                    id=snapshot.id,
                    uid=run.get("userUid"),
                    score=score,
                    elo=run["ratingAtPlay"],
                    order=(
                        played_at if played_at.tzinfo else played_at.replace(tzinfo=UTC)
                    ).timestamp(),
                )
            )
        return observations, dict(sorted(excluded.items()))

    def publish(self, scenario_id: str, user: CurrentUser) -> DifficultyDetail:
        ref, data = self._scenario(scenario_id, user)
        if data.get("authorUid") != user.uid and not user.is_admin:
            raise DifficultyError(
                "Only the author or an administrator can publish difficulty.", 403
            )
        detail = self._detail(ref, data, user)
        if not detail.can_publish:
            raise DifficultyError("Save a playable scenario version first.", 409)
        at = datetime.now(UTC)
        version_id = detail.scenario.current_version_id

        @firestore.transactional
        def commit(transaction):
            latest = ref.get(transaction=transaction)
            if not latest.exists or latest.to_dict().get("currentVersionId") != version_id:
                raise DifficultyError(
                    "The scenario changed. Refresh and recompute difficulty.", 409
                )
            if latest.to_dict().get("authorUid") != user.uid and not user.is_admin:
                raise DifficultyError("Scenario ownership changed.", 403)
            # The numeric bridge remains absent until there is enough independent evidence.
            value = None if detail.estimate.is_provisional else detail.estimate.value
            transaction.set(
                ref.collection("difficultyEstimates").document(version_id),
                {
                    **detail.estimate.model_dump(by_alias=True),
                    "scenarioId": scenario_id,
                    "scenarioVersionId": version_id,
                    "partId": detail.part_id,
                    "speedMultiplier": 1,
                    "source": "performances",
                    "computedAt": at,
                },
            )
            transaction.update(
                ref,
                {
                    "crowdDifficulty": value,
                    "crowdDifficultyVersionId": version_id,
                },
            )

        commit(self.db.transaction())
        return detail.model_copy(update={"published_at": at})
