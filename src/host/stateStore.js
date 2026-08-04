// State store — state belongs to the patch NAME, not to a compiled function body.
//
// This is the whole point of PRD §7 ("State has an identity") and L-03. When a
// performer re-evaluates `patch("orbiters", ...)`, the function object is thrown away
// and replaced. The trail array is not. It is found again by name.
//
// §13.4 sets the contract: patch state should be numbers, strings, booleans, arrays,
// plain objects — structured-clone-compatible values. p5.Image, media elements, and
// analyzers are host resources and do not belong here. We enforce nothing, but a value
// that cannot be cloned loses its rollback snapshot, and we say so out loud.

export function createStateStore({ diagnostics } = {}) {
  /** @type {Map<string, object>} */
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
  function reset(name, factory) {
    states.set(name, buildInitialState(name, factory));
    return states.get(name);
  }

  return {
    ensure,
    reset,
    snapshot,
    restore,
    get: (name) => states.get(name),
    has: (name) => states.has(name),
    remove: (name) => states.delete(name),
    names: () => [...states.keys()],
  };
}
