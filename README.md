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
npm test             # 64 unit tests — registry, rollback, state, audio, blocks, project
npm run test:e2e     # 10 browser tests, including the PRD §12 Degree 3 scenario
```

The E2E tests need Chromium once: `npx playwright install chromium`.

The headline one walks all ten steps of the acceptance test in a real browser with
real audio analysis — including introducing a syntax error and a first-frame crash and
asserting that the canvas element, `frameCount`, host clock, playback position, and
accumulated patch state all survive. The rest cover the projection window (including
that a stack trace can never reach it), panic, import confirmation, and that the page
loads with every non-local request blocked.

```sh
npm run test:soak                  # 3 minutes
SOAK_MINUTES=30 npm run test:soak  # the PRD §15 figure
```

The soak runs the page continuously while evaluating a rotation of good edits,
stateful patches, syntax errors, and first-frame crashes. Last full run:

> **30.2 minutes · 108,866 frames · 7,040 evaluations · mean 60.1 FPS · heap
> 17.1 MB → 17.2 MB (+0.4%)** — with the canvas element, `AudioContext`, and
> `window.draw` all still the same objects they were at the start, and the music
> still playing.

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

**P0 and P1 from PRD §14** are implemented and tested — the full §20 release criterion
for a course pilot.

*P0, the Degree 3 core:* persistent canvas and host loop · audio-file playback and
p5.sound analysis · shared normalized audio snapshot · block evaluation · named patch
registration and atomic replacement · per-patch persistent state · named scenes and
live recomposition · syntax and registration rejection · first-frame runtime rollback ·
version history and one-click revert · local project persistence.

*P1, course-ready performance:* microphone and line input with device selection ·
live smoothing and auto-gain controls · silence fallback on any input failure ·
projection window with canvas / code / trace layouts · fullscreen · safe scene and
one-key panic · frame-rate warnings · project export and import behind a trusted-code
confirmation · offline course bundle.

Not built (P2): Web MIDI, crossfades, stronger runtime isolation, WebGL/shader
patches, collaborative rooms, language adapters, recording and replay.

## One warning

Response runs your JavaScript with `new Function`. That is deliberate, and it is not a
security sandbox — error boundaries cannot catch an infinite loop, and `while (true)`
in a patch will freeze the tab. Run code you wrote or that your instructor gave you.
See `docs/ARCHITECTURE.md` for the full trust boundary.
