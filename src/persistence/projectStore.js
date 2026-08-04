// Local project persistence — D-01.
//
// "The current editor source, patch registry, scenes, and declared parameters shall
// persist locally after refresh."
//
// What is saved is *source and composition*, never compiled functions. On reload the
// host replays the source through the ordinary evaluator, so a restored project goes
// through exactly the same validation path as a live edit — including rollback if a
// saved patch turns out to throw.
//
// The stored shape is versioned. A format change degrades to "start fresh" rather
// than throwing during startup, because a student mid-semester should never be met
// with a broken page.

const KEY = 'response.project.v1';
const SCHEMA = 1;

export function createProjectStore({ registry, diagnostics, storage = globalThis.localStorage } = {}) {
  let timer = null;

  function snapshot(editorSource) {
    return {
      schema: SCHEMA,
      savedAt: Date.now(),
      source: editorSource,
      scenes: registry.listScenes(),
      activeScene: registry.activeSceneName(),
      params: registry.listParams().map(({ name, value, min, max, step }) => ({
        name,
        value,
        min,
        max,
        step,
      })),
    };
  }

  function save(editorSource) {
    try {
      storage?.setItem(KEY, JSON.stringify(snapshot(editorSource)));
      return true;
    } catch (error) {
      diagnostics?.warn('Could not save project locally', error.message);
      return false;
    }
  }

  /** Debounced so typing does not write to localStorage on every keystroke. */
  function saveSoon(editorSource, delay = 600) {
    clearTimeout(timer);
    timer = setTimeout(() => save(editorSource), delay);
  }

  function load() {
    let raw;
    try {
      raw = storage?.getItem(KEY);
    } catch (error) {
      diagnostics?.warn('Could not read saved project', error.message);
      return null;
    }
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      if (data?.schema !== SCHEMA || typeof data.source !== 'string') {
        diagnostics?.warn('Saved project is from an older format — starting fresh');
        return null;
      }
      return data;
    } catch (error) {
      diagnostics?.warn('Saved project was unreadable — starting fresh', error.message);
      return null;
    }
  }

  /**
   * Put back the parts replaying the source will not rebuild: scene order the
   * performer changed by hand, and parameter values they tuned.
   *
   * Order matters — this must run AFTER the saved source has been evaluated. The
   * source contains scene("tunnel", [...]) and param() calls that would otherwise
   * overwrite exactly what we are restoring.
   */
  function restoreComposition(data) {
    if (!data) return;
    for (const scene of data.scenes ?? []) {
      // Only patches that actually came back from the source belong in a scene.
      registry.defineScene(
        scene.name,
        scene.order.filter((name) => registry.hasPatch(name)),
      );
    }
    if (data.activeScene && data.scenes?.some((s) => s.name === data.activeScene)) {
      registry.go(data.activeScene);
    }
    for (const param of data.params ?? []) {
      registry.declareParam(param.name, param.value, param);
      // declareParam deliberately keeps an existing value, so set the saved one
      // explicitly — the performer's tuning outranks the source's default.
      registry.setParam(param.name, param.value);
    }
  }

  function clear() {
    try {
      storage?.removeItem(KEY);
    } catch {
      /* nothing useful to do */
    }
  }

  return { save, saveSoon, load, restoreComposition, clear };
}
