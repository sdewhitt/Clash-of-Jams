# Clash of Jams — Frontend

React + TypeScript single-page app, built with Vite. No backend is wired up yet;
every screen renders from `src/lib/mockData.ts`.

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
  App.tsx                  route table
  components/layout/       sidebar shell used by the signed-in screens
  components/ui/           Button, Card, Badge, PageHeader
  features/gameplay/       canvas note highway + the audio clock
  lib/                     shared types, mock data, class-name helper
  pages/                   one file per screen in the design doc
```

Import with the `@/` alias (`@/lib/types`), which maps to `src/`.

## Routes

| Path                | Screen                                 |
| ------------------- | -------------------------------------- |
| `/`                 | Welcome                                |
| `/login`, `/signup` | Auth forms (submit just navigates)     |
| `/home`             | Dashboard: featured, runs, leaderboard |
| `/scenarios`        | Search with client-side filtering      |
| `/editor`           | Scenario editor shell                  |
| `/profile`          | Stats and run history                  |
| `/settings`         | Audio, gameplay, accessibility         |
| `/play/:scenarioId` | Gameplay, full viewport                |

## The one architectural rule

`/play` does not render through React. `features/gameplay/NoteHighway.tsx` mounts a
raw `<canvas>` and drives it with `requestAnimationFrame`; React mounts it and then
stays out of the way. Putting the playhead in `useState` would run the reconciler
60 times a second on the one screen that cannot afford it.

The playhead itself comes from `features/gameplay/transport.ts`, which reads
`AudioContext.currentTime` rather than `performance.now()` or a frame count — it is
the only clock that stays locked to sample playback and will not drift against a
backing track. `AudioContext` also cannot start without a user gesture, which is why
the scenario waits behind an explicit "Start scenario" click.

## Not built yet

- Firebase auth, Firestore reads, and live match state (Realtime DB)
- Audio capture, pitch detection, and the scoring engine
- The editor's MIDI grid — it is a static mockup
- Route guards; every route is currently public
