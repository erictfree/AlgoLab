// The live authoring API — PRD §9.
//
// These are the only functions a student's evaluated block receives beyond ordinary
// JavaScript and the global p5 drawing functions. Deliberately small: §7 says the live
// API "adds a small lifecycle around ordinary JavaScript and p5.js" rather than a
// large effects vocabulary.
//
// Nothing here touches the live registry. Every call records an intention on a
// transaction, which the host applies atomically at a frame boundary (§13.2). That is
// what makes a half-executed block harmless: if the code throws partway through, the
// transaction is discarded and the running system never saw it.

export const LIVE_API_NAMES = [
  'patch',
  'scene',
  'go',
  'add',
  'remove',
  'clearScene',
  'resetPatch',
  'param',
];

const LIFECYCLE_KEYS = ['state', 'enter', 'draw', 'beat', 'exit'];

/**
 * Normalize the two authoring forms into one definition.
 *   §9.1  patch("rings", (ctx) => {...})
 *   §9.2  patch("orbiters", { state: () => ({...}), draw(ctx) {...} })
 */
function normalizeDefinition(name, value) {
  if (typeof value === 'function') {
    return { draw: value };
  }
  if (value === null || typeof value !== 'object') {
    throw new TypeError(
      `patch("${name}", ...) needs a draw function or an object with a draw() method`,
    );
  }
  if (typeof value.draw !== 'function') {
    throw new TypeError(`patch("${name}", ...) is missing a draw() function`);
  }
  const definition = {};
  for (const key of LIFECYCLE_KEYS) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'function') {
      throw new TypeError(`patch("${name}", ...): ${key} must be a function`);
    }
    definition[key] = value[key];
  }
  return definition;
}

function assertName(fnName, name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`${fnName}() needs a non-empty name as its first argument`);
  }
  return name;
}

/**
 * Create a staging transaction plus the API bound to it.
 * @param {string} source the evaluated block, stored with each patch it registers
 */
export function createTransaction(source = '') {
  /** @type {Map<string, {definition: object, source: string}>} */
  const stagedPatches = new Map();
  /** @type {Array<{type: string, [k: string]: any}>} */
  const operations = [];

  const api = {
    patch(name, value) {
      assertName('patch', name);
      stagedPatches.set(name, { definition: normalizeDefinition(name, value), source });
      return name;
    },

    scene(name, patchNames) {
      assertName('scene', name);
      if (!Array.isArray(patchNames)) {
        throw new TypeError(`scene("${name}", [...]) needs an array of patch names`);
      }
      for (const patchName of patchNames) assertName('scene', patchName);
      operations.push({ type: 'scene', name, patchNames: [...patchNames] });
      return name;
    },

    go(name) {
      assertName('go', name);
      operations.push({ type: 'go', name });
      return name;
    },

    add(name) {
      assertName('add', name);
      operations.push({ type: 'add', name });
      return name;
    },

    remove(name) {
      assertName('remove', name);
      operations.push({ type: 'remove', name });
      return name;
    },

    clearScene() {
      operations.push({ type: 'clearScene' });
    },

    resetPatch(name) {
      assertName('resetPatch', name);
      operations.push({ type: 'resetPatch', name });
      return name;
    },

    param(name, value, options = {}) {
      assertName('param', name);
      if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') {
        throw new TypeError(`param("${name}", ...) value must be a number, boolean, or string`);
      }
      operations.push({ type: 'param', name, value, options });
      return name;
    },
  };

  return {
    api,
    stagedPatches,
    operations,
    /** Arguments in LIVE_API_NAMES order, for `new Function(...names, source)`. */
    args: () => LIVE_API_NAMES.map((key) => api[key]),
    isEmpty: () => stagedPatches.size === 0 && operations.length === 0,
  };
}
