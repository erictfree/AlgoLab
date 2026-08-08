# Writing AlgoLab programs

AlgoLab code is ordinary JavaScript. You write patches and place them in an array;
AlgoLab keeps p5's main `draw()` loop alive and invokes those patches in array order.
There is no registration wrapper and no string name to keep synchronized. The host
uses “strategy” as an internal architecture term; the student-facing object is a patch.

## The patch lifecycle

- **Available** means the patch exists in the library.
- **Installed** means its source has been added to this project.
- **Active** means a patch instance is in the current scene array.
- **Running** means that active instance evaluated and rendered successfully.

Installing a patch never activates it. “Add to scene” edits the visible scene array;
press `Cmd/Ctrl+Enter` in that scene cell to evaluate the edit and make the patch Active.
It becomes Running only after its first successful render.

## Three ways to write a patch

A plain function is the smallest form:

```js
const waveScope = ({ audio }) => {
  beginShape();
  audio.waveform.forEach((sample, index) => vertex(index, sample * 100));
  endShape();
};
```

An object literal adds properties, helper methods, and normal `this` behavior:

```js
const laserFan = {
  beams: 13,
  spread: 0.72,

  addBeams(amount) {
    this.beams += amount;
  },

  draw({ audio }) {
    for (let i = 0; i < this.beams; i++) {
      line(width / 2, height, i * this.spread * 50, audio.treble * height);
    }
  },
};

laserFan.addBeams(2);
```

A class instance adds constructors, private fields, and resource lifecycle:

```js
// %% patch neonTunnel
class NeonTunnel {
  constructor({ rings = 16, sides = 6 } = {}) {
    this.rings = rings;
    this.sides = sides;
  }

  draw({ audio, time }) {
    // this.rings and this.sides belong to this instance
  }
}

const neonTunnel = new NeonTunnel({ rings: 20, sides: 8 });
```

The exact object is retained—not copied or flattened—so prototypes, getters, private
fields, data, helper methods, and `this` all behave like normal JavaScript. AlgoLab
invokes an object as `strategy.draw(drawInputs)`, so `this` is the strategy object.
Avoid arrow functions for object methods when you need `this`.

## Draw inputs and normal parameters

`{ audio, time }` is one normal parameter using object destructuring. These are
equivalent:

```js
draw(inputs) {
  const audio = inputs.audio;
  const time = inputs.time;
}
```

```js
draw({ audio, time }) {
  // use audio and time directly
}
```

The useful distinction is who supplies a value:

- AlgoLab supplies changing live values to `draw()` and lifecycle methods.
- The strategy stores configuration and object state on `this`.
- Student code supplies arguments to ordinary methods such as `laserFan.addBeams(2)`.

The available draw inputs are:

| Field | Meaning |
| --- | --- |
| `audio` | Shared normalized audio analysis for the current draw |
| `canvas` | Live main p5 renderer, usable as a shader texture source |
| `state` | Persistent data for this scene copy |
| `dt` | Seconds since the previous draw, bounded after stalls |
| `time` | Seconds since the host started |
| `sceneTime` | Seconds since the active scene changed |
| `params` | Values declared with `param()` |
| `controls` | Read-only keyboard state |

A strategy requests only what it needs. It may ignore the argument entirely:

```js
const dot = {
  draw() {
    circle(100, 100, 20);
  },
};
```

Global p5 functions and values such as `fill`, `circle`, `noise`, `map`, `width`, and
`height` remain available. AlgoLab wraps each strategy in `push()`/`pop()` and resets
common drawing defaults so styles and transforms do not leak between strategies.

## Higher-order functions and configuration

A higher-order function can accept ordinary parameters and return a configured
strategy. The returned function remembers those values through its closure:

```js
function makeKaleido(segments, hue) {
  return {
    segments,
    hue,
    draw({ audio, time }) {
      // draw this.segments rotated shapes
    },
  };
}

const kaleido = makeKaleido(12, 285);
```

Objects and classes store the same configuration as properties or constructor values.
To make two differently configured object strategies, give each result its own binding:

```js
const pinkLasers = { ...laserFan, hue: 330, direction: -1 };
const cyanLasers = { ...laserFan, hue: 180, beams: 7 };
```

The same pattern works when what differs is how each object interprets the shared
draw inputs:

```js
class ReactiveHalo {
  constructor({ band, scale }) {
    this.band = band;
    this.scale = scale;
  }

  draw({ audio }) {
    circle(width / 2, height / 2, 40 + audio[this.band] * this.scale);
  }
}

const bassHalo = new ReactiveHalo({ band: "bass", scale: 300 });
const trebleHalo = new ReactiveHalo({ band: "treble", scale: 120 });
const duet = [bassHalo, trebleHalo];
go(duet);
```

AlgoLab supplies the same read-only-by-convention inputs to both. Each object owns
the parameters that select and transform those inputs; it should not rewrite the
shared `audio`, `time`, or other host values.

There is deliberately no separate scene-configuration descriptor. Closures, object
properties, constructors, and factories are already JavaScript's configuration tools.

## Shader chains

`ShaderChain` is a built-in class for transforming the image drawn by earlier patches.
It is not a second language or a registration API: the resulting instance is an
ordinary patch object with `draw()` and `dispose()` methods.

```js
const clubLens = new ShaderChain()
  .rotate(({ time }) => time * 0.08)
  .scale(({ audio }) => 1 + audio.bass * 0.18)
  .pixelate(32, 18)
  .hue(({ audio }) => audio.mid * 0.2)
  .contrast(1.15);

const scene = [solidBackground, laserFan, clubLens, plasma];
go(scene);
```

Every operator argument may be either a number or a function receiving the same live
context as `draw()`. The chain evaluates those functions every frame, then sends their
results to one generated fragment shader. Put a chain after the drawing patches it
should transform.

Transform operators:

| Method | Arguments |
| --- | --- |
| `rotate(angle, speed)` | radians and optional radians per second |
| `scale(amount, xMult, yMult, offsetX, offsetY)` | zoom, axis multipliers, and center |
| `pixelate(pixelX, pixelY)` | horizontal and vertical cell counts |
| `repeat(x, y, offsetX, offsetY)` | tiled copies and alternating offsets |
| `repeatX(reps, offset)` / `repeatY(reps, offset)` | one-axis tiling |
| `kaleid(sides)` | radial mirror count |
| `scroll(x, y, speedX, speedY)` | offset and speed on both axes |
| `scrollX(x, speed)` / `scrollY(y, speed)` | one-axis offset and speed |

Color operators:

`posterize`, `shift`, `invert`, `contrast`, `brightness`, `luma`, `thresh`, `color`,
`saturate`, `hue`, `colorama`, `sum`, and `rgba`.

These single-input operations compile into one GPU pass. Blend and modulation methods
are intentionally not present yet: they need a second named texture, which belongs to
the future multi-source routing model rather than being hidden inside this class.

## Scenes are arrays

```js
const scene = [checkerZoom, neonTunnel, laserFan, plasma];
go(scene);
```

Earlier entries draw underneath later entries. Re-evaluating the array changes the
composition without replacing its members or their persistent state. `go()` accepts
the array itself, not its name as a string.

The binding names—`laserFan`, `plasma`, and `scene`—are the stable identities used for
replacement, diagnostics, history, and the performer UI. Every strategy therefore
needs its own JavaScript binding; anonymous inline strategies in a scene are rejected.

The same strategy can appear more than once:

```js
const echoes = [laserFan, laserFan, laserFan, plasma];
go(echoes);
```

The copies share the current implementation but receive independent persistent state.
They appear as `laserFan`, `laserFan#2`, and `laserFan#3` in the scene UI.

## Live commands

Commands take first-class JavaScript values:

```js
reset(laserFan);     // reset every copy's persistent state
go(scene);           // activate this scene array
param("trail", 0.08, { min: 0, max: 0.3 });
```

Composition is ordinary source, not a command language. Add, remove, duplicate, or
reorder entries by editing and evaluating the array:

```js
const scene = [laserFan, laserFan, neonTunnel, plasma]; // two independent copies
const empty = [];                                        // an intentionally empty scene
go(scene);
```

An ordinary method call is also valid live code:

```js
laserFan.addBeams(2);
```

Strings are not accepted in place of strategy or scene values. The scene strip is a
read-only view of the active array, so the editor remains the single source of truth.

## Live-coding cells

`Cmd/Ctrl+Enter` evaluates the cell or statement under the cursor. A `// %%` marker
groups several related statements into one atomic cell:

```js
// %% strategy plasma
class Plasma {
  // ...
}

const plasma = new Plasma();
```

Editing the class and evaluating anywhere in that cell constructs a new instance from
the new class. The same pattern works for a factory and the strategy it returns.
Without a marker, each complete top-level statement remains its own block.
`Cmd/Ctrl+Shift+Enter` evaluates the whole buffer.

The editor preserves indentation on Enter, indents inside matching `{}`, `[]`, and
`()`, and outdents closing delimiters typed on a blank line. Tab and Shift+Tab adjust
the current selection. `Cmd/Ctrl+/` comments or uncomments the current line or all
selected lines. Folding is reversible in both presentations: the structured editor can
expand every object/function/class and still collapse any one again, while the complete
editor keeps a disclosure control beside every top-level declaration.
`Cmd/Ctrl+Alt+[` folds all and `Cmd/Ctrl+Alt+]` unfolds all; both work while the editor
has focus. `Cmd/Ctrl+Alt+/` opens that key-command sheet without leaving the editor.

## Lifecycle and persistent state

Only `draw()` is required. Object and class strategies may add lifecycle methods:

```js
const pixelRain = {
  state() {
    return { drops: [] };
  },

  enter({ state }) {},
  beat({ state, audio }) {},

  draw({ state, audio, dt }) {
    // update state.drops using dt and audio.treble
  },

  exit({ state }) {},

  dispose() {
    // Release resources owned by this implementation.
  },
};
```

`state()` runs once per scene copy. Re-evaluating the strategy retains that state;
`reset(pixelRain)` explicitly recreates it. Keep persistent state structured-clone
compatible—numbers, strings, booleans, arrays, and plain objects—so first-draw rollback
can restore it.

Lifecycle methods are invoked with the exact object as `this`. `dispose()` runs once
when an implementation is replaced, rolled back, or removed during a project reset.
It is intended for WEBGL buffers, shaders, cameras, and similar external resources.

## Shaders

A class strategy may own an offscreen `WEBGL` graphics buffer and composite it into
the 2D stage. It can use `canvas` as a `sampler2D` source, which makes a strategy placed
last in a scene a true post-processing pass. Create resources lazily in `draw()`, pass
`audio` and `time` through uniforms, and release resources in `dispose()`. The starter's
`Plasma` class is a complete example.

## Audio

`audio` is computed once and shared by every strategy during a draw:

```js
audio.level
audio.bass
audio.mid
audio.treble
audio.beat
audio.spectrum
audio.waveform
audio.raw
```

Normalized scalar features are generally `0..1`. `spectrum` contains FFT values and
`waveform` contains the current waveform. Choose an audio file, drop one on the stage,
or select the microphone. With no source, strategies keep drawing against silence.

## Live parameters

Parameters are optional performer controls shared through the draw inputs:

```js
param("checkerSpeed", 0.08, { min: -0.4, max: 0.4, step: 0.01 });

const checkerZoom = ({ time, params }) => {
  rotate(time * params.checkerSpeed);
};
```

Re-evaluating `param()` keeps the value currently selected by the performer rather than
overwriting it with the source default.

## Evaluation and recovery

- Syntax or evaluation errors do not alter the live scene.
- Replacements land at a draw boundary, never halfway through a scene.
- A replacement is provisional until every active copy survives its first draw.
- If a provisional version throws, AlgoLab restores the previous implementation,
  binding, version, and clone-compatible state snapshot.
- Successful versions appear in History and can be restored without a page reload.
- Calling an ordinary method such as `laserFan.addBeams(2)` executes normal JavaScript
  immediately; it does not create a replacement version.
- Re-evaluating an explicit named patch cell replaces that patch's declaration group.
  If the same named cell was accidentally installed twice, the newest copy is used
  instead of compiling two declarations such as `class Plasma` together.
- **Set safe** captures source, installed patch implementations and versions, the active
  scene, parameters, and clone-compatible runtime state. **Restore safe state** restores
  that checkpoint and reports anything that could not be restored. Failed evaluations
  never replace the safe snapshot.

AlgoLab executes trusted JavaScript with `new Function`; it is an error boundary, not
a security sandbox. An infinite loop can still freeze the tab.
