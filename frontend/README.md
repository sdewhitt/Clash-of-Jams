# Clash of Jams — Frontend

React + TypeScript single-page app, built with Vite, Firebase authentication and
persistence, and a FastAPI backend. See [UI testing](../docs/ui-testing.md) for
the shared browser harness, test layers, and contributor instructions.

## Running it

Use Node.js 22.22.0 or newer (required by React Router).

```bash
npm ci
npm run dev      # http://localhost:5173
```

The lockfile includes a scoped override of Firestore's `@grpc/grpc-js` dependency
to 1.14.5, which patches its certificate-authentication and error-disclosure
advisories. Firestore 4.17.2 otherwise selects the vulnerable 1.9.x series.
Keep the override until Firebase includes a patched gRPC dependency, then
remove it and verify `npm audit` again. Avoid `npm audit fix --force`, which can
downgrade Firebase to an older major version.

| Script                    | What it does                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run dev`             | Dev server with hot reload                                       |
| `npm run build`           | Typecheck, then production build to `dist/`                      |
| `npm run preview`         | Serve the production build locally                               |
| `npm run typecheck`       | TypeScript only                                                  |
| `npm run lint`            | oxlint                                                           |
| `npm run format`          | Prettier, write in place                                         |
| `npm test`                | Component/module tests without emulators                         |
| `npm run test:rules`      | Firestore authorization tests                                    |
| `npm run test:e2e`        | Starts isolated emulators, API and frontend; runs browser suites |
| `npm run test:e2e:report` | Opens the latest browser report                                  |

## Layout

```
src/
  App.tsx       route table
  index.css     Tailwind import + theme tokens
  main.tsx      entry point
  components/   RequireAuth.tsx (route guard), NavButton, ProfileButton
  lib/
    api.ts      backend client; attaches the Firebase ID token
    auth/       AuthProvider, useAuth, account.ts (sign up / in / out)
    firebase.ts app, auth and db singletons
  pages/        Login.tsx, SignUp.tsx, Home.tsx, ...
```

Import with the `@/` alias (`@/pages/Home`), which maps to `src/`.

## Routes

| Path      | Screen                                  |
| --------- | --------------------------------------- |
| `/login`  | Email/password sign-in, password reset  |
| `/signup` | Account creation; reserves the username |
| `/home`   | Nav hub (guarded)                       |

`/login` and `/signup` are the only public routes. Everything else is wrapped in
`<RequireAuth>`, which sends a signed-out visitor to `/login` and remembers where
they were headed. `/` and any unmatched path go to `/home`, so a signed-in user
lands there and everyone else bounces to the login form.

## Auth

`AuthProvider` (mounted in `App.tsx`) holds the Firebase Auth session and a live
subscription to `users/{uid}`; read both with `useAuth()`. Signing up writes
`users/{uid}`, `usernames/{usernameLower}` and `userSettings/{uid}` in one batch,
and deletes the Auth account if that batch fails, so a half-created account never
locks up an email address.

Calls to the FastAPI backend should go through `apiFetch` in `src/lib/api.ts`,
which attaches the ID token as `Authorization: Bearer <token>`.

## Not built yet

Audio capture, scoring, and most feature screens.
