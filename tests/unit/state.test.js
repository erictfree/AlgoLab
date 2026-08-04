// PRD §7 "State has an identity" — L-03 and L-04.
//
// A patch's code may change while its state persists. State belongs to the patch
// name, not to one compiled function body.

import { describe, it, expect } from 'vitest';
import { createTestHost } from './helpers.js';

describe('L-03 replacing a patch preserves compatible state', () => {
  it('hands the new code the same state object', () => {
    const h = createTestHost();
    h.evaluator.evaluate(`
      patch("orbiters", {
        state: () => ({ angle: 0, trail: [] }),
        draw: ({ state }) => { state.angle += 0.1; state.trail.push(state.angle); },
      });
    `);
    h.frame(30);

    const trailLength = h.stateStore.get('orbiters').trail.length;
    expect(trailLength).toBeGreaterThan(20);

    // Same name, different logic, different state() factory — state must not reset.
    h.evaluator.evaluate(`
      patch("orbiters", {
        state: () => ({ angle: 999, trail: ["WRONG"] }),
        draw: ({ state }) => { state.angle += 1; },
      });
    `);
    // The replacement lands at a frame boundary (R-03), so the old code draws once
    // more before the new code takes over. Measure after that has happened.
    h.frame(2);
    const settled = h.stateStore.get('orbiters').trail.length;
    h.frame(10);

    const state = h.stateStore.get('orbiters');
    expect(settled).toBeGreaterThanOrEqual(trailLength); // nothing was discarded
    expect(state.trail.length).toBe(settled); // the new code does not push
    expect(state.trail[0]).not.toBe('WRONG'); // the new factory never ran
  });

  it('runs state() exactly once, when the name first appears', () => {
    const h = createTestHost();
    let calls = 0;
    globalThis.__countStateCalls = () => {
      calls++;
      return { v: calls };
    };

    h.evaluator.evaluate('patch("p", { state: () => __countStateCalls(), draw: () => {} });');
    h.frame(3);
    h.evaluator.evaluate('patch("p", { state: () => __countStateCalls(), draw: () => {} });');
    h.frame(3);

    expect(calls).toBe(1);
    delete globalThis.__countStateCalls;
  });
});

describe('L-04 explicit reset', () => {
  it('resetPatch re-runs the factory', () => {
    const h = createTestHost();
    h.evaluator.evaluate(`
      patch("orbiters", {
        state: () => ({ trail: [] }),
        draw: ({ state }) => { state.trail.push(1); },
      });
    `);
    h.frame(20);
    expect(h.stateStore.get('orbiters').trail.length).toBeGreaterThan(10);

    h.evaluator.evaluate('resetPatch("orbiters");');
    h.frame(1);

    expect(h.stateStore.get('orbiters').trail).toEqual([]);
  });
});

describe('§13.4 state compatibility', () => {
  it('reports state that cannot be snapshotted instead of crashing', () => {
    const h = createTestHost();
    h.evaluator.evaluate(`
      patch("bad", { state: () => ({ fn: () => {} }), draw: () => {} });
    `);
    h.frame(3);

    // Replacing it forces a snapshot attempt; a function is not structured-cloneable.
    h.evaluator.evaluate('patch("bad", () => {});');
    h.frame(3);

    const warnings = h.diagnostics.list().filter((d) => d.level === 'warn');
    expect(warnings.some((w) => w.message.includes('could not be snapshotted'))).toBe(true);
    // ...and the replacement still went through.
    expect(h.registry.getPatch('bad').version).toBe(2);
  });

  it('falls back to an empty object when state() throws', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("p", { state: () => { throw new Error("nope"); }, draw: () => {} });');
    h.frame(3);

    expect(h.stateStore.get('p')).toEqual({});
    expect(h.registry.getPatch('p').status).toBe('ok');
  });
});

describe('L-05 / L-06 scenes', () => {
  it('activates a named scene and draws in layer order', () => {
    const h = createTestHost();
    const order = [];
    globalThis.__order = order;
    h.evaluator.evaluate(`
      patch("a", () => __order.push("a"));
      patch("b", () => __order.push("b"));
      scene("s", ["a", "b"]);
      go("s");
    `);
    h.frame(2);
    order.length = 0;
    h.frame(1);
    expect(order).toEqual(['a', 'b']);

    h.registry.reorderActiveScene('a', 1);
    order.length = 0;
    h.frame(1);
    expect(order).toEqual(['b', 'a']);
    delete globalThis.__order;
  });

  it('changes membership while running without touching implementations', () => {
    const h = createTestHost();
    h.evaluator.evaluate(`
      patch("a", ({ state }) => { state.n = (state.n||0)+1; });
      patch("b", ({ state }) => { state.n = (state.n||0)+1; });
      scene("s", ["a", "b"]);
      go("s");
    `);
    h.frame(10);
    const bVersion = h.registry.getPatch('b').version;

    h.evaluator.evaluate('remove("b");');
    h.frame(10);
    const bCount = h.stateStore.get('b').n;
    h.frame(10);

    expect(h.stateStore.get('b').n).toBe(bCount); // no longer drawn
    expect(h.registry.getPatch('b').version).toBe(bVersion); // but still registered
    expect(h.stateStore.get('a').n).toBeGreaterThan(25);

    h.evaluator.evaluate('add("b");');
    h.frame(10);
    expect(h.stateStore.get('b').n).toBeGreaterThan(bCount);
  });

  it('runs enter once per activation and exit on departure (L-07)', () => {
    const h = createTestHost();
    const log = [];
    globalThis.__log = log;
    h.evaluator.evaluate(`
      patch("a", { enter: () => __log.push("enter"), exit: () => __log.push("exit"), draw: () => {} });
    `);
    h.frame(5);
    expect(log.filter((e) => e === 'enter')).toHaveLength(1);

    h.evaluator.evaluate('remove("a");');
    h.frame(3);
    expect(log).toContain('exit');
    delete globalThis.__log;
  });

  it('fires beat on a frame where the audio snapshot says so', () => {
    const h = createTestHost();
    const log = [];
    globalThis.__beats = log;
    h.evaluator.evaluate('patch("a", { beat: () => __beats.push(1), draw: () => {} });');
    h.frame(3, { beat: false });
    expect(log).toHaveLength(0);
    h.frame(1, { beat: true });
    expect(log).toHaveLength(1);
    delete globalThis.__beats;
  });
});

describe('a new patch becomes visible without composing a scene by hand', () => {
  it('joins the running scene on first registration', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("first", () => {});');
    h.frame(2);
    expect(h.registry.activeOrder()).toContain('first');

    // Re-evaluating never re-adds a patch the performer deliberately removed.
    h.evaluator.evaluate('remove("first");');
    h.frame(2);
    h.evaluator.evaluate('patch("first", () => {});');
    h.frame(2);
    expect(h.registry.activeOrder()).not.toContain('first');
  });

  it('defers to explicit composition in the same block', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("wash", () => {}); scene("calm", ["wash"]); go("calm");');
    h.frame(3);

    // This block composes "chaos" into its own scene, so the convenience auto-add
    // must not also append it to whatever scene happens to be running.
    h.evaluator.evaluate('patch("chaos", () => {}); scene("wild", ["chaos"]); go("wild");');
    h.frame(3);

    expect(h.registry.activeOrder()).toEqual(['chaos']);
    expect(h.registry.listScenes().find((s) => s.name === 'calm').order).toEqual(['wash']);
  });
});
