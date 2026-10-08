"""E2E test adapter: call the real Elo service against a dedicated local project."""

import json
import os
import sys
from urllib.parse import urlsplit

from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client

from app.services.skill_ratings import FinalMatchResult, finalize_match


def main():
    project = "demo-clash-of-jams-ui"
    hosts = [
        os.getenv(key, "") for key in ("FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST")
    ]
    if os.getenv("GCLOUD_PROJECT") != project or any(
        urlsplit("http://" + host).hostname not in ("127.0.0.1", "localhost") for host in hosts
    ):
        raise SystemExit("UI fixtures require the dedicated demo project and local emulators")
    result = FinalMatchResult.model_validate_json(sys.argv[1])
    if not result.match_id.startswith("e2e-"):
        raise SystemExit("Only namespaced E2E fixtures may be finalized")
    db = Client(project=project, credentials=AnonymousCredentials())
    try:
        events = finalize_match(db, result)
        print(json.dumps([event.model_dump(by_alias=True, mode="json") for event in events]))
    finally:
        db.close()


if __name__ == "__main__":
    main()
