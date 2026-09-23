# Clash of Jams — Backend

FastAPI service for scoring, scenarios and match state. Skeleton only: a health
check plus one worked CRUD router backed by an in-memory dict. No Firestore
wiring yet.

## Running it

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # then set AUTH_DISABLED=true for local work

uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

Interactive docs at `/docs`, OpenAPI JSON at `/openapi.json`.

| Command                | What it does              |
| ---------------------- | ------------------------- |
| `pytest`               | Test suite                |
| `ruff check .`         | Lint                      |
| `ruff format .`        | Format, write in place    |

## Layout

```
app/
  main.py          create_app(): CORS, router mounting
  config.py        Settings, read from env / .env
  dependencies.py  Firebase ID token -> CurrentUser
  schemas.py       Pydantic request/response models
  routers/
    health.py      GET /health
    scenarios.py   the pattern to copy for new routers
tests/
```

## Routes

Versioned routes live under `/api/v1`; `/health` sits outside it so deployment
probes do not track the API version.

| Method | Path                       | Notes                    |
| ------ | -------------------------- | ------------------------ |
| GET    | `/health`                  | No auth                  |
| GET    | `/api/v1/scenarios`        | The caller's scenarios   |
| POST   | `/api/v1/scenarios`        | 201 with the new record  |
| GET    | `/api/v1/scenarios/{id}`   | 404 if not the caller's  |

## Auth

The frontend signs in with the Firebase Web SDK and sends the ID token as
`Authorization: Bearer <token>`. `app/dependencies.py` verifies it with the
Firebase Admin SDK and injects a `CurrentUser`; inject it into a route with:

```python
from app.dependencies import CurrentUserDep


@router.get("/thing")
def read_thing(user: CurrentUserDep): ...
```

Verification needs credentials — either `GOOGLE_APPLICATION_CREDENTIALS`
pointing at a service account key, or Application Default Credentials from
`gcloud auth application-default login`. To work without either, set
`AUTH_DISABLED=true` and every request is attributed to `AUTH_DEV_UID`.

## Field names

Python is snake_case, the TypeScript interfaces and the Firestore documents are
camelCase. `ApiModel` in `app/schemas.py` bridges the two with an alias
generator, so `author_difficulty` here is `authorDifficulty` on the wire and in
the OpenAPI schema. Subclass it for anything a route accepts or returns, and
write the fields in snake_case:

```python
class ScenarioCreate(ApiModel):
    author_difficulty: int = 1  # clients send authorDifficulty
```

Validation accepts either spelling, so Python callers keep using keyword
arguments. Serialization is the asymmetric half: FastAPI renders responses by
alias, but a bare `model_dump()` returns snake_case — code writing a model to
Firestore wants `model_dump(by_alias=True)`.

## Adding a router

1. New module in `app/routers/`, with `router = APIRouter(prefix=..., tags=[...])`.
2. Request/response models in `app/schemas.py`, subclassing `ApiModel` so the
   wire names match `frontend/src/lib/schema/types.ts` (see Field names).
3. `app.include_router(...)` in `app/main.py`, under `settings.api_prefix`.

## Next

- Replace `_STORE` in `routers/scenarios.py` with Firestore via the Admin SDK.
- Port the remaining shapes from `frontend/src/lib/schema/types.ts`.
- Routers for runs, matches and leaderboards.
