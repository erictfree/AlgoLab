// State store — state belongs to the patch INSTANCE, not to a compiled function body.
//
// This is the whole point of PRD §7 ("State has an identity") and L-03. When a
// performer re-evaluates `patch("orbiters", ...)`, the function object is thrown away
// and replaced. The trail array is not. It is found again by identity.
//
// Identity is the instance id, because a scene may hold the same patch more than once.
// The first instance of a patch uses the bare patch name, so the ordinary case — one
// copy of `orbiters` — is exactly the "state belongs to the name" model, unchanged.
// Extra copies are `orbiters#2`, `orbiters#3`, and each gets its own state, because
// two swarms sharing one particle array would be one swarm drawn twice.
//
// §13.4 sets the contract: patch state should be numbers, strings, booleans, arrays,
// plain objects — structured-clone-compatible values. p5.Image, media elements, and
// analyzers are host resources and do not belong here. We enforce nothing, but a value
// that cannot be cloned loses its rollback snapshot, and we say so out loud.

/** `orbiters#2` -> `orbiters`. Patch names may not contain "#" (see liveApi.js). */
export const patchOf = (instanceId) => instanceId.split('#')[0];

/** The id of the nth instance of a patch; the first is the bare name. */
export const instanceId = (patch, n) => (n <= 1 ? patch : `${patch}#${n}`);

export function createStateStore({ diagnostics } = {}) {
  /** @type {Map<string, object>} keyed by instance id */
  const states = new Map();

  /**
   * Get the state for a name, creating it once from the patch's `state()` factory.
   * Re-evaluating a patch does NOT re-run the factory — that is what makes state
   * survive a code replacement.
   */
  function ensure(name, factory) {
    if (!states.has(name)) {
      states.set(name, buildInitialState(name, factory));
    }
    return states.get(name);
  }

  function buildInitialState(name, factory) {
    if (typeof factory !== 'function') return {};
    try {
      const value = factory();
      if (value === null || typeof value !== 'object') {
        diagnostics?.warn(
          `${name}: state() should return an object`,
          `Got ${value === null ? 'null' : typeof value}. Using an empty object instead.`,
        );
        return {};
      }
      return value;
    } catch (err) {
      diagnostics?.warn(`${name}: state() threw`, err.message);
      return {};
    }
  }

  /**
   * Copy the current state so it can be put back if a candidate version fails on its
   * first frame (S-03). Returns `null` when the state cannot be cloned — the caller
   * treats that as "code can roll back, state cannot".
   */
  function snapshot(name) {
    const current = states.get(name);
    if (current === undefined) return undefined;
    try {
      return structuredClone(current);
    } catch (err) {
      diagnostics?.warn(
        `${name}: state could not be snapshotted`,
        `${err.message} — patch state should be JSON-compatible (PRD §13.4). ` +
          `Code will still roll back, but this patch's state will not.`,
      );
      return null;
    }
  }

  /** Put back a snapshot taken by `snapshot()`. A null snapshot means "leave it". */
  function restore(name, snap) {
    if (snap === null) return false;
    if (snap === undefined) {
      states.delete(name);
      return true;
    }
    states.set(name, snap);
    return true;
  }

  /** Explicit performer-initiated reset — `resetPatch("orbiters")` (L-04). */
  function reset(id, factory) {
    states.set(id, buildInitialState(id, factory));
    return states.get(id);
  }

  /** Every instance id of a patch that currently holds state. */
  function instancesOf(patch) {
    return [...states.keys()].filter((id) => patchOf(id) === patch);
  }

  // --- whole-patch operations -----------------------------------------------------
  //
  // Replacing a patch replaces the behavior of every one of its instances at once, so
  // rollback and reset have to cover all of them. A rollback that restored only the
  // first swarm would leave the other two running the failed version's state.

  /** @returns {Record<string, any>} snapshots keyed by instance id */
  function snapshotPatch(patch) {
    const snapshots = {};
    for (const id of instancesOf(patch)) snapshots[id] = snapshot(id);
    return snapshots;
  }

  function restorePatch(patch, snapshots) {
    if (!snapshots) return false;
    let restored = false;
    for (const [id, snap] of Object.entries(snapshots)) {
      if (restore(id, snap)) restored = true;
    }
    return restored;
  }

  function resetPatch(patch, factory) {
    const ids = instancesOf(patch);
    // A patch with no state yet still deserves its bare instance created, so that
    // resetPatch() on a freshly-registered patch is not a silent no-op.
    for (const id of ids.length ? ids : [patch]) reset(id, factory);
    return ids.length || 1;
  }

  return {
    ensure,
    reset,
    snapshot,
    restore,
    snapshotPatch,
    restorePatch,
    resetPatch,
    instancesOf,
    get: (id) => states.get(id),
    has: (id) => states.has(id),
    remove: (id) => states.delete(id),
    clear: () => states.clear(),
    names: () => [...states.keys()],
  };
}
