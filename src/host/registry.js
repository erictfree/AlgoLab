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

import { instanceId } from './stateStore.js';

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

  // --- scenes and instances -----------------------------------------------------
  //
  // A scene is an ordered list of INSTANCES, not of patch names, because the same
  // patch may appear more than once — two swarms with different configs, three
  // ribbons at different heights. An instance is `{ id, patch, config }`.
  //
  // The first instance of a patch takes the bare patch name as its id, so a scene
  // that uses each patch once is indistinguishable from the old name-list model.
  // Extras are `swarm#2`, `swarm#3`.

  /** Allocate the lowest unused instance id for `patch` within `order`. */
  function nextInstanceId(order, patch) {
    const taken = new Set(order.map((entry) => entry.id));
    for (let n = 1; ; n++) {
      const id = instanceId(patch, n);
      if (!taken.has(id)) return id;
    }
  }

  /**
   * Normalize one scene entry into an instance.
   * Accepts `"swarm"` or `{ patch: "swarm", config: {...} }`.
   */
  function toInstance(order, entry) {
    const patch = typeof entry === 'string' ? entry : entry.patch;
    const config = typeof entry === 'string' ? {} : (entry.config ?? {});
    // An explicit id is honoured when it is free, so a saved or exported project
    // reloads with the ids it was saved under rather than being renumbered.
    const wanted = typeof entry === 'string' ? null : entry.id;
    const free = wanted && !order.some((i) => i.id === wanted);
    return { id: free ? wanted : nextInstanceId(order, patch), patch, config };
  }

  function defineScene(name, entries) {
    /** @type {Array<{id: string, patch: string, config: object}>} */
    const order = [];
    for (const entry of entries) order.push(toInstance(order, entry));
    scenes.set(name, order);
    if (activeSceneName === null) activeSceneName = name;
    notify();
    return order;
  }

  function go(name) {
    if (!scenes.has(name)) throw new Error(`No scene named "${name}"`);
    activeSceneName = name;
    notify();
    return name;
  }

  /** Instance ids, in layer order. The host draws these, in this order. */
  function activeOrder() {
    return activeInstances().map((instance) => instance.id);
  }

  function activeInstances() {
    if (activeSceneName === null) return [];
    return scenes.get(activeSceneName) ?? [];
  }

  function getInstance(id) {
    return activeInstances().find((instance) => instance.id === id) ?? null;
  }

  /** Every instance of a patch in the active scene — one patch, possibly many copies. */
  function activeInstancesOf(patch) {
    return activeInstances().filter((instance) => instance.patch === patch);
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
   * Add an instance of a patch to the running scene.
   *
   * Called two ways, and the difference matters:
   *
   *  - automatically, when a newly-named patch is registered. Without this, a
   *    student's first `patch("mine", ...)` evaluates successfully and draws nothing,
   *    which reads as "the system is broken" rather than "you have not composed a
   *    scene yet" (§15 asks for a first success within 15 minutes). That path passes
   *    `once: true`, so re-evaluating an existing patch never re-adds it.
   *
   *  - deliberately, via `add("swarm")` or the Patch shelf. That path always creates
   *    a new instance, so asking for a second swarm gets you a second swarm.
   */
  function addToActiveScene(patch, config = {}, { once = false } = {}) {
    const sceneName = ensureActiveScene();
    const order = scenes.get(sceneName);
    if (once && order.some((instance) => instance.patch === patch)) return null;
    const instance = toInstance(order, { patch, config });
    order.push(instance);
    notify();
    return instance;
  }

  /**
   * Remove by instance id (`swarm#2`) or by patch name.
   *
   * A bare patch name removes that patch's LAST instance rather than all of them, so
   * repeated `remove("swarm")` peels copies off one at a time and mirrors repeated
   * `add("swarm")`. Removing every copy at once is `removeAll`.
   */
  function removeFromActiveScene(idOrPatch) {
    const sceneName = ensureActiveScene();
    const order = scenes.get(sceneName);

    // "swarm" and "swarm#2" mean different things, and "swarm" is ambiguous on its
    // own — it is both the patch name and the first instance's id. The "#" settles
    // it: with one, target that exact instance; without one, treat it as a patch name
    // and peel off its last copy, so repeated remove() undoes repeated add().
    const index = idOrPatch.includes('#')
      ? order.findIndex((instance) => instance.id === idOrPatch)
      : order.map((instance) => instance.patch).lastIndexOf(idOrPatch);
    if (index === -1) return order;
    order.splice(index, 1);
    // The host uses its own record of what was on stage last frame to notice the
    // departure and run exit() (L-07), so nothing lifecycle-related happens here.
    notify();
    return order;
  }

  function removeAllFromActiveScene(patch) {
    const sceneName = ensureActiveScene();
    scenes.set(
      sceneName,
      scenes.get(sceneName).filter((instance) => instance.patch !== patch),
    );
    notify();
    return scenes.get(sceneName);
  }

  function clearActiveScene() {
    const sceneName = ensureActiveScene();
    scenes.set(sceneName, []);
    notify();
    return [];
  }

  /** Live layer reordering (L-06) — move one instance to a new index. */
  function reorderActiveScene(id, toIndex) {
    const sceneName = ensureActiveScene();
    const order = scenes.get(sceneName);
    const from = order.findIndex((instance) => instance.id === id);
    if (from === -1) return order;
    const [moved] = order.splice(from, 1);
    order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, moved);
    notify();
    return order;
  }

  /** Per-instance settings, live (§9.7's params are workspace-wide; this is not). */
  function configureInstance(id, changes) {
    const instance = getInstance(id);
    if (!instance) return null;
    instance.config = { ...instance.config, ...changes };
    notify();
    return instance;
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

  /**
   * Forget everything: patches, scenes, params, and the safe scene.
   *
   * Used only by the performer's explicit "reset project" action. It is deliberately
   * a single call rather than something the evaluator can reach, because nothing a
   * student evaluates should be able to empty the registry.
   */
  function reset() {
    patches.clear();
    scenes.clear();
    params.clear();
    activeSceneName = null;
    safeSceneName = null;
    notify();
  }

  return {
    reset,
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

    // scenes and instances
    defineScene,
    go,
    activeOrder,
    activeInstances,
    activeInstancesOf,
    getInstance,
    ensureActiveScene,
    addToActiveScene,
    removeFromActiveScene,
    removeAllFromActiveScene,
    clearActiveScene,
    reorderActiveScene,
    configureInstance,
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
