# Clash of Jams — Frontend

React + TypeScript single-page app, built with Vite. Scaffolding only: a login
form and an empty home route. No backend.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

| Script              | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                  |
| `npm run build`     | Typecheck, then production build to `dist/` |
| `npm run preview`   | Serve the production build locally          |
| `npm run typecheck` | TypeScript only                             |
| `npm run lint`      | oxlint                                      |
| `npm run format`    | Prettier, write in place                    |

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

| Path      | Screen                                     |
| --------- | ------------------------------------------ |
| `/login`  | Email/password sign-in, password reset     |
| `/signup` | Account creation; reserves the username    |
| `/home`   | Nav hub (guarded)                          |

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
