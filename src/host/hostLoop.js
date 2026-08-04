// Host loop — the part that stays alive.
//
// PRD §8: Response, not student code, owns setup() and draw(). This module is the
// body of that draw(). Student code contributes named behaviors that this loop calls.
//
// It also owns steps 6 and 7 of the evaluation transaction (§13.2): a candidate patch
// is invoked inside an error boundary, and either survives its first frame (commit) or
// is replaced by its predecessor along with the state snapshot taken before it ran.
//
// Drawing is injected through `drawing` so this file can be unit-tested without p5.

import { patchOf } from './stateStore.js';

const MAX_DT = 1 / 10; // S-08: after a stall, resumed state must not leap.
const FPS_WINDOW = 60;
const ERROR_REPEAT_FRAMES = 120; // Throttle a patch that throws every frame (§13.5).
const SLOW_SECONDS = 5; // S-07: sustained, not a single bad frame.

export function createHostLoop({
  registry,
  stateStore,
  evaluator,
  diagnostics,
  drawing,
  controls = {},
  fpsThreshold = 30, // S-07 calls this configurable; the panel writes to it
  now = () => performance.now() / 1000,
}) {
  const performance_ = { fpsThreshold, slowSince: null, warned: false };
  const startTime = now();
  let lastFrameAt = startTime;
  let sceneEnteredAt = startTime;
  let lastSceneName = null;
  /** @type {string[]} */
  let lastOrder = [];

  const fpsSamples = new Float32Array(FPS_WINDOW);
  let fpsIndex = 0;
  let fpsFilled = 0;

  // One context object, reused every frame for every patch. §13.5 forbids unbounded
  // per-frame allocation, and a performance can run for half an hour. `state` is
  // swapped per patch immediately before the call.
  const context = {
    audio: null,
    state: null,
    dt: 0,
    time: 0,
    sceneTime: 0,
    params: {},
    config: {},
    controls,
  };

  /**
   * Instance ids that have run `enter` and not yet run `exit`.
   *
   * Lifecycle is per instance, not per patch: three ribbons each get their own enter
   * and exit. Kept here rather than on the registry record because it is a property of
   * being on stage, not of being registered.
   */
  const entered = new Set();
  const EMPTY_CONFIG = Object.freeze({});

  /** Start a frame: advance clocks, refresh params, handle scene transitions. */
  function beginFrame(audio) {
    const t = now();
    const dt = Math.min(t - lastFrameAt, MAX_DT);
    lastFrameAt = t;

    fpsSamples[fpsIndex] = dt > 0 ? 1 / dt : 0;
    fpsIndex = (fpsIndex + 1) % FPS_WINDOW;
    if (fpsFilled < FPS_WINDOW) fpsFilled += 1;

    const sceneName = registry.activeSceneName();
    if (sceneName !== lastSceneName) {
      lastSceneName = sceneName;
      sceneEnteredAt = t;
    }

    runExitsForDepartedPatches();
    checkFrameRate(t);

    context.audio = audio;
    context.dt = dt;
    context.time = t - startTime;
    context.sceneTime = t - sceneEnteredAt;
    registry.paramValues(context.params);
    return context;
  }

  /** `exit` runs when an instance leaves the active scene (§9.3). */
  function runExitsForDepartedPatches() {
    const order = registry.activeOrder();
    if (lastOrder.length) {
      for (const id of lastOrder) {
        if (order.includes(id)) continue;
        entered.delete(id);
        const record = registry.getPatch(patchOf(id));
        if (!record?.definition?.exit) continue;
        context.state = stateStore.ensure(id, record.definition.state);
        context.config = EMPTY_CONFIG; // the instance is gone; its config went with it
        guard(record, 'exit', () => record.definition.exit(context));
      }
    }
    lastOrder = [...order];
  }

  /**
   * Draw one patch inside its own error boundary.
   *
   * Two failure paths, and the difference matters (§10.5):
   *   - a candidate version throws  -> automatic rollback to the previous version
   *   - an already-committed version throws -> it is marked failed, but the loop and
   *     every other patch keep running (S-04)
   */
  function drawPatch(id, frame) {
    const instance = registry.getInstance(id);
    const patch = instance?.patch ?? patchOf(id);
    const record = registry.getPatch(patch);
    if (!record?.definition) return;

    const definition = record.definition;
    // State and config are per instance; the definition is shared by all of them.
    context.state = stateStore.ensure(id, definition.state);
    context.config = instance?.config ?? EMPTY_CONFIG;

    let threw = null;
    drawing.push();
    drawing.resetDefaults();
    try {
      if (!entered.has(id)) {
        entered.add(id);
        if (definition.enter) definition.enter(context);
      }
      if (frame.audio?.beat && definition.beat) definition.beat(context);
      definition.draw(context);
    } catch (error) {
      threw = error;
    } finally {
      drawing.pop();
    }

    if (threw === null) {
      if (record.candidate) {
        const version = record.version;
        registry.confirmPatch(patch);
        record.errorSignature = null;
        diagnostics?.success(`${patch} v${version} active`);
      }
      return;
    }

    if (record.candidate) {
      const result = registry.rollbackPatch(patch, threw);
      // Replacing a patch replaced the behavior of every instance of it, so the
      // rollback has to put every instance's state back, not just this one's.
      stateStore.restorePatch(patch, result.stateSnapshot);
      diagnostics?.error(
        `${patch} v${result.failedVersion} threw on its first frame — rolled back to v${result.restoredVersion}`,
        `${threw.name}: ${threw.message}`,
      );
    } else {
      reportRepeatingError(record, threw);
    }
  }

  /** A committed patch that throws every frame must not flood history or memory. */
  function reportRepeatingError(record, error) {
    const signature = `${error.name}: ${error.message}`;
    record.status = 'failed';
    record.lastError = { message: signature, version: record.version };
    if (record.errorSignature === signature && record.errorFrames++ < ERROR_REPEAT_FRAMES) return;
    record.errorSignature = signature;
    record.errorFrames = 0;
    diagnostics?.error(`${record.name} is throwing every frame`, signature);
  }

  /** Wrap a lifecycle handler that is not `draw` — never allowed to stop the loop. */
  function guard(record, hook, fn) {
    drawing.push();
    try {
      fn();
    } catch (error) {
      diagnostics?.error(`${record.name}.${hook}() threw`, `${error.name}: ${error.message}`);
    } finally {
      drawing.pop();
    }
  }

  /**
   * End of frame. Confirm candidates the scene could not test, then splice in any
   * queued transactions so they take effect at the next frame boundary (R-03).
   */
  function commitPendingChanges() {
    for (const record of registry.listPatches()) {
      // A patch with any instance on stage gets tested by that instance's first draw.
      if (!record.candidate || registry.activeInstancesOf(record.name).length > 0) continue;
      // Not in the running scene, so there was no frame to survive. Nothing on stage
      // is at risk; accept it and let it prove itself when the scene includes it.
      const version = record.version;
      registry.confirmPatch(record.name);
      diagnostics?.success(`${record.name} v${version} registered (not in the active scene)`);
    }
    evaluator.applyPending();
  }

  function fps() {
    if (fpsFilled === 0) return 0;
    let total = 0;
    for (let i = 0; i < fpsFilled; i++) total += fpsSamples[i];
    return total / fpsFilled;
  }

  /**
   * S-07: warn when average FPS stays below the threshold for five seconds.
   *
   * The five seconds matter. A single slow frame is a garbage collection or a window
   * resize; five seconds of them is a patch that is too expensive, and that is worth
   * interrupting a performer to say. Warn once per episode, not once per frame.
   */
  function checkFrameRate(t) {
    if (fpsFilled < FPS_WINDOW) return; // not enough history to judge
    const current = fps();

    if (current >= performance_.fpsThreshold) {
      if (performance_.warned) {
        diagnostics?.success(`Frame rate recovered — ${current.toFixed(0)} FPS`);
      }
      performance_.slowSince = null;
      performance_.warned = false;
      return;
    }

    if (performance_.slowSince === null) {
      performance_.slowSince = t;
      return;
    }
    if (!performance_.warned && t - performance_.slowSince >= SLOW_SECONDS) {
      performance_.warned = true;
      diagnostics?.warn(
        `Frame rate below ${performance_.fpsThreshold} FPS for ${SLOW_SECONDS}s`,
        `Currently ${current.toFixed(0)} FPS. Check for an unbounded array, a large ` +
          `loop, or too many active patches.`,
      );
    }
  }

  return {
    beginFrame,
    drawPatch,
    commitPendingChanges,
    fps,
    time: () => now() - startTime,
    fpsThreshold: () => performance_.fpsThreshold,
    setFpsThreshold(value) {
      performance_.fpsThreshold = value;
      performance_.slowSince = null;
      performance_.warned = false;
    },
  };
}
