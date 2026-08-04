// Performer chrome — PRD §10.1.
//
// Everything here is for the person performing, never for the audience (§10.5, P-01).
// Structural panels redraw when the registry changes; meters tick on a slow interval
// rather than every frame, because the draw loop's budget belongs to the visuals
// (§13.5), not to DOM updates.

const METER_HZ = 15;

export function createPanels({
  registry,
  stateStore,
  diagnostics,
  audio,
  host,
  evaluator,
  editor,
  onRevert,
}) {
  const el = (id) => document.getElementById(id);

  const nodes = {
    shelf: el('patch-shelf'),
    scene: el('scene-strip'),
    sceneName: el('scene-name'),
    history: el('history-list'),
    diagnostics: el('diagnostics-list'),
    params: el('param-list'),
    fps: el('stat-fps'),
    patchCount: el('stat-patches'),
    status: el('stat-status'),
    audioSource: el('audio-source'),
    audioPosition: el('audio-position'),
    audioError: el('audio-error'),
    beatDot: el('beat-dot'),
    safeNote: el('safe-scene-note'),
    meters: {
      level: el('meter-level'),
      bass: el('meter-bass'),
      mid: el('meter-mid'),
      treble: el('meter-treble'),
    },
  };

  let lastSnapshot = null;

  // --- patch shelf --------------------------------------------------------------

  function renderShelf() {
    const patches = registry.listPatches();
    const order = registry.activeOrder();
    nodes.shelf.replaceChildren(
      ...(patches.length
        ? patches.map((record) => patchRow(record, order.includes(record.name)))
        : [hint('No patches yet. Evaluate a patch(...) block with Cmd/Ctrl+Enter.')]),
    );
    nodes.patchCount.textContent = `${order.length}/${patches.length}`;
  }

  function patchRow(record, isActive) {
    const row = document.createElement('div');
    row.className = `row patch ${isActive ? 'is-active' : 'is-idle'}`;
    row.dataset.patch = record.name;

    const dot = document.createElement('span');
    dot.className = `dot ${record.status === 'failed' ? 'bad' : isActive ? 'ok' : 'idle'}`;
    dot.title = record.status === 'failed' ? (record.lastError?.message ?? 'failed') : record.status;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = record.name;

    const version = document.createElement('span');
    version.className = 'version';
    version.textContent = `v${record.version}`;

    const actions = document.createElement('span');
    actions.className = 'actions';
    actions.append(
      button(isActive ? 'remove' : 'add', isActive ? 'Remove from scene' : 'Add to scene', () => {
        if (isActive) registry.removeFromActiveScene(record.name);
        else registry.addToActiveScene(record.name);
      }),
      button('reset', 'Reset this patch state', () => {
        stateStore.reset(record.name, record.definition?.state);
        diagnostics.info(`${record.name} state reset`);
      }),
    );

    row.append(dot, name, version, actions);
    if (record.status === 'failed' && record.lastError) {
      const err = document.createElement('div');
      err.className = 'row-error';
      err.textContent = record.lastError.message;
      row.append(err);
    }
    return row;
  }

  // --- scene strip --------------------------------------------------------------

  function renderScene() {
    const order = registry.activeOrder();
    const active = registry.activeSceneName();
    const safe = registry.safeSceneName();
    nodes.sceneName.textContent = active ?? '—';
    nodes.scene.replaceChildren(
      ...(order.length
        ? order.map((name, index) => sceneChip(name, index, order.length))
        : [hint('Scene is empty.')]),
    );
    nodes.safeNote.textContent =
      safe === null
        ? 'No safe scene set — press "set safe" so panic has somewhere to go.'
        : safe === active
          ? `Safe scene: ${safe} (currently active)`
          : `Safe scene: ${safe} — press 0 or "panic" to return to it.`;
  }

  function sceneChip(name, index, total) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${name}`;
    chip.append(
      label,
      button('↑', `Move ${name} earlier (drawn under)`, () =>
        registry.reorderActiveScene(name, index - 1),
      ),
      button('↓', `Move ${name} later (drawn over)`, () =>
        registry.reorderActiveScene(name, index + 1),
      ),
    );
    chip.querySelectorAll('button')[0].disabled = index === 0;
    chip.querySelectorAll('button')[1].disabled = index === total - 1;
    return chip;
  }

  // --- params (§9.7) ------------------------------------------------------------

  function renderParams() {
    const params = registry.listParams();
    nodes.params.replaceChildren(
      ...(params.length ? params.map(paramRow) : [hint('No parameters declared.')]),
    );
  }

  function paramRow(entry) {
    const row = document.createElement('label');
    row.className = 'row param';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    const value = document.createElement('span');
    value.className = 'version';
    value.textContent = format(entry.value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = entry.min ?? 0;
    input.max = entry.max ?? 1;
    input.step = entry.step ?? 0.01;
    input.value = entry.value;
    input.addEventListener('input', () => {
      registry.setParam(entry.name, Number(input.value));
      value.textContent = format(Number(input.value));
    });

    row.append(name, value, input);
    return row;
  }

  // --- history (S-05) -----------------------------------------------------------

  function renderHistory() {
    const entries = registry
      .listPatches()
      .flatMap((record) => record.history.map((h) => ({ ...h, name: record.name })))
      .sort((a, b) => b.at - a.at)
      .slice(0, 40);

    nodes.history.replaceChildren(
      ...(entries.length ? entries.map(historyRow) : [hint('No successful evaluations yet.')]),
    );
  }

  function historyRow(entry) {
    const row = document.createElement('div');
    row.className = 'row history';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `${entry.name} v${entry.version}`;
    const time = document.createElement('span');
    time.className = 'version';
    time.textContent = new Date(entry.at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    row.append(
      name,
      time,
      button('revert', `Make ${entry.name} v${entry.version} active again`, () => {
        evaluator.revert(entry.name, entry.version);
        editor.replaceBlockFor(entry.name, entry.source);
        // A revert is an evaluation, so anything watching evaluations — the
        // projection's code overlay in particular — has to hear about it too.
        onRevert?.(entry.name, entry.version, entry.source);
      }),
    );
    return row;
  }

  // --- diagnostics --------------------------------------------------------------

  function renderDiagnostics() {
    const entries = diagnostics.list().slice(0, 30);
    nodes.diagnostics.replaceChildren(
      ...(entries.length ? entries.map(diagnosticRow) : [hint('Nothing to report.')]),
    );
    const latest = entries[0];
    if (latest) {
      nodes.status.textContent = latest.message;
      nodes.status.className = `value ${latest.level}`;
    }
  }

  function diagnosticRow(entry) {
    const row = document.createElement('div');
    row.className = `row diagnostic ${entry.level}`;
    const message = document.createElement('div');
    message.className = 'name';
    message.textContent = entry.message;
    row.append(message);
    if (entry.detail) {
      const detail = document.createElement('div');
      detail.className = 'row-error';
      detail.textContent = entry.detail;
      row.append(detail);
    }
    return row;
  }

  // --- meters -------------------------------------------------------------------

  function setSnapshot(snapshot) {
    lastSnapshot = snapshot;
  }

  function updateMeters() {
    const fps = host.fps();
    nodes.fps.textContent = fps.toFixed(0);
    nodes.fps.className = `value ${fps < 30 ? 'warn' : ''}`;

    const status = audio.status();
    nodes.audioSource.textContent = status.source === 'none' ? 'no source' : status.source;
    nodes.audioPosition.textContent =
      status.kind === 'mic'
        ? 'live'
        : status.loaded
          ? `${formatTime(status.position)} / ${formatTime(status.duration)}${status.playing ? '' : ' (paused)'}`
          : status.contextState;
    // A-07: an input failure is visible to the performer and nowhere else.
    nodes.audioError.hidden = !status.error;
    nodes.audioError.textContent = status.error ?? '';

    const s = lastSnapshot;
    if (!s) return;
    for (const [band, node] of Object.entries(nodes.meters)) {
      node.style.setProperty('--fill', `${Math.round(s[band] * 100)}%`);
    }
    nodes.beatDot.classList.toggle('lit', s.beat);
  }

  // --- helpers ------------------------------------------------------------------

  function button(label, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    // The visible label is often a glyph ("↑") or a bare verb ("reset") that means
    // nothing without its row. aria-label carries the full phrase, so the control is
    // usable by keyboard and screen reader — and addressable by the acceptance test.
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  function hint(text) {
    const div = document.createElement('div');
    div.className = 'hint';
    div.textContent = text;
    return div;
  }

  const format = (v) => (typeof v === 'number' ? v.toFixed(3).replace(/\.?0+$/, '') : String(v));
  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function renderAll() {
    renderShelf();
    renderScene();
    renderParams();
    renderHistory();
  }

  registry.subscribe(renderAll);
  diagnostics.subscribe(renderDiagnostics);
  renderAll();
  renderDiagnostics();
  const timer = setInterval(updateMeters, 1000 / METER_HZ);

  return { setSnapshot, renderAll, stop: () => clearInterval(timer) };
}
