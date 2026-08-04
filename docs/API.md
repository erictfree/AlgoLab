# The Response authoring API

Everything you write is ordinary JavaScript and ordinary p5.js. This page documents
the small number of functions that get added on top, and — more importantly — the
rules about what survives when you re-evaluate your code.

You never write `setup()` or `draw()`. Response owns those, and keeps them running.
That is the whole trick: because the host owns the loop, your code can be replaced
underneath it without the canvas ever going away.

---

## Evaluating

| Key | What it does |
| --- | --- |
| `Cmd/Ctrl + Enter` | Evaluate the block your cursor is in |
| `Cmd/Ctrl + Shift + Enter` | Evaluate the whole editor as one transaction |
| `Esc` | Release editor focus |
| `Tab` | Insert two spaces |

With editor focus released:

| Key | What it does |
| --- | --- |
| `Space` | Play / pause the audio source |
| `0` | **Panic** — return to the safe scene |

A "block" is one top-level statement — usually one `patch(...)` call. If Response
can't tell where the block boundaries are, it evaluates the whole buffer instead.

Nothing happens instantly. A successful evaluation takes effect at the **next frame
boundary**, never in the middle of a rendered frame.

---

## `patch(name, drawFunction)`

The short form. One function, called once per frame.

```js
patch("rings", ({ audio }) => {
  const diameter = map(audio.bass, 0, 1, 40, width * 0.8);

  noFill();
  stroke(255);
  strokeWeight(3);
  circle(width / 2, height / 2, diameter);
});
```

Evaluating a new `patch("rings", ...)` replaces the `rings` behavior. It does not
reload the page, restart the music, or disturb any other patch.

## `patch(name, { state, enter, draw, beat, exit })`

The long form, for patches that remember something.

```js
patch("orbiters", {
  state: () => ({ angle: 0, trail: [] }),

  draw({ audio, state, dt }) {
    state.angle += dt * map(audio.treble, 0, 1, 0.2, 2.4);
    // ...
  },
});
```

| Key | When it runs |
| --- | --- |
| `state` | **Once**, the first time this name is ever registered |
| `enter` | When a scene activates the patch |
| `draw` | Once per rendered frame — the only required one |
| `beat` | Once on the rising edge of a detected onset |
| `exit` | When the patch leaves the active scene |

### The state rule

`state()` runs **once per copy**, not once per evaluation. Re-evaluating a patch gives
it new code and hands it back the *same state object*. That is how a trail array
survives an edit. (If a patch is in the scene once — the usual case — "once per copy"
and "once per name" are the same thing. See Scenes for more than one copy.)

If you want it gone, say so:

```js
resetPatch("orbiters");
```

State should be numbers, strings, booleans, arrays, and plain objects. Response
snapshots your state before running new code so it can put it back if that code
throws — and it can only snapshot things that are JSON-shaped. If you store a
`p5.Image` or a function in state, you'll get a warning in the Messages panel saying
that this patch's state can no longer be rolled back.

---

## The draw context

Every handler receives one object:

| Property | Meaning |
| --- | --- |
| `audio` | Read-only audio for this frame (below) |
| `state` | Persistent state owned by this patch name |
| `dt` | Seconds since the previous frame, capped after a stall |
| `time` | Seconds since Response started |
| `sceneTime` | Seconds since the current scene was entered |
| `params` | Current values of anything declared with `param()` |
| `config` | This copy's settings, from `add("x", {...})` — see Scenes |
| `controls` | `{ keys, shift, alt }` — keyboard state |

Use `dt` for motion rather than a fixed step. It keeps your patch moving at the same
speed on a 30 FPS laptop and a 60 FPS one, and it is capped so a stall doesn't
teleport everything across the screen.

---

## The audio snapshot

```js
audio = {
  level,      // 0..1, smoothed amplitude
  bass,       // 0..1
  mid,        // 0..1
  treble,     // 0..1
  centroid,   // 0..1, brightness, on a log scale
  beat,       // true for exactly one frame on an onset
  sinceBeat,  // seconds since the last onset
  waveform,   // p5.FFT waveform values, about -1..1
  spectrum,   // p5.FFT spectrum values, 0..255
  raw: { level, bass, mid, treble, centroid },  // p5.sound's own scales
}
```

The top-level band values are **smoothed and auto-gained** into 0..1, so
`map(audio.bass, 0, 1, ...)` behaves the same on a quiet track and a loud one. If you
want the unprocessed p5.sound numbers — the 0–255 band energies and the centroid in
Hz — they are under `audio.raw`.

Both are adjustable live from the Audio panel. Turn **auto-gain** off if you want a
patch to respond to absolute loudness rather than relative dynamics, and raise
**smoothing** if a mapping feels twitchy. Neither affects `beat`, which is measured on
the raw signal so that it keeps working however you set them.

The source can be an audio file or **live input** — microphone, or a line input
selected from the device list. The first time you choose live input, the browser asks
permission; if you decline, the sketch keeps running on silence and says so in the
Messages panel rather than stopping.

Every patch in a frame gets the same frozen snapshot. Analysis runs once per frame no
matter how many patches are drawing, and you should never construct your own
`p5.FFT`.

---

## Scenes

A scene is an ordered list of patch names. Order is layer order — the first is drawn
underneath.

```js
scene("tunnel", ["wash", "rings", "orbiters"]);
go("tunnel");
```

Re-evaluating a `scene(...)` changes the composition without touching the patches
themselves or their state. While running:

```js
add("sparks");     // add a copy to the active scene
remove("wash");    // take one out (its state is kept)
removeAll("wash"); // take every copy out
clearScene();      // empty the active scene
```

### More than one copy

A scene can hold the same patch several times. Each copy is an **instance** with its
own state and its own settings:

```js
add("ribbon", { y: 0.3, hue: 190 });
add("ribbon", { y: 0.7, hue: 40, mirror: true });
```

The first copy of a patch is called by its plain name; extras get a number:

```
ribbon    ribbon#2    ribbon#3
```

So `stateStore` for a single `orbiters` is exactly what it always was — the numbering
only appears once you ask for a second copy.

The same works directly in a scene:

```js
scene("stacked", [
  "wash",
  { patch: "grid",   config: { cols: 14, hue: 220 } },
  { patch: "grid",   config: { cols: 7,  hue: 320, rotate: 0.05 } },
  "pulse",
]);
```

| You write | What happens |
| --- | --- |
| `add("ribbon")` | Adds another copy, always |
| `remove("ribbon")` | Removes the **last** copy — undoes one `add` |
| `remove("ribbon#2")` | Removes that specific copy |
| `removeAll("ribbon")` | Removes every copy |
| `resetPatch("ribbon")` | Resets **all** copies' state — one name, one meaning |

Editing `patch("ribbon", ...)` changes every copy at once, because they all share one
definition. Only their state and config are separate. If a new version throws on its
first frame, all copies roll back together.

You can do all of this from the panels too: **add** in the Patch shelf makes another
copy, and each chip in the Scene strip has its own **×**.

### Config

`config` is whatever object you passed to `add()` or put in the scene entry, handed to
your patch on every call:

```js
patch("ribbon", ({ audio, config }) => {
  const y = height * (config.y ?? 0.5);   // always provide a default
  // ...
});
```

Config is per copy. `param()` is workspace-wide and gets a slider. Use config for
what makes two copies *different*, and params for what you want to perform.

### The library

The **Library** panel has five ready patches — `bars`, `ribbon`, `swarm`, `pulse`,
`grid` — all written to be stacked. **insert** drops one into your editor and
registers it; it is then an ordinary patch you can rewrite. The **stacked** button
builds a scene from several copies of them, as a worked example.

A patch you register for the first time joins the running scene automatically, so a
new `patch("mine", ...)` is visible immediately. Two things that convenience will not
do: re-evaluating an existing patch never changes scene membership (if you removed it,
it stays removed), and a block that composes the patch itself wins outright —

```js
patch("chaos", () => { /* ... */ });
scene("wild", ["chaos"]);
go("wild");
```

puts `chaos` in `wild` and nowhere else.

### The safe scene

Pick a scene you trust, press **set safe**, and `0` will bring you back to it from
anywhere. Panic changes the active scene and does *nothing else* — no state reset, no
re-evaluation, no effect on the audio. That is the point: mid-show, you need one key
with an outcome you already know the look of.

---

## Parameters

```js
param("trail", 0.08, { min: 0, max: 0.3, step: 0.01 });
```

Declared parameters appear as sliders in the Parameters panel and arrive in your patch
as `params.trail`. Re-evaluating a `param()` call keeps whatever value you have tuned
it to, rather than snapping it back to the default.

---

## What happens when your code is wrong

This is designed behavior, not an accident. There are three cases:

**Syntax error.** The block never compiles, so nothing is staged. Your last working
version keeps drawing. The error appears in the Messages panel.

**Registration error** — a patch with no `draw`, a scene naming a patch that doesn't
exist, a block that throws while registering. Nothing is applied, including the parts
of the block that came before the error. Your last working version keeps drawing.

**Runtime error on the first frame.** The new code compiled and registered, then threw
when it ran. Response restores the previous version *and* the state snapshot it took
before the new code ran, so any damage the failed version did to your state is undone.
The rest of the scene never stops.

A patch that keeps throwing after it has been committed is marked failed in the Patch
shelf and keeps being skipped, but it never stops the other patches or the draw loop.

Everything successful is kept: the Patch shelf shows a version number, and the History
panel will put any of the last twelve versions back with one click.

---

## Drawing isolation

Each patch call is wrapped in `push()` / `pop()`, and a documented set of defaults is
restored before it runs:

```
colorMode(RGB, 255)   blendMode(BLEND)     rectMode(CORNER)   ellipseMode(CENTER)
angleMode(RADIANS)    fill(255)            stroke(255)        strokeWeight(1)
strokeCap(ROUND)      strokeJoin(MITER)    textAlign(LEFT, BASELINE)   textSize(12)
```

So reordering a scene doesn't silently change how a patch looks. If you want a patch
to layer over what came before with a different blend mode, set it inside your own
patch — it will be reset for the next one.

---

---

## Showing it to an audience

**Projection** opens a second window for the projector. Three layouts, switchable from
either window (`Tab` cycles them from inside the projection window):

| Layout | What the audience sees |
| --- | --- |
| `canvas` | The visual output, and nothing else |
| `canvas + code` | Plus the most recently *accepted* block — a failed edit is never projected |
| `canvas + trace` | Plus patch names, layer order, and which audio feature each patch reads |

Your editor, your meters, your error messages, and your file names never appear there.
The trace layout is the one worth trying if the audience can't tell what you're doing:
it names the link between what they're hearing and what they're seeing.

**Fullscreen** blows up the stage in this window instead. Resizing either way keeps
every patch, every version, and all their state.

---

## Sharing a project

**Export** writes a `.json` file containing your source (as lines, so it stays
readable), your scenes, your safe scene, and your parameter values.

**Import** asks you to confirm first, and shows you the code it is about to run. Take
that seriously — see below.

---

## What this is not

Response runs your JavaScript with `new Function`. That is a deliberate live-coding
decision, and it is **not a security sandbox**. Error boundaries catch exceptions;
they cannot catch an infinite loop, and a `while (true)` in your patch will freeze the
tab. Bound your loops and bound your arrays.

This is why import asks you to confirm, and why the confirmation shows you the source.
Imported code runs with exactly the privileges your own code has. Only import projects
from someone you trust.
