// P1 safety and performance requirements: S-06, S-07, P-05.

import { describe, it, expect } from 'vitest';
import { createTestHost } from './helpers.js';

const TWO_SCENES = `
  patch("safe", ({ state }) => { state.n = (state.n || 0) + 1; });
  patch("wild", ({ state }) => { state.n = (state.n || 0) + 1; });
  scene("calm", ["safe"]);
  scene("chaos", ["safe", "wild"]);
  go("calm");
`;

describe('S-06 / P-05 safe scene and panic', () => {
  it('returns to the designated scene in one action', () => {
    const h = createTestHost();
    h.evaluator.evaluate(TWO_SCENES);
    h.frame(3);

    h.registry.setSafeScene(); // marks "calm", the active scene
    h.evaluator.evaluate('go("chaos");');
    h.frame(3);
    expect(h.registry.activeOrder()).toEqual(['safe', 'wild']);

    expect(h.registry.panic()).toBe('calm');
    h.frame(2);
    expect(h.registry.activeOrder()).toEqual(['safe']);
  });

  it('does nothing at all beyond changing scene', () => {
    const h = createTestHost();
    h.evaluator.evaluate(TWO_SCENES);
    h.frame(20);
    h.registry.setSafeScene();
    h.evaluator.evaluate('go("chaos");');
    h.frame(20);

    const safeState = h.stateStore.get('safe');
    const wildCount = h.stateStore.get('wild').n;
    const safeVersion = h.registry.getPatch('safe').version;

    h.registry.panic();
    h.frame(5);

    // Panic must not reset state, bump versions, or re-evaluate anything — the
    // performer has to be able to predict exactly what it does mid-show.
    expect(h.stateStore.get('safe')).toBe(safeState);
    expect(h.stateStore.get('wild').n).toBe(wildCount);
    expect(h.registry.getPatch('safe').version).toBe(safeVersion);
  });

  it('reports rather than throws when no safe scene has been set', () => {
    const h = createTestHost();
    h.evaluator.evaluate(TWO_SCENES);
    h.frame(3);
    expect(h.registry.safeSceneName()).toBe(null);
    expect(h.registry.panic()).toBe(null);
  });

  it('refuses to designate a scene that does not exist', () => {
    const h = createTestHost();
    h.evaluator.evaluate(TWO_SCENES);
    h.frame(3);
    expect(h.registry.setSafeScene('nope')).toBe(null);
    expect(h.registry.safeSceneName()).toBe(null);
  });
});

describe('S-07 frame rate warning', () => {
  it('warns only after the frame rate stays low for five seconds', () => {
    const h = createTestHost({ fpsThreshold: 30 });
    h.evaluator.evaluate('patch("a", () => {});');

    // 10 FPS. The window has to fill before any judgment is made.
    h.frame(60, { beat: false }, 1 / 10);
    expect(warnings(h)).toHaveLength(0);

    // Three more seconds at 10 FPS — still under the five-second threshold.
    h.frame(30, { beat: false }, 1 / 10);
    expect(warnings(h)).toHaveLength(0);

    // Past five seconds.
    h.frame(30, { beat: false }, 1 / 10);
    expect(warnings(h)).toHaveLength(1);
    expect(warnings(h)[0].message).toContain('below 30 FPS');
  });

  it('warns once per episode, not once per frame', () => {
    const h = createTestHost({ fpsThreshold: 30 });
    h.evaluator.evaluate('patch("a", () => {});');
    h.frame(600, { beat: false }, 1 / 10);
    expect(warnings(h)).toHaveLength(1);
  });

  it('says so when the frame rate recovers', () => {
    const h = createTestHost({ fpsThreshold: 30 });
    h.evaluator.evaluate('patch("a", () => {});');
    h.frame(200, { beat: false }, 1 / 10);
    expect(warnings(h)).toHaveLength(1);

    h.frame(120, { beat: false }, 1 / 60);
    const recovered = h.diagnostics.list().filter((d) => d.message.includes('recovered'));
    expect(recovered).toHaveLength(1);
  });

  it('never warns at a healthy frame rate', () => {
    const h = createTestHost({ fpsThreshold: 30 });
    h.evaluator.evaluate('patch("a", () => {});');
    h.frame(1200);
    expect(warnings(h)).toHaveLength(0);
  });

  it('honours a changed threshold', () => {
    const h = createTestHost({ fpsThreshold: 30 });
    h.evaluator.evaluate('patch("a", () => {});');
    h.host.setFpsThreshold(120); // now 60 FPS counts as slow
    h.frame(500);
    expect(warnings(h)).toHaveLength(1);
  });
});

describe('S-08 dt is capped after a stall', () => {
  it('hands patches a bounded dt even after a long freeze', () => {
    const h = createTestHost();
    const seen = [];
    globalThis.__dt = seen;
    h.evaluator.evaluate('patch("a", ({ dt }) => __dt.push(dt));');
    h.frame(2);
    h.frame(1, { beat: false }, 30); // a thirty-second stall
    expect(Math.max(...seen)).toBeLessThanOrEqual(0.1);
    delete globalThis.__dt;
  });
});

const warnings = (h) => h.diagnostics.list().filter((d) => d.level === 'warn');
