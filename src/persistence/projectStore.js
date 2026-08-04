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
// v2 stores scenes as instances ({id, patch, config}) rather than bare patch names,
// so a scene holding the same patch more than once round-trips faithfully.
const SCHEMA = 2;
const READABLE_SCHEMAS = new Set([1, 2]);

export function createProjectStore({ registry, diagnostics, storage = globalThis.localStorage } = {}) {
  let timer = null;

  function snapshot(editorSource) {
    return {
      schema: SCHEMA,
      savedAt: Date.now(),
      source: editorSource,
      scenes: registry.listScenes(),
      activeScene: registry.activeSceneName(),
      safeScene: registry.safeSceneName(),
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
      if (!READABLE_SCHEMAS.has(data?.schema) || typeof data.source !== 'string') {
        diagnostics?.warn('Saved project is from an older format — starting fresh');
        return null;
      }
      return { ...data, scenes: (data.scenes ?? []).map(upgradeScene) };
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
        upgradeOrder(scene.order).filter((entry) => registry.hasPatch(entry.patch)),
      );
    }
    if (data.activeScene && data.scenes?.some((s) => s.name === data.activeScene)) {
      registry.go(data.activeScene);
    }
    if (data.safeScene) registry.setSafeScene(data.safeScene);
    for (const param of data.params ?? []) {
      registry.declareParam(param.name, param.value, param);
      // declareParam deliberately keeps an existing value, so set the saved one
      // explicitly — the performer's tuning outranks the source's default.
      registry.setParam(param.name, param.value);
    }
  }

  const upgradeScene = (scene) => ({ ...scene, order: upgradeOrder(scene.order) });

  /** Accept both v1 (`["wash", "rings"]`) and v2 (instance objects) scene orders. */
  function upgradeOrder(order) {
    return (order ?? []).map((entry) =>
      typeof entry === 'string'
        ? { patch: entry, config: {} }
        : { id: entry.id, patch: entry.patch, config: entry.config ?? {} },
    );
  }

  function clear() {
    try {
      storage?.removeItem(KEY);
    } catch {
      /* nothing useful to do */
    }
  }

  // --- export / import (D-02, D-03) ----------------------------------------------

  /**
   * D-02: "a human-readable project containing source, scene definitions, and
   * configuration."
   *
   * Pretty-printed JSON, with the source split into lines. A single escaped string
   * with `\n` in it is technically readable and practically not — an instructor
   * reading a student's submitted project, or diffing two of them, needs to see the
   * code as code.
   */
  function exportProject(editorSource, extra = {}) {
    const data = snapshot(editorSource);
    return JSON.stringify(
      {
        format: 'response-project',
        schema: SCHEMA,
        exportedAt: new Date(data.savedAt).toISOString(),
        source: data.source.split('\n'),
        scenes: data.scenes,
        activeScene: data.activeScene,
        safeScene: data.safeScene,
        params: data.params,
        ...extra,
      },
      null,
      2,
    );
  }

  function download(editorSource, extra = {}) {
    const blob = new Blob([exportProject(editorSource, extra)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `response-project-${new Date().toISOString().slice(0, 10)}.json`;
    // Chromium ignores a synthetic click on an anchor that is not in the document, so
    // attach it for the duration of the click.
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    // Revoke on the next task so the click has actually been dispatched.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return link.download;
  }

  /**
   * Parse an exported project. Returns `{ ok, data }` or `{ ok: false, error }`.
   *
   * Parsing is separate from applying on purpose: D-03 requires an explicit
   * trusted-code confirmation, and the performer cannot meaningfully confirm anything
   * until they can be shown what is in the file. So this validates and hands back the
   * contents; running it is a second, deliberate step.
   */
  function parseProject(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { ok: false, error: `Not a valid project file — ${error.message}` };
    }
    if (data?.format !== 'response-project') {
      return { ok: false, error: 'Not a Response project file' };
    }
    if (!READABLE_SCHEMAS.has(data.schema)) {
      return {
        ok: false,
        error: `Project uses format version ${data.schema}, this build reads ${[...READABLE_SCHEMAS].join(' and ')}`,
      };
    }
    const source = Array.isArray(data.source) ? data.source.join('\n') : data.source;
    if (typeof source !== 'string') {
      return { ok: false, error: 'Project file has no source' };
    }
    return {
      ok: true,
      data: {
        source,
        scenes: (Array.isArray(data.scenes) ? data.scenes : []).map(upgradeScene),
        activeScene: data.activeScene ?? null,
        safeScene: data.safeScene ?? null,
        params: Array.isArray(data.params) ? data.params : [],
      },
    };
  }

  return {
    save,
    saveSoon,
    load,
    restoreComposition,
    clear,
    exportProject,
    download,
    parseProject,
  };
}
