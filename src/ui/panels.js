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
  library = [],
  onAddLibrary,
  onDemoScene,
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

  /**
   * The shelf lists every patch there is — the ones registered in this session, and
   * the ready-made ones from the library that have not been brought in yet.
   *
   * One list, because from the performer's side "add rings again" and "add a swarm"
   * are the same gesture. A library patch that has been added becomes an ordinary row
   * with a version number, indistinguishable from one that was typed.
   */
  function renderShelf() {
    const patches = registry.listPatches();
    const order = registry.activeOrder();
    const available = library.filter((entry) => !registry.hasPatch(entry.name));

    const rows = patches.map((record) =>
      patchRow(record, registry.activeInstancesOf(record.name).length),
    );
    if (patches.length === 0) {
      rows.push(hint('No patches yet. Evaluate a patch(...) block with Cmd/Ctrl+Enter.'));
    }
    if (available.length) {
      rows.push(sectionLabel('available'), ...available.map(availableRow));
    }
    if (onDemoScene) rows.push(demoRow());

    nodes.shelf.replaceChildren(...rows);
    nodes.patchCount.textContent = `${order.length}/${patches.length}`;
  }

  /** A library patch not yet brought in: no version, no state, one "+". */
  function availableRow(entry) {
    const row = document.createElement('div');
    row.className = 'row patch is-available';
    row.dataset.available = entry.name;

    const dot = document.createElement('span');
    dot.className = 'dot idle';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    name.title = entry.blurb;

    const actions = document.createElement('span');
    actions.className = 'actions';
    actions.append(icon('+', `Add ${entry.name} — ${entry.blurb}`, () => onAddLibrary?.(entry)));

    row.append(dot, name, actions);
    return row;
  }

  function sectionLabel(text) {
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = text;
    return label;
  }

  function demoRow() {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'name dim';
    name.textContent = 'demo scene';
    const actions = document.createElement('span');
    actions.className = 'actions';
    actions.append(
      button(
        'stacked',
        'Build a scene from several copies of the library patches',
        () => onDemoScene(),
      ),
    );
    row.append(name, actions);
    return row;
  }

  /** @param {number} copies how many instances of this patch are on stage */
  function patchRow(record, copies) {
    const isActive = copies > 0;
    const row = document.createElement('div');
    row.className = `row patch ${isActive ? 'is-active' : 'is-idle'}`;
    row.dataset.patch = record.name;

    const dot = document.createElement('span');
    dot.className = `dot ${record.status === 'failed' ? 'bad' : isActive ? 'ok' : 'idle'}`;
    dot.title = record.status === 'failed' ? (record.lastError?.message ?? 'failed') : record.status;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = record.name;
    // A patch on stage more than once says so, since the scene strip below is where
    // the individual copies live.
    if (copies > 1) {
      const badge = document.createElement('span');
      badge.className = 'copies';
      badge.textContent = `×${copies}`;
      badge.title = `${copies} copies in the scene`;
      name.append(' ', badge);
    }

    const version = document.createElement('span');
    version.className = 'version';
    version.textContent = `v${record.version}`;

    const actions = document.createElement('span');
    actions.className = 'actions';
    actions.append(
      // "+" always adds another copy — asking for a second swarm gets a second swarm.
      icon('+', `Add ${isActive ? 'another copy of ' : ''}${record.name} to the scene`, () => {
        const instance = registry.addToActiveScene(record.name);
        stateStore.ensure(instance.id, record.definition?.state);
        diagnostics.info(`Added ${instance.id}`);
      }),
      icon('−', `Remove the last copy of ${record.name}`, () => {
        registry.removeFromActiveScene(record.name);
      }),
      icon('↺', `Reset ${record.name} state${copies > 1 ? ' (all copies)' : ''}`, () => {
        const n = stateStore.resetPatch(record.name, record.definition?.state);
        diagnostics.info(`${record.name} state reset${n > 1 ? ` (${n} copies)` : ''}`);
      }),
    );
    actions.querySelectorAll('button')[1].disabled = !isActive;

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
    const instances = registry.activeInstances();
    const active = registry.activeSceneName();
    const safe = registry.safeSceneName();
    nodes.sceneName.textContent = active ?? '—';
    nodes.scene.replaceChildren(
      ...(instances.length
        ? instances.map((instance, index) => sceneChip(instance, index, instances.length))
        : [hint('Scene is empty.')]),
    );
    nodes.safeNote.textContent =
      safe === null
        ? 'No safe scene set — press "set safe" so panic has somewhere to go.'
        : safe === active
          ? `Safe scene: ${safe} (currently active)`
          : `Safe scene: ${safe} — press 0 or "panic" to return to it.`;
  }

  /** One chip per INSTANCE, so three swarms are three separately-movable chips. */
  function sceneChip(instance, index, total) {
    const { id } = instance;
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.instance = id;

    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${id}`;
    const configKeys = Object.keys(instance.config ?? {});
    if (configKeys.length) {
      label.title = configKeys.map((k) => `${k}: ${instance.config[k]}`).join(', ');
      label.append(' ');
      const mark = document.createElement('span');
      mark.className = 'copies';
      mark.textContent = '⚙';
      label.append(mark);
    }

    chip.append(
      label,
      icon('↑', `Move ${id} earlier (drawn under)`, () =>
        registry.reorderActiveScene(id, index - 1),
      ),
      icon('↓', `Move ${id} later (drawn over)`, () =>
        registry.reorderActiveScene(id, index + 1),
      ),
      icon('×', `Remove ${id} from the scene`, () => registry.removeFromActiveScene(id)),
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

  /** A glyph button. The title carries the meaning, so it is never guesswork. */
  function icon(glyph, title, onClick) {
    const b = button(glyph, title, onClick);
    b.className = 'icon';
    return b;
  }

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
