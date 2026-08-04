// Registry — named visual behaviors and the scenes that compose them.
//
// This module is the "first-class functions stored in a registry" idea from PRD §18,
// made literal. A patch is a name pointing at a function. Replacing the function does
// not disturb the name, the scene that mentions it, or the state filed under it.
//
// The single invariant everything else depends on: a failed evaluation never mutates
// an active record. New code is a *candidate* until it has survived one frame (§7,
// "The last good image-making system wins"). Only then does it enter history.
//
// No p5, no DOM — this file is unit-testable in plain Node.

const DEFAULT_HISTORY_LIMIT = 12; // S-05 requires at least ten.
const DEFAULT_SCENE = 'main';

/**
 * @typedef {{ state?: Function, draw: Function, enter?: Function, beat?: Function, exit?: Function }} PatchDefinition
 * @typedef {{ version: number, source: string, definition: PatchDefinition, at: number }} HistoryEntry
 */

export function createRegistry({ historyLimit = DEFAULT_HISTORY_LIMIT, now = () => Date.now() } = {}) {
  /** @type {Map<string, any>} */
  const patches = new Map();
  /** @type {Map<string, string[]>} */
  const scenes = new Map();
  /** @type {Map<string, {value: any, min?: number, max?: number, step?: number}>} */
  const params = new Map();
  let activeSceneName = null;
  /** The scene panic returns to (S-06, P-05). */
  let safeSceneName = null;
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener();
  }

  // --- patches ------------------------------------------------------------------

  function createRecord(name) {
    const record = {
      name,
      version: 0,
      definition: null,
      source: '',
      /** @type {HistoryEntry[]} */
      history: [],
      /** Set while a new version is awaiting its first frame. */
      candidate: null,
      status: 'empty', // 'empty' | 'ok' | 'failed'
      lastError: null,
      /** Cleared each time a scene activates the patch, so `enter` runs once. */
      entered: false,
    };
    patches.set(name, record);
    return record;
  }

  /**
   * Install a new version as a *candidate*. The previous definition is remembered so
   * `rollback` can put it back if the candidate throws on its first frame (S-03).
   *
   * @param {string} name
   * @param {PatchDefinition} definition
   * @param {string} source
   * @param {any} stateSnapshot value from stateStore.snapshot(), kept for rollback
   */
  function stagePatch(name, definition, source, stateSnapshot) {
    const record = patches.get(name) ?? createRecord(name);
    record.candidate = {
      previousDefinition: record.definition,
      previousVersion: record.version,
      previousSource: record.source,
      previousStatus: record.status,
      stateSnapshot,
    };
    record.definition = definition;
    record.source = source;
    record.version += 1;
    record.status = 'ok';
    record.lastError = null;
    // A brand-new patch has never run `enter`; a replacement has already entered.
    if (record.candidate.previousDefinition === null) record.entered = false;
    notify();
    return record;
  }

  /** The candidate survived a frame. Record it as a successful version (S-05). */
  function confirmPatch(name) {
    const record = patches.get(name);
    if (!record?.candidate) return null;
    record.candidate = null;
    record.history.unshift({
      version: record.version,
      source: record.source,
      definition: record.definition,
      at: now(),
    });
    if (record.history.length > historyLimit) record.history.length = historyLimit;
    notify();
    return record;
  }

  /**
   * The candidate threw on its first frame. Put the previous version back and hand
   * the caller the state snapshot to restore alongside it.
   */
  function rollbackPatch(name, error) {
    const record = patches.get(name);
    if (!record?.candidate) return null;
    const { previousDefinition, previousVersion, previousSource, previousStatus, stateSnapshot } =
      record.candidate;

    const failedVersion = record.version;
    record.definition = previousDefinition;
    record.version = previousVersion;
    record.source = previousSource;
    record.status = previousDefinition ? previousStatus : 'failed';
    record.lastError = { message: error?.message ?? String(error), version: failedVersion };
    record.candidate = null;
    notify();
    return { record, stateSnapshot, failedVersion, restoredVersion: previousVersion };
  }

  /**
   * One-click reversion (S-05). The historical definition becomes active again as a
   * new version, so history stays append-only and version numbers stay monotonic.
   */
  function historyEntry(name, version) {
    return patches.get(name)?.history.find((entry) => entry.version === version) ?? null;
  }

  function removePatch(name) {
    patches.delete(name);
    for (const [sceneName, order] of scenes) {
      const next = order.filter((n) => n !== name);
      if (next.length !== order.length) scenes.set(sceneName, next);
    }
    notify();
  }

  // --- scenes -------------------------------------------------------------------

  function defineScene(name, patchNames) {
    scenes.set(name, [...patchNames]);
    if (activeSceneName === null) activeSceneName = name;
    notify();
    return scenes.get(name);
  }

  function go(name) {
    if (!scenes.has(name)) throw new Error(`No scene named "${name}"`);
    activeSceneName = name;
    // Re-entering a scene re-runs each patch's `enter` handler.
    for (const patchName of scenes.get(name)) {
      const record = patches.get(patchName);
      if (record) record.entered = false;
    }
    notify();
    return name;
  }

  function activeOrder() {
    if (activeSceneName === null) return [];
    return scenes.get(activeSceneName) ?? [];
  }

  // --- safe scene (S-06, P-05) --------------------------------------------------

  /** Designate a scene as the one to fall back to. Defaults to the active scene. */
  function setSafeScene(name = activeSceneName) {
    if (name === null || !scenes.has(name)) return null;
    safeSceneName = name;
    notify();
    return name;
  }

  /**
   * Return to the safe scene in one action.
   *
   * Deliberately does nothing else — it does not reset state, re-evaluate code, or
   * touch the audio. Panic is for the moment when the visuals have gone somewhere
   * unusable in front of an audience, and the recovery has to be one keystroke with
   * an outcome the performer already knows the look of.
   */
  function panic() {
    if (safeSceneName === null || !scenes.has(safeSceneName)) return null;
    return go(safeSceneName);
  }

  function ensureActiveScene() {
    if (activeSceneName === null) {
      if (!scenes.has(DEFAULT_SCENE)) scenes.set(DEFAULT_SCENE, []);
      activeSceneName = DEFAULT_SCENE;
    }
    return activeSceneName;
  }

  /**
   * A newly-named patch joins the running scene automatically.
   *
   * Without this, a student's first `patch("mine", ...)` evaluates successfully and
   * draws nothing, which reads as "the system is broken" rather than "you have not
   * composed a scene yet" (§15 asks for a first success within 15 minutes).
   * Re-evaluating an existing patch never changes scene membership.
   */
  function addToActiveScene(name) {
    const sceneName = ensureActiveScene();
    const order = scenes.get(sceneName);
    if (!order.includes(name)) order.push(name);
    notify();
    return order;
  }

  function removeFromActiveScene(name) {
    const sceneName = ensureActiveScene();
    const order = scenes.get(sceneName).filter((n) => n !== name);
    scenes.set(sceneName, order);
    // `entered` is deliberately left alone: the host uses it to notice that this
    // patch has departed and to run its exit() handler on the next frame (L-07).
    // Clearing it here would silently swallow every exit.
    notify();
    return order;
  }

  function clearActiveScene() {
    const sceneName = ensureActiveScene();
    scenes.set(sceneName, []);
    notify();
    return [];
  }

  /** Live layer reordering (L-06) — move one patch to a new index in the active scene. */
  function reorderActiveScene(name, toIndex) {
    const sceneName = ensureActiveScene();
    const order = scenes.get(sceneName);
    const from = order.indexOf(name);
    if (from === -1) return order;
    order.splice(from, 1);
    order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, name);
    notify();
    return order;
  }

  // --- params (§9.7) ------------------------------------------------------------

  function declareParam(name, value, options = {}) {
    const existing = params.get(name);
    // Re-evaluating a block must not stomp a value the performer has since tuned.
    params.set(name, { ...options, value: existing ? existing.value : value, default: value });
    notify();
    return params.get(name);
  }

  function setParam(name, value) {
    const entry = params.get(name);
    if (!entry) return null;
    entry.value = value;
    notify();
    return entry;
  }

  /** Flat `{ name: value }` view handed to patches each frame as `context.params`. */
  function paramValues(target = {}) {
    for (const key of Object.keys(target)) delete target[key];
    for (const [name, entry] of params) target[name] = entry.value;
    return target;
  }

  return {
    // patches
    stagePatch,
    confirmPatch,
    rollbackPatch,
    removePatch,
    historyEntry,
    getPatch: (name) => patches.get(name) ?? null,
    hasPatch: (name) => patches.has(name),
    listPatches: () => [...patches.values()],
    patchNames: () => [...patches.keys()],

    // scenes
    defineScene,
    go,
    activeOrder,
    ensureActiveScene,
    addToActiveScene,
    removeFromActiveScene,
    clearActiveScene,
    reorderActiveScene,
    listScenes: () => [...scenes.entries()].map(([name, order]) => ({ name, order: [...order] })),
    activeSceneName: () => activeSceneName,
    setSafeScene,
    panic,
    safeSceneName: () => safeSceneName,

    // params
    declareParam,
    setParam,
    paramValues,
    listParams: () => [...params.entries()].map(([name, entry]) => ({ name, ...entry })),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
