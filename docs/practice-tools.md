# Playback, tuner, speed, audio interfaces and match results — Sprint II

This sprint adds five player-facing features:

| Story | Feature                   | Where to find it                                                     |
| ----- | ------------------------- | -------------------------------------------------------------------- |
| #20   | Scenario playback         | **Listen** on the play setup screen (Solo Play and editor Play test) |
| #15   | Tuner                     | Home → **Tuner** (`/tuner`)                                          |
| #19   | Speed multiplier          | **Speed** on the play setup screen and in playback                   |
| #51   | Audio interfaces          | Home → **Settings** → **Audio interface**, and the play setup screen |
| #58   | Multiplayer match results | The screen shown when an online match ends                           |

No new hosting service, Firestore collection, index or rules change is needed. `userSettings/{uid}`
gains three optional fields, and multiplayer snapshots gain `hitBeats`.

## Scenario playback (#20)

**Listen** on the setup screen switches to playback mode: the same note highway used during play
scrolls in time with a synthesized rendition of the scenario, and the note that is sounding is
named under it. Controls: Play / Pause / Resume / Play again, Stop, a metronome toggle, a progress
bar, and the speed control. **Back to setup** returns to the setup screen with the speed chosen
while listening.

- Notes are scheduled ahead on the Web Audio clock (`lib/play/playback.ts`), so timing does not
  depend on React renders. The highway reads its position from the same clock.
- Changing speed mid-playback reschedules from the same beat at the new tempo, rather than
  restarting or jumping.
- Each note is a triangle wave plus a quiet octave overtone, with a short attack and release and a
  compressor on the master bus, so dense chords do not clip. Velocity sets loudness; notes shorter
  than 40 ms are lengthened so they remain audible.

**Tests** (`lib/play/playback.test.tsx`): 50 named, distinct scenarios in
`test/playback-scenarios.ts` (single notes, chords, ties, tempo and time-signature changes, rests,
extreme pitches and velocities, a 1,000-note piece, seeded random pieces and others). Each is
checked at several speeds for the right pitches, start times, durations and loudness, and is
rendered through the playback component against a fake `AudioContext`. `ScenarioPlayer.test.tsx`
covers Listen, pause/resume, the metronome, and a speed change mid-playback.

## Tuner (#15)

The tuner page shows the detected note and octave, a needle against the nearest equal-tempered
target, the distance in cents (with "tune up" / "tune down" / "In tune" within ±5 cents), the
heard frequency, and the target note and frequency. The reference pitch (A4) is adjustable from
415 to 466 Hz.

- **Source**: microphone/audio interface (using the saved device and input from Settings), or a
  MIDI controller, which always reads as perfectly in tune. The chosen source and A4 are
  remembered in this browser (`localStorage`).
- **Stable reading**: pitch frames go through the existing piano-profile analyzer, then a median
  of the last seven clear frames. A jump of more than half a semitone starts a new reading, and
  the last reading is held for 600 ms after the note stops.
- **Audio interruptions**: if the input stops, the tuner reopens it a second later. If the
  chosen interface is unplugged it falls back to the system default and switches back when the
  interface returns. A suspended audio context (e.g. after switching tabs) resumes on the next
  click or key press. If microphone permission was already granted, a reload starts the tuner
  without another click. Blocked permission shows **Try again**.

**Tests** (`lib/tuner/tuner.test.tsx`, `audio/useLiveAudioInput.test.ts`): detuned and in-tune
synthesized monophonic audio through the real pitch analyzer, a hundred differently detuned
pitches from E1 upward each rendered with a readable note, needle, cents and frequencies, MIDI
notes reading as exactly 0 cents, smoothing and hold behavior, and the
unplug/replug, dropout, input switch and blocked-permission paths.

## Speed multiplier (#19)

Speed is chosen on the setup screen with a slider (0.3x–3x, steps of 0.05x) or presets (0.5x,
0.75x, 1x, 1.5x, 2x). The default is 1x. The readout shows the resulting tempo, e.g.
`0.5x · 60 bpm (written 120 bpm)`.

- **Locked while playing**: once **Start** is pressed the control disappears; the playing screen
  shows `Speed 1.5x · 150 bpm · locked while playing`.
- **Audio and visuals**: the count-in clicks, note highway, expected-note timeline and playback all
  use the scaled timeline.
- **Scoring is speed-invariant**: expected times and the timing window are both scaled, so the same
  performance relative to the beat gets the same score at any speed.
- **Stored with the score**: the run's `speedMultiplier` is saved with the run (the backend accepts
  0.3–3.0, matching the frontend). The score screen shows `Played at 0.5x · 60 bpm (written 120
bpm)`, and adds "Only full-speed runs count toward the leaderboard." for runs away from 1x.
- **Play again** keeps the chosen speed.

**Tests** (`lib/play/speed.test.ts`): BPM tapping — the count-in clicks at 0.3x through 3x are
timed and converted back to BPM, matching the expected tempo. Synthetic performances at
0.3/0.5/2/3x score identically to 1x. Recorded audio (single pitches, rhythm, a slow scale and a
legato melody) is transcribed and scored identically at 0.5/1/2x. `ScenarioPlayer.test.tsx` checks
the lock and that the finished run reports its speed; `PlayScenario.test.tsx` checks a 0.5x run is
saved with `speedMultiplier: 0.5` and the tempo is shown.

## Audio interfaces (#51)

**Settings → Audio interface** lists audio input devices and the inputs (channels) of the
selected one. The choice saves immediately to `userSettings/{uid}` and is used by gameplay, the
tuner and latency calibration. **Test level** shows a live meter. The same picker and a **Check
input level** meter appear on the play setup screen when the microphone input is chosen.

- **Only the chosen input is analyzed**: the device is opened with enough channels, a channel
  splitter picks the chosen input, and only that mono signal reaches pitch detection. "All inputs
  (mixed)" keeps the previous behavior.
- **Gain meter and clipping**: during play a compact meter shows level, peak hold and a **CLIP**
  badge (peaks at or above −0.1 dBFS), with advice ("Quiet. Turn the gain up on your interface.",
  "Clipping! Turn the gain down on your interface.", …).
- **Latency calibration** (Settings → Input latency → Calibrate) now listens on the saved device
  and input.
- **Unplugged mid-scenario**: the run stops, nothing is scored or saved, and the setup screen says
  "Your audio interface was disconnected, so the scenario was stopped. Plug it back in and press
  Start to try again."
- **Missing saved device**: the picker says it is not plugged in and the system default is used
  until it returns.

`UserSettings` fields (all optional, `null` meaning system default / all inputs mixed):

| Field                   | Type             | Notes                                                       |
| ----------------------- | ---------------- | ----------------------------------------------------------- |
| `audioInputDeviceId`    | `string \| null` | Browser device id; can change between sessions.             |
| `audioInputDeviceLabel` | `string \| null` | Used to find the device again if its id changed.            |
| `audioInputChannel`     | `number \| null` | Zero-based input index (shown to players as Input 1, 2, …). |

**Tests**: `audio/input.test.ts` (channel selection, unavailable input, level and clipping, unplug),
`audio/level.test.ts`, `audio/devices.test.ts`, `lib/play/settings.test.ts` (save and load back),
`audio/useLiveAudioInput.test.ts`, `pages/Settings.test.tsx` (choosing and saving an interface and
input, a missing saved device), and `ScenarioPlayer.test.tsx` (unplugging mid-run stops the run
and shows the message).

**Limitations**: browsers name devices only after microphone permission is granted (the picker
offers a button for this). Some browsers or drivers expose only the first two inputs of a larger
interface, so an input above 2 may report as unavailable; the picker lists what the device reports.

## Multiplayer match results (#58)

When a match ends, the results screen shows:

- **Outcome**: You won! / You lost / It's a tie / You forfeited, with the scenario, instrument and
  whether a resignation or disconnect decided it.
- **Score breakdown** for both players side by side: score, beats hit, missed, longest streak, first
  half vs second half, and a hit/miss strip for every beat. The better value in each row is bold.
- **Your opponent**: profile picture, display name, @username, instrument, Elo after the match
  (with change), rank, rated matches, bio, and strengths and weaknesses derived from their play
  this match. Private profiles show "This profile is private." and the in-match name.
- **How your Elo changed**: the formula worked through with the real numbers —
  `Rating change = K × (result − expected) = 32 × (1 − 0.43) = +18.3` — plus notes on upsets and
  provisional ratings, followed by the existing rating card.
- **Areas for improvement**: your strengths and weaknesses and specific tips (where you lost the
  beat, a second-half fade, the gap to your opponent, resignations and disconnects).

To support the beat-by-beat breakdown, the session snapshot now includes each player's `hitBeats`
(the zero-based beats they hit, in order). When a match is cut short by a resignation or
disconnect, the breakdown counts only the beats played up to the last hit.

**Tests**: `lib/multiplayer/breakdown.test.ts` (stats, strengths and weaknesses, tips, Elo
explanation, headline), `components/MatchResults.test.tsx` (win, loss, tie, opponent profile and
private profile, both breakdowns, Elo explanation, tips, cut-short matches) and
`backend/tests/test_multiplayer.py::test_snapshot_lists_the_beats_each_player_hit_in_order`.

## Verification

```bash
cd frontend
npm test            # 863 tests
npx tsc -b --noEmit
npx oxlint
npm run build

cd ../backend
uv run --extra dev pytest   # 183 passed, 41 skipped (emulator-only)
```
