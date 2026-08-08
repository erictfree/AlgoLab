// The live authoring API — the small set of commands around first-class strategies.
//
// Students do not register callbacks. They define ordinary named functions, objects,
// or class instances:
//
//   const waveScope = ({ audio }) => { ... };
//   const laserFan = { draw({ audio }) { ... } };
//   const scene = [waveScope, laserFan, plasma];
//
// The evaluator captures those bindings. An object with draw() is immediately a
// strategy; a function becomes one when it is placed in a scene. A top-level array of
// strategies is a scene. Composition changes only by editing that array.

import { ShaderChain } from '../shaders/shaderChain.js';

export const LIVE_API_NAMES = [
  'go',
  'reset',
  'param',
  'ShaderChain',
];

const LIFECYCLE_KEYS = ['state', 'enter', 'draw', 'beat', 'exit', 'dispose'];

function assertName(kind, name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`${kind} needs a non-empty name`);
  }
  if (name.includes('#')) {
    throw new TypeError(`${kind} "${name}" may not contain "#"`);
  }
  return name;
}

/** Validate and return the exact function or object supplied by the student. */
export function validateStrategy(value, suggestedName) {
  const name = suggestedName;
  if (typeof value === 'function') {
    assertName('Strategy', name);
    return { name, implementation: value };
  }
  if (value === null || typeof value !== 'object') {
    throw new TypeError('A strategy must be a function or an object with draw()');
  }
  if (typeof value.draw !== 'function') {
    throw new TypeError(`Strategy${name ? ` "${name}"` : ''} is missing a draw() method`);
  }
  assertName('Strategy', name);
  for (const key of LIFECYCLE_KEYS) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'function') {
      throw new TypeError(`Strategy "${name}": ${key} must be a method`);
    }
  }
  return { name, implementation: value };
}

/**
 * Create one atomic staging transaction.
 *
 * `nameOf` resolves an already-captured binding (`laserFan` -> "laserFan"). Identity always
 * comes from that JavaScript binding; objects do not carry a second name property.
 */
export function createTransaction(source = '', { nameOf = () => null } = {}) {
  /** @type {Map<string, {definition: Function | object, source: string}>} */
  const stagedStrategies = new Map();
  /** Objects mentioned by scenes/commands; the evaluator stages them only if needed. */
  const referencedStrategies = new Map();
  /** Captured JavaScript bindings committed with the transaction. */
  const bindingUpdates = new Map();
  /** @type {Array<{type: string, [k: string]: any}>} */
  const operations = [];

  const resolve = (value, suggestedName) =>
    validateStrategy(value, suggestedName ?? nameOf(value));

  function stageStrategy(value, strategySource = source, suggestedName) {
    const { name, implementation } = resolve(value, suggestedName);
    stagedStrategies.set(name, { definition: implementation, source: strategySource });
    return name;
  }

  function referenceStrategy(value, suggestedName) {
    const { name, implementation } = resolve(value, suggestedName);
    referencedStrategies.set(name, { definition: implementation, source });
    return name;
  }

  function normalizeSceneEntry(entry, localNameOf = nameOf) {
    const name = referenceStrategy(entry, localNameOf(entry));
    return { strategy: name };
  }

  /** Called by the evaluator when it captures `const scene = [laserFan, plasma]`. */
  function defineScene(name, entries, localNameOf = nameOf) {
    assertName('Scene', name);
    if (!Array.isArray(entries)) throw new TypeError(`Scene "${name}" must be an array`);
    operations.push({
      type: 'scene',
      name,
      entries: entries.map((entry) => normalizeSceneEntry(entry, localNameOf)),
    });
    return name;
  }

  function commandTarget(value, command) {
    if (typeof value === 'string') {
      throw new TypeError(`${command}() takes a strategy value, not a strategy name`);
    }
    return value;
  }

  const api = {
    ShaderChain,

    go(scene) {
      if (typeof scene === 'string') {
        throw new TypeError('go() takes a scene array, not a scene name');
      }
      if (!Array.isArray(scene)) throw new TypeError('go() needs a scene array');
      operations.push({ type: 'go', target: scene });
      return scene;
    },

    reset(strategy) {
      operations.push({ type: 'reset', target: commandTarget(strategy, 'reset') });
      return strategy;
    },

    param(name, value, options = {}) {
      assertName('Parameter', name);
      if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') {
        throw new TypeError(`param("${name}", ...) value must be a number, boolean, or string`);
      }
      operations.push({ type: 'param', name, value, options });
      return name;
    },
  };

  /** Resolve command objects after the evaluator has captured same-buffer bindings. */
  function resolveCommandTargets(localNameOf = nameOf) {
    for (const op of operations) {
      if (!Object.hasOwn(op, 'target')) continue;
      if (op.type === 'go') {
        op.name = localNameOf(op.target);
        assertName('Scene', op.name);
        delete op.target;
        continue;
      }
      op.name = referenceStrategy(op.target, localNameOf(op.target));
      delete op.target;
    }
  }

  return {
    api,
    stagedStrategies,
    referencedStrategies,
    bindingUpdates,
    operations,
    stageStrategy,
    defineScene,
    resolveCommandTargets,
    args: () => LIVE_API_NAMES.map((key) => api[key]),
    isEmpty: () =>
      stagedStrategies.size === 0 &&
      bindingUpdates.size === 0 &&
      operations.length === 0,
  };
}
