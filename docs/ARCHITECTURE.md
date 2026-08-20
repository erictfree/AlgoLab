# How AlgoLab works

AlgoLab inverts a normal p5 sketch: the host owns `setup()` and `draw()` permanently;
student code contributes ordinary strategy functions or objects that the host invokes. Editing a
strategy never recreates the canvas, clock, audio graph, or unrelated state.

## Module map

```text
src/main.js                 p5 setup/draw and application wiring
src/app/controller.js       snapshots and actions between model and DOM views
src/host/registry.js        exact strategy values, instances, scenes, history
src/host/stateStore.js      per-instance state snapshots and restoration
src/host/liveApi.js         object-based live commands and validation
src/host/evaluator.js       binding capture and atomic staging
src/host/hostLoop.js        lifecycle calls, frame boundaries, rollback
src/shaders/shaderChain.js  fluent single-input GPU operator compiler and patch
src/language/sourceBlocks.js DOM-free statement and // %% cell discovery
src/audio/                  one analyzer graph and pure feature processing
src/ui/                     editor, read-only model views, projection
src/persistence/            schema-versioned source and settings storage
starter/                    object-based starter and strategy library
community-patches/          one ordinary source file per student contribution
src/generated/              disposable community catalog built before dev/test
```

The host and audio feature modules contain no DOM or p5 dependencies, so the core
identity, rollback, state, and analysis behavior runs in the Node unit suite.

`scripts/build-patch-library.mjs` reads, but never executes, every local file in
`community-patches/`. It validates a small comment header, including the required
`@category`, and emits one static browser module containing metadata and source text. Git distributes the individual files;
AlgoLab has no runtime network or directory-listing dependency.

The Patch Library is one persistent catalog grouped by explicit metadata into Utilities,
Visual patches, Shaders, and User patches. Starter cells are derived directly from
`STARTER_SOURCE`, additional bundled entries are marked `system`, and generated
community entries carry their student author and declared category. Its four product states are deliberately
separate: **Available** is in the catalog, **Installed** has source in the project,
**Active** has an instance in the current scene, and **Running** survived evaluation and
rendered. Installing changes only the source and Installed status; it neither removes
the recipe from the catalog nor activates the patch.

## The frame

```js
window.draw = function draw() {
  const snapshot = audio.readFrame();
  const drawInputs = host.beginFrame(snapshot);

  for (const strategy of registry.activeStrategies()) {
    host.drawStrategy(strategy, drawInputs);
  }

  host.commitPendingChanges();
};
```

A scene is literally the user-configured strategy order. Each registry instance is a
stable object with `{ id, strategy }` plus non-enumerable lifecycle delegates. Those
delegates resolve the currently registered implementation on every call. Object/class
methods use `method.apply(implementation, args)`; a function strategy is invoked
directly. Consequently:

- the original function, object, or class instance is retained exactly;
- `this`, prototypes, getters, and private fields work normally;
- replacing an implementation does not replace the scene slot;
- several scene copies can share behavior while retaining separate state.

## Binding discovery

The evaluator scans complete top-level statements—or explicit `// %%` cells—compiles
them as JavaScript, and captures declared bindings. It classifies values by behavior:

- an object with `draw()` is a strategy, named by its binding when it has one;
- a function becomes a strategy when a scene uses it, and a bound function remains one
  on later replacements of that binding;
- an anonymous function or object directly in a scene receives a scene-slot identity
  such as `scene[1]`;
- an array entirely composed of strategy values is a scene, named by its binding;
- unused functions, classes, arrays, and other values remain ordinary reusable bindings;
- `go`, `reset`, and `param` are the only injected live commands.

Bindings are retained between block evaluations, which is why a later
`const stacked = [checkerZoom, waveScope]` uses the actual earlier values. `go(stacked)` uses
the scene array itself rather than repeating its name as a string. There is no
student-facing registration table and no duplicate string identity.

An explicit cell stores a class/factory and the strategy it constructs as one source
unit. Evaluating that cell updates all of its declarations together; this prevents a
new class declaration from leaving an existing instance attached to the old class.
Before compiling a full buffer, duplicate explicit cells with the same patch name are
collapsed transactionally: the newest source replaces the older cell at its original
position. This repairs accidental double installation without asking JavaScript to
declare the same `class` or `const` twice.

## Atomic replacement

Evaluation is a transaction:

| Phase | Action | Failure result |
| --- | --- | --- |
| Compile | Build a function from the selected source | Nothing changes |
| Execute | Capture declarations and live commands in staging | Nothing changes |
| Validate | Check methods, scene members, command targets | Nothing changes |
| Snapshot | Clone affected per-instance state | Warn if unclonable |
| Queue | Wait for the bottom of the current frame | No mid-frame swap |
| Candidate | Run every active copy once | Roll back on a throw |
| Confirm | Store the successful version in history | Candidate becomes live |

A replacement queued during draw N is installed at the end of N, first runs in N+1,
and is confirmed at the end of N+1. A shared implementation is confirmed only after
every active copy survives; independent state can take different code paths.

Rollback restores four aligned identities: the registry implementation, the associated
JavaScript binding or scene-array slot, the version/source record, and all
clone-compatible instance state. That restoration matters: after a failed `laserFan`
edit, a later scene edit containing `laserFan` must refer to the restored object, not
the failed candidate. A failed inline replacement similarly restores the value used by
its containing scene binding.
Scene configuration is part of the same transaction. If a newly selected scene fails
its first render, the previously running scene and its order remain live.

After a candidate succeeds, the host calls `dispose()` on the replaced implementation.
If a candidate fails, it disposes the failed object after restoring its predecessor;
reset and import dispose all current implementations before clearing the registry.
This gives class-based strategies a deterministic place to release WEBGL buffers and
other external resources without putting them in the cloneable state store.

## Identity and copies

A named strategy's binding is its stable identity. An anonymous strategy uses its
zero-based scene-array position, such as `scene[1]`; moving it intentionally creates a
new identity and fresh state. The first scene copy uses the base identity as its
instance id; later copies use `name#2`, `name#3`, and so on.

| Shared by copies | Per copy |
| --- | --- |
| implementation, version, source, history | id, state, lifecycle membership |

`stateStore` is a `Map<instanceId, object>`. A strategy's `state()` factory runs once
per instance. Re-evaluation deliberately does not re-run it; `reset(strategy)` is the
explicit request for fresh state.

Configuration belongs to the strategy value: closure variables for functions,
properties for objects, and constructor arguments for classes. Distinct configured
strategies can receive distinct bindings or occupy distinct anonymous scene slots, and
can be created with factories or object spread. The runtime has no second per-scene
configuration language.

Scene membership and order have one write path: evaluating a named array. The scene
strip renders the resulting instance ids but does not mutate them. Installing a library
patch inserts visible source and evaluates only that patch, leaving it Installed but
inactive. “Add to scene” edits the visible array and selects its cell; the student must
evaluate that cell before the new instance becomes Active, then it becomes Running only
after a successful render.

## Application and view boundary

The registry, state store, evaluator, host loop, audio engine, and diagnostics form the
runtime model. `src/app/controller.js` translates them into data-only snapshots and a
small set of named actions. The panels and projection receive that controller, never
the registry or evaluator. `main.js` is the composition root and adapts browser events,
p5 callbacks, editor source insertion, project import/export, and keyboard transport.

This is MVC-like rather than framework MVC: the host modules are the model, the app
controller is the controller boundary, and `src/ui` is the view. Most importantly for
the course, students can be given the view unchanged while working on mechanics in the
host and language modules.

The separate Project Patches drawer is a read-only object browser over that boundary.
It shows Installed patches while labelling Active and Running independently. The
controller describes public configuration, helper signatures, lifecycle signatures,
and the function/object/class shape as strings. It uses property descriptors, so
producing the view neither hands a live student object to the DOM nor invokes a
student's getter. Scene membership still changes only by evaluating the source array.
“Jump to source” is an editor navigation action, not a model mutation. The complete
library and settings remain in the general tools drawer; neither appears in the
reference drawer.

## Audio

`audioEngine` owns one `p5.Amplitude` and one `p5.FFT`; evaluation cannot recreate
them. Feature processing runs once per frame, and every strategy receives the same
snapshot. Normalized values use a decaying-peak auto-gain with headroom; the spectral
bands share one ceiling so their relative balance remains visible. Onset detection uses raw
band energy so gain normalization does not erase the dynamics needed to find beats.

There is deliberately no bundled song. Audio remains suspended until a user gesture,
and the host supplies a silent snapshot when no file or microphone is selected.

## Persistence

Project schema 6 stores source, the safe-scene preference, and live parameter values.
Compiled functions and derived scene membership are never stored. Reload evaluates the
source through the same validation path; its arrays recreate the scene order.

During a running session, the controller's safe snapshot is broader than project
persistence: it retains the editor source, exact installed implementations and version
history, evaluator bindings, active scene/order, parameters, and clone-compatible
instance state. The first successfully rendered starter/saved scene becomes the initial
safe snapshot; **Set safe** replaces it only on explicit success. A failed evaluation
cannot overwrite it. Restoration reports skipped uncloneable state instead of silently
claiming a complete recovery.

Older schemas are intentionally not read because their source and scene records use
the removed registration model.

## Trust and performance boundaries

`new Function` is not a sandbox. Exceptions are contained, but an infinite loop can
freeze the tab and evaluated code can access browser globals. AlgoLab is for trusted,
self-authored local code.

The draw path reuses one draw-input object, a fixed FPS ring, one analyzer snapshot, and
bounded diagnostics/history. Panels update on registry changes or a slow timer rather
than allocating DOM every frame. `pixelDensity(1)` prevents a high-DPI backing store
from silently quadrupling fill cost.
