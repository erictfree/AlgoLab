// Diagnostics — the performer's channel, and only the performer's.
//
// PRD §10.5 / P-01: when an evaluation fails, the message belongs in the performer
// chrome. It must never be drawn onto the canvas, because the canvas is what the
// audience is watching. Nothing in this module touches the p5 canvas.
//
// Entries are held in a bounded ring so a long set cannot grow host memory without
// limit (§15, soak test).

const DEFAULT_LIMIT = 200;

/**
 * @typedef {'info'|'success'|'warn'|'error'} DiagnosticLevel
 * @typedef {{ id: number, level: DiagnosticLevel, message: string, detail?: string, at: number }} Diagnostic
 */

export function createDiagnostics({ limit = DEFAULT_LIMIT } = {}) {
  /** @type {Diagnostic[]} */
  const entries = [];
  const listeners = new Set();
  let nextId = 1;

  /**
   * @param {DiagnosticLevel} level
   * @param {string} message
   * @param {string} [detail]
   */
  function emit(level, message, detail) {
    const entry = { id: nextId++, level, message, detail, at: Date.now() };
    entries.unshift(entry);
    if (entries.length > limit) entries.length = limit;
    for (const listener of listeners) listener(entry, entries);
    return entry;
  }

  return {
    emit,
    info: (message, detail) => emit('info', message, detail),
    success: (message, detail) => emit('success', message, detail),
    warn: (message, detail) => emit('warn', message, detail),
    error: (message, detail) => emit('error', message, detail),

    /** Latest first. */
    list: () => entries.slice(),
    latest: () => entries[0] ?? null,
    clear() {
      entries.length = 0;
      for (const listener of listeners) listener(null, entries);
    },

    /** @param {(entry: Diagnostic|null, all: Diagnostic[]) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
