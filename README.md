# Clash of Jams
Kovaak's but for music :)

Musicians improve through repeated, focused practice, but traditional practice methods often provide limited quantitative feedback and can make it difficult to measure short term improvement. While rhythm games such as Guitar Hero provide immediate scoring and strong incentives to replay songs, they generally rely on simplified or specialized controllers rather than evaluating performance on real musical instruments. Conversely, traditional music practice tools provide useful resources such as sheet music, metronomes, and recordings, but often lack the competitive and measurable feedback loops that make skill based games engaging.
We aim to create a music practice application inspired by the gameplay loop in Kovaak's Aim Trainer (a minigame to practice video game skills in various environments). Users will be able to play full songs or specific parts of songs, hereafter referred to as scenarios, designed to exercise specific skills or pieces of music. The application will evaluate their performance using factors such as pitch accuracy and rhythm, and compare their score against the user's previous attempts and other players through leaderboards, providing feedback for improvement.
The standard practice loop is: 
Select a scenario → perform it on a real instrument → receive feedback immediately → compare results → attempt to improve on the same or another scenario. 
By making improvement measurable and encouraging repeated attempts, the application is intended to provide incremental motivation to engage in deliberate practice.

Frontend:

```
cd frontend
npm install
npm run dev
```

Backend:

```
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

## Run locally with Firebase emulators

The Auth and Firestore emulators use a separate local project, `demo-clash-of-jams`. Your cloud accounts and data stay in the shared Firebase project. A fresh emulator starts with an empty user list and database unless you import a local snapshot. Create a local account through the app or use the demo accounts seeded below.

### 1. Check prerequisites

Use Node.js 22.22 or newer, JDK 21 or newer, and `uv`. Run `npm install` in `frontend` and `uv sync` in `backend` if you haven't already.

Check `java -version` in the terminal that will run Firebase. On macOS with Homebrew, you can install and select Java 21 for that terminal:

```sh
brew install openjdk@21
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```

### 2. Start the emulators

From the repo root, run the command below and leave it running. Auth listens on port `9099` and Firestore on `8080`.

```sh
npx -y firebase-tools@15.32.1 emulators:start --config firebase/firebase.json --project demo-clash-of-jams --only auth,firestore
```

### 3. Seed demo data and start the backend

Stop any existing backend on port `8000`. Open a second terminal at the repo root. The seed script creates two local accounts and a playable public piano scenario for matchmaking.

```sh
cd backend
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FIREBASE_PROJECT_ID=demo-clash-of-jams
export AUTH_DISABLED=false

.venv/bin/python scripts/demo_multiplayer.py
.venv/bin/python -c 'import firebase_admin, uvicorn; from google.auth.credentials import AnonymousCredentials; firebase_admin.initialize_app(AnonymousCredentials(), {"projectId": "demo-clash-of-jams"}); uvicorn.run("app.main:app", host="127.0.0.1", port=8000)'
```

### 4. Start the frontend

Stop any existing frontend on port `5173`. Open a third terminal at the repo root and run:

```sh
cd frontend
VITE_FIREBASE_API_KEY=demo-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-clash-of-jams.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-clash-of-jams \
VITE_FIREBASE_APP_ID=demo-app \
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
VITE_API_BASE_URL='' \
API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev -- --port 5173 --strictPort
```

Open [localhost:5173](http://localhost:5173) in two separate browser profiles or browsers. Sign in as `elo-demo@example.test` in one and `elo-opponent@example.test` in the other. Both local accounts use the password `EloDemo123!`. Choose **Online Play** in both windows.

If the API returns `401 Invalid or expired token`, open a fresh private window and sign in with a demo account. Check that the frontend and backend both use `demo-clash-of-jams`. If both players stay in the queue, verify the seed script completed and both players selected piano. The matchmaking catalog refreshes every 10 seconds.

See the [multiplayer demo guide](docs/multiplayer.md#local-demo) for the full walkthrough.

### Seed more local demo data

With the emulators running, use the following command from `backend` to populate scenario search, play history, ratings, and leaderboards with sample data. Rerunning it resets the Sprint 1 demo fixtures.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
PYTHONPATH=scripts .venv/bin/python -c 'import firebase_admin; from google.auth.credentials import AnonymousCredentials; firebase_admin.initialize_app(AnonymousCredentials(), {"projectId": "demo-clash-of-jams"}); from seed_demo import seed; seed()'
```

Sign in locally as `demo_1_user@clashofjams.dev` with the demo password `ClashDemo2026!`.

### Keep local data between restarts

By default, the emulator discards its local data on shutdown. To keep it, append `--export-on-exit="$HOME/.clash-of-jams-emulator"` to the emulator startup command in step 2. After a clean shutdown with Ctrl+C, add both flags on future starts:

```sh
npx -y firebase-tools@15.32.1 emulators:start \
  --config firebase/firebase.json --project demo-clash-of-jams --only auth,firestore \
  --import="$HOME/.clash-of-jams-emulator" --export-on-exit="$HOME/.clash-of-jams-emulator"
```

This snapshot contains local Auth users and Firestore documents. [Firebase emulator import and export](https://firebase.google.com/docs/emulator-suite/install_and_configure#export_and_import_emulator_data)
