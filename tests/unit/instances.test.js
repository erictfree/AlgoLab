// Multiple copies of one patch in a scene.
//
// The rule that makes this work: the FIRST instance of a patch uses the bare patch
// name as its id, so a scene using each patch once behaves exactly as it did before
// instances existed. Extra copies are `swarm#2`, `swarm#3`, and each has its own
// state and its own config.

import { describe, it, expect } from 'vitest';
import { createTestHost } from './helpers.js';

const COUNTER = 'patch("c", ({ state }) => { state.n = (state.n || 0) + 1; });';

describe('adding copies', () => {
  it('numbers instances, with the first taking the bare patch name', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual(['c']);

    h.evaluator.evaluate('add("c"); add("c");');
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual(['c', 'c#2', 'c#3']);
  });

  it('gives every copy its own state', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(10);
    h.evaluator.evaluate('add("c");');
    h.frame(10);

    // The second copy started ten frames later, so it must be behind — which it can
    // only be if it is counting in its own object.
    expect(h.stateStore.get('c').n).toBeGreaterThan(h.stateStore.get('c#2').n);
    expect(h.stateStore.get('c')).not.toBe(h.stateStore.get('c#2'));
  });

  it('draws every copy, in scene order', () => {
    const h = createTestHost();
    const drawn = [];
    globalThis.__drawn = drawn;
    h.evaluator.evaluate('patch("c", ({ config }) => __drawn.push(config.tag ?? "base"));');
    h.frame(2);
    h.evaluator.evaluate('add("c", { tag: "second" }); add("c", { tag: "third" });');
    h.frame(2);

    drawn.length = 0;
    h.frame(1);
    expect(drawn).toEqual(['base', 'second', 'third']);
    delete globalThis.__drawn;
  });

  it('supports duplicates directly in a scene definition', () => {
    const h = createTestHost();
    h.evaluator.evaluate(`
      patch("a", () => {});
      patch("b", () => {});
      scene("s", ["a", "b", "a", { patch: "b", config: { x: 1 } }]);
      go("s");
    `);
    h.frame(3);
    expect(h.registry.activeOrder()).toEqual(['a', 'b', 'a#2', 'b#2']);
    expect(h.registry.getInstance('b#2').config).toEqual({ x: 1 });
  });

  it('does not stack copies when a patch is merely re-evaluated', () => {
    const h = createTestHost();
    for (let i = 0; i < 5; i++) {
      h.evaluator.evaluate(COUNTER);
      h.frame(2);
    }
    expect(h.registry.activeOrder()).toEqual(['c']);
  });
});

describe('per-instance config', () => {
  it('hands each copy its own config object', () => {
    const h = createTestHost();
    const seen = [];
    globalThis.__cfg = seen;
    h.evaluator.evaluate('patch("c", ({ config }) => __cfg.push(config.hue));');
    h.frame(2);
    h.evaluator.evaluate('add("c", { hue: 40 }); add("c", { hue: 300 });');
    h.frame(2);

    seen.length = 0;
    h.frame(1);
    expect(seen).toEqual([undefined, 40, 300]);
    delete globalThis.__cfg;
  });

  it('can be changed live without disturbing state', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("c", ({ state }) => { state.n = (state.n || 0) + 1; });');
    h.frame(10);
    const state = h.stateStore.get('c');

    h.registry.configureInstance('c', { hue: 99 });
    h.frame(5);

    expect(h.registry.getInstance('c').config).toEqual({ hue: 99 });
    expect(h.stateStore.get('c')).toBe(state);
  });
});

describe('removing copies', () => {
  it('peels off the last copy, mirroring add', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(2);
    h.evaluator.evaluate('add("c"); add("c");');
    h.frame(2);

    h.evaluator.evaluate('remove("c");');
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual(['c', 'c#2']);

    h.evaluator.evaluate('remove("c");');
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual(['c']);
  });

  it('removes a specific copy by instance id', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(2);
    h.evaluator.evaluate('add("c"); add("c");');
    h.frame(2);

    h.evaluator.evaluate('remove("c#2");');
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual(['c', 'c#3']);
  });

  it('removes every copy with removeAll', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(2);
    h.evaluator.evaluate('add("c"); add("c");');
    h.frame(2);

    h.evaluator.evaluate('removeAll("c");');
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual([]);
    // Still registered, and its state is still there — removed from the scene is not
    // the same as deleted.
    expect(h.registry.hasPatch('c')).toBe(true);
    expect(h.stateStore.get('c')).toBeDefined();
  });

  it('reuses a freed id rather than climbing forever', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(2);
    h.evaluator.evaluate('add("c");');
    h.frame(2);
    h.evaluator.evaluate('remove("c#2");');
    h.frame(2);
    h.evaluator.evaluate('add("c");');
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual(['c', 'c#2']);
  });
});

describe('lifecycle is per instance', () => {
  it('runs enter and exit once for each copy', () => {
    const h = createTestHost();
    const log = [];
    globalThis.__life = log;
    h.evaluator.evaluate(`
      patch("c", {
        enter: ({ config }) => __life.push("enter:" + (config.tag ?? "base")),
        exit: ({ config }) => __life.push("exit"),
        draw: () => {},
      });
    `);
    h.frame(3);
    h.evaluator.evaluate('add("c", { tag: "two" });');
    h.frame(3);
    expect(log).toEqual(['enter:base', 'enter:two']);

    h.evaluator.evaluate('remove("c#2");');
    h.frame(3);
    expect(log.filter((e) => e === 'exit')).toHaveLength(1);
    expect(h.registry.activeOrder()).toEqual(['c']);
    delete globalThis.__life;
  });

  it('fires beat for every copy', () => {
    const h = createTestHost();
    let beats = 0;
    globalThis.__beat = () => beats++;
    h.evaluator.evaluate('patch("c", { beat: () => __beat(), draw: () => {} });');
    h.frame(2);
    h.evaluator.evaluate('add("c"); add("c");');
    h.frame(2);

    beats = 0;
    h.frame(1, { beat: true });
    expect(beats).toBe(3);
    delete globalThis.__beat;
  });
});

describe('replacing a patch that has copies', () => {
  it('replaces the behavior of every copy at once', () => {
    const h = createTestHost();
    const drawn = [];
    globalThis.__v = drawn;
    h.evaluator.evaluate('patch("c", () => __v.push(1));');
    h.frame(2);
    h.evaluator.evaluate('add("c");');
    h.frame(2);

    h.evaluator.evaluate('patch("c", () => __v.push(2));');
    h.frame(3);
    drawn.length = 0;
    h.frame(1);
    expect(drawn).toEqual([2, 2]);
    delete globalThis.__v;
  });

  it('preserves every copy’s state across the replacement (L-03)', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(20);
    h.evaluator.evaluate('add("c");');
    h.frame(20);

    const before = { one: h.stateStore.get('c').n, two: h.stateStore.get('c#2').n };
    h.evaluator.evaluate('patch("c", ({ state }) => { state.n = (state.n || 0) + 1; state.v2 = true; });');
    h.frame(3);

    expect(h.stateStore.get('c').n).toBeGreaterThanOrEqual(before.one);
    expect(h.stateStore.get('c#2').n).toBeGreaterThanOrEqual(before.two);
    expect(h.stateStore.get('c').n).not.toBe(h.stateStore.get('c#2').n);
  });

  it('rolls back every copy’s state when the new version throws (S-03)', () => {
    const h = createTestHost();
    h.evaluator.evaluate(COUNTER);
    h.frame(20);
    h.evaluator.evaluate('add("c");');
    h.frame(20);
    const before = { one: h.stateStore.get('c').n, two: h.stateStore.get('c#2').n };

    // The bad version wrecks state before throwing, and only the first copy gets to
    // run before the rollback — so the second copy's state proves the rollback covers
    // instances that never even executed.
    h.evaluator.evaluate('patch("c", ({ state }) => { state.n = -999; missing.boom(); });');
    h.frame(2);

    expect(h.registry.getPatch('c').version).toBe(1);
    expect(h.stateStore.get('c').n).toBe(before.one);
    // `c` is drawn first, so the rollback lands mid-frame: by the time `c#2` is
    // reached the previous version is already restored, and it draws once with it.
    // Hence +1 — and crucially not -999, which is what it would be if the rollback
    // had only covered the copy that actually threw.
    expect(h.stateStore.get('c#2').n).toBe(before.two + 1);
  });

  it('resets every copy with resetPatch (L-04)', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("c", { state: () => ({ n: 0 }), draw: ({ state }) => { state.n++; } });');
    h.frame(10);
    h.evaluator.evaluate('add("c");');
    h.frame(10);
    expect(h.stateStore.get('c').n).toBeGreaterThan(10);

    h.evaluator.evaluate('resetPatch("c");');
    h.frame(1);
    expect(h.stateStore.get('c').n).toBeLessThanOrEqual(1);
    expect(h.stateStore.get('c#2').n).toBeLessThanOrEqual(1);
  });
});

describe('naming', () => {
  it('refuses "#" in a patch name, since it separates instance numbers', () => {
    const h = createTestHost();
    const result = h.evaluator.evaluate('patch("a#2", () => {});');
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('#');
    expect(h.registry.hasPatch('a#2')).toBe(false);
  });
});
