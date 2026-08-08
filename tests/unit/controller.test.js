import { describe, it, expect } from 'vitest';
import { createAppController } from '../../src/app/controller.js';
import { createTestHost } from './helpers.js';

function setup() {
  const runtime = createTestHost();
  const audio = { status: () => ({ source: 'none', contextState: 'running' }) };
  const controller = createAppController({ ...runtime, audio });
  return { ...runtime, controller };
}

describe('application controller boundary', () => {
  it('projects the runtime into data-only view snapshots', () => {
    const h = setup();
    h.evaluator.evaluate(`
      const rings = { draw() {} };
      const show = [rings, rings];
      go(show);
    `);
    h.frame(2);

    const snapshot = h.controller.snapshot();
    expect(snapshot.scene).toEqual({
      name: 'show',
      order: [
        { id: 'rings', strategy: 'rings' },
        { id: 'rings#2', strategy: 'rings' },
      ],
    });
    expect(snapshot.strategies[0]).toMatchObject({ name: 'rings', version: 1, copies: 2 });
    expect(snapshot.strategies[0]).not.toHaveProperty('definition');
    expect(snapshot).not.toHaveProperty('registry');
    expect(Object.isFrozen(snapshot)).toBe(true);
    h.controller.dispose();
  });

  it('reports source-installed patches even when their evaluation failed', () => {
    const h = setup();
    h.controller.setSourceProvider(() => `// %% patch broken
const broken = { draw() { ((( } };`);

    expect(h.controller.snapshot()).toMatchObject({
      installedPatches: ['broken'],
      strategies: [],
    });
    h.controller.dispose();
  });

  it('describes public function, object, and class interfaces without exposing or invoking them', () => {
    const h = setup();
    h.evaluator.evaluate(`
      // %% strategy examples
      const wash = ({ audio }) => {};
      const rings = {
        count: 4,
        spacing: 34,
        colours: [255, 90, 180],
        get dangerous() { throw new Error('the reference invoked a getter'); },
        addRings(amount) { this.count += amount; },
        diameter(index, audio) { return index + audio.bass; },
        draw({ audio }) {},
      };
      class Orbiters {
        #secret = 42;
        constructor() { this.colour = [120, 200, 255, 90]; }
        state() { return {}; }
        nextPosition(audio, state, dt) {}
        draw({ audio, state, dt }) {}
      }
      const orbiters = new Orbiters();
      const show = [wash, rings, orbiters];
      go(show);
    `);
    h.frame(2);

    const snapshot = h.controller.snapshot();
    const byName = Object.fromEntries(snapshot.strategies.map((entry) => [entry.name, entry]));

    expect(byName.wash.reference).toMatchObject({
      kind: 'function',
      lifecycle: ['draw({ audio })'],
    });
    expect(byName.rings.reference).toEqual({
      kind: 'object',
      className: null,
      properties: [
        { name: 'count', value: '4' },
        { name: 'spacing', value: '34' },
        { name: 'colours', value: '[255, 90, 180]' },
        { name: 'dangerous', value: '[getter]' },
      ],
      methods: ['addRings(amount)', 'diameter(index, audio)'],
      lifecycle: ['draw({ audio })'],
    });
    expect(byName.orbiters.reference).toEqual({
      kind: 'class',
      className: 'Orbiters',
      properties: [{ name: 'colour', value: '[120, 200, 255, 90]' }],
      methods: ['nextPosition(audio, state, dt)'],
      lifecycle: ['state()', 'draw({ audio, state, dt })'],
    });
    expect(JSON.stringify(snapshot)).not.toContain('#secret');
    h.controller.dispose();
  });

  it('dispatches reset, parameter, safe-scene, and panic actions', () => {
    const h = setup();
    h.evaluator.evaluate(`
      const counter = {
        state() { return { n: 0 }; },
        draw({ state }) { state.n++; },
      };
      const safe = [counter];
      const empty = [];
      go(empty);
      go(safe);
      param("speed", 1, { min: 0, max: 2 });
    `);
    h.frame(8);

    expect(h.controller.actions.setSafeScene()).toBe('safe');
    h.controller.actions.setParam('speed', 1.5);
    h.controller.actions.resetStrategy('counter');
    expect(h.stateStore.get('counter').n).toBe(0);

    h.evaluator.evaluate('go(empty);');
    h.frame(2);
    expect(h.registry.activeSceneName()).toBe('empty');
    expect(h.controller.actions.panic()).toBe('safe');
    // Recovery now restores the parameter value captured with the safe state,
    // rather than only switching back to a scene name.
    expect(h.controller.snapshot().params[0].value).toBe(1);
    h.controller.dispose();
  });

  it('captures and restores a complete safe state without overwriting it on failure', () => {
    const h = setup();
    let source = `
      const counter = {
        state() { return { n: 0 }; },
        draw({ state }) { state.n++; state.version = 1; },
      };
      const trusted = [counter];
      go(trusted);
      param("speed", 1, { min: 0, max: 4 });
    `;
    h.controller.setSourceProvider(() => source);
    h.evaluator.evaluate(source);
    h.frame(8);
    h.controller.actions.setParam('speed', 2.5);
    const safeCount = h.stateStore.get('counter').n;
    const captured = h.controller.actions.setSafeState();

    expect(captured.ok).toBe(true);
    expect(h.controller.snapshot().safeState.dirty).toBe(false);

    source = `
      const counter = { draw({ state }) { state.version = 2; } };
      const empty = [];
      go(empty);
      param("speed", 0);
    `;
    h.controller.sourceChanged();
    h.evaluator.evaluate(source);
    h.frame(3);
    h.controller.actions.setParam('speed', 0.25);
    expect(h.controller.snapshot().safeState.dirty).toBe(true);

    const failed = h.evaluator.evaluate('class Counter { draw() { ((( } }');
    expect(failed.ok).toBe(false);
    expect(h.controller.snapshot().safeState.createdAt).toBe(captured.createdAt);

    const restored = h.controller.actions.restoreSafeState();
    source = restored.source;
    h.controller.sourceChanged();

    expect(restored.ok).toBe(true);
    expect(h.registry.activeSceneName()).toBe('trusted');
    expect(h.registry.activeOrder()).toEqual(['counter']);
    expect(h.registry.getStrategy('counter').version).toBe(1);
    expect(h.registry.getStrategy('counter').source).toContain('state.version = 1');
    expect(h.registry.listParams()[0].value).toBe(2.5);
    expect(h.stateStore.get('counter').n).toBe(safeCount);
    expect(h.controller.snapshot().safeState.dirty).toBe(false);
    h.controller.dispose();
  });

  it('notifies views without handing them model objects', () => {
    const h = setup();
    const received = [];
    const unsubscribe = h.controller.subscribe((snapshot) => received.push(snapshot));

    h.evaluator.evaluate('const idle = { draw() {} };');
    h.frame(2);

    expect(received.length).toBeGreaterThan(0);
    expect(received.at(-1).strategies[0].name).toBe('idle');
    expect(received.at(-1).strategies[0]).not.toHaveProperty('definition');
    unsubscribe();
    h.controller.dispose();
  });
});
