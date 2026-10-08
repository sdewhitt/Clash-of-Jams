"""Start the real API with local emulator credentials; never a production entrypoint."""

import os
from urllib.parse import urlsplit

import firebase_admin
import uvicorn
from google.auth.credentials import AnonymousCredentials


def main():
    project = "demo-clash-of-jams-ui"
    if os.getenv("FIREBASE_PROJECT_ID") != project or any(
        urlsplit("http://" + os.getenv(key, "")).hostname not in ("127.0.0.1", "localhost")
        for key in ("FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST")
    ):
        raise SystemExit("UI test server requires the dedicated demo project and local emulators")
    # Auth still verifies the real emulator ID token. No auth-disabled development mode.
    firebase_admin.initialize_app(AnonymousCredentials(), {"projectId": project})
    uvicorn.run("app.main:app", host="127.0.0.1", port=8190)


if __name__ == "__main__":
    main()
