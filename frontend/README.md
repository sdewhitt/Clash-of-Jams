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
  pages/        Login.tsx, Home.tsx
```

Import with the `@/` alias (`@/pages/Home`), which maps to `src/`.

## Routes

| Path     | Screen                                      |
| -------- | ------------------------------------------- |
| `/login` | Login form; submitting navigates to `/home` |
| `/home`  | Empty                                       |

`/` and any unmatched path redirect to `/login`.

## Not built yet

Auth, data, route guards, and every feature screen.
