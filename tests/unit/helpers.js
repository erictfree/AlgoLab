// Shared fixture: a complete host with drawing stubbed out.
//
// Everything under src/host and src/audio/features is deliberately free of p5 and the
// DOM, which is what lets the interesting logic — rollback, state identity, history —
// be tested in plain Node instead of a browser.

import { createDiagnostics } from '../../src/host/diagnostics.js';
import { createRegistry } from '../../src/host/registry.js';
import { createStateStore } from '../../src/host/stateStore.js';
import { createEvaluator } from '../../src/host/evaluator.js';
import { createHostLoop } from '../../src/host/hostLoop.js';

export function createTestHost() {
  const diagnostics = createDiagnostics();
  const registry = createRegistry();
  const stateStore = createStateStore({ diagnostics });
  const evaluator = createEvaluator({ registry, stateStore, diagnostics });

  const drawing = {
    depth: 0,
    push() {
      this.depth++;
    },
    pop() {
      this.depth--;
    },
    resetDefaults() {},
  };

  let clock = 0;
  const host = createHostLoop({
    registry,
    stateStore,
    evaluator,
    diagnostics,
    drawing,
    now: () => clock,
  });

  /** Run whole frames, exactly as src/main.js does. */
  function frame(count = 1, audio = { beat: false }) {
    for (let i = 0; i < count; i++) {
      clock += 1 / 60;
      const ctx = host.beginFrame(audio);
      for (const name of registry.activeOrder()) host.drawPatch(name, ctx);
      host.commitPendingChanges();
    }
  }

  return { diagnostics, registry, stateStore, evaluator, host, drawing, frame };
}

/** Messages the performer would see, newest first. */
export const messages = (diagnostics) => diagnostics.list().map((d) => `${d.level}: ${d.message}`);
