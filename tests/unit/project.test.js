// Project persistence and portability: D-01, D-02, D-03.

import { describe, it, expect } from 'vitest';
import { createRegistry } from '../../src/host/registry.js';
import { createProjectStore } from '../../src/persistence/projectStore.js';

/** A localStorage stand-in, since these tests run in Node. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() {
      return map.size;
    },
  };
}

function setup() {
  const registry = createRegistry();
  const storage = fakeStorage();
  const store = createProjectStore({ registry, storage });

  // A registry with something in it to save.
  registry.stagePatch('wash', { draw: () => {} }, 'patch("wash", () => {});', undefined);
  registry.confirmPatch('wash');
  registry.stagePatch('rings', { draw: () => {} }, 'patch("rings", () => {});', undefined);
  registry.confirmPatch('rings');
  registry.defineScene('tunnel', ['wash', 'rings']);
  registry.go('tunnel');
  registry.setSafeScene('tunnel');
  registry.declareParam('trail', 0.08, { min: 0, max: 0.3, step: 0.01 });

  return { registry, storage, store };
}

const SOURCE = 'patch("wash", () => {});\npatch("rings", () => {});\nscene("tunnel", ["wash", "rings"]);';

describe('D-01 local persistence', () => {
  it('round-trips source, scenes, safe scene, and params', () => {
    const { store } = setup();
    store.save(SOURCE);
    const loaded = store.load();

    expect(loaded.source).toBe(SOURCE);
    expect(loaded.scenes.find((s) => s.name === 'tunnel').order.map((i) => i.id)).toEqual([
      'wash',
      'rings',
    ]);
    expect(loaded.activeScene).toBe('tunnel');
    expect(loaded.safeScene).toBe('tunnel');
    expect(loaded.params[0]).toMatchObject({ name: 'trail', value: 0.08 });
  });

  it('restores a hand-reordered scene rather than the order in the source', () => {
    const { registry, store } = setup();
    registry.reorderActiveScene('rings', 0);
    store.save(SOURCE);
    const saved = store.load();

    // A fresh session: the source has been replayed, so the scene is back in its
    // written order. Restoring must then reinstate what the performer actually had.
    const fresh = createRegistry();
    fresh.stagePatch('wash', { draw: () => {} }, '', undefined);
    fresh.confirmPatch('wash');
    fresh.stagePatch('rings', { draw: () => {} }, '', undefined);
    fresh.confirmPatch('rings');
    fresh.defineScene('tunnel', ['wash', 'rings']);
    fresh.go('tunnel');

    createProjectStore({ registry: fresh, storage: fakeStorage() }).restoreComposition(saved);
    expect(fresh.activeOrder()).toEqual(['rings', 'wash']);
  });

  it('restores a tuned parameter value over the source default', () => {
    const { registry, store } = setup();
    registry.setParam('trail', 0.25);
    const saved = { ...store.load(), ...JSON.parse(JSON.stringify({})) };
    store.save(SOURCE);

    const fresh = createRegistry();
    fresh.declareParam('trail', 0.08, { min: 0, max: 0.3 }); // the source's default
    createProjectStore({ registry: fresh, storage: fakeStorage() }).restoreComposition(store.load());

    expect(fresh.listParams()[0].value).toBe(0.25);
    expect(saved).toBeDefined();
  });

  it('starts fresh rather than throwing on a corrupt or outdated save', () => {
    const registry = createRegistry();
    const storage = fakeStorage();
    storage.setItem('response.project.v1', '{ not json');
    expect(createProjectStore({ registry, storage }).load()).toBe(null);

    storage.setItem('response.project.v1', JSON.stringify({ schema: 99, source: 'x' }));
    expect(createProjectStore({ registry, storage }).load()).toBe(null);
  });

  it('does not throw when storage is unavailable', () => {
    const registry = createRegistry();
    const storage = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {},
    };
    const store = createProjectStore({ registry, storage });
    expect(store.load()).toBe(null);
    expect(store.save(SOURCE)).toBe(false);
  });
});

describe('D-02 export is human-readable', () => {
  it('writes the source as lines, not one escaped string', () => {
    const { store } = setup();
    const text = store.exportProject(SOURCE);

    expect(text).not.toContain('\\n');
    expect(JSON.parse(text).source).toEqual(SOURCE.split('\n'));
    expect(text.split('\n').length).toBeGreaterThan(10); // pretty-printed
  });

  it('includes scene definitions and configuration', () => {
    const { store } = setup();
    const data = JSON.parse(store.exportProject(SOURCE));

    expect(data.format).toBe('response-project');
    expect(data.scenes.find((s) => s.name === 'tunnel').order.map((i) => i.id)).toEqual([
      'wash',
      'rings',
    ]);
    expect(data.safeScene).toBe('tunnel');
    expect(data.params[0].name).toBe('trail');
    expect(Date.parse(data.exportedAt)).not.toBeNaN();
  });
});

describe('D-03 import parsing is separate from running', () => {
  it('round-trips an exported project', () => {
    const { store } = setup();
    const parsed = store.parseProject(store.exportProject(SOURCE));

    expect(parsed.ok).toBe(true);
    expect(parsed.data.source).toBe(SOURCE);
    expect(parsed.data.scenes.find((s) => s.name === 'tunnel').order.map((i) => i.patch)).toEqual([
      'wash',
      'rings',
    ]);
    expect(parsed.data.safeScene).toBe('tunnel');
  });

  it('rejects files that are not Response projects', () => {
    const { store } = setup();
    expect(store.parseProject('not json at all').ok).toBe(false);
    expect(store.parseProject('{"hello":1}').error).toContain('Not a Response project');
    expect(
      store.parseProject(JSON.stringify({ format: 'response-project', schema: 99 })).error,
    ).toContain('format version 99');
    expect(
      store.parseProject(JSON.stringify({ format: 'response-project', schema: 1 })).error,
    ).toContain('no source');
  });

  it('parses without applying anything to the registry', () => {
    const { registry, store } = setup();
    const before = registry.listScenes();

    store.parseProject(
      JSON.stringify({
        format: 'response-project',
        schema: 1,
        source: ['patch("evil", () => {});'],
        scenes: [{ name: 'evil', order: ['evil'] }],
      }),
    );

    // Nothing may change until the performer has confirmed (D-03).
    expect(registry.listScenes()).toEqual(before);
    expect(registry.hasPatch('evil')).toBe(false);
  });
});
