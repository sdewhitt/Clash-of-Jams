# UI testing

This project uses the existing Vitest component/module tests, Firestore rule tests, and standard Playwright browser tests. There is no hosted test service, separate test application, or custom page-object framework.

## Test layers

| Layer                    | Use it for                                                                               | Command from frontend/ |
| ------------------------ | ---------------------------------------------------------------------------------------- | ---------------------- |
| Vitest + Testing Library | Deterministic logic, component states, listener cleanup, explicit loading/error fixtures | `npm test`             |
| Firestore rule tests     | Ownership, permissions, forbidden writes and actual allowed queries                      | `npm run test:rules`   |
| Playwright               | Real browser journeys through React, Firebase Auth, Firestore, and FastAPI               | `npm run test:e2e`     |

Keep most edge cases in fast logic/component tests. Add browser tests for the user-visible integration path and meaningful regressions. A browser test should assert a user outcome, rather than reproduce implementation details.

## Shared architecture

```text
playwright.config.ts
  ├── isolated Firebase Auth + Firestore emulators
  ├── actual Vite frontend + actual FastAPI server
  └── tests/e2e/
       ├── support/       shared environment, data lifecycle, fixtures and login helpers
       ├── shell.spec.ts  route guards, login/logout, keyboard access and responsive header
       ├── scenarios/     scenario browsing through the authenticated API
       └── elo/           rating journeys + a feature-specific server result adapter
```

The Firebase project is always `demo-clash-of-jams-ui`. Its Auth, Firestore, API and frontend ports are 9199, 8180, 8190 and 5190; these are separate from the normal developer/demo servers. The configuration refuses to reuse an arbitrary already-running API/frontend. No production Firebase credentials are required.

`support/fixtures.ts` extends Playwright's normal `test` fixture. Every test gets a fresh browser context and an independent `TestData` object. Accounts, scenarios and matches use unique names. Cleanup deletes only tracked documents and accounts; it never clears another test's database. This supports parallel runs and multiple developers.

`support/data.ts` reuses the application's document factories in `src/lib/schema/collections.ts`. Fixture preparation uses emulator-only administrative access. Browser interactions sign in through the real login form and remain subject to normal Firestore rules and API token verification.

Shared helpers cover authentication and data lifecycle. Feature-specific setup stays beside the feature's specs. Elo's adapter invokes the actual Python finalization service on synthetic match results; it does not pretend that a musical playthrough or multiplayer session has run.

`backend/scripts/serve_ui_tests.py` starts the real API with anonymous emulator credentials after checking the dedicated project and local hosts. Authentication is enabled. This test-only entrypoint leaves production startup unchanged.

## Run locally

Prerequisites: Node >=22.22, Java >=21, and Python >=3.12. From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e './backend[dev]'
cd frontend
npm ci
npx playwright install chromium webkit
npm run test:e2e
```

The last command starts/stops both emulators and both application servers automatically. It runs desktop Chromium, desktop WebKit, and mobile Chromium. Fixed timezone/locale keep displayed dates and numbers consistent. Failures are not retried automatically.

On the current development machine Java 21 was prepared at `/tmp/coj-jdk21/jdk-21.0.12.1+1/Contents/Home`. Set `JAVA_HOME` to that directory if your default Java is older. Prefer an installed JDK for long-term use. The machine's system Node is older than the package requirement; the Codex bundled Node 24 runtime is also available.

For a focused run, keep a dedicated emulator terminal open:

```bash
# From frontend/, terminal 1:
npx -y firebase-tools@15.32.1 emulators:start --config ../firebase/firebase.e2e.json --project demo-clash-of-jams-ui --only auth,firestore
# Terminal 2:
npm run test:e2e:browser -- --project=chromium-desktop tests/e2e/scenarios
```

The browser runner still manages the API/frontend. `E2E_PYTHON` optionally selects the Python executable for Elo's result adapter; the test API expects the normal backend/.venv location.

## Add a feature test

1. Create `tests/e2e/<feature>/<feature>.spec.ts`.
2. Import `test` and `expect` from `../support/fixtures.js`; use the shared `player`, `opponent` and `data` fixtures as needed.
3. Prepare documents using existing schema factories and `data.seed()`. Create unique IDs with `data.id()`. Feature-specific server writes must register their new document paths with `data.track()` for cleanup.
4. Use `signIn(page, player, destination)` from `../support/auth.js` to enter through the actual login flow.
5. Prefer accessible roles/labels and automatic Playwright assertions. Do not use arbitrary sleeps, production accounts, shared demo accounts, Firebase bypasses inside the browser, or a global database wipe.
6. Keep unusual actions in small feature-local helpers. Start a page object only when repeated navigation actually warrants one.

Example: `tests/e2e/scenarios/browse.spec.ts` creates a private scenario with `newScenario`, signs in, selects it in the real scenario browser, and checks that Play is enabled. It demonstrates reuse of the same harness outside Elo.

For multiplayer, use two isolated browser contexts and the same shared identity/data fixtures; the existing two-player Elo test is an example. Implement its session fixture alongside the multiplayer specs when the session server exists.

## Results and CI

`npm run test:e2e:report` opens the generated HTML report. `test-results/results.json` provides machine-readable results. Failed tests retain screenshots, videos and traces; unexpected browser JavaScript exceptions fail tests. The successful two-player rating test also attaches a screenshot.

`playwright-report/` and `test-results/` are ignored by Git. Commit specs and fixtures. Add screenshot baselines only when intentionally testing stable visual design, and review any baseline update as a UI change.

Observed WebKit behavior: canceling or re-authenticating an emulator Firestore
listen stream can produce a native network message classified as a page error.
The harness records those messages as report attachments, using a narrow
allowlist for the dedicated local project's Listen URL and exact message suffix.
Other page errors still fail. The independent UI assertions require ratings,
history and account switching to actually work despite those transport messages.

`.github/workflows/ui-tests.yml` runs unit tests, typecheck/build, security-rule tests and browser tests for relevant pull requests or manual dispatch. Reports are uploaded even on failure and retained for seven days. This workflow does not deploy anything and needs no cloud secrets. Its GitHub run is not verified until the workflow is pushed and executed.

Initial coverage is 21 journeys across three browser/device projects (63 checks): authentication, protected routes, account isolation, keyboard access, small-phone header layout, scenario browsing, two-player rating updates, idempotency, persistence, all result reasons, instrument selection, missing ratings, history ordering/limit, provisional status, profile subscriptions and network recovery.

These checks do not establish gameplay/audio accuracy, production capacity or latency targets. Keep those in dedicated backend/audio tests and measured benchmarks as their implementations arrive.

Firefox was initially attempted but could not launch on this machine. The error matches [Playwright's reported macOS app-data privacy issue](https://github.com/microsoft/playwright/issues/42768). WebKit provides the second engine without changing OS permissions; Firefox coverage is not claimed.

Configuration and reporting follow [Playwright's web-server support](https://playwright.dev/docs/test-webserver) and [recording options](https://playwright.dev/docs/test-use-options).
