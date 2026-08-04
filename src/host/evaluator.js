// Evaluator — the staged transaction of PRD §13.2.
//
//   1. compile the block                        -> SyntaxError stops here      (S-01)
//   2. run its registration calls into staging  -> a throw stops here          (S-02)
//   3. validate the staged shape and targets    -> a bad reference stops here  (S-02)
//   4. snapshot compatible patch state
//   5. queue for the next frame boundary
//   6. invoke the candidate inside an error boundary   (hostLoop)
//   7. commit on success; restore previous definition and state on failure (hostLoop)
//   8. add successful source and metadata to history                       (registry)
//
// Steps 1-5 live here. Steps 6-8 belong to the frame and live in hostLoop.js.
//
// Nothing in steps 1-4 can touch the running system: the code runs against a staging
// transaction, not the registry. That is the mechanical reason a syntax error can
// never blank the stage.
//
// §13.3, plainly: this compiles and runs student JavaScript with `new Function`. That
// is deliberate live-coding, not a sandbox. An infinite loop still freezes the tab.

import { createTransaction, LIVE_API_NAMES } from './liveApi.js';

/** Operations that name something which must already exist (or be created by this block). */
const TARGETED_OPS = new Set(['go', 'add', 'remove', 'resetPatch']);

export function createEvaluator({ registry, stateStore, diagnostics }) {
  /** @type {Array<{transaction: object, label: string}>} */
  const queue = [];

  /**
   * Steps 1-5. Returns synchronously; visible change happens at the next frame.
   * @param {string} source
   * @param {{label?: string}} [options]
   */
  function evaluate(source, { label = 'block' } = {}) {
    if (typeof source !== 'string' || source.trim() === '') {
      return { ok: false, phase: 'empty', error: new Error('Nothing to evaluate') };
    }

    // 1. Compile. A syntax error ends the transaction before anything else happens.
    let compiled;
    try {
      compiled = new Function(...LIVE_API_NAMES, source);
    } catch (error) {
      diagnostics?.error(`Syntax error — ${label} not applied`, formatError(error, source));
      return { ok: false, phase: 'syntax', error };
    }

    // 2. Run the registration calls against a staging transaction.
    const transaction = createTransaction(source);
    try {
      compiled(...transaction.args());
    } catch (error) {
      diagnostics?.error(`Registration error — ${label} not applied`, formatError(error, source));
      return { ok: false, phase: 'registration', error };
    }

    if (transaction.isEmpty()) {
      diagnostics?.warn(
        `${label} evaluated, but registered nothing`,
        'Did you mean to call patch(), scene(), or go()?',
      );
      return { ok: true, phase: 'noop', staged: [], operations: 0 };
    }

    // 3. Validate that every referenced name will exist once this block is applied.
    const validationError = validateTargets(transaction);
    if (validationError) {
      diagnostics?.error(`Registration error — ${label} not applied`, validationError.message);
      return { ok: false, phase: 'registration', error: validationError };
    }

    // 4 + 5. Snapshot state and queue for the frame boundary. The snapshot is taken
    // now, before the candidate has had any chance to mutate state.
    for (const [name, staged] of transaction.stagedPatches) {
      staged.stateSnapshot = stateStore.snapshot(name);
    }
    queue.push({ transaction, label });

    return {
      ok: true,
      phase: 'queued',
      staged: [...transaction.stagedPatches.keys()],
      operations: transaction.operations.length,
    };
  }

  function validateTargets(transaction) {
    const patchNames = new Set([...registry.patchNames(), ...transaction.stagedPatches.keys()]);
    const sceneNames = new Set(registry.listScenes().map((s) => s.name));
    for (const op of transaction.operations) {
      if (op.type === 'scene') {
        sceneNames.add(op.name);
        const missing = op.patchNames.filter((n) => !patchNames.has(n));
        if (missing.length) {
          return new Error(
            `scene("${op.name}", ...) refers to undefined patch${missing.length > 1 ? 'es' : ''}: ` +
              `${missing.join(', ')}. Define ${missing.length > 1 ? 'them' : 'it'} first, or ` +
              `evaluate the whole buffer with Cmd/Ctrl+Shift+Enter.`,
          );
        }
      } else if (op.type === 'go') {
        if (!sceneNames.has(op.name)) return new Error(`go("${op.name}") — no scene by that name`);
      } else if (TARGETED_OPS.has(op.type)) {
        if (!patchNames.has(op.name)) {
          return new Error(`${op.type}("${op.name}") — no patch by that name`);
        }
      }
    }
    return null;
  }

  /**
   * Apply every queued transaction. Called by the host at a frame boundary so a
   * replacement is never spliced in halfway through a rendered frame (R-03).
   * @returns {string[]} names whose candidate versions will be tested next frame
   */
  function applyPending() {
    if (queue.length === 0) return [];
    const staged = [];

    for (const { transaction, label } of queue) {
      // Names this block places into a scene itself. The convenience of auto-adding a
      // new patch must defer to explicit composition: a block that says
      //   patch("chaos", ...); scene("wild", ["chaos"]); go("wild");
      // means chaos belongs to "wild", not also to whatever happened to be running.
      const composed = composedNames(transaction);

      for (const [name, entry] of transaction.stagedPatches) {
        const isNew = !registry.hasPatch(name);
        registry.stagePatch(name, entry.definition, entry.source, entry.stateSnapshot);
        // Create state once, from this version's factory, if it has none yet.
        stateStore.ensure(name, entry.definition.state);
        // A brand-new patch joins the running scene so it is visible immediately.
        if (isNew && !composed.has(name)) registry.addToActiveScene(name);
        staged.push(name);
      }
      for (const op of transaction.operations) applyOperation(op, label);
    }

    queue.length = 0;
    return staged;
  }

  function composedNames(transaction) {
    const names = new Set();
    for (const op of transaction.operations) {
      if (op.type === 'scene') for (const name of op.patchNames) names.add(name);
      else if (op.type === 'add') names.add(op.name);
    }
    return names;
  }

  function applyOperation(op, label) {
    switch (op.type) {
      case 'scene':
        registry.defineScene(op.name, op.patchNames);
        break;
      case 'go':
        registry.go(op.name);
        break;
      case 'add':
        registry.addToActiveScene(op.name);
        break;
      case 'remove':
        registry.removeFromActiveScene(op.name);
        break;
      case 'clearScene':
        registry.clearActiveScene();
        break;
      case 'resetPatch': {
        const record = registry.getPatch(op.name);
        stateStore.reset(op.name, record?.definition?.state);
        diagnostics?.info(`${op.name} state reset`);
        break;
      }
      case 'param':
        registry.declareParam(op.name, op.value, op.options);
        break;
      default:
        diagnostics?.warn(`Unknown operation "${op.type}" in ${label}`);
    }
  }

  /**
   * One-click reversion (S-05). Reverting is an ordinary evaluation of a stored
   * version: it becomes a new candidate and must survive a frame like any other.
   */
  function revert(name, version) {
    const entry = registry.historyEntry(name, version);
    if (!entry) {
      diagnostics?.warn(`No stored version ${version} of ${name}`);
      return { ok: false, phase: 'history' };
    }
    const transaction = createTransaction(entry.source);
    transaction.stagedPatches.set(name, {
      definition: entry.definition,
      source: entry.source,
      stateSnapshot: stateStore.snapshot(name),
    });
    queue.push({ transaction, label: `${name} v${version}` });
    return { ok: true, phase: 'queued', staged: [name] };
  }

  return { evaluate, applyPending, revert, pendingCount: () => queue.length };
}

/** Trim a stack down to the one line a performer can act on (§10.5). */
function formatError(error, source) {
  const line = lineFromStack(error, source);
  const where = line ? ` (line ${line})` : '';
  return `${error.name}: ${error.message}${where}`;
}

function lineFromStack(error, source) {
  // `new Function` bodies report as "<anonymous>:LINE:COL", offset by the two-line
  // wrapper the engine adds around the body.
  const match = /<anonymous>:(\d+):\d+/.exec(error.stack ?? '');
  if (!match) return null;
  const line = Number(match[1]) - 2;
  const total = source.split('\n').length;
  return line >= 1 && line <= total ? line : null;
}
