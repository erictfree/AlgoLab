# Response

A p5.js environment for performing audio-reactive visuals **while their code is still
being edited**.

Response owns `setup()` and `draw()` and keeps them running. You write named patches,
evaluate them with `Cmd/Ctrl+Enter`, and the change appears on the next frame — no
page reload, no blank canvas, no restarted track, no lost state. Code that doesn't
compile never reaches the stage. Code that throws on its first frame rolls itself back
to the last version that worked.

Built for **AET 350C — _Visuals in the Loop: Reactive Systems for Algorave_**, against
`# Product Requirements Document.md` in this repo.

---

## Run it

```sh
npm run dev          # http://localhost:5173
```

That's it — no build step. `npm` is only needed for the tests; the app itself is
`index.html` plus plain ES modules and a vendored copy of p5.js 1.11.3.

Opening `index.html` from the filesystem will **not** work: ES modules need an HTTP
origin, which is what `npm run dev` provides (a ~60-line dependency-free static
server).

Then: choose an audio file → **start** → put your cursor in the `rings` block →
change something → `Cmd/Ctrl+Enter`.

## Test it

```sh
npm test             # 41 unit tests — registry, rollback, state, audio, block scanner
npm run test:e2e     # the PRD §12 Degree 3 acceptance scenario, end to end
```

The E2E test needs Chromium once: `npx playwright install chromium`.

`npm run test:e2e` walks all ten steps of the acceptance test in a real browser with
real audio analysis — including introducing a syntax error and a first-frame crash and
asserting that the canvas element, `frameCount`, host clock, playback position, and
accumulated patch state all survive.

---

## Where to look

| | |
| --- | --- |
| **`docs/API.md`** | What students write. Start here. |
| **`docs/ARCHITECTURE.md`** | How it works and why it's shaped this way. |
| `src/main.js` | The whole draw loop, in about ten lines. |
| `starter/starter.js` | The starter scene, which doubles as the tutorial. |
| `tests/spike.html` | The PRD §16 technical spike, kept as an executable record. |

---

## Scope

This is the **P0 core** from PRD §14 — everything required to pass the Degree 3
acceptance test, plus a working performer interface:

persistent canvas and host loop · audio-file playback and p5.sound analysis · shared
normalized audio snapshot · block evaluation · named patch registration and atomic
replacement · per-patch persistent state · named scenes and live recomposition ·
syntax and registration rejection · first-frame runtime rollback · version history and
one-click revert · local project persistence · starter project and API docs.

Not yet built (P1/P2): microphone input, the projection window, safe-scene/panic, FPS
warnings, project import/export, the offline course bundle, Web MIDI.

## One warning

Response runs your JavaScript with `new Function`. That is deliberate, and it is not a
security sandbox — error boundaries cannot catch an infinite loop, and `while (true)`
in a patch will freeze the tab. Run code you wrote or that your instructor gave you.
See `docs/ARCHITECTURE.md` for the full trust boundary.
