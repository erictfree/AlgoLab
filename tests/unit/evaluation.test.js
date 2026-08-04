// The safety requirements, PRD §11 "Safety and recovery".
//
// These are the tests that matter most: every one of them describes a way a live
// performance could be ruined, and asserts that it isn't.

import { describe, it, expect } from 'vitest';
import { createTestHost } from './helpers.js';

const RINGS_V1 = 'patch("rings", ({ state }) => { state.n = (state.n || 0) + 1; });';

describe('S-01 a syntax error never replaces a valid active patch', () => {
  it('rejects before anything is staged', () => {
    const h = createTestHost();
    h.evaluator.evaluate(RINGS_V1);
    h.frame(2);
    const good = h.registry.getPatch('rings').definition.draw;

    const result = h.evaluator.evaluate('patch("rings", ({state}) => { this is not js (((');
    h.frame(2);

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('syntax');
    expect(h.registry.getPatch('rings').definition.draw).toBe(good);
    expect(h.registry.getPatch('rings').version).toBe(1);
  });

  it('survives a hundred consecutive syntax errors (§15 reliability)', () => {
    const h = createTestHost();
    h.evaluator.evaluate(RINGS_V1);
    h.frame(2);
    const good = h.registry.getPatch('rings').definition.draw;

    for (let i = 0; i < 100; i++) {
      h.evaluator.evaluate(`patch("rings", ( { ${i} !!! `);
      h.frame();
    }

    expect(h.registry.getPatch('rings').definition.draw).toBe(good);
    expect(h.stateStore.get('rings').n).toBeGreaterThan(100);
  });
});

describe('S-02 a registration error never replaces a valid active patch', () => {
  it('rejects a patch with no draw function', () => {
    const h = createTestHost();
    h.evaluator.evaluate(RINGS_V1);
    h.frame(2);

    const result = h.evaluator.evaluate('patch("rings", { state: () => ({}) });');
    h.frame(2);

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('registration');
    expect(h.registry.getPatch('rings').version).toBe(1);
  });

  it('rejects a scene that names an undefined patch', () => {
    const h = createTestHost();
    h.evaluator.evaluate(RINGS_V1);
    h.frame(2);

    const result = h.evaluator.evaluate('scene("x", ["rings", "ghost"]); go("x");');

    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('ghost');
    expect(h.registry.listScenes().some((s) => s.name === 'x')).toBe(false);
  });

  it('discards a block that throws halfway through its registrations', () => {
    const h = createTestHost();
    h.evaluator.evaluate(RINGS_V1);
    h.frame(2);

    // "wash" registers, then the block throws — neither may reach the registry.
    const result = h.evaluator.evaluate(
      'patch("wash", () => {}); throw new Error("boom"); patch("rings", () => {});',
    );
    h.frame(2);

    expect(result.ok).toBe(false);
    expect(h.registry.hasPatch('wash')).toBe(false);
    expect(h.registry.getPatch('rings').version).toBe(1);
  });
});

describe('S-03 a first-frame runtime error restores the previous version', () => {
  it('restores both the previous draw function and the pre-candidate state', () => {
    const h = createTestHost();
    h.evaluator.evaluate(RINGS_V1);
    h.frame(20);
    const good = h.registry.getPatch('rings').definition.draw;
    const countBefore = h.stateStore.get('rings').n;

    h.evaluator.evaluate('patch("rings", ({ state }) => { state.n = 9999; missing.boom(); });');
    // Frame 1: the old code draws, then the candidate is spliced in at the boundary.
    // Frame 2: the candidate runs, throws, and is rolled back along with its state.
    h.frame(2);

    const record = h.registry.getPatch('rings');
    expect(record.definition.draw).toBe(good);
    expect(record.version).toBe(1);
    expect(record.lastError.message).toContain('missing');
    // The failed version mutated state before throwing; the snapshot undoes it.
    expect(h.stateStore.get('rings').n).toBe(countBefore);
  });

  it('never files a failed version in history (S-05 says successful versions)', () => {
    const h = createTestHost();
    h.evaluator.evaluate(RINGS_V1);
    h.frame(2);
    h.evaluator.evaluate('patch("rings", () => { missing.boom(); });');
    h.frame(3);

    expect(h.registry.getPatch('rings').history).toHaveLength(1);
    expect(h.registry.getPatch('rings').history[0].version).toBe(1);
  });
});

describe('S-04 one failing patch does not stop the others', () => {
  it('keeps drawing the rest of the scene, every frame', () => {
    const h = createTestHost();
    h.evaluator.evaluate(`
      patch("wash", ({ state }) => { state.n = (state.n || 0) + 1; });
      patch("broken", () => { throw new Error("always"); });
      patch("rings", ({ state }) => { state.n = (state.n || 0) + 1; });
      scene("s", ["wash", "broken", "rings"]);
      go("s");
    `);
    h.frame(2);
    // "broken" survives its own first frame only because the candidate check runs
    // before it throws — so force it past that: it is committed and failing.
    h.frame(30);

    expect(h.stateStore.get('wash').n).toBeGreaterThan(25);
    expect(h.stateStore.get('rings').n).toBeGreaterThan(25);
    expect(h.registry.getPatch('broken').status).toBe('failed');
  });

  it('throttles a patch that throws every frame instead of flooding messages', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("broken", () => { throw new Error("always"); });');
    h.frame(400);

    const errors = h.diagnostics.list().filter((d) => d.level === 'error');
    expect(errors.length).toBeLessThan(10);
  });

  it('leaves p5 push/pop balanced when a patch throws', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("broken", () => { throw new Error("always"); });');
    h.frame(10);

    expect(h.drawing.depth).toBe(0);
  });
});

describe('S-05 version history and reversion', () => {
  it('keeps at least ten successful versions and reverts to a chosen one', () => {
    const h = createTestHost();
    for (let i = 1; i <= 12; i++) {
      h.evaluator.evaluate(`patch("rings", ({ state }) => { state.mark = ${i}; });`);
      h.frame(2);
    }
    const record = h.registry.getPatch('rings');
    expect(record.version).toBe(12);
    expect(record.history.length).toBeGreaterThanOrEqual(10);

    h.evaluator.revert('rings', 5);
    h.frame(3);

    expect(h.registry.getPatch('rings').version).toBe(13);
    expect(h.registry.getPatch('rings').source).toContain('state.mark = 5');
    expect(h.stateStore.get('rings').mark).toBe(5);
  });
});

describe('R-03 / L-02 replacement is scoped and lands at a frame boundary', () => {
  it('does not re-evaluate or reset unrelated patches', () => {
    const h = createTestHost();
    h.evaluator.evaluate(`
      patch("wash", { state: () => ({ born: 1 }), draw: ({ state }) => { state.n = (state.n||0)+1; } });
      patch("rings", () => {});
    `);
    h.frame(10);
    const washState = h.stateStore.get('wash');
    const washVersion = h.registry.getPatch('wash').version;

    h.evaluator.evaluate('patch("rings", () => {});');
    h.frame(3);

    expect(h.stateStore.get('wash')).toBe(washState); // same object, untouched
    expect(h.registry.getPatch('wash').version).toBe(washVersion);
  });

  it('does not swap the definition mid-frame', () => {
    const h = createTestHost();
    h.evaluator.evaluate('patch("rings", () => {});');
    h.frame(2);
    const before = h.registry.getPatch('rings').definition.draw;

    h.evaluator.evaluate('patch("rings", () => {});');
    // Queued, but no frame has ended yet.
    expect(h.registry.getPatch('rings').definition.draw).toBe(before);

    h.frame(1);
    expect(h.registry.getPatch('rings').definition.draw).not.toBe(before);
  });
});
