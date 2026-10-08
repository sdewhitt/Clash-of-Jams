"""
Run validation: the server-side half of submitting a run.

The browser scores a performance and writes runs/{runId} itself, which firestore.rules only
allow with validation == 'pending'. This router is what moves a run on from there: it checks
the run against the scenario version it claims to be on, then marks it 'accepted' or
'rejected'. Leaderboards only read accepted runs.

These are consistency checks, not anti-cheat. The audio never leaves the browser, so the
server can confirm a run is coherent and points at a real chart, not that it was played.
"""

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.firebase import firestore, get_firestore_client
from app.schemas import RunValidation, RunValidationResult

router = APIRouter(prefix="/runs", tags=["runs"])

# Scores are rounded to two decimals client-side, so recomputed values can differ slightly.
SCORE_TOLERANCE = 0.02
MIN_SPEED = 0.25
MAX_SPEED = 2.0

# Mirrors DEFAULT_SCORING_RULES in frontend/src/lib/schema/collections.ts.
DEFAULT_WEIGHTS = {"pitchWeight": 0.4, "rhythmWeight": 0.4, "completenessWeight": 0.2}


def check_run(run: dict, version: dict | None) -> str | None:
    """Return why a run cannot be accepted, or None if it is consistent with its version."""
    if version is None:
        return "Scenario version not found"
    try:
        return _check_against_version(run, version)
    except (KeyError, TypeError, AttributeError):
        return "Run is malformed"


def _check_against_version(run: dict, version: dict) -> str | None:
    parts = version["chart"]["parts"]
    part = next((p for p in parts if p["partId"] == run["partId"]), None)
    if part is None:
        return "Part is not in this scenario version"

    expected = {note["index"] for note in part["notes"]}
    if not expected:
        return "Part has no notes"

    if not MIN_SPEED <= run["speedMultiplier"] <= MAX_SPEED:
        return "Speed multiplier is out of range"

    breakdown = run["breakdown"]
    results = breakdown["noteResults"]
    if len(results) != len(expected) or {r["expectedNoteIndex"] for r in results} != expected:
        return "Note results do not match the chart"

    verdicts = [r["verdict"] for r in results]
    missed = verdicts.count("missed")
    if (
        breakdown["notesMissed"] != missed
        or breakdown["notesHit"] != verdicts.count("hit")
        or breakdown["extraNotes"] < 0
    ):
        return "Note counts do not match the note results"

    pitch = breakdown["pitchAccuracy"]
    rhythm = breakdown["rhythmAccuracy"]
    completeness = breakdown["completeness"]
    if not all(0 <= value <= 100 for value in (pitch, rhythm, completeness)):
        return "Accuracy is out of range"

    total = len(expected)
    if abs(completeness - (total - missed) / total * 100) > SCORE_TOLERANCE:
        return "Completeness does not match the note results"
    # Only matched notes earn pitch or rhythm credit.
    if max(pitch, rhythm) > completeness + SCORE_TOLERANCE:
        return "Accuracy exceeds completeness"

    rules = {**DEFAULT_WEIGHTS, **(version.get("scoringRules") or {})}
    weights = (rules["pitchWeight"], rules["rhythmWeight"], rules["completenessWeight"])
    if sum(weights) <= 0:
        return "Scenario version has no scoring weights"
    final = sum(v * w for v, w in zip((pitch, rhythm, completeness), weights, strict=True))
    if abs(run["finalScore"] - final / sum(weights)) > SCORE_TOLERANCE:
        return "Final score does not match the breakdown"

    return None


@router.post("/{run_id}/validate", response_model=RunValidationResult)
def validate_run(run_id: str, user: CurrentUserDep) -> RunValidationResult:
    """Accept or reject the caller's pending run. Already-decided runs are returned as is."""
    db = get_firestore_client()
    run_ref = db.collection("runs").document(run_id)
    snapshot = run_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    run = snapshot.to_dict()
    if run.get("userUid") != user.uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your run")

    if run.get("validation") != RunValidation.PENDING:
        return RunValidationResult(run_id=run_id, validation=run["validation"])

    scenario_id = run.get("scenarioId")
    version_id = run.get("scenarioVersionId")
    scenario_ref = None
    version = None
    # Ids come from the client; an empty one or one with a slash is not a document path.
    if _is_document_id(scenario_id) and _is_document_id(version_id):
        scenario_ref = db.collection("scenarios").document(scenario_id)
        if scenario_ref.get().exists:
            version_snapshot = scenario_ref.collection("versions").document(version_id).get()
            version = version_snapshot.to_dict() if version_snapshot.exists else None

    reason = check_run(run, version)
    validation = RunValidation.REJECTED if reason else RunValidation.ACCEPTED

    batch = db.batch()
    batch.update(run_ref, {"validation": validation.value})
    if validation is RunValidation.ACCEPTED:
        batch.update(scenario_ref, {"playCount": firestore.Increment(1)})
    batch.commit()

    return RunValidationResult(run_id=run_id, validation=validation, reason=reason)


def _is_document_id(value: object) -> bool:
    return isinstance(value, str) and value != "" and "/" not in value
