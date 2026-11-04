"""
Re-check every rejected run and accept the ones that pass the current checks.

    python scripts/revalidate_runs.py           # show what would change
    python scripts/revalidate_runs.py --apply   # accept them

Run from backend/ with the venv active. POST /runs/{id}/validate never revisits a decided
run, so runs rejected by an old bug in check_run stay rejected until this flips them. The
first one was the 0-100,000 score scale: every scored run failed "Final score does not match
the breakdown". Runs that still fail keep their rejection; accepted ones also bump their
scenario's playCount, the same as the route does.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: E402

from app.firebase import firestore, get_firestore_client  # noqa: E402
from app.routers.runs import check_run  # noqa: E402


def main(apply: bool) -> None:
    db = get_firestore_client()
    rejected = db.collection("runs").where(filter=FieldFilter("validation", "==", "rejected"))

    accepted = 0
    still_rejected = 0
    for snapshot in rejected.stream():
        run = snapshot.to_dict()
        scenario_ref = db.collection("scenarios").document(run.get("scenarioId") or "_")
        version_snapshot = (
            scenario_ref.collection("versions").document(run.get("scenarioVersionId") or "_").get()
        )
        version = version_snapshot.to_dict() if version_snapshot.exists else None

        reason = check_run(run, version)
        if reason:
            still_rejected += 1
            print(f"  still rejected  {snapshot.id}: {reason}")
            continue

        accepted += 1
        print(f"  accept          {snapshot.id}")
        if apply:
            batch = db.batch()
            batch.update(snapshot.reference, {"validation": "accepted"})
            batch.update(scenario_ref, {"playCount": firestore.Increment(1)})
            batch.commit()

    verb = "Accepted" if apply else "Would accept"
    print(f"{verb} {accepted} run(s); {still_rejected} still rejected.")
    if not apply and accepted:
        print("Run again with --apply to save.")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
