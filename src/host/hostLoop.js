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

const MAX_DT = 1 / 10; // S-08: after a stall, resumed state must not leap.
const FPS_WINDOW = 60;
const ERROR_REPEAT_FRAMES = 120; // Throttle a patch that throws every frame (§13.5).

export function createHostLoop({
  registry,
  stateStore,
  evaluator,
  diagnostics,
  drawing,
  controls = {},
  now = () => performance.now() / 1000,
}) {
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
    controls,
  };

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

    context.audio = audio;
    context.dt = dt;
    context.time = t - startTime;
    context.sceneTime = t - sceneEnteredAt;
    registry.paramValues(context.params);
    return context;
  }

  /** `exit` runs when a patch leaves the active scene (§9.3). */
  function runExitsForDepartedPatches() {
    const order = registry.activeOrder();
    if (lastOrder.length) {
      for (const name of lastOrder) {
        if (order.includes(name)) continue;
        const record = registry.getPatch(name);
        if (!record?.definition?.exit || !record.entered) continue;
        record.entered = false;
        context.state = stateStore.ensure(name, record.definition.state);
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
  function drawPatch(name, frame) {
    const record = registry.getPatch(name);
    if (!record?.definition) return;

    const definition = record.definition;
    context.state = stateStore.ensure(name, definition.state);

    let threw = null;
    drawing.push();
    drawing.resetDefaults();
    try {
      if (!record.entered) {
        record.entered = true;
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
        registry.confirmPatch(name);
        record.errorSignature = null;
        diagnostics?.success(`${name} v${version} active`);
      }
      return;
    }

    if (record.candidate) {
      const result = registry.rollbackPatch(name, threw);
      stateStore.restore(name, result.stateSnapshot);
      record.entered = result.record.definition !== null;
      diagnostics?.error(
        `${name} v${result.failedVersion} threw on its first frame — rolled back to v${result.restoredVersion}`,
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
    const order = registry.activeOrder();
    for (const record of registry.listPatches()) {
      if (!record.candidate || order.includes(record.name)) continue;
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

  return {
    beginFrame,
    drawPatch,
    commitPendingChanges,
    fps,
    time: () => now() - startTime,
  };
}
