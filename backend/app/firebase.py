from app.config import get_settings
from firebase_admin import firestore


_firebase_ready = False


def ensure_firebase() -> None:
    """Initialize the Admin SDK once, on first use."""
    global _firebase_ready
    if _firebase_ready:
        return

    import firebase_admin
    from firebase_admin import credentials

    if not firebase_admin._apps:
        settings = get_settings()
        cred = (
            credentials.Certificate(settings.google_application_credentials)
            if settings.google_application_credentials
            else credentials.ApplicationDefault()
        )
        firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id})
    _firebase_ready = True


def get_firestore_client():
    ensure_firebase()
    return firestore.client()

