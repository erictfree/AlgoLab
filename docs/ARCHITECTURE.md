# How Response works

This document is for the person maintaining Response, and for students who want to
know why the system is shaped the way it is. PRD §18 argues that the course's
JavaScript topics are *structurally necessary* here rather than decorative — this is
where you can check that claim against the code.

---

## The one idea

An ordinary p5.js sketch owns `setup()` and `draw()`. Changing it means reloading,
and reloading destroys the canvas, `frameCount`, every array you built up, and
possibly the audio context.

Response inverts that. **The host owns `setup()` and `draw()` and never gives them
up.** Student code contributes *named functions* that the host calls. Replacing a
name's function is a `Map.set` — nothing about the canvas, the clock, the audio graph,
or the accumulated state is involved.

Everything else in this codebase exists to make that replacement safe.

---

## Module map

```
index.html            loads vendored p5 + p5.sound (classic scripts), then src/main.js
src/main.js           the only file that touches p5 globals or assigns window.draw

src/host/
  registry.js         Map<name, patch record>; scenes; params; version history
  stateStore.js       Map<name, state object> — state identity, snapshot, restore
  liveApi.js          patch/scene/go/add/remove/clearScene/resetPatch/param
  evaluator.js        the staged evaluation transaction (compile -> stage -> queue)
  hostLoop.js         beginFrame / drawPatch / commitPendingChanges; error boundaries
  diagnostics.js      bounded ring of performer-facing messages

src/audio/
  audioEngine.js      one Amplitude, one FFT, file loading, transport
  features.js         smoothing, auto-gain, normalization, onset detection (pure)

src/ui/
  editor.js           textarea + top-level block scanner + key bindings
  panels.js           patch shelf, scene strip, meters, history, messages
  projection.js       the audience window: canvas / code / trace layouts
  confirmDialog.js    the trusted-code confirmation shown before an import
  styles.css          dark performance theme

src/persistence/
  projectStore.js     localStorage: source, scenes, params
```

`src/host/*` and `src/audio/features.js` contain **no p5 and no DOM**. That is not
tidiness — it is what makes rollback, state identity, and onset detection testable in
plain Node, which is where `tests/unit/` runs.

---

## The frame

`src/main.js` is short on purpose. This is the whole loop:

```js
window.draw = function draw() {
  const snapshot = audio.readFrame();          // analysis once per frame, shared
  const frame = host.beginFrame(snapshot);     // clocks, params, scene transitions

  for (const name of registry.activeOrder()) { // scene order = layer order
    host.drawPatch(name, frame);               // each inside its own error boundary
  }

  host.commitPendingChanges();                 // new code splices in HERE, never mid-frame
};
```

`commitPendingChanges()` is at the bottom for a reason. A replacement queued during
frame *N* is applied at the end of frame *N*, first runs during frame *N+1*, and is
confirmed or rolled back at the end of *N+1*. A patch is never swapped out halfway
through a rendered image.

---

## The evaluation transaction

From PRD §13.2. Steps 1–5 are in `evaluator.js`; 6–8 belong to the frame and live in
`hostLoop.js`.

| # | Step | Where | Failure means |
| - | ---- | ----- | ------------- |
| 1 | Compile with `new Function` | evaluator | Syntax error — nothing staged (S-01) |
| 2 | Run registration calls into a **staging transaction** | liveApi | Registration error — nothing applied (S-02) |
| 3 | Validate shapes and referenced names | evaluator | Registration error (S-02) |
| 4 | Snapshot each affected patch's state | stateStore | Warning; code still rolls back, state won't |
| 5 | Queue for the frame boundary | evaluator | — |
| 6 | Invoke the candidate inside an error boundary | hostLoop | Rollback to previous version (S-03) |
| 7 | Commit, or restore previous definition **and** state | registry | — |
| 8 | File the successful source in history | registry | — |

The invariant that everything rests on: **steps 1–4 cannot touch the live registry.**
Student code runs against a staging transaction that the running system has never
seen. This is why a syntax error, or a block that throws halfway through its
registrations, is structurally incapable of blanking the stage — not because we catch
the error carefully, but because there was never a path from that code to the active
map.

### Candidates

A new version is a *candidate* until it has survived one frame. `registry.stagePatch`
records the previous definition, version, source, and state snapshot on
`record.candidate`. Then:

- `drawPatch` returns without throwing → `confirmPatch` files it in history and clears
  the candidate. Version numbers only ever go up, and only successful versions are
  stored.
- `drawPatch` throws → `rollbackPatch` restores the previous definition and version,
  `stateStore.restore` puts the snapshot back, and the performer gets a message. The
  failed version is never filed.

A candidate that is not in the active scene has no frame to survive, so
`commitPendingChanges` accepts it directly — nothing on stage is at risk from code
that isn't drawing.

---

## State identity

`stateStore` is a `Map<patchName, object>`. The factory in `state: () => ({...})` runs
**once per name, ever**. Re-evaluating a patch does not re-run it.

This is the mechanism behind PRD §7's "state has an identity". The function object is
discarded and replaced on every evaluation; the state object is found again by name.
It is also why `resetPatch(name)` has to exist as an explicit act — there is no other
way to get a fresh one.

Snapshots use `structuredClone`, which is why §13.4 asks for JSON-shaped state. A
value that can't be cloned produces a warning and a `null` snapshot, and `restore`
treats `null` as "leave it alone" — the code still rolls back, the state doesn't. That
degradation is deliberate and visible rather than silent.

---

## Audio

One `p5.Amplitude` and one `p5.FFT`, created in `setup()` and never recreated.
Nothing in the evaluation path can reach `audioEngine`, which is how A-04 ("code
evaluation shall not restart playback or recreate the analyzer") is satisfied
structurally rather than by discipline.

`features.js` is pure. Two decisions worth knowing:

- **Auto-gain is a decaying peak.** The ceiling jumps up instantly and sags back
  slowly, so a steady quiet track still spans 0..1. p5.sound's own values survive
  under `raw` (settling PRD §19.3 in favor of normalized-by-default).
- **Onset detection runs on the raw band energy, not the auto-gained value.** Auto-gain
  exists to flatten dynamics, which is precisely the information onset detection
  needs; running detection downstream of it means a steady loop reads as permanently
  loud and nothing ever fires. A beat requires a floor, a frame-to-frame rise, and a
  large ratio against the recent average — the rise condition is what stops a
  sustained bass note from firing every frame.

---

## Projection

`projection.js` opens a popup, gives it a plain 2D canvas, and copies each frame
across with `drawImage`.

The obvious alternative — moving the p5 canvas into the popup — was rejected. It works
until the popup is closed, at which point the running sketch loses its drawing surface
mid-set, which is precisely the class of failure this whole system exists to prevent.
A copy costs well under a millisecond at 1280×720, only happens while the window is
open, and leaves the performer's stage intact so both views show the work.

P-01 is a prohibition as much as a feature: no editor errors, file paths, transport
controls, or private notes. Nothing in `projection.js` reads the diagnostics bus, so
there is no path from a stack trace to the projector even by accident. The code layout
is fed only from *successful* evaluations, so a failed edit is never projected.

The trace layout recovers each patch's audio mappings by scanning its stored source
for `audio.<feature>`. That is what makes it worth projecting — it names the link
between what the audience is hearing and what they are seeing, which is otherwise
invisible about this kind of performance.

## Where the course concepts actually live

| Concept | Where |
| --- | --- |
| First-class functions | `registry.js` — a patch *is* a function stored under a name |
| Higher-order functions | `liveApi.js` builds the API bound to a transaction and hands it to `new Function` |
| Closures | `createRegistry`, `createHostLoop`, etc. — every module is a closure over private state, with no `this` |
| Objects and interfaces | the `{ state, enter, draw, beat, exit }` lifecycle contract, shared by unlike visual systems |
| Arrays | `features.js` band history, `hostLoop.js` FPS ring, patch trails |
| Error handling | `hostLoop.drawPatch` — the boundary that keeps the last valid image alive |
| Composition | scenes: an ordered list of names, evaluated top to bottom |

---

## Trust boundary

Response compiles and runs student JavaScript with `new Function`. Say the rest of
this out loud in class, because the PRD does (§13.3):

- **Wrapping errors is not a sandbox.** A patch can freeze the tab with an infinite
  loop, and it can reach browser globals.
- Response runs **trusted, self-authored local code**. Do not paste in code from
  strangers.
- Live code is never sent to a server. There is no backend and no account.

Stronger isolation — a sandboxed frame, a worker, `OffscreenCanvas` — is listed in the
PRD as a P2 investigation and is deliberately *not* implemented, because a partial
sandbox that looks like a real one is worse than none.

---

## Performance notes

§13.5 budgets under 2 ms of host overhead per frame, and a 30-minute set without
unbounded memory growth. The things that keep that true:

- one context object, reused for every patch on every frame; `state` is swapped in
  immediately before the call
- `registry.paramValues(target)` writes into an existing object rather than building
  one
- FPS uses a preallocated `Float32Array` ring
- diagnostics are a bounded ring; a patch that throws every frame is throttled instead
  of appending a message per frame
- panels redraw on registry change; meters update at 15 Hz on a timer, not in `draw()`
- `pixelDensity(1)` — a retina backing store quadruples fill cost at 1280×720

---

## Not yet built (PRD P2)

Web MIDI mapping, crossfades and transition objects, stronger runtime isolation
(sandboxed frame / worker / `OffscreenCanvas`), WebGL and shader patch lifecycles,
collaborative rooms, student-defined language adapters, performance recording and
annotated replay, and export to a standalone conventional p5.js sketch.

P0 and P1 are implemented and tested.
