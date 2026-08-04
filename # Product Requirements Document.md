# Product Requirements Document

## p5.js Live Visual Playground

**Working name:** Response  
**Product type:** Browser-based p5.js creative-coding and performance system  
**Status:** Concept / test PRD  
**Primary context:** AET 350C, _Visuals in the Loop — Reactive Systems for Algorave_  
**Target release:** Course-ready MVP

---

## 1. Product Summary

Response is a p5.js environment for creating and performing audio-reactive
visuals while their code remains editable.

The system continuously runs a p5.js sketch, analyzes music through p5.sound,
and renders the active visual composition. A performer can edit, evaluate, and
replace named visual behaviors without restarting the canvas, interrupting the
audio analysis, or discarding the visual system's state. Valid edits become
active at the next animation frame. Invalid edits never replace the last
working version.

Response satisfies **Degree 3 liveness**:

> The performer can change or recombine the visual logic itself while the
> system is running.

It is not a system for generating or live coding music. Its input is music
from a file, microphone, line input, DJ, or other performer. Its medium is the
visual response.

---

## 2. Problem

Ordinary p5.js sketches are easy to begin but difficult to alter safely during
a performance.

In the usual global-mode structure, student code owns `setup()` and `draw()`.
Changing the sketch generally means saving and reloading the page. Reloading:

- interrupts the visual output;
- resets `frameCount`, arrays, particles, and other state;
- may interrupt or reinitialize the audio context;
- creates a blank screen while the page restarts;
- makes syntax and runtime errors visible as performance-ending failures;
- encourages students to finish a fixed sketch rather than design a playable
  system.

Existing editor environments can update p5.js code quickly, but speed alone
does not create a student-friendly performance instrument. Students need a
stable audio and rendering host, an understandable live-code contract, and an
explicit recovery model.

The existing **Live Patch Audio Instrument** demonstrates safe runtime
composition from a fixed shelf of functions. It does not yet meet Degree 3
because performers can only reorder behaviors the instructor has already
defined. Response must additionally let performers author and replace those
behaviors while the sketch runs.

---

## 3. Product Vision

Response should feel like a p5.js sketch that has learned how to stay alive
while it is being rewritten.

Students should recognize the drawing language they already know:
`background()`, `circle()`, `map()`, `noise()`, `push()`, `pop()`, arrays,
objects, and functions. The system adds only the structure necessary to make
those ideas safely replaceable at runtime.

The desired performance loop is:

1. Listen to the music.
2. Decide what should change visually.
3. Edit or select a small block of p5.js code.
4. Evaluate it without stopping the sketch.
5. See and hear the consequence immediately.
6. Keep, revise, combine, or undo the intervention.

---

## 4. Goals

### G1. Make p5.js visual logic live-replaceable

A performer can define or redefine a named visual behavior during execution.
The replacement takes effect without reloading the page or recreating the p5
canvas.

### G2. Preserve continuity

Audio analysis, playback position, global time, active scenes, and compatible
behavior state survive successful code changes.

### G3. Make failure recoverable

Syntax errors, registration errors, and first-frame runtime errors leave the
last valid behavior active. The performer receives useful diagnostics without
the audience output becoming an error screen.

### G4. Keep the system recognizably p5.js

Student-authored visuals use familiar p5.js drawing functions and JavaScript.
A custom language may later be built on top of the runtime, but is not required
to use the product.

### G5. Support musical performance rather than code demonstration

The stage remains visually prominent. Code evaluation is fast, controls are
usable in low light, and the audience can optionally see the active code or
patch state without being forced to read the entire development interface.

### G6. Make the architecture teachable

Students can understand the separation among the persistent host loop, audio
features, named visual behaviors, persistent state, scenes, and live
evaluation. The system itself should demonstrate advanced JavaScript concepts
from the course.

---

## 5. Non-Goals

The MVP will not:

- synthesize, sequence, or live code music;
- replace a full IDE or support arbitrary npm packages;
- provide a general-purpose secure sandbox for untrusted internet code;
- require students to start performances from a blank editor;
- judge liveness by typing speed or number of lines changed;
- provide a node-based visual programming interface;
- provide multi-user network collaboration;
- provide video recording, streaming, projection mapping, or a full VJ mixer;
- require shaders, WebGL, MIDI, or a student-designed parser;
- guarantee recovery from browser crashes, infinite loops, or code that
  intentionally modifies the host page.

Hydra, P5LIVE, and professional VJ tools remain useful adjacent systems. The
MVP's purpose is narrower: teachable live replacement of p5.js visual behavior
in response to external music.

---

## 6. Users

### Primary user: student visual performer

A student who has completed an introductory p5.js course and understands
variables, functions, arrays, loops, and basic objects. They are learning
higher-order functions, persistent systems, composition, and performance
design.

They need to:

- get from a normal sketch to a live-editable visual quickly;
- understand exactly which state will and will not survive an edit;
- practice meaningful interventions before performing publicly;
- recover from mistakes without losing the set;
- develop a personal visual vocabulary rather than use only presets.

### Secondary user: instructor

The instructor needs to:

- provide starter patches and examples;
- demonstrate live replacement in class;
- inspect a student's active code and patch history;
- diagnose audio, performance, and evaluation problems;
- distribute a pinned, offline-capable course build;
- assess whether a performance changed logic rather than only parameters.

### Tertiary user: audience member

The audience needs a coherent projected visual experience. When process is
shown, it should clarify the performer's agency rather than expose irrelevant
editor chrome or diagnostic noise.

---

## 7. Design Principles

### The host stays alive

Response—not student code—owns the p5.js `setup()` and `draw()` functions.
Student code supplies named behaviors that the host calls from its persistent
draw loop.

### Replace small units, not the entire sketch

The primary live-coded unit is a named **patch**. Re-evaluating a patch replaces
that one behavior. This makes the consequence of an edit easier to predict and
recover.

### The last good image-making system wins

New code is a candidate until it compiles, registers successfully, and survives
its first invocation. Failure restores the previous version.

### State has an identity

A patch's code may change while its state persists. State belongs to the patch
name, not to one compiled function body.

### Audio is shared infrastructure

p5.sound analysis is computed once per frame by the host. Patches consume a
shared read-only audio snapshot and do not create competing FFT analyzers.

### p5.js remains visible

The live API adds a small lifecycle around ordinary JavaScript and p5.js. It
does not hide drawing behind a large effects vocabulary.

### Performer and audience views are different

Diagnostics belong to the performer. The projected output should show the
canvas and, optionally, a deliberate code or patch overlay.

---

## 8. Core Concept: The Persistent p5.js Host

The page loads a pinned course version of p5.js and p5.sound. For the MVP, the
implementation baseline is **p5.js 1.11.3 + p5.sound 1.11.3**, matching the
existing course prototypes. The version is a course-build decision, not part of
the authoring API. The MVP uses p5.js **global mode** so students can write the
drawing functions they already know without prefixing every call with a p5
instance. The host reserves the global lifecycle functions while live blocks
register their own named callbacks.

The host owns:

- `setup()`;
- `draw()`;
- canvas creation and resize behavior;
- audio input and playback;
- one `p5.Amplitude` analyzer;
- one `p5.FFT` analyzer;
- onset / peak detection;
- the patch registry;
- the scene registry;
- patch state;
- evaluation history;
- error recovery;
- performer and projection views.

The host's conceptual draw loop is:

```js
function draw() {
  const audio = audioEngine.readFrame();
  const frame = runtime.beginFrame(audio);

  for (const patch of activeScene.patches) {
    runtime.drawPatch(patch, frame);
  }

  runtime.commitPendingChanges();
}
```

Student code does not redefine `setup()` or `draw()` during a performance.
Those functions may be taught and inspected, but they remain stable so that
the surrounding system can survive student edits.

---

## 9. Student Authoring API

### 9.1 Minimum patch form

Students define a named patch using ordinary p5.js functions:

```js
patch("rings", ({ audio }) => {
  const diameter = map(audio.bass, 0, 1, 40, width * 0.8);

  noFill();
  stroke(255);
  strokeWeight(3);
  circle(width / 2, height / 2, diameter);
});
```

Evaluating a new `patch("rings", ...)` block replaces the active `rings`
behavior on the next frame. No page reload occurs.

### 9.2 Stateful patch form

Patches may declare state that survives later code replacements:

```js
patch("orbiters", {
  state: () => ({ angle: 0, trails: [] }),

  draw({ audio, state, dt }) {
    state.angle += dt * map(audio.treble, 0, 1, 0.2, 2.4);

    const radius = map(audio.bass, 0, 1, 80, 280);
    const x = width / 2 + cos(state.angle) * radius;
    const y = height / 2 + sin(state.angle) * radius;

    circle(x, y, 12 + audio.mid * 40);
  },
});
```

Re-evaluating the `orbiters` block changes its `draw` logic but retains
`angle` and `trails`. The performer can explicitly reset state with:

```js
resetPatch("orbiters");
```

### 9.3 Patch lifecycle

A patch may define:

```js
patch("name", {
  state: () => ({}),
  enter(context) {},
  draw(context) {},
  beat(context) {},
  exit(context) {},
});
```

- `state` initializes JSON-compatible patch state once.
- `enter` runs when a scene activates the patch.
- `draw` runs once per rendered frame.
- `beat` runs once on the rising edge of a detected onset.
- `exit` runs when the patch leaves the active scene.

Only `draw` is required.

### 9.4 Draw context

Each handler receives:

| Property    | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `audio`     | Read-only audio snapshot for the current frame                 |
| `state`     | Persistent state owned by this patch name                      |
| `dt`        | Seconds since the previous rendered frame, capped after stalls |
| `time`      | Seconds since the host began running                           |
| `sceneTime` | Seconds since the current scene was entered                    |
| `params`    | Live parameter values declared by the patch                    |
| `controls`  | Read-only keyboard/MIDI state when available                   |

Global p5.js drawing functions remain available in patch code. The host wraps
each patch invocation in `push()` / `pop()` and restores required shared drawing
defaults to reduce accidental style leakage between patches.

### 9.5 Audio snapshot

The host exposes normalized summary features and familiar raw p5.sound data:

```js
audio = {
  level, // 0..1, smoothed amplitude
  bass, // 0..1, normalized band energy
  mid, // 0..1, normalized band energy
  treble, // 0..1, normalized band energy
  centroid, // 0..1, normalized spectral centroid
  beat, // true for one frame on detected onset
  sinceBeat, // seconds since the last detected onset
  waveform, // p5.FFT waveform values, approximately -1..1
  spectrum, // p5.FFT spectrum values, 0..255
  raw: {
    level: rawLevel,
    bass: rawBass,
    mid: rawMid,
    treble: rawTreble,
  },
};
```

The exact normalized values are derived from a host-level smoothing and
auto-gain stage. Raw values remain available for learning and deliberate custom
mapping.

### 9.6 Scenes and composition

Named patches are combined into named scenes:

```js
scene("tunnel", ["wash", "orbiters", "sparks"]);
go("tunnel");
```

Re-evaluating a scene definition changes its layer order without changing the
registered patch implementations or their state.

The MVP also supports:

```js
add("sparks");
remove("wash");
clearScene();
```

These operations satisfy Degree 3 when they recombine authored visual logic;
they are not a substitute for the ability to redefine the patches themselves.

### 9.7 Live parameters

A patch may declare a small number of performable values:

```js
param("trail", 0.08, { min: 0, max: 0.3, step: 0.01 });
```

Parameters appear in the performer view and can be changed by code, keyboard,
or controls. Parameter manipulation provides Degree 2 liveness; live patch
replacement provides Degree 3.

---

## 10. Primary User Experience

### 10.1 Workspace layout

The default performer workspace contains:

| Region              | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| **Stage**           | Large live p5.js canvas; never replaced by an editor error      |
| **Code editor**     | Multi-block JavaScript editor with syntax highlighting          |
| **Patch shelf**     | Named patches, active/inactive status, version, and error state |
| **Scene strip**     | Current scene, layer order, and saved scene cues                |
| **Audio monitor**   | Source, level, bass/mid/treble meters, onset indicator          |
| **Runtime monitor** | FPS, active patch, evaluation status, last error                |
| **History**         | Successful evaluations and one-click reversion                  |

The stage occupies at least 60% of the default viewport. The interface uses a
dark performance theme and remains usable at a 1280×720 laptop resolution.

### 10.2 First-run flow

1. Open the local course page.
2. Choose microphone/line input or drop an audio file.
3. Start the browser audio context through an explicit button.
4. See a working starter scene and live audio meters.
5. Place the cursor inside the `rings` block.
6. Change one p5.js expression.
7. Press **Command/Ctrl + Enter**.
8. See the behavior change without interruption.

The first successful live replacement should be possible without reading
documentation beyond the starter block and its inline comments.

### 10.3 Evaluation controls

- **Command/Ctrl + Enter:** evaluate the block containing the cursor.
- **Command/Ctrl + Shift + Enter:** evaluate the entire editor buffer as one
  registration transaction.
- **Escape:** return focus to the stage/performance shortcuts.
- **Command/Ctrl + Z:** ordinary text undo while the editor is focused.
- **Revert** button: restore the previous successful runtime version of the
  selected patch.

The editor determines blocks from top-level `patch(...)`, `scene(...)`, and
command expressions. If block detection is uncertain, it selects the smallest
complete JavaScript program containing the cursor and previews the evaluation
range before execution.

### 10.4 Successful evaluation

On success:

- the edited block briefly highlights;
- its patch receives a new visible version number;
- the candidate is committed at a frame boundary;
- a non-modal message reports `rings v7 active`;
- the source and timestamp enter history;
- editor focus remains where it was;
- audio, time, and compatible patch state continue.

### 10.5 Failed evaluation

On syntax or registration failure:

- the candidate is not committed;
- the last valid patch continues drawing;
- the relevant line and error message appear in the performer view;
- the projected view does not show the diagnostic;
- audio continues;
- the failed source remains in the editor for repair;
- the user can dismiss the message without changing the active patch.

On a patch's first-frame runtime failure:

- the host catches the error around that patch invocation;
- the candidate version is marked failed;
- the previous version is restored for the next frame;
- the patch's pre-candidate JSON-compatible state snapshot is restored;
- other patches remain active;
- the audience sees at most one incomplete frame, not an error screen.

### 10.6 Projection mode

The performer can open a dedicated projection window from a user-initiated
button. It supports three audience layouts:

1. **Canvas:** visual output only.
2. **Canvas + active code:** visual output with the most recently evaluated
   block in a deliberate, readable overlay.
3. **Canvas + system trace:** visual output with patch names, layer order, and
   audio-to-behavior mappings.

Editor errors, file paths, transport controls, and private notes never appear
in projection mode.

---

## 11. Functional Requirements

Priority definitions:

- **P0:** required for the system to satisfy Degree 3.
- **P1:** required for a course-ready public performance.
- **P2:** valuable extension after the first course pilot.

### Runtime and p5.js

| ID   | Priority | Requirement                                                                                                                   |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R-01 | P0       | The host shall create one persistent p5.js canvas and keep it alive across code evaluations.                                  |
| R-02 | P0       | The host shall own `setup()` and `draw()`; student live code shall register named handlers rather than replace the host loop. |
| R-03 | P0       | Valid patch replacements shall become active at the next frame boundary without a page reload.                                |
| R-04 | P0       | Patches shall be able to call standard global p5.js drawing, math, color, noise, and geometry functions.                      |
| R-05 | P0       | Each patch invocation shall be isolated with p5.js drawing-state protection where practical.                                  |
| R-06 | P1       | Canvas resize and fullscreen changes shall preserve patch registrations and state.                                            |

### Audio

| ID   | Priority | Requirement                                                                                                            |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| A-01 | P0       | The host shall accept a browser-readable audio file and analyze it with p5.sound.                                      |
| A-02 | P1       | The host shall accept microphone or selectable line input with clear permission and source status.                     |
| A-03 | P0       | FFT and amplitude analysis shall run once per frame regardless of the number of active patches.                        |
| A-04 | P0       | Code evaluation shall not restart playback, reset playback position, or recreate the audio analyzer.                   |
| A-05 | P0       | All patches in a frame shall receive the same read-only audio snapshot.                                                |
| A-06 | P1       | The host shall provide smoothing, auto-gain, silence behavior, and visible input meters.                               |
| A-07 | P1       | Audio input failure shall produce a performer diagnostic and a stable silence snapshot rather than stop the draw loop. |

### Live code and patches

| ID   | Priority | Requirement                                                                                                             |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| L-01 | P0       | A performer shall be able to define, evaluate, and replace a named p5.js visual patch while the sketch runs.            |
| L-02 | P0       | Evaluating one patch shall not re-evaluate or reset unrelated patches.                                                  |
| L-03 | P0       | Replacing a patch by the same name shall preserve compatible patch state.                                               |
| L-04 | P0       | A performer shall be able to explicitly reset one patch's state.                                                        |
| L-05 | P0       | A performer shall be able to define and activate a named scene composed of multiple patches.                            |
| L-06 | P0       | A performer shall be able to change scene membership and layer order while running.                                     |
| L-07 | P1       | A patch may implement `enter`, `draw`, `beat`, and `exit` lifecycle handlers.                                           |
| L-08 | P1       | The editor shall evaluate the block containing the cursor through one keyboard shortcut.                                |
| L-09 | P2       | The system shall support user-defined higher-order patch helpers and alternate notations built on the registration API. |

### Safety and recovery

| ID   | Priority | Requirement                                                                                                            |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| S-01 | P0       | A syntax error shall never replace a valid active patch.                                                               |
| S-02 | P0       | A registration error shall never replace a valid active patch.                                                         |
| S-03 | P0       | A first-frame runtime error shall automatically restore the previous valid patch version.                              |
| S-04 | P0       | One failing patch shall not stop unrelated active patches or the host draw loop.                                       |
| S-05 | P0       | The system shall retain at least ten successful versions per patch for one-click reversion.                            |
| S-06 | P1       | The system shall provide a performer-only panic action that returns to a designated safe scene.                        |
| S-07 | P1       | The system shall warn when average FPS remains below a configurable threshold for five seconds.                        |
| S-08 | P1       | The runtime shall cap `dt` after stalls so resumed state updates do not make extreme jumps.                            |
| S-09 | P2       | The runtime shall detect likely runaway patch execution in an isolated worker or frame boundary and offer termination. |

### Performance and presentation

| ID   | Priority | Requirement                                                                         |
| ---- | -------- | ----------------------------------------------------------------------------------- |
| P-01 | P1       | The system shall provide a dedicated projection view without performer diagnostics. |
| P-02 | P1       | Projection view shall optionally show the active evaluated code block.              |
| P-03 | P1       | Projection view shall optionally show a readable patch and mapping trace.           |
| P-04 | P1       | Performer shortcuts shall remain available when editor focus is released.           |
| P-05 | P1       | The performer shall be able to designate and recall a safe scene with one action.   |
| P-06 | P2       | The performer shall be able to map declared parameters and cues to Web MIDI.        |

### Saving and portability

| ID   | Priority | Requirement                                                                                                        |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| D-01 | P0       | The current editor source, patch registry, scenes, and declared parameters shall persist locally after refresh.    |
| D-02 | P1       | The user shall be able to export a human-readable project containing source, scene definitions, and configuration. |
| D-03 | P1       | The user shall be able to import an exported project only through an explicit trusted-code confirmation.           |
| D-04 | P1       | A course project shall run from a local server without a backend or account.                                       |
| D-05 | P1       | The pinned course build shall work without network access once its local libraries are installed.                  |
| D-06 | P2       | The user shall be able to export a conventional non-live p5.js performance build from the same project.            |

---

## 12. Degree 3 Acceptance Test

The MVP does not satisfy this PRD unless it passes the following live scenario:

1. A p5.js canvas is rendering a scene containing `wash` and `rings`.
2. Music is playing or entering through a live input.
3. `rings` has visible persistent state accumulated over at least ten seconds.
4. The performer edits the `rings` drawing logic and evaluates the block.
5. The changed logic becomes visible without a page reload, blank canvas,
   restarted track, reset audio analyzer, reset host time, or loss of compatible
   `rings` state.
6. The performer introduces a syntax error and evaluates again.
7. The previously working `rings` behavior remains active while the error is
   shown only in the performer view.
8. The performer introduces code that compiles but throws on its first frame.
9. The runtime automatically restores the previous `rings` version while
   `wash`, the music, and the rest of the scene continue.
10. The performer reorders the scene's patches and then reverts `rings` to an
    earlier successful version.

Passing only steps 1–3 demonstrates reactivity. Adding performance controls
demonstrates Degree 2. Passing all ten demonstrates Degree 3.

---

## 13. Technical Approach

### 13.1 Application structure

The MVP is a client-only web application containing:

- a stable p5.js/p5.sound host runtime;
- a code editor such as CodeMirror;
- a compiler/evaluator adapter;
- staging and active patch registries;
- JSON-compatible state storage keyed by patch name;
- an audio feature service;
- scene and parameter stores;
- local project persistence;
- a projection view synchronized with the performer view.

### 13.2 Evaluation transaction

Evaluation follows a staged transaction:

1. Parse/compile the selected JavaScript block.
2. Execute its registration calls against a staging registry.
3. Validate the staged patch or scene shape.
4. Snapshot compatible patch state.
5. Queue the staged definition for the next frame boundary.
6. Invoke the candidate inside an error boundary.
7. Commit on success; restore the previous definition and state on failure.
8. Add successful source and metadata to history.

The evaluator may use a generated function or equivalent browser mechanism to
run student-authored JavaScript. This is deliberate live-code execution, unlike
the constrained parser used in the earlier Live Patch lesson.

### 13.3 Trust boundary

The MVP runs **trusted, self-authored local code**. It must clearly warn users
before importing or pasting code from another person. It must never send live
code to a server for execution.

Wrapping errors is not a security sandbox. Code can still freeze the main
thread with an infinite loop or intentionally alter browser globals. Stronger
isolation through a sandboxed frame, worker, or `OffscreenCanvas` is a P2
investigation and must not be implied as an MVP guarantee.

### 13.4 State compatibility

Patch state is expected to be composed of numbers, strings, booleans, arrays,
plain objects, and other structured-clone-compatible values. p5-specific
objects such as `p5.Image`, media elements, and audio analyzers remain host
resources rather than persistent patch state.

If a new patch version expects a different state shape, the performer may:

- migrate it explicitly in the evaluated block;
- reset that patch;
- register the patch under a new name.

### 13.5 Performance budget

At the baseline 1280×720 canvas:

- successful evaluation-to-visible-change target: under 100 ms;
- editor interaction must not intentionally pause the draw loop;
- runtime overhead excluding student drawing: under 2 ms per frame on the
  supported classroom laptop baseline;
- audio analysis occurs once per frame;
- history and diagnostics perform no unbounded per-frame allocation;
- the default starter scene targets 60 FPS and remains usable at 30 FPS.

---

## 14. Product Scope

### P0: Degree 3 technical core

- persistent p5.js canvas and host loop;
- audio-file playback and p5.sound analysis;
- normalized shared audio snapshot;
- code editor with block evaluation;
- named patch registration and atomic replacement;
- persistent per-patch state;
- named scenes and live recomposition;
- syntax/registration rejection;
- first-frame runtime rollback;
- version history and manual revert;
- local project persistence;
- clear starter project and API examples.

### P1: Course-ready performance system

- microphone/line input;
- auto-gain and silence fallback;
- projection window and optional code/trace overlay;
- lifecycle hooks and beat events;
- safe scene and panic control;
- FPS monitoring and performance warnings;
- project import/export;
- offline course bundle;
- accessible keyboard operation and readable low-light interface.

### P2: Extensions

- Web MIDI mapping;
- crossfades and transition objects;
- stronger runtime isolation;
- WebGL and shader patch lifecycle;
- collaborative rooms;
- student-defined language adapters;
- performance recording and annotated replay;
- export to a standalone conventional p5.js sketch.

---

## 15. Success Metrics

### Usability

- At least 80% of pilot students can make their first successful live patch
  replacement within 15 minutes using only the starter file and inline help.
- At least 80% can explain why editing a patch does not replace `draw()` after
  one lab session.
- At least 75% can intentionally preserve, reset, and migrate patch state in a
  guided exercise.

### Reliability

- 100 consecutive syntax-error evaluations leave the last valid visual output
  active.
- A 30-minute input-and-render soak test completes without audio reinitialization
  or unbounded host memory growth.
- A failing patch does not stop other patches in automated integration tests.
- Patch history restores the corresponding source and behavior in all supported
  browsers used by the class.

### Performance practice

- Every pilot student can complete the Degree 3 acceptance test before the
  public show, whether or not they choose live-script mode for the final.
- In rehearsal, a performer can recover from a supplied syntax or runtime error
  within ten seconds without restarting the page.
- Audience testers can correctly identify at least one consequence of the
  performer's intervention when code or system trace is shown.

---

## 16. Validation Plan

### Technical spike

Prove the riskiest behavior before building the full interface:

1. Run a persistent p5.js `draw()` loop with p5.sound analysis.
2. Compile and replace one named drawing callback from a textarea.
3. Preserve that callback's state by name.
4. Reject a syntax error without replacing it.
5. Roll back after a first-frame runtime error.
6. Confirm that audio playback position and FFT analysis continue.

If this spike cannot pass the Degree 3 acceptance test, interface design should
not proceed.

### Classroom prototype test

Give students three starter patches and ask them to:

- alter one behavior;
- create a new named patch;
- combine two patches into a scene;
- preserve a trail array across a code replacement;
- recover from a seeded error;
- describe which part of the system stayed alive.

Observe misconceptions, evaluation latency, error recovery, and whether the
API feels like p5.js rather than an unrelated framework.

### Performance rehearsal test

Run the application for 30 minutes on the actual laptop, browser, audio input,
projector resolution, and room sound path. Test low input, silence, loud input,
window focus, fullscreen transitions, accidental double evaluation, bad code,
FPS degradation, safe-scene recall, and handoff to another performer.

---

## 17. Risks and Mitigations

| Risk                                                    | Consequence                                      | Mitigation                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Full JavaScript can freeze the main thread              | Performance stops despite error boundaries       | Teach bounded loops; provide FPS/runaway guidance; investigate isolated runtime after MVP     |
| The live API feels less direct than ordinary p5.js      | Students fight the framework                     | Keep one required function, use global p5 drawing calls, and show the host loop transparently |
| Persistent state becomes confusing                      | New code expects an incompatible shape           | State inspector, explicit reset, starter migration examples, JSON-compatible state rule       |
| p5 drawing state leaks across patches                   | Reordering patches changes them unpredictably    | Wrap calls in `push()`/`pop()` and restore documented defaults                                |
| Audio permissions or input routing fail                 | No meaningful reactivity                         | File-input fallback, visible meters, source diagnostics, silence behavior                     |
| Students over-focus on the editor                       | Performance becomes typing rather than listening | Keep stage dominant; require performance scores and listening-based critique                  |
| Projected code is unreadable or aesthetically intrusive | Audience loses the visual work                   | Offer intentional canvas/code/trace layouts rather than mirroring the full IDE                |
| Students mistake presets for Degree 3                   | Only parameters change                           | Require authored patch replacement in the acceptance test and show the active version history |
| Custom language work consumes the semester              | Visual and performance goals suffer              | Treat language adapters as P2; make ordinary p5.js the complete path                          |

---

## 18. Pedagogical Fit

Response makes the course's advanced JavaScript topics structurally necessary:

| Course concept         | Product role                                                |
| ---------------------- | ----------------------------------------------------------- |
| Arrays                 | waveform, spectrum, histories, particles, and state         |
| First-class functions  | named visual behaviors stored in a registry                 |
| Higher-order functions | patch factories, mappings, modifiers, and language adapters |
| Closures               | configurable behaviors and private persistent logic         |
| Objects and classes    | scenes, agents, parameters, and lifecycle state             |
| Composition            | multiple patches forming a live scene                       |
| Error handling         | keeping the last valid performance state alive              |
| Interfaces             | shared lifecycle contract across unlike visual systems      |

The product is therefore not only a final-performance utility. It is a working
model of why the course teaches these ideas.

---

## 19. Open Questions

1. Is first-frame rollback sufficient, or should candidate patches pass a
   hidden dry-run frame before appearing?
2. How much automatic drawing-state reset should occur beyond
   `push()` / `pop()` without making intentional feedback techniques difficult?
3. Should normalized audio features be the default, or should the API preserve
   p5.sound's familiar 0–255 band-energy scale at the top level?
4. Should the projection view default to canvas-only or to a small active-code
   overlay in keeping with “show us your screens”?
5. Is a separate projection window reliable enough across the supported
   classroom browsers, or should presentation mode occupy the primary window?
6. Should students modify the host runtime as part of the course, or treat it
   as instructor infrastructure until the final project?

These are prototype questions. None changes the core Degree 3 requirement:
named p5.js visual logic must be replaceable while the host, audio, state, and
audience output remain alive.

---

## 20. Release Criterion

Response is ready for a course pilot when:

- every P0 requirement is implemented and tested;
- the complete Degree 3 acceptance scenario passes in the supported classroom
  browser;
- a student unfamiliar with the system can replace a starter patch within 15
  minutes;
- the instructor can deliberately cause syntax and first-frame runtime errors
  without losing the last working visual scene or audio continuity;
- one 30-minute rehearsal succeeds on the actual performance rig;
- the starter project, live API, trust boundary, state model, and recovery
  behavior are documented in language appropriate for AET 350C students.
