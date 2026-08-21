# AlgoLab instructional manual

## From a first patch to a live audio-reactive performance

AlgoLab is a browser-based visual instrument for live coding with JavaScript and
p5.js. It keeps the canvas, audio analysis, clock, patch state, and last successful
performance alive while code changes.

AlgoLab was created by Eric Freeman at the
[Department of Arts and Entertainment Technologies](https://aet.utexas.edu/) at The
University of Texas at Austin.

This manual is written for AET 350C students who already recognize variables,
functions, arrays, loops, and basic p5.js drawing. It develops those foundations into
first-class functions, object-oriented design, higher-order functions, persistent
systems, audio-reactive composition, shaders, and live performance practice.

This edition describes the current AlgoLab product. Older exercises, screenshots, and
schedule drafts may show previous patch syntax or interface arrangements; when they
disagree with this manual, the running application and its in-app command sheet are the
authority.

The goal is not merely to finish a sketch. By the end, you should be able to design a
visual system that can be changed while it is performing.

---

## How to use this manual

Every phase follows the same studio rhythm:

1. **Make** a small working result.
2. **Understand** the JavaScript idea that makes it possible.
3. **Modify** the result through controlled experiments.
4. **Break it safely** and practice recovery.
5. **Demonstrate** the competency through code and performance.

Do not wait until the final project to practice performing. A thirty-second live
intervention at the end of each lesson is more valuable than one unrehearsed final set.

### Core, stretch, and performance-ready work

- **Core** exercises establish the required programming idea.
- **Stretch** exercises add complexity or another JavaScript form.
- **Performance-ready** exercises ask whether the result is legible, stable, and
  controllable in front of an audience.

### What AlgoLab owns and what you own

AlgoLab owns the instrument infrastructure:

- the p5 `setup()` and main `draw()` loop;
- canvas creation, resizing, fullscreen, and projection;
- audio loading, microphone permissions, FFT analysis, and normalization;
- the live context supplied to patches;
- patch registration, scene instances, state storage, and lifecycle calls;
- evaluation, version history, first-frame rollback, and diagnostics;
- local persistence, named Performances, safe state, and project files.

You own the visual and algorithmic decisions:

- patch functions, objects, factories, and class instances;
- properties, methods, constructors, closures, and state shapes;
- drawing algorithms and audio mappings;
- scene membership and order;
- live parameters and method calls;
- shared library patches;
- shader formulas and performance composition.

The practical rule is simple: if code expresses an artistic or algorithmic choice,
you should own it. If it only keeps the browser instrument reliable, AlgoLab should own
it.

---

## Course map

| Phase | Main idea | Studio artifact |
| --- | --- | --- |
| 0. Orientation | Instrument, safety, and lifecycle | First running scene |
| 1. Drawing | Coordinates, color, loops, and time | Silent geometric study |
| 2. Functions | Functions as first-class patches and live context | Two function patches |
| 3. Objects | Properties, methods, `this`, references, and copies | Configurable object patch |
| 4. Classes | Constructors, instances, and encapsulation | Two independent class instances |
| 5. Composition | Ordered scene arrays and visual roles | Three scene arrangements |
| 6. Persistent systems | State, lifecycle, `dt`, and bounded data | Stateful beat-driven patch |
| 7. Functional design | Factories, closures, mappings, and parameters | Patch family with live mappings |
| 8. Audio | Features, diagnostic views, and musical relationships | Audio-mapping study |
| 9. Live practice | Evaluation, history, recovery, and performance safety | Timed recovery circuit |
| 10. Sharing | Metadata, library lifecycle, and peer integration | Library-ready student patch |
| 11. Shaders | GPU post-processing and resource lifecycle | ShaderChain and Plasma studies |
| 12. Performance | Scenes, recall points, projection, and rehearsal | Three-to-five-minute live set |

The phases are a conceptual progression, not a semester calendar. Use the current
course syllabus for dates and assignment deadlines. Recovery practice should recur
throughout the sequence rather than being saved for the performance phase.

---

# Phase 0 — Orientation, safety, and the first successful frame

## What you will make

A small scene containing a background and one visual patch, running with either an
audio file, microphone input, or silence.

## Learning objectives

By the end of this phase, you can:

- start AlgoLab from its local server;
- identify the stage, code editor, fixed performance controls, Tools drawer, separate
  Project Patch Reference, and projection control;
- explain **Available → Installed → Active → Running**;
- evaluate one cell and confirm that its change reached the stage;
- make a syntax error without losing the last successful visual.

## Start the instrument

From the project directory:

```sh
npm run dev
```

Open `http://localhost:5173`. Do not open `index.html` directly from the filesystem;
browser modules require the local HTTP server.

Choose an `.mp3`, `.wav`, `.ogg`, `.m4a`, or `.aac` audio file, microphone input, or
silence. Silence is a valid input state: patches continue receiving an audio object
whose values are zero.

## Current product surfaces

- The **stage** is the canvas behind the code.
- The **code layer** is either a structured folded view or the complete editor. The
  Project panel's **code size** control changes both views, line numbers, and projected
  code together.
- The fixed controls in the upper-right remain in place while drawers open beneath
  them. They provide audio transport, file and microphone input, projection,
  fullscreen, Safe State recovery, folding, patch reference, Tools, and help.
- The **Tools drawer** (`\\`) contains Audio, Library, Messages, and Project tabs.
- The separate **Project Patch Reference** (`r`) documents installed objects,
  properties, methods, lifecycle methods, and status. It does not install or compose
  patches.
- The **audience projection** can show canvas, canvas + code, or canvas + trace.

Press `?` after releasing editor focus to see the current command sheet. While typing,
`Cmd/Ctrl+Option/Alt+/` opens the same sheet without first leaving the editor.

## Starting a handwritten patch

In the structured editor, every boundary before, between, and after folded cells has a
quiet insertion target in the far-left gutter, before the line numbers. Hover over a
boundary—or reach it with keyboard focus—to reveal **＋ New patch**. Click it, enter a
JavaScript identifier such as `orbitDots`, and press Enter. AlgoLab inserts an ordinary
source cell, opens it, and places the caret inside `draw()`:

```js
// %% patch orbitDots

const orbitDots = {
  draw({ time, audio }) {

  },
};
```

The control rejects invalid, reserved, and already-declared names. If insertion would
place the declaration after a scene cell, AlgoLab keeps scene cells last so the scene
cannot refer to the patch before JavaScript has created it. This is only scaffolding:
the complete editor remains the source of truth, and creating the cell does not
evaluate or activate it.

The exact live-coding sequence is:

1. Write the patch's behavior inside `draw()`.
2. With the caret in that patch cell, press `Cmd/Ctrl+Enter` to evaluate it.
3. Add the patch name to the scene array, either by typing it or using Library tooling.
4. With the caret in the scene cell, press `Cmd/Ctrl+Enter` to activate the new scene.

The patch is now project source, but a handwritten patch is not automatically added to
the reusable Patch Library catalog. Reusable-library lifecycle controls are deferred
product work rather than hidden behavior.

## The four patch statuses

- **Available**: the patch exists in the library.
- **Installed**: its source has been added to this project.
- **Active**: a patch instance appears in the current scene array.
- **Running**: that active instance evaluated and rendered successfully.

Installing a patch does not activate it. Adding it to a scene edits the visible source,
but that edit does not affect the performance until you evaluate the scene cell. The
Library label **Added — activate scene** describes this in-between source state; it is not a
fifth runtime status.

## First scene

Install `solidBackground` and `waveScope`, add both to the scene, and make the source
look like this:

```js
const scene = [
  solidBackground,
  waveScope,
];
activate(scene);
```

Place the cursor in the scene cell and press `Cmd/Ctrl+Enter`. `solidBackground` draws
first, and `waveScope` draws over it.

## Break it safely

Temporarily remove a closing bracket:

```js
const scene = [solidBackground, waveScope, plasma;
```

Evaluate the cell. Read the syntax message, then observe that the last successful scene
continues drawing. Repair the bracket and evaluate again.

## Competency check

Demonstrate the complete lifecycle for one patch:

1. Show it as Available.
2. Install it without activating it.
3. Add it to the scene source.
4. Evaluate the scene.
5. Point to evidence that it is Running.

### Common misconception

Editing source is not the same as changing the performance. A change becomes live only
after its evaluation succeeds.

---

# Phase 1 — Drawing before abstraction

## Lesson 1: Coordinates, color, and drawing order

### Learning objectives

- Position marks with canvas coordinates.
- Use `width` and `height` instead of assuming one screen size.
- Distinguish fill, stroke, alpha, and blend mode.
- Explain why later patches appear over earlier patches.

### Worked patch

```js
// %% patch horizon
const horizon = {
  draw() {
    noStroke();
    fill(12, 16, 34);
    rect(0, 0, width, height);

    fill(255, 70, 160, 150);
    circle(width * 0.5, height * 0.52, height * 0.42);

    stroke(90, 210, 255, 180);
    line(0, height * 0.72, width, height * 0.72);
  },
};
```

AlgoLab isolates common p5 drawing state between patches. You should still use
`push()` and `pop()` when one section of a patch needs a local transform:

```js
push();
translate(width / 2, height / 2);
rotate(0.4);
rect(-40, -10, 80, 20);
pop();
```

### Studio exercise

Create a patch with a background region, a focal mark, and one transparent layer.
Resize the browser and verify that the composition still works.

### Competency check

Explain which statement establishes the background, which creates the focal point, and
which dimensions respond to the browser size.

## Lesson 2: Variables, expressions, decisions, and loops

Replace repeated literals with names that communicate artistic intent:

```js
// %% patch radialStudy
const radialStudy = {
  count: 18,
  radius: 180,
  hue: 195,

  draw() {
    colorMode(HSB, 360, 100, 100, 1);
    noFill();
    stroke(this.hue, 70, 100, 0.65);

    push();
    translate(width / 2, height / 2);
    for (let index = 0; index < this.count; index++) {
      const angle = (TWO_PI * index) / this.count;
      const x = cos(angle) * this.radius;
      const y = sin(angle) * this.radius;
      circle(x, y, 22);
    }
    pop();
  },
};
```

### Controlled experiments

Change only one property at a time:

- `count`: visual density;
- `radius`: overall structure;
- `hue`: palette;
- circle size: detail weight.

Then add a conditional that emphasizes every third mark.

## Lesson 3: Time, sine, and frame-independent movement

Use `time` for absolute animation:

```js
const breathe = ({ time }) => {
  const size = 120 + sin(time * 2) * 45;
  circle(width / 2, height / 2, size);
};
```

Use `dt` when updating stored movement. `dt` is seconds since the previous draw, capped
after a stall:

```js
state.x += state.speed * dt;
```

This means `state.speed = 100` represents approximately 100 pixels per second, not 100
pixels per frame. A per-frame update moves at different speeds on 30 FPS and 60 FPS
machines.

### Studio exercise

Build a silent animation using `time`, `sin`, `cos`, or `noise`. It must remain visually
interesting before audio is added.

### Break it safely

Replace a bounded loop with an obviously excessive but still finite count, observe the
FPS warning, then restore the bounded version. Never enter an infinite loop: evaluated
JavaScript is trusted code, and `while (true)` can freeze the tab.

---

# Phase 2 — First-class functions and the live context

## Lesson 4: The smallest patch

A function is the smallest patch form:

```js
// %% patch pulse
const pulse = ({ time }) => {
  noFill();
  stroke(100, 220, 255);
  strokeWeight(3);
  const diameter = 100 + sin(time * 3) * 40;
  circle(width / 2, height / 2, diameter);
};

// %% scene firstScene
const firstScene = [pulse];
activate(firstScene);
```

`pulse` is a function value. `pulse()` calls that function immediately. A scene contains
the value `pulse`, because AlgoLab is responsible for calling it every draw.

Functions can be named declarations too:

```js
function strobe({ audio }) {
  if (!audio.beat) return;
  fill(255, 50);
  rect(0, 0, width, height);
}
```

### Code-reading check

Predict the difference between these arrays before trying them:

```js
const correct = [pulse];
const incorrect = [pulse()];
```

The first stores behavior. The second stores whatever the call returned.

## Lesson 5: Context and ordinary parameters

AlgoLab invokes each active patch with one context object. Destructuring selects the
fields a patch needs:

```js
const movingDot = ({ time, audio }) => {
  const x = width / 2 + sin(time) * width * 0.3;
  const diameter = 20 + audio.bass * 120;
  circle(x, height / 2, diameter);
};
```

These two method signatures are equivalent:

```js
draw(inputs) {
  const audio = inputs.audio;
}
```

```js
draw({ audio }) {
}
```

The live context fields are:

| Field | Meaning |
| --- | --- |
| `audio` | Shared audio analysis for this draw |
| `canvas` | The live main renderer, usable as a shader texture |
| `state` | Persistent data for this scene copy |
| `dt` | Seconds since the previous draw |
| `time` | Seconds since the AlgoLab host started |
| `sceneTime` | Seconds since the active scene changed |
| `params` | Current values declared with `param()` |
| `controls` | Read-only keyboard state |

The useful question is **who supplies the value?**

- AlgoLab supplies context to lifecycle methods.
- The patch stores configuration on properties or in a closure.
- You supply ordinary arguments to your own methods.

```js
const rings = {
  radius: 100,

  grow(amount) {
    this.radius += amount;
  },

  draw({ audio }) {
    circle(width / 2, height / 2, this.radius + audio.bass * 80);
  },
};

rings.grow(2);
```

AlgoLab supplies `{ audio }` to `draw()`. You supply `2` to `grow()`.

### Classification exercise

For a patch of your own, label every important value as one of:

- host context;
- patch configuration;
- persistent state;
- ordinary method argument;
- local temporary value.

### Competency check

Create two function patches, place both in one scene, and explain why the array contains
function values instead of function calls.

---

# Phase 3 — Object-literal patches

## Lesson 6: Configuration and behavior in one value

An object literal combines properties and methods:

```js
// %% patch rings
const rings = {
  count: 7,
  spacing: 30,
  hue: 190,

  grow(amount) {
    this.spacing += amount;
  },

  draw({ time }) {
    colorMode(HSB, 360, 100, 100, 1);
    noFill();
    strokeWeight(2);

    push();
    translate(width / 2, height / 2);
    for (let index = 0; index < this.count; index++) {
      const wobble = sin(time * 2 + index * 0.5) * 5;
      const diameter = this.spacing * (index + 1) + wobble;
      stroke((this.hue + index * 12) % 360, 70, 100, 0.7);
      circle(0, 0, diameter);
    }
    pop();
  },
};
```

`this` is the exact object retained by AlgoLab. Evaluating this ordinary statement is
a valid live intervention:

```js
rings.grow(2);
```

The call executes immediately. It does not create a new patch version because it does
not replace the patch declaration.

### Arrow-method warning

Use method syntax when the method needs `this`:

```js
draw({ time }) {
  circle(0, 0, this.spacing);
}
```

An arrow function does not receive normal method `this`:

```js
draw: ({ time }) => {
  // `this` is not the rings object here.
}
```

Arrow functions remain excellent patch functions and mapping functions. The issue is
specifically using an arrow where you expect object-method `this`.

## Lesson 7: References, spread, and configured variations

Two bindings can hold two differently configured objects:

```js
// %% patch smallRings
const smallRings = {
  ...rings,
  count: 4,
  spacing: 20,
  hue: 185,
};

const largeRings = {
  ...rings,
  count: 10,
  spacing: 46,
  hue: 315,
};
```

Now the properties can change independently:

```js
smallRings.grow(2);
largeRings.grow(-3);
```

Object spread is shallow. Primitive properties such as numbers are copied, but a
nested array or object would still be shared unless you copy it too.

Compare that with repeating one binding:

```js
const echoes = [rings, rings, rings];
activate(echoes);
```

All three entries use the same current implementation and configuration. AlgoLab gives
each occurrence a separate scene-copy identity—`rings`, `rings#2`, and `rings#3`—so a
stateful patch can receive independent persistent state per occurrence.

### Studio exercise

Create one configurable object patch with:

- at least three properties;
- a `draw()` method;
- one ordinary method with a student-supplied argument;
- two configured variations made with object spread.

### Break it safely

Convert a method that uses `this` into an arrow function, evaluate, and inspect the
error or visual change. Restore method syntax and explain why it works.

### Competency check

Predict which object changes in each line before evaluating it. Explain the difference
between changing a shared reference and changing one spread-created variation.

---

# Phase 4 — Classes and true instances

## Why classes now?

Object literals work well for one named configured thing. A class becomes useful when
you want several explicit instances with the same substantial behavior, constructor
rules, helper methods, or owned resources.

## Lesson 8: Class, constructor, and instance

```js
// %% patch slowOrbiters
class Orbiters {
  constructor({ count = 7, radius = 130, speed = 0.7, hue = 45 } = {}) {
    this.count = count;
    this.radius = radius;
    this.speed = speed;
    this.hue = hue;
  }

  reverse() {
    this.speed *= -1;
  }

  drawDot(angle, size) {
    circle(
      cos(angle) * this.radius,
      sin(angle) * this.radius,
      size,
    );
  }

  draw({ time, audio }) {
    colorMode(HSB, 360, 100, 100, 1);
    noStroke();

    push();
    translate(width / 2, height / 2);
    for (let index = 0; index < this.count; index++) {
      const offset = (TWO_PI * index) / this.count;
      const angle = offset + time * this.speed;
      fill((this.hue + index * 18) % 360, 70, 100, 0.8);
      this.drawDot(angle, 8 + audio.treble * 16);
    }
    pop();
  }
}

const slowOrbiters = new Orbiters({
  count: 5,
  radius: 110,
  speed: 0.35,
  hue: 190,
});

const fastOrbiters = new Orbiters({
  count: 11,
  radius: 190,
  speed: -0.8,
  hue: 325,
});
```

A class describes a reusable kind of object. `new Orbiters(...)` constructs one exact
instance. The two bindings above have independent properties and normal prototype
methods.

Keep the class and the instance declarations in one `// %% patch` cell. Evaluating the
cell updates the class and constructs fresh instances from that version together.

### Controlled experiments

- Call `slowOrbiters.reverse()`.
- Construct a third instance with different options.
- Add a helper method that changes `count` by an ordinary argument.
- Change the constructor default but leave one instance's explicit option intact.

## Choosing a patch form

| Form | Use it when |
| --- | --- |
| Function | The patch is small and mostly stateless |
| Object literal | You need one named configured object with methods |
| Factory | You want a lightweight family configured by closure |
| Class instance | You want explicit instances, constructors, substantial methods, or resources |

These forms are not a ranking. Competent design means selecting the simplest form that
communicates the patch clearly.

### Studio exercise

Convert an existing object patch into a class. Construct two visibly different
instances and demonstrate that calling a method on one does not change the other.

### Competency check

Explain the difference among the class `Orbiters`, the instance `slowOrbiters`, its
constructor options, and the context supplied later to `draw()`.

---

# Phase 5 — Scenes as ordered composition

## Lesson 9: The array is the score

A scene is an ordinary named array of patch values:

```js
// %% scene neonGarden
const neonGarden = [
  solidBackground,
  largeRings,
  slowOrbiters,
  fastOrbiters,
  waveScope,
  plasma,
];

activate(neonGarden);
```

`activate()` takes the array value, not its name as a string. This is incorrect:

```js
activate("neonGarden");
```

Array order is visual order:

1. Background or clearing patches usually go first.
2. Large structural generators usually come next.
3. Details and transparent overlays build above them.
4. Diagnostic displays go late when you want them visible.
5. Post-processors go after the image they should transform.

Re-evaluating a scene array changes membership and order without replacing unrelated
patch implementations. The source array remains the single authority; the scene shown
in the interface is a read-only view of what evaluated successfully.

## Composition experiments

Make three named scenes from the same patches:

```js
const calm = [solidBackground, slowOrbiters, plasma];

const detailed = [
  solidBackground,
  largeRings,
  slowOrbiters,
  fastOrbiters,
  waveScope,
  plasma,
];

const diagnostic = [solidBackground, slowOrbiters, plasma, audioMeters];
```

Activate one by evaluating a statement such as:

```js
activate(calm);
```

Moving `audioMeters` before `plasma` allows Plasma to transform the meters. Moving it
after Plasma keeps the diagnostic marks comparatively direct. Neither order is
universally correct; the choice should be intentional.

## Inline functions and objects

A scene may contain a first-class patch value directly. It does not need a separate
top-level binding:

```js
// %% scene inlineStudy
const inlineStudy = [
  solidBackground,

  ({ time, audio, state }) => {
    state.frames = (state.frames ?? 0) + 1;
    noStroke();
    fill(255, 70, 180, 120);
    circle(
      width / 2 + cos(time) * 120,
      height / 2,
      30 + audio.bass * 90,
    );
  },

  new ShaderChain()
    .rotate(({ time }) => time * 0.08)
    .scale(({ audio }) => 1 + audio.bass * 0.16),

  plasma,
];

activate(inlineStudy);
```

JavaScript constructs each inline value when the scene cell evaluates; AlgoLab calls
it later on every draw. Anonymous entries receive position-based identities such as
`inlineStudy[1]` and `inlineStudy[2]`. State survives an implementation change in the
same slot, but moving an anonymous entry to another array position gives it a new
identity. Use a named binding when the patch must survive scene reordering, appear by
name in other scenes, or expose methods you want to call live.

## Installing versus composing

The Patch Library helps source enter a project. It does not decide your composition.

1. **Install source** adds the patch cell.
2. **Add to scene** edits the visible scene array.
3. `Cmd/Ctrl+Enter` evaluates that scene.
4. A successful first render changes Active into Running.

If the editor caret is on a blank line inside the active scene array, **Add to scene**
uses that line as the insertion point. Otherwise AlgoLab preserves the existing source
and normally inserts an ordinary patch before the starter `plasma` post-processor.
You can always compose, comment, duplicate, remove, or reorder entries by hand; the
array remains the authority.

## Studio exercise

Create low-, medium-, and high-density scenes from one limited palette. Give every
patch a role: foundation, structure, detail, diagnostic, or post-process.

## Competency check

Reorder one scene live and explain the consequence of every position. The explanation
must discuss rendering, not merely list patch names.

---

# Phase 6 — Persistent state and lifecycle

## Configuration is not state

Configuration describes how a patch is designed to behave:

```js
this.amount = 20;
this.hue = 330;
```

Persistent state records what has happened to one scene copy while it runs:

```js
state.particles
state.position
state.age
```

AlgoLab preserves compatible state across a patch replacement. Call `reset(patch)`
when you intentionally want fresh state.

## Lesson 10: Lifecycle methods

Only `draw()` is required. Objects and class instances may also provide:

| Method | Role |
| --- | --- |
| `state()` | Create persistent data once per scene copy |
| `enter(context)` | Respond when the copy enters the active scene |
| `beat(context)` | Respond to an audio onset |
| `draw(context)` | Update and render each frame |
| `exit(context)` | Respond when the copy leaves the scene |
| `dispose()` | Release resources owned by an implementation |

## Worked stateful patch

```js
// %% patch beatBurst
class BeatBurst {
  constructor({ amount = 20, hue = 330, lifetime = 0.9 } = {}) {
    this.amount = amount;
    this.hue = hue;
    this.lifetime = lifetime;
  }

  state() {
    return { particles: [] };
  }

  beat({ state, audio }) {
    for (let index = 0; index < this.amount; index++) {
      const angle = random(TWO_PI);
      const speed = random(80, 240) * (0.7 + audio.bass);
      state.particles.push({
        x: width / 2,
        y: height / 2,
        vx: cos(angle) * speed,
        vy: sin(angle) * speed,
        life: this.lifetime,
      });
    }

    const maximum = 300;
    if (state.particles.length > maximum) {
      state.particles.splice(0, state.particles.length - maximum);
    }
  }

  draw({ state, dt }) {
    colorMode(HSB, 360, 100, 100, 1);
    blendMode(ADD);
    noStroke();

    for (let index = state.particles.length - 1; index >= 0; index--) {
      const particle = state.particles[index];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;

      if (particle.life <= 0) {
        state.particles.splice(index, 1);
        continue;
      }

      const alpha = particle.life / this.lifetime;
      fill((this.hue + index * 3) % 360, 70, 100, alpha);
      circle(particle.x, particle.y, 3 + alpha * 8);
    }
  }
}

const beatBurst = new BeatBurst();
```

## State rules

- Keep state clone-compatible: numbers, strings, booleans, arrays, and plain objects.
- Keep arrays and histories bounded.
- Use `dt` for rates.
- Do not store p5 graphics, shaders, cameras, DOM elements, or audio nodes in state.
- Keep owned external resources on the object and release them in `dispose()`.
- Expect each occurrence of a patch in a scene to receive independent state.

## State-preservation experiment

1. Let a stateful patch accumulate visible particles.
2. Change only its color calculation.
3. Evaluate the patch cell.
4. Confirm that compatible particle state continues.
5. Evaluate `reset(beatBurst)` and observe the intentional restart.

## Break it safely

Introduce a first-frame error into `draw()`. AlgoLab installs a replacement
provisionally. If an active copy throws on its first draw, it restores the previous
implementation, binding, version, scene configuration, and clone-compatible state.

## Competency check

Build a stateful patch that:

- responds to `audio.beat` through `beat()`;
- moves with `dt`;
- has a documented maximum population;
- survives a successful visual code change without unintended reset;
- resets when explicitly asked.

# Phase 7 — Factories, closures, and function-valued mappings

## Why this phase matters

Copying a patch and changing one number works for two variations. A factory is
better when you want a family of related patches. A closure lets a function remember
the values used to create it. A higher-order function takes or returns another
function, which makes behavior itself configurable.

These ideas are related, but they are not synonyms:

- A **factory** returns a new value, often an object.
- A **closure** is a function that retains access to its surrounding variables.
- A **higher-order function** takes a function, returns a function, or both.

## Lesson 11: A factory for related objects

```js
function makeDots({ count = 20, hue = 190, speed = 0.4 } = {}) {
  return {
    count,
    hue,
    speed,

    draw({ audio, time }) {
      colorMode(HSB, 360, 100, 100, 1);
      noStroke();

      for (let index = 0; index < this.count; index++) {
        const phase = (TWO_PI * index) / this.count;
        const radius = 70 + audio.mid * 180;
        const angle = phase + time * this.speed;
        fill((this.hue + index * 4) % 360, 75, 100, 0.65);
        circle(
          width / 2 + cos(angle) * radius,
          height / 2 + sin(angle) * radius,
          4 + audio.treble * 14,
        );
      }
    },
  };
}

const cyanDots = makeDots({ hue: 190, speed: 0.25 });
const pinkDots = makeDots({ count: 36, hue: 320, speed: -0.45 });

const scene = [solidBackground, cyanDots, pinkDots];
activate(scene);
```

Each call creates a distinct object with independent configuration. The returned
objects still use ordinary properties and `this`.

## Lesson 12: A closure returning a function patch

```js
function makePulse(scale, color) {
  return ({ audio }) => {
    noStroke();
    fill(...color);
    circle(width / 2, height / 2, 30 + audio.bass * scale);
  };
}

const smallPulse = makePulse(140, [80, 180, 255, 120]);
const largePulse = makePulse(360, [255, 60, 180, 35]);
```

The returned arrow function remembers `scale` and `color`. An arrow function is a
good choice here because it does not need a dynamic `this`.

## Lesson 13: Pass behavior as a value

```js
function makeMappedCircle(mapping, color) {
  return {
    draw(context) {
      const diameter = mapping(context);
      noStroke();
      fill(...color);
      circle(width / 2, height / 2, diameter);
    },
  };
}

const bassCircle = makeMappedCircle(
  ({ audio }) => 30 + audio.bass * 300,
  [255, 80, 160, 100],
);

const breathingCircle = makeMappedCircle(
  ({ time }) => 100 + sin(time * 1.7) * 50,
  [80, 220, 255, 75],
);
```

`makeMappedCircle` is higher-order because it receives `mapping`, a function. This
separates **what gets drawn** from **how a changing value is calculated**.

## Lesson 14: Live parameters

Declare a parameter once at top level, then read its current value from `params`:

```js
param("energy", 0.7, { min: 0, max: 2, step: 0.05 });

const glow = {
  draw({ audio, params }) {
    noStroke();
    fill(255, 80, 180, 70);
    circle(
      width / 2,
      height / 2,
      40 + audio.level * 180 * params.energy,
    );
  },
};
```

`param()` registers the control and returns the parameter's **name string**. It does
not return the current slider value. Use `params.energy` while drawing.

For now, use numeric parameters. Give each one a meaningful default, range, and step.

### Studio exercise

Build one visual idea in three forms:

1. a standalone function patch;
2. two variations produced by a factory;
3. a mapped patch that accepts an arrow function.

Explain which form is clearest for the idea and why.

### Competency check

You can distinguish a factory, closure, and higher-order function; create independent
configured objects; and expose a useful live parameter without confusing its name
with its current value.

# Phase 8 — Audio as data and musical structure

## Lesson 15: Read the audio snapshot

AlgoLab computes one shared audio analysis snapshot per frame. Every patch reads from
that snapshot; students should not create a new FFT or amplitude analyzer per patch.

| Field | Meaning | Typical use |
| --- | --- | --- |
| `audio.level` | normalized overall energy | total size or opacity |
| `audio.bass` | normalized low-frequency energy | scale, impact, displacement |
| `audio.mid` | normalized middle-frequency energy | density, shape, color balance |
| `audio.treble` | normalized high-frequency energy | detail, sparkle, edges |
| `audio.centroid` | normalized spectral brightness | hue or visual sharpness |
| `audio.beat` | one-frame onset flag | discrete events |
| `audio.sinceBeat` | seconds since detected onset | beat envelopes |
| `audio.waveform` | time-domain sample array | oscilloscope line |
| `audio.spectrum` | raw FFT magnitudes, usually `0..255` | frequency bars |
| `audio.raw` | unnormalized analysis values | diagnostics and advanced mappings |

Audio arrays can be empty when no usable source exists. A robust patch treats silence
as a normal condition.

## Diagnostic patches before artistic patches

Create these tools early and keep them available:

- a waveform line;
- frequency bars with no backing rectangle;
- four simple meters for level, bass, mid, and treble;
- a beat indicator that flashes only on onset;
- a background-color patch that makes compositing easy to see.

Diagnostics answer “what data is arriving?” before you debug an artistic mapping.

## Lesson 16: Map ranges deliberately

```js
const bassHalo = {
  minimum: 80,
  maximum: 420,
  smoothing: 0.15,

  state() {
    return { diameter: 80 };
  },

  draw({ audio, state }) {
    const target = map(audio.bass, 0, 1, this.minimum, this.maximum);
    state.diameter = lerp(state.diameter, target, this.smoothing);

    noFill();
    stroke(255, 80, 190, 150);
    strokeWeight(4);
    circle(width / 2, height / 2, state.diameter);
  },
};
```

The important design decisions are visible as properties: input, output range, and
smoothing. Avoid scattering unexplained multipliers throughout `draw()`.

## Musical mapping principles

- Use continuous features for continuous motion.
- Use `audio.beat` for discrete creation or switching.
- Let bass influence large-scale form and treble influence fine detail—but treat this
  as a useful starting convention, not a rule.
- Give mappings headroom. If everything reaches its maximum constantly, the scene has
  no dynamics.
- Combine audio with time so visuals continue to breathe during quiet passages.
- Use `audio.sinceBeat` to build a decaying response rather than a one-frame blink.

### Controlled experiments

For one patch, change only the input feature: `level`, `bass`, `mid`, `treble`, then
`centroid`. Keep the output range fixed and describe the musical difference.

### Competency check

Build a diagnostic patch and an artistic patch. The artistic patch must map at least
two different audio features to two visually distinct properties and remain valid in
silence.

# Phase 9 — Live coding, evaluation, and safe failure

## Lesson 17: Evaluate the smallest meaningful unit

- `Cmd/Ctrl+Enter` evaluates the current cell or complete statement.
- `Cmd/Ctrl+Shift+Enter` evaluates the whole buffer.
- A `// %%` marker groups related declarations into an atomic cell.

Keep a class or factory and the patch it constructs in the same patch cell:

```js
// %% patch tunnel
class Tunnel {
  draw({ time }) {
    // ...
  }
}

const tunnel = new Tunnel();
```

This lets AlgoLab replace the binding as one unit and avoids duplicate class
declarations during live edits.

## Editing behavior that matters live

- `Enter` preserves the current indentation, indents inside matching delimiters, and
  outdents a closing delimiter typed on an otherwise blank line.
- `Tab` and `Shift+Tab` indent or outdent the current line or selection.
- `Cmd/Ctrl+Option/Alt+T` tidies the current cell without evaluating it. It works in
  the complete editor and in an opened folded cell; plain `Cmd/Ctrl+T` remains the
  browser's new-tab command.
- `Cmd/Ctrl+/` adds or removes one reversible outer comment layer across the selection.
  If a selected line was already disabled, it may temporarily read `// // line`; a
  second use removes only the outer layer and restores the original comment.
- `Cmd/Ctrl+Option/Alt+[` folds all foldable regions and
  `Cmd/Ctrl+Option/Alt+]` unfolds them while keeping their individual disclosure
  controls available.
- The Project panel's **code size** setting controls the complete editor, folded cells,
  line numbers, and projected code together. The browser remembers the setting, and a
  named Performance captures it.

## What evaluation protects

Evaluation is transactional: source is compiled and validated in staging, then a
candidate replacement is tested at a frame boundary.

- A syntax, evaluation, or validation failure changes nothing.
- If an active candidate throws during its first `enter()`, `beat()`, or `draw()`,
  AlgoLab restores the preceding implementation and clone-compatible state.
- If successfully confirmed code fails later because runtime data changes, AlgoLab
  isolates the failed patch but does not automatically roll it back to an older version.
- Other patches and the host loop continue after an ordinary exception.
- An infinite loop cannot be caught and may freeze the browser.

The practical rule is: make bounded changes, evaluate often, and never write an
unbounded loop during a performance.

## A live-coding change ladder

Rehearse changes in this order:

1. Change a literal number.
2. Change a color or range.
3. Change a function-valued mapping.
4. Change scene order or membership.
5. Replace an algorithm.
6. Add a new state field with a compatible default.

Each rung introduces more ways for the result to surprise you.

## Recovery drill

AlgoLab automatically captures the first confirmed starter or restored scene as an
initial Safe State, so recovery exists from the beginning. **Set safe** or `s` replaces
that checkpoint only after the current scene and candidate versions are confirmed.

1. Capture a new Safe State while the scene is running.
2. Introduce a syntax error and evaluate.
3. Confirm the previous render continues.
4. Fix it and evaluate again.
5. Introduce a first-frame runtime error and confirm candidate rollback.
6. Restore the Safe State with `0` after releasing editor focus.
7. Confirm source, scene, parameters, and clone-compatible runtime state return.

### Competency check

Perform three visible edits without stopping the scene, recover from an intentional
failure, and explain what AlgoLab can and cannot protect against.

# Phase 10 — Sharing patches as a local library

## Lesson 18: From personal source to contribution

A shareable patch should be understandable without its author standing nearby. Before
packaging one, check that it:

- has a stable, descriptive binding name;
- contains no private file paths or network dependencies;
- draws correctly with silence as input;
- keeps state bounded;
- releases owned external resources in `dispose()`;
- exposes its best creative choices as properties, constructor options, factory
  arguments, mappings, or live parameters;
- includes a one-sentence description of its visual role.

## Community patch format

Place one contribution per `.js` file in `community-patches/`:

```js
// %% patch radialEcho
// @title Radial Echo
// @author Your Name
// @description Repeating rings that expand from each detected beat.
// @category user

const radialEcho = {
  // implementation
  draw({ audio }) {
    circle(width / 2, height / 2, 40 + audio.bass * 200);
  },
};
```

Valid categories are:

- `visual` — general built-in visual material;
- `utility` — diagnostics, backgrounds, and support tools;
- `shader` — post-processing and shader-based effects;
- `user` — student and community contributions.

The marker name and the JavaScript binding must match, must be unique, and must be a
valid JavaScript identifier.

Build the local catalog with:

```bash
npm run build:patches
```

The build validates metadata, categories, and duplicate names, then embeds source in
the application. It does not execute the contribution. Installation and evaluation in
AlgoLab perform the final runtime validation.

## Review protocol

Pair reviews should answer:

1. What does the patch contribute to a scene?
2. Which inputs are intentionally configurable?
3. Is drawing order documented when it matters?
4. Are collections bounded and motion based on `dt`?
5. Does the chosen function, object, factory, or class form make sense?
6. Can another student install it without it becoming active unexpectedly?

### Competency check

Package one patch, rebuild the library, install it in a clean project, add it to a
scene, evaluate that scene, and review a classmate's contribution.

# Phase 11 — Post-processing and shaders

## Lesson 19: Think in passes

Ordinary p5 patches draw shapes and images. A post-processing patch reads the canvas
produced by earlier patches and transforms those pixels. It therefore belongs after
the content it should affect.

```js
const clubLens = new ShaderChain()
  .rotate(({ time }) => time * 0.08)
  .scale(({ audio }) => 1 + audio.bass * 0.18)
  .pixelate(32, 18)
  .hue(({ audio }) => audio.mid * 0.2)
  .contrast(1.15);

const scene = [solidBackground, laserFan, clubLens];
activate(scene);
```

Every operator argument may be a number or a function that receives the normal live
context. The arrow functions above turn audio and time into live shader parameters.

## Available ShaderChain operators

| Family | Operators |
| --- | --- |
| Transform | `rotate`, `scale`, `pixelate`, `repeat`, `repeatX`, `repeatY`, `kaleid`, `scroll`, `scrollX`, `scrollY` |
| Color | `posterize`, `shift`, `invert`, `contrast`, `brightness`, `luma`, `thresh`, `color`, `saturate`, `hue`, `colorama`, `sum`, `rgba` |

`rotate(angle, speed)` uses radians and rotates around the image center; its optional
`speed` adds an automatic time-based turn. `scale(amount, xMult, yMult, offsetX,
offsetY)` scales around normalized center coordinates, which default to `0.5, 0.5`.
An amount above `1` zooms in. Like every operator argument, any of these values may be
a number or a context function.

Useful methods include `clone()`, `clear()`, the `operations` property, and
`dispose()`.

`ShaderChain` is a single-input pipeline over the current canvas. It does not provide
Hydra-style named texture routing, blend operators, or modulation operators. Methods
such as `blend`, `mask`, and `modulateScale` are not part of this API.

Coordinate operators are compiled in their declared coordinate order, then the scene
is sampled once, then color operators run in their declared color order. One
`ShaderChain` object is one GPU post-processing pass. Stacking two chain objects in a
scene creates two passes, with the later chain reading the output already produced by
the earlier one.

## Current modular shader patches

The Library includes small chains that are easier to inspect and recombine than one
large effect:

- `slowRotate` — one continuous center rotation;
- `bassZoom` — one bass-controlled center scale;
- `prismMirror` — kaleidoscope, rotation, scale, and color treatment;
- `pixelDrift` — pixelation, repeat, scroll, and posterization;
- `neonInk` — thresholded two-tone color treatment.

The transparent drawing patches `roseWindow`, `waveTerrain`, and `moireField` are
designed to feed these effects. For example:

```js
const scene = [
  solidBackground,
  waveTerrain,
  roseWindow,
  slowRotate,
  bassZoom,
];

activate(scene);
```

Because `slowRotate` and `bassZoom` are ordinary patch objects, they can be installed,
reordered, duplicated, or replaced exactly like a drawing patch.

## Parameterized ShaderChain factories

A factory can turn one shader design into several configured first-class patch
objects. Ordinary arguments establish the configuration; arrow functions inside the
chain retain those values through closures and still receive the current draw context:

```js
function makeShaderFlow({
  speed = 0.05,
  zoom = 1.02,
  bassZoom = 0.2,
  rotation = 0.08,
} = {}) {
  return new ShaderChain()
    .scrollX(({ time }) =>
      time * speed
    )
    .rotate(({ time, audio }) =>
      time * rotation + audio.mid * 0.08
    )
    .scale(({ audio }) =>
      zoom + audio.bass * bassZoom
    );
}
```

The factory may be called directly in a scene array:

```js
const scene = [
  solidBackground,
  waveTerrain,

  makeShaderFlow({
    speed: -0.03,
    zoom: 1.05,
    bassZoom: 0.35,
    rotation: 0.12,
  }),

  plasma,
];

activate(scene);
```

The factory call runs when the scene cell evaluates and returns one real
`ShaderChain`. Because this chain is anonymous, its scene position is its identity.
Construct it in a named patch cell instead when other scenes should share it or live
code needs to refer to it by name.

Use `param()` when a value should appear in the Live Parameters panel and be captured
by project or Performance persistence:

```js
param("flowSpeed", 0.05, {
  min: -0.3,
  max: 0.3,
  step: 0.01,
});

param("flowBassZoom", 0.25, {
  min: 0,
  max: 0.8,
  step: 0.01,
});

const shaderFlow = new ShaderChain()
  .scrollX(({ time, params }) =>
    time * params.flowSpeed
  )
  .scale(({ audio, params }) =>
    1.02 + audio.bass * params.flowBassZoom
  );
```

Use a factory for differently configured copies. Use `param()` for controls that
should remain adjustable during a performance and saved with the project. The two
approaches can be combined when both kinds of control are useful.

## Lesson 20: A custom shader as an advanced class

A custom WebGL patch such as `Plasma` is a class that owns graphics buffers, shader
programs, or textures. Those resources belong on the instance, not in persistent
`state`, and the class must release them in `dispose()`.

The conceptual lifecycle is:

```js
class CustomEffect {
  #buffer = null;
  #program = null;

  draw({ canvas, audio, time }) {
    // 1. Lazily create GPU resources.
    // 2. Capture the canvas produced by earlier patches.
    // 3. Set uniforms from audio, time, and resolution.
    // 4. Render the processed image back to the canvas.
  }

  dispose() {
    // Release owned graphics and shader resources.
  }
}

const customEffect = new CustomEffect();
```

Custom shader construction is a stretch goal. Students should first be fluent with
scene order and `ShaderChain`, because both use the same “content first, effect last”
mental model.

### Controlled experiments

1. Move a `ShaderChain` before its source content and describe the result.
2. Replace a literal operator argument with an audio mapping.
3. Clone a chain and change exactly one operation.
4. Compare a fluent chain with the custom `Plasma` class.

### Competency check

Build a scene with at least two drawing patches and one post-processing patch. Explain
the order, parameterize one operation with an arrow function, and identify when a
custom shader class is justified.

# Phase 12 — Performance design and final demonstration

## Lesson 21: Design an arc, not a pile

A strong set changes density, color, speed, and focus over time. Sketch three sections:

- **Arrival** — establish a visual identity with restraint.
- **Development** — add contrast, rhythmic response, and transformation.
- **Release** — simplify, invert the hierarchy, or reveal a final effect.

Use a small number of patches well. The scene array is the score, and its order should
be readable at the bottom of the source.

## Performance persistence tools

AlgoLab has four related but different forms of persistence.

### Automatic project persistence

The browser automatically stores complete source, the preferred safe-scene name, and
parameter definitions/values. Refresh reevaluates that source. It is convenient, but
it is not a version history or portable backup.

The saved source may include an edit that was never successfully evaluated. During
startup AlgoLab first tries the complete buffer atomically. If that fails, it recovers
independent valid cells and falls back to a visible Plasma scene when necessary while
leaving failed source available to repair.

### Project export and import

Portable project JSON contains source, safe-scene name, and parameter information. It
does not contain audio, playback position, runtime state, compiled definitions, named
Performance slots, or the complete view layout. Only import trusted source because it
executes as JavaScript.

### Safe State

A Safe State is an exact in-memory runtime checkpoint containing source, installed
implementations and histories, scenes, active order, parameters, evaluator bindings,
and clone-compatible instance state. It does not capture audio transport or view
layout. It does not persist as the same exact runtime checkpoint across refresh.

AlgoLab creates an initial Safe State after the startup scene is confirmed. Use
**Set safe** only after confirming a later active scene is healthy. A failed or still
provisional evaluation never overwrites it. Use **Restore safe state**, or `0` after
releasing editor focus, for emergency recovery.

### Named Performance

A named Performance is a browser-local recall slot for source, scene metadata,
parameters, audio-analysis settings, loop setting, folding/code visibility, projection
layout, FPS threshold, tools opacity, and code size. Recall reevaluates source and
protects the previous runtime if the candidate fails.

A Performance does not include runtime patch state, the audio file, playback position,
microphone selection, compiled history, the currently open projection window, or the
selected tools tab. Keep audio files beside exported projects and document which track
the set expects.

Choose **＋ New performance** in the Project panel, or press
`Cmd/Ctrl+Option/Alt+N`, to replace the working source, installed patches, history,
scenes, and state with the Plasma-only starter. AlgoLab asks for confirmation. Named
Performances remain saved, and the current music and canvas keep running during the
reset.

Fullscreen includes the code layer and fixed controls because AlgoLab fullscreens the
complete performer surface. Use `e` after releasing editor focus when you intentionally
want to hide or reveal the code. The separate projection window is controlled by the
audience layout selector; in that window, `Tab` cycles layouts and `Esc` closes it.

## Rehearsal protocol

1. Load the intended audio and confirm analysis with diagnostics.
2. Run every planned scene transition.
3. Rehearse each live edit rather than improvising every edit for the first time.
4. Check frame rate during the densest section.
5. Bound arrays and reduce counts before removing the artistic idea.
6. Capture a Safe State.
7. Save a named Performance.
8. Export the project and keep it with the audio file.
9. Practice one deliberate failure and recovery.
10. Restart the browser and prove the set can be reconstructed.

## Final project brief

Create a three-to-five-minute audio-reactive set that includes:

- at least three original patches;
- at least two different patch forms;
- one patch with persistent bounded state;
- one factory, closure, or higher-order mapping;
- at least one intentional live parameter;
- at least one post-processing pass;
- a scene whose order clearly affects the composition;
- three rehearsed live edits;
- a demonstrated recovery path;
- a packaged community patch with documentation.

## Suggested assessment rubric

| Dimension | Emerging | Competent | Exceptional |
| --- | --- | --- | --- |
| JavaScript and OOP | code works by imitation | forms and `this` are chosen correctly | abstractions make extensions easier |
| Audio mapping | mostly one-to-one and saturated | distinct, readable musical mappings | mappings create a convincing musical arc |
| State and lifecycle | unbounded or frame-dependent | bounded state, `dt`, and lifecycle are correct | state behavior remains robust through live edits |
| Composition | patches obscure one another | order, contrast, and density are intentional | scene behaves as a coherent visual instrument |
| Live coding | edits are risky or unrehearsed | several visible edits and a recovery succeed | edits reshape the performance fluently |
| Sharing | patch needs author assistance | metadata, API, and install path are complete | contribution is flexible and exemplary for peers |

## Final competency statement

A student is performance-ready when they can design a patch, choose an appropriate
JavaScript form, map audio and time, manage bounded state, compose an ordered scene,
modify it live, recover safely, save the work accurately, and share one reusable part
with another student.

---

# Appendix A — Command sheet

## While editing code

| Command | Action |
| --- | --- |
| `Cmd/Ctrl+Enter` | Evaluate current cell or complete statement |
| `Cmd/Ctrl+Shift+Enter` | Evaluate the entire buffer |
| `Cmd/Ctrl+/` | Add or remove one reversible comment layer on current/selected lines |
| `Cmd/Ctrl+Option/Alt+T` | Tidy indentation in the current cell without evaluating |
| `Cmd/Ctrl+Option/Alt+N` | Start a confirmed new Plasma performance |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Enter` | Insert a smart-indented line |
| `Tab` / `Shift+Tab` | Indent / outdent |
| `Cmd/Ctrl+Option/Alt+[` | Fold all foldable regions |
| `Cmd/Ctrl+Option/Alt+]` | Unfold all regions |
| `Cmd/Ctrl+Option/Alt+/` | Toggle command sheet |
| `Esc` | Release editor focus |

## After releasing editor focus

| Key | Action |
| --- | --- |
| `Space` | Play or pause file audio |
| `0` | Restore complete Safe State |
| `s` | Capture Safe State |
| `\\` | Toggle performer tools |
| `r` | Toggle installed-patch reference |
| `e` | Toggle code visibility |
| `f` | Toggle fullscreen |
| `p` | Open or close projection window |
| `l` | Toggle audio looping |
| `a` | Load an audio file |
| `m` | Switch to live input |
| `?` | Toggle command sheet |
| `Esc` | Close command sheet |

In the projection window, `Tab` cycles canvas, canvas + code, and canvas + trace;
`Esc` closes the window.

# Appendix B — Patch-form decision guide

| Need | Start with | Reason |
| --- | --- | --- |
| One stateless drawing behavior | named function | smallest first-class patch |
| Named configuration plus behavior | object literal | properties and methods remain visible together |
| Several independent configured instances | class or factory | construction expresses variation clearly |
| Lexically captured values | closure | returned function remembers creation arguments |
| Pluggable behavior | higher-order function | mapping itself becomes a value |
| Persistent per-scene-copy data | `state()` lifecycle | runtime state remains separate from configuration |
| GPU resources and cleanup | class with `dispose()` | ownership and cleanup stay explicit |

Prefer the simplest form that makes the next likely change easy. Refactoring between
forms is part of learning, not evidence that the first form was a mistake.

# Appendix C — Troubleshooting and misconceptions

## “Installed” means it is drawing

It does not. Installed means source exists in the project. Add the patch value to a
scene array, evaluate the scene cell, and confirm its status becomes Running.

## Adding from the Library immediately activates a patch

Installation only inserts source. **Add to scene** edits the scene source, and that
source still must be evaluated.

## A doubled `// //` means commenting is broken

It is intentional for a mixed selection. `Cmd/Ctrl+/` adds one reversible outer layer
to every selected line, including a line that was already commented. Invoke the command
again on the same selection to remove that outer layer and restore the earlier disabled
line.

## Deleting a patch cell immediately uninstalls its running object

Deleting text changes the project source, but it does not retroactively destroy an
implementation already registered in the current runtime. Remove the patch from the
scene and evaluate that scene to stop drawing it. A new performance, project reset, or
a later startup reconstructed from the saved source rebuilds the installed runtime.

## A class declaration is a patch

The instance is the patch:

```js
class Rings { /* ... */ }
const rings = new Rings();
```

## An object needs a special patch name property

The top-level binding is its identity. `const rings = { draw() {} }` is named `rings`.

## `this` is the live context

For an object or class patch, `this` is the patch object. The live context is the
argument to `draw()`, `enter()`, `beat()`, or `exit()`.

## Object arrow methods behave like ordinary methods

Arrow functions do not receive dynamic `this`. Use `draw({ audio }) { ... }` when a
method needs object properties.

## Two appearances of one binding have separate configuration

They have independent lifecycle `state`, but share the same implementation object and
its properties. Create distinct bindings for distinct configuration.

## Spread makes a deep copy

Object spread is shallow. Nested arrays and objects remain shared unless copied too.

## `param()` returns the current value

It returns the parameter name. Read the changing value from `params` inside lifecycle
methods.

## `state()` receives context

It does not. `state()` runs without arguments and returns the initial plain object.

## Removing a patch calls `dispose()`

Leaving a scene calls `exit()`. `dispose()` releases resources when an implementation
is replaced or discarded.

## Every error restores the previous version

Syntax and evaluation failures never land, and an active candidate is rolled back if
its first frame fails. A version that succeeds initially but fails later is isolated,
not automatically replaced by older code.

## Safe State is a permanent file

Safe State is an in-memory runtime checkpoint. Export the project for portability and
save a named Performance for browser-local recall.

## The browser can protect against any bad code

Exceptions can be isolated. An infinite loop blocks the page and cannot be caught by
an ordinary error boundary.

# Appendix D — Instructor implementation notes

## Teaching stance

Treat AlgoLab as an instrument students gradually learn to open. Begin with visual
cause and effect, introduce an abstraction only when it solves a visible limitation,
and return immediately to performance.

Use the same vocabulary in lecture, critique, and interface:

- **Available** — in the Library;
- **Installed** — source in the project;
- **Active** — occurrence in the current scene;
- **Running** — evaluated and rendered successfully;
- **Failed** — active but not rendering successfully.

## Suggested milestone submissions

1. **Visual grammar study** — function patches using coordinates, loops, and time.
2. **Configurable family** — object, spread variation, class instances, and factory.
3. **Audio instrument study** — diagnostics plus deliberate musical mappings.
4. **Persistent system** — bounded state, `dt`, beat response, and reset behavior.
5. **Community contribution** — packaged patch and peer integration review.
6. **Live set** — composed scenes, post-processing, live edits, and recovery.

## Short demonstration prompts

Ask students to demonstrate, not merely define:

- Show why scene order matters.
- Use one patch twice, then explain what is shared and what is independent.
- Call an ordinary method with an argument while `draw()` still receives context.
- Replace an active class implementation without losing compatible state.
- Make one mapping a function and swap that function live.
- Diagnose a flat-looking audio response before changing the artwork.
- Recover from both a syntax failure and a first-frame failure.
- Explain which persistence tool fits a refresh, a performance recall, an emergency,
  and transfer to another computer.

## Critique language

Move critique beyond “looks cool” by asking:

- Which musical feature controls this behavior, and why?
- What is the patch's compositional role?
- What changes when it moves earlier or later in the scene?
- Which values are safe and expressive to edit live?
- Where is state bounded?
- Does the abstraction make the artistic idea easier to vary?
- What is the recovery path if this edit fails on stage?

## Infrastructure boundary for assignments

Students normally should not edit the host draw loop, audio engine, evaluator,
registry, editor implementation, persistence store, or projection transport. Those are
course infrastructure. Advanced systems assignments may inspect them, but visual and
algorithmic assignments should remain in patch cells, scene arrays, community patch
files, and shader classes.

# Appendix E — Glossary

| Term | Meaning |
| --- | --- |
| patch | function or object/class instance that can draw in a scene; it may be named or inline |
| scene | named ordered array of patch values |
| binding | the JavaScript variable or function name that gives a patch identity |
| context | live per-frame inputs supplied by AlgoLab to lifecycle methods |
| configuration | properties or captured values shared by uses of an implementation |
| state | persistent plain data belonging to one scene occurrence |
| instance ID | runtime identity such as `rings`, `rings#2`, or `rings#3` |
| lifecycle | `state`, `enter`, `beat`, `draw`, `exit`, and resource `dispose` behavior |
| factory | function that constructs and returns a new value |
| closure | function retaining access to variables from where it was created |
| higher-order function | function that takes or returns another function |
| post-processing | transforming pixels produced by earlier patches |
| Safe State | exact in-memory recovery checkpoint |
| Performance | named browser-local recall slot for source and performance settings |
