// AlgoLab — wiring.
//
// This is the only file that touches p5's globals directly, and the only file that
// assigns window.setup and window.draw. PRD §8: the host owns those functions, and
// student code never redefines them. Everything a student writes arrives through the
// evaluator instead.
//
// The draw loop below is the one printed in §8. It is short on purpose — it is meant
// to be read by students as the answer to "what stayed alive while I edited?"

import { createDiagnostics } from './host/diagnostics.js';
import { createRegistry } from './host/registry.js';
import { createStateStore } from './host/stateStore.js';
import { createEvaluator } from './host/evaluator.js';
import { createHostLoop } from './host/hostLoop.js';
import { createAudioEngine } from './audio/audioEngine.js';
import { createEditor } from './ui/editor.js';
import { createPanels } from './ui/panels.js';
import { createProjection } from './ui/projection.js';
import { createConfirmDialog } from './ui/confirmDialog.js';
import { createProjectStore } from './persistence/projectStore.js';
import { createAppController } from './app/controller.js';
import { evaluateStartupProject } from './app/startupRecovery.js';
import { STARTER_SOURCE, upgradeLegacyPlasma } from '../starter/starter.js';
import {
  LIBRARY,
  RAVE_PATCH_NAMES,
  libraryDemoSource,
  upgradeOpaqueDiagnostics,
} from '../starter/library.js';
import { COMMUNITY_PATCHES } from './generated/communityPatches.js';
import {
  findCells,
  moveSceneCellsLast,
  renameLegacyStarterScene,
} from './language/sourceBlocks.js';

const STARTER_PATCHES = findCells(STARTER_SOURCE).flatMap((cell) => {
  const match = /^(?:strategy|patch)\s+([A-Za-z_$][\w$]*)$/.exec(cell.label);
  if (!match) return [];
  return [{
    name: match[1],
    title: match[1],
    blurb: 'Included in the starter project.',
    source: cell.text.trimEnd(),
    origin: 'system',
    category: match[1] === 'plasma' ? 'shader' : 'visual',
  }];
});

const PATCH_LIBRARY = [
  ...STARTER_PATCHES,
  ...LIBRARY.map((entry) => ({ ...entry, title: entry.name, origin: 'system' })),
  ...COMMUNITY_PATCHES,
].sort((a, b) => a.title.localeCompare(b.title));

const diagnostics = createDiagnostics();
const registry = createRegistry();
const stateStore = createStateStore({ diagnostics });
const evaluator = createEvaluator({ registry, stateStore, diagnostics });
const audio = createAudioEngine({ diagnostics });

// Read-only keyboard state, handed to strategies as one of the draw inputs (§9.4).
const controls = { keys: new Set(), shift: false, alt: false };

/**
 * p5 drawing isolation for one strategy invocation (R-05, §7).
 *
 * push()/pop() already save and restore p5's style and transform stack. The reset in
 * between exists for a subtler reason: without it, an object inherits whatever the
 * *host* last set, so reordering a scene could silently change how it looks.
 * These are the defaults documented in docs/API.md.
 */
const drawing = {
  push: () => push(),
  pop: () => pop(),
  resetDefaults() {
    colorMode(RGB, 255);
    blendMode(BLEND);
    rectMode(CORNER);
    ellipseMode(CENTER);
    imageMode(CORNER);
    angleMode(RADIANS);
    fill(255);
    stroke(255);
    strokeWeight(1);
    strokeCap(ROUND);
    strokeJoin(MITER);
    textAlign(LEFT, BASELINE);
    textSize(12);
  },
};

let showCodeError = () => {};
const host = createHostLoop({
  registry,
  stateStore,
  evaluator,
  diagnostics,
  drawing,
  controls,
  onCodeError: (name) => showCodeError(name),
});
const controller = createAppController({ registry, stateStore, diagnostics, evaluator, audio, host });
const projectStore = createProjectStore({ registry, diagnostics });
const projection = createProjection({
  controller,
  onBlocked: () =>
    diagnostics.warn(
      'Projection window was blocked',
      'Allow pop-ups for this page, or use Fullscreen instead.',
    ),
  onOpened: () =>
    diagnostics.success('Projection window open', 'Tab cycles layout; Esc closes it.'),
});
const dialog = createConfirmDialog();

// --- editor + panels ------------------------------------------------------------

const stage = document.getElementById('stage');
const app = document.getElementById('app');
const codeLayer = document.getElementById('code-layer');
const foldButton = document.getElementById('fold-code');
let stageCanvas = null;

const editor = createEditor(document.getElementById('code'), {
  onEvaluate: (source, label) => {
    const result = evaluator.evaluate(source, { label });
    // P-02: the projection's code layout shows the block that was actually accepted,
    // never a failed candidate — the audience should not be shown a broken edit.
    if (result.ok) projection.setActiveCode(source);
    return result;
  },
  onChange: (source) => {
    projectStore.saveSoon(source);
    controller.sourceChanged();
  },
  onEscape: () => stage.focus(),
  // Paints the text and the box behind each line; see src/ui/styles.css.
  mirror: document.getElementById('code-mirror'),
  lineNumbers: document.getElementById('line-numbers'),
  foldControls: document.getElementById('fold-controls'),
  foldedView: document.getElementById('folded-blocks'),
  onFoldChange: (folded) => {
    foldButton.classList.toggle('is-on', folded);
    const label = folded
      ? 'Open complete editor; fold controls remain in the gutter'
      : 'Return to structured code folds';
    foldButton.title = label;
    foldButton.setAttribute('aria-label', label);
  },
});
showCodeError = (name) => editor.flashCodeError(name);
controller.setSourceProvider(() => editor.value);

foldButton.addEventListener('click', () => editor.toggleFolded());
editor.setFolded(true);

// Parameter and safety-setting changes also need to save, not only typing.
registry.subscribe(() => projectStore.saveSoon(editor.value));

const panels = createPanels({
  controller,
  onRevert: ({ name, source }) => {
    editor.replaceBlockFor(name, source);
    projection.setActiveCode(source);
  },
  library: PATCH_LIBRARY,
  onInsertLibrary: installFromLibrary,
  onAddToScene: addPatchToScene,
  onRestoreSafe: restoreSafeState,
  onLocateStrategy: (name) => {
    if (editor.revealStrategy(name)) toggleReference(true);
  },
});

// --- p5 lifecycle ---------------------------------------------------------------

window.setup = function setup() {
  const stage = document.getElementById('stage');
  stageCanvas = createCanvas(stage.clientWidth, stage.clientHeight);
  stageCanvas.parent(stage);
  // One device pixel per canvas pixel. §13.5 budgets 60 FPS at 1280x720 on a
  // classroom laptop, and a retina backing store quadruples the fill cost.
  pixelDensity(1);
  frameRate(60);
  background(8, 8, 12);

  audio.init();

  const saved = projectStore.load();
  const source = saved?.source ?? STARTER_SOURCE;
  const upgradedSource = upgradeLegacyPlasma(source);
  const diagnosticSource = upgradeOpaqueDiagnostics(upgradedSource);
  const namedSource = renameLegacyStarterScene(diagnosticSource);
  const orderedSource = moveSceneCellsLast(namedSource);
  editor.value = orderedSource;
  if (upgradedSource !== source) {
    diagnostics.info(
      'Updated starter Plasma',
      'The original bright feedback shader is now a subtle ambient AET colour field.',
    );
  }
  if (diagnosticSource !== upgradedSource) {
    diagnostics.info(
      'Updated diagnostic overlays',
      'Frequency bars and audio meters now draw solid marks with no backing tint.',
    );
  }
  if (namedSource !== diagnosticSource) {
    diagnostics.info('Renamed the starter scene', 'The default scene binding is now simply scene.');
  }
  if (orderedSource !== namedSource) {
    diagnostics.info(
      'Organized project cells',
      'The first patch begins at line 1 and scene arrays load after their patch declarations.',
    );
  }
  // The starter/saved project goes through the ordinary atomic evaluation path. If
  // one saved cell is broken on reload, recover its other independent cells and keep
  // a small visible scene running instead of accepting an empty registry.
  const startup = evaluateStartupProject({
    source: orderedSource,
    label: saved ? 'saved project' : 'starter',
    starterSource: STARTER_SOURCE,
    evaluator,
    registry,
    stateStore,
    host,
  });
  if (startup.recovered) {
    diagnostics.warn(
      'Saved project recovered with errors',
      `${startup.failedBlocks.length} block${startup.failedBlocks.length === 1 ? '' : 's'} could not be evaluated. ` +
        'Their source is still in the editor. Installed source remains visible in the library; open the failed cell, fix it, and press Cmd/Ctrl+Enter.',
    );
  }
  projectStore.restoreSettings(
    saved?.safeScene === 'tunnel' && namedSource !== diagnosticSource
      ? { ...saved, safeScene: 'scene' }
      : saved,
  );
  // Panic needs somewhere to go from the first minute, not only after the performer
  // has thought to designate a safe scene (S-06).
  if (registry.safeSceneName() === null) registry.setSafeScene();

  diagnostics.info(
    saved ? 'Restored your saved project' : 'Starter project loaded',
    'Cmd/Ctrl+Enter evaluates the cell or statement under your cursor.',
  );
};

window.draw = function draw() {
  const snapshot = audio.readFrame(); // once per frame, shared by every strategy
  const drawInputs = host.beginFrame(snapshot, stageCanvas);

  // The live coder configures the scene as an ordered array of strategy values.
  // Each function or object exposes the current drawing behavior.
  for (const strategy of registry.activeStrategies()) {
    host.drawStrategy(strategy, drawInputs);
  }

  host.commitPendingChanges();
  // The first confirmed starter/saved scene becomes a complete recovery point.
  // Later edits never overwrite it; only the explicit Set safe action does.
  if (!controller.safeStateStatus().exists) controller.ensureSafeState();
  controller.setAudioSnapshot(snapshot);

  // The audience's copy of this frame. No-op unless the projection window is open.
  projection.render(drawingContext.canvas);
};

window.windowResized = function windowResized() {
  const stage = document.getElementById('stage');
  // R-06: resizing changes the canvas, never the registrations or their state.
  resizeCanvas(stage.clientWidth, stage.clientHeight);
};

// --- transport ------------------------------------------------------------------

const overlay = document.getElementById('start-overlay');
const welcomeFileButton = document.getElementById('file-label');
const welcomeFileInput = document.getElementById('audio-file');
const welcomeLoadState = document.getElementById('start-load-state');
const welcomeLoadLabel = document.getElementById('start-load-label');
const welcomeLoadProgress = document.getElementById('start-load-progress');
const welcomeNote = document.getElementById('start-note');
const loadAudioButton = document.getElementById('load-audio');

function renderAudioLoadStatus(status) {
  loadAudioButton.classList.toggle('is-loading', status.loading);
  loadAudioButton.setAttribute('aria-busy', String(status.loading));
  welcomeLoadState.hidden = !status.loading;

  if (status.loading) {
    welcomeNote.classList.remove('is-error');
    welcomeNote.textContent =
      'Audio files stay in this browser. Sound cannot begin until loading finishes.';
    welcomeLoadLabel.textContent =
      status.loadPhase === 'decoding'
        ? `Decoding ${status.source}…`
        : Number.isFinite(status.loadProgress)
          ? `Loading ${status.source} — ${Math.round(status.loadProgress * 100)}%`
          : `Loading ${status.source}…`;
    if (status.loadPhase === 'loading' && Number.isFinite(status.loadProgress)) {
      welcomeLoadProgress.value = status.loadProgress;
    } else {
      welcomeLoadProgress.removeAttribute('value');
    }
    return;
  }

  if (status.error && !overlay.hidden) {
    welcomeNote.textContent = `${status.error}. Choose another audio file or enter with silence.`;
    welcomeNote.classList.add('is-error');
  }
}

async function startAudio() {
  try {
    const state = await audio.start();
    overlay.hidden = true;
    diagnostics.success(`Audio context ${state}`);
  } catch (error) {
    // A-07: an audio failure is a message, not a stopped draw loop.
    overlay.hidden = true;
    diagnostics.error('Could not start audio', `${error.message} — running on silence.`);
  }
}

async function chooseFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    // Safari must be unlocked by the file input's trusted change event. Waiting for
    // loadSound's asynchronous decode before doing this can leave a playing analyzer
    // graph whose master output is still inaudible.
    await audio.unlock();
  } catch (error) {
    diagnostics.error('Could not start audio', `${error.message} — running on silence.`);
    return;
  }
  try {
    await audio.loadFile(file, { onProgress: renderAudioLoadStatus });
    await startAudio();
  } catch {
    /* loadFile already reported the decode failure */
  }
}

for (const id of ['audio-file', 'audio-file-2']) {
  document.getElementById(id).addEventListener('change', (event) => chooseFile(event.target));
}
welcomeFileButton.addEventListener('click', () => welcomeFileInput.click());
document.getElementById('load-audio').addEventListener('click', () => {
  document.getElementById('audio-file-2').click();
});
document.getElementById('start-audio').addEventListener('click', startAudio);
requestAnimationFrame(() => welcomeFileButton.focus({ preventScroll: true }));
async function toggleAudio() {
  try {
    await audio.toggle();
  } catch (error) {
    diagnostics.error('Could not resume audio', error.message);
  }
}

document.getElementById('play-toggle').addEventListener('click', toggleAudio);

let looping = false;
function toggleLoop() {
  looping = !looping;
  audio.setLoop(looping);
  document.getElementById('loop-toggle').classList.toggle('is-on', looping);
  diagnostics.info(`Loop ${looping ? 'on' : 'off'}`);
}
document.getElementById('loop-toggle').addEventListener('click', toggleLoop);

// --- live input (A-02) -----------------------------------------------------------

const deviceSelect = document.getElementById('input-device');

async function startMicrophone(deviceId) {
  const ok = await audio.useMicrophone(deviceId);
  if (!ok) return false;
  overlay.hidden = true;
  // Device labels are empty until permission has been granted once, so the picker is
  // only worth populating after a successful start.
  const inputs = await audio.listInputs();
  deviceSelect.replaceChildren(
    new Option('(default input)', ''),
    ...inputs.map((d) => new Option(d.label, d.deviceId)),
  );
  if (deviceId) deviceSelect.value = deviceId;
  return true;
}

document.getElementById('use-mic').addEventListener('click', () => startMicrophone());
document.getElementById('start-mic').addEventListener('click', () => startMicrophone());
deviceSelect.addEventListener('change', (event) => {
  if (event.target.value) startMicrophone(event.target.value);
});

// --- analysis controls (A-06) ----------------------------------------------------

const smoothingInput = document.getElementById('smoothing');
const smoothingValue = document.getElementById('smoothing-value');
smoothingInput.addEventListener('input', () => {
  const value = Number(smoothingInput.value);
  audio.configure({ smoothing: value });
  smoothingValue.textContent = value.toFixed(2);
});
document.getElementById('auto-gain').addEventListener('change', (event) => {
  audio.configure({ autoGain: event.target.checked });
  diagnostics.info(`Auto-gain ${event.target.checked ? 'on' : 'off'}`);
});

// --- projection, fullscreen, safe scene, panic -----------------------------------

const projectionButton = document.getElementById('projection-open');
const layoutSelect = document.getElementById('projection-layout');

function toggleProjection() {
  if (projection.isOpen()) {
    projection.close();
  } else {
    projection.open();
    projection.setLayout(layoutSelect.value);
  }
  projectionButton.classList.toggle('is-on', projection.isOpen());
}
projectionButton.addEventListener('click', toggleProjection);
layoutSelect.addEventListener('change', () => projection.setLayout(layoutSelect.value));

async function toggleFullscreen() {
  // Fullscreen the complete performer surface, not only the canvas. The code layer,
  // runtime status, glyphs, and optional tools are siblings of #stage inside #app.
  // Targeting #stage alone makes the browser correctly hide all of those siblings.
  if (document.fullscreenElement) await document.exitFullscreen();
  else await app.requestFullscreen().catch((error) => diagnostics.warn('Fullscreen refused', error.message));
}
document.getElementById('fullscreen-toggle').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  document.getElementById('fullscreen-toggle').classList.toggle('is-on', !!document.fullscreenElement);
  // Wait a frame so the stage has been laid out at its new size before measuring it.
  requestAnimationFrame(() => resizeCanvas(stage.clientWidth, stage.clientHeight));
});

// --- tools overlay ---------------------------------------------------------------

const side = document.getElementById('side');
const referenceSide = document.getElementById('reference-side');

const OPACITY_KEY = 'algolab.toolsAlpha';
const LEGACY_OPACITY_KEYS = [
  'livecode-lab.toolsAlpha',
  'patchlab.toolsAlpha',
  'patchbay.toolsAlpha',
  'response.toolsAlpha',
];

/**
 * How see-through the tools are.
 *
 * A live control rather than a fixed value, because the right amount depends on what
 * is playing: over a dark set you want it low to see anything behind the panel at
 * all, over a bright one you want it high to read the code. Persisted on its own key
 * — it is a property of this machine and this room, not of the project, so it should
 * not travel in an export.
 */
function setToolsOpacity(alpha) {
  const value = Math.min(1, Math.max(0.15, Number(alpha) || 0.55));
  document.documentElement.style.setProperty('--tools-alpha', value.toFixed(2));
  const output = document.getElementById('tools-opacity-value');
  if (output) output.textContent = `${Math.round(value * 100)}%`;
  try {
    localStorage.setItem(OPACITY_KEY, String(value));
  } catch {
    /* a private-mode browser is not a reason to stop */
  }
  return value;
}

const opacityInput = document.getElementById('tools-opacity');
opacityInput.addEventListener('input', () => setToolsOpacity(opacityInput.value));
{
  let saved = null;
  try {
    saved = localStorage.getItem(OPACITY_KEY);
    for (const legacyKey of LEGACY_OPACITY_KEYS) saved ??= localStorage.getItem(legacyKey);
  } catch {
    /* ignore */
  }
  opacityInput.value = setToolsOpacity(saved ?? opacityInput.value);
}

function toggleTools(force) {
  const hidden = force ?? !side.classList.contains('is-hidden');
  side.classList.toggle('is-hidden', hidden);
  document.getElementById('tools-toggle').classList.toggle('is-on', !hidden);
  if (!hidden) {
    referenceSide.classList.add('is-hidden');
    document.getElementById('reference-toggle').classList.remove('is-on');
  }
  // The canvas already fills the window, so nothing needs resizing — the panel is
  // over the top of it, not beside it. That is the point of the overlay.
  return hidden;
}
// Closed on arrival. Everything in the drawer is a setting; nothing in it is a move
// you make mid-set, and the ones that were — play, panic, projection — are glyphs and
// key commands now. So the default state of the window is the visuals and the code.
toggleTools(true);

document.getElementById('tools-toggle').addEventListener('click', () => toggleTools());

function toggleReference(force) {
  const hidden = force ?? !referenceSide.classList.contains('is-hidden');
  referenceSide.classList.toggle('is-hidden', hidden);
  document.getElementById('reference-toggle').classList.toggle('is-on', !hidden);
  if (!hidden) {
    side.classList.add('is-hidden');
    document.getElementById('tools-toggle').classList.remove('is-on');
  }
  return hidden;
}
toggleReference(true);

document.getElementById('reference-toggle').addEventListener('click', () => toggleReference());
document.getElementById('reference-close').addEventListener('click', () => toggleReference(true));

/**
 * Hide the code itself (`e`).
 *
 * Distinct from hiding the tools: mid-set you want to look at the composition with
 * nothing on it at all, and the code is the largest thing on it. Hiding it does not
 * pause anything — the strategies keep running exactly as they are.
 */
function toggleCode(force) {
  const hidden = force ?? !codeLayer.classList.contains('is-hidden');
  codeLayer.classList.toggle('is-hidden', hidden);
  return hidden;
}

// --- key command help (?) --------------------------------------------------------

const keysOverlay = document.getElementById('keys-overlay');
function toggleKeys(force) {
  keysOverlay.hidden = force ?? !keysOverlay.hidden;
}
document.getElementById('keys-close').addEventListener('click', () => toggleKeys(true));
document.getElementById('keys-open').addEventListener('click', () => toggleKeys());
keysOverlay.addEventListener('click', (event) => {
  if (event.target === keysOverlay) toggleKeys(true);
});

const fpsThresholdInput = document.getElementById('fps-threshold');
fpsThresholdInput.addEventListener('change', () => {
  const value = Number(fpsThresholdInput.value);
  if (!Number.isFinite(value) || value <= 0) return;
  host.setFpsThreshold(value); // S-07 calls the threshold configurable
  diagnostics.info(`Frame rate warning set to ${value} FPS`);
});

function setSafeScene() {
  return controller.actions.setSafeState();
}

function restoreSafeState() {
  const result = controller.actions.restoreSafeState();
  if (!result.ok) return result;
  editor.value = result.source;
  projection.setActiveCode(result.source);
  projectStore.saveSoon(result.source, 0);
  controller.sourceChanged();
  return result;
}

function panic() {
  return restoreSafeState();
}

document.getElementById('set-safe').addEventListener('click', setSafeScene);
document.getElementById('panic').addEventListener('click', panic);

// --- patch library ---------------------------------------------------------------

/**
 * Insert a library patch into the editor and register it without changing a scene.
 *
 * It goes through the ordinary evaluation path — no privileged loading — so a library
 * patch is exactly as replaceable as one the student typed, and appears in Installed
 * Patches with a version number like any other.
 */
function installFromLibrary(entry) {
  const existing = editor.patchSource(entry.name);
  if (existing) {
    diagnostics.info(
      `${entry.title ?? entry.name} source is already in the project`,
      registry.hasStrategy(entry.name)
        ? 'Installed does not mean active. Use Add to scene to render it.'
        : 'Evaluate its patch cell to retry installation; no duplicate source was added.',
    );
    return { ok: registry.hasStrategy(entry.name), phase: 'present' };
  }

  editor.insertPatchSource(entry.source);
  const result = evaluator.evaluate(entry.source, { label: `patch ${entry.name}` });
  if (result.ok) {
    projection.setActiveCode(entry.source);
    diagnostics.info(
      `${entry.title ?? entry.name} source installed`,
      'It is installed in the project but will not render until you add it to the active scene.',
    );
  }
  return result;
}

function addPatchToScene(entry) {
  if (!registry.hasStrategy(entry.name)) {
    diagnostics.warn(`${entry.title ?? entry.name} is not installed`, 'Install its source first.');
    return { ok: false };
  }
  const sceneName = registry.activeSceneName() ?? 'liveScene';
  const currentOrder = registry.activeInstances().map((instance) => instance.strategy);
  const result = editor.addStrategyToScene(sceneName, entry.name, currentOrder, {
    // Plasma samples everything drawn before it, so ordinary additions belong before
    // it even when the performer presses Add to scene after Plasma is already active.
    before: entry.name === 'plasma' ? null : 'plasma',
  });
  if (!result.ok) {
    diagnostics.error(
      `Could not add ${entry.name} to ${sceneName}`,
      'Edit the scene array directly, then evaluate that scene cell.',
    );
    return result;
  }
  diagnostics.info(
    `${entry.title ?? entry.name} added to ${sceneName} source`,
    'It is not active yet. Press Cmd/Ctrl+Enter in the selected scene cell to evaluate it.',
  );
  return result;
}

function buildDemoScene() {
  // Add and evaluate all missing dependency cells in one editor update. Rebuilding the
  // highlighted/folded editor after every patch made a larger library needlessly slow.
  const dependencies = RAVE_PATCH_NAMES.map((name) =>
    LIBRARY.find((entry) => entry.name === name),
  ).filter(Boolean);
  const sourcesToEvaluate = [];
  const sourcesToInsert = [];

  for (const entry of dependencies) {
    if (registry.hasStrategy(entry.name)) continue;
    const projectSource = editor.patchSource(entry.name);
    sourcesToEvaluate.push(projectSource || entry.source);
    if (!projectSource) sourcesToInsert.push(entry.source);
  }

  if (sourcesToInsert.length) editor.insertPatchSource(sourcesToInsert.join('\n\n'));
  if (sourcesToEvaluate.length) {
    const installed = evaluator.evaluate(sourcesToEvaluate.join('\n\n'), {
      label: 'configured example patches',
    });
    if (!installed.ok) return installed;
    evaluator.applyPending();
  }

  const source = libraryDemoSource();
  editor.replaceNamedBlock('scene stacked', source);
  editor.revealScene('stacked');
  diagnostics.info(
    'Configured example added to the source',
    'It is not active yet. Press Cmd/Ctrl+Enter in the selected scene cell to evaluate it.',
  );
  return { ok: true, phase: 'inserted' };
}

document.getElementById('insert-demo-scene').addEventListener('click', buildDemoScene);

// --- project export / import (D-02, D-03) ----------------------------------------

document.getElementById('export-project').addEventListener('click', () => {
  const name = projectStore.download(editor.value);
  diagnostics.success(`Exported ${name}`);
});

document.getElementById('import-project').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

/**
 * Start over — the counterpart to "↺" on a single strategy.
 *
 * Deliberately NOT a page reload. Everything the performer authored goes, but the
 * canvas, the host clock, and the music keep running, which is the same promise the
 * rest of the system makes. It is behind a confirmation because it discards source
 * that is not saved anywhere else.
 */
document.getElementById('reset-project').addEventListener('click', async () => {
  const strategyCount = registry.listStrategies().length;
  const confirmed = await dialog.ask({
    title: 'Reset this project?',
    body:
      `This discards your editor contents, all ${strategyCount} installed patches, ` +
      `their versions and history, every scene, and all patch state, and goes back to ` +
      `the starter project. The music and the canvas keep running.`,
    warning: 'There is no undo for this. Export first if you might want it back.',
    confirmLabel: 'Reset to starter',
  });
  if (!confirmed) return;

  evaluator.discardPending();
  evaluator.clearBindings();
  projectStore.clear();
  host.reset();
  registry.reset();
  stateStore.clear();

  editor.value = STARTER_SOURCE;
  evaluator.evaluate(STARTER_SOURCE, { label: 'starter' });
  evaluator.applyPending();
  registry.setSafeScene();
  projection.setActiveCode('');
  diagnostics.success('Project reset to the starter');
});

document.getElementById('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = ''; // so importing the same file twice still fires
  if (!file) return;

  const parsed = projectStore.parseProject(await file.text());
  if (!parsed.ok) {
    diagnostics.error(`Could not import ${file.name}`, parsed.error);
    return;
  }

  // D-03: importing runs someone else's JavaScript on this machine. §13.3 is explicit
  // that error boundaries are not a sandbox, so the confirmation shows the actual
  // source and defaults to Cancel.
  const confirmed = await dialog.ask({
    title: `Import "${file.name}"?`,
    body:
      `This project contains ${parsed.data.source.split('\n').length} lines of JavaScript ` +
      `including its scene arrays. Importing replaces your current editor contents ` +
      `and runs this code immediately.`,
    preview: parsed.data.source.slice(0, 1200),
    warning:
      'AlgoLab runs imported code with the same privileges as your own. It is not a ' +
      'sandbox — imported code can freeze this tab. Only import projects from someone you trust.',
    confirmLabel: 'Import and run',
  });
  if (!confirmed) {
    diagnostics.info('Import cancelled');
    return;
  }

  evaluator.discardPending();
  evaluator.clearBindings();
  host.reset();
  registry.reset();
  stateStore.clear();
  editor.value = parsed.data.source;
  const result = evaluator.evaluate(parsed.data.source, { label: file.name });
  evaluator.applyPending();
  if (!result.ok) {
    diagnostics.error(`Could not run ${file.name}`, result.error?.message);
    return;
  }
  projectStore.restoreSettings(parsed.data);
  projection.setActiveCode(parsed.data.source);
  diagnostics.success(`Imported ${file.name}`);
});

// Drop an audio file anywhere on the stage (§10.2 step 2).
stage.addEventListener('dragover', (event) => event.preventDefault());
stage.addEventListener('drop', async (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    await audio.unlock();
  } catch (error) {
    diagnostics.error('Could not start audio', `${error.message} — running on silence.`);
    return;
  }
  try {
    await audio.loadFile(file, { onProgress: renderAudioLoadStatus });
    await startAudio();
  } catch {
    /* loadFile already reported the decode failure */
  }
});

// --- performer shortcuts (available once editor focus is released) --------------

/**
 * Every control that is not a glyph in the corner is one of these.
 *
 * That is the trade the minimal display makes: the chrome went away, so the commands
 * have to be in the hands. `?` prints this list, which is what lets it afford to be a
 * long one — and is why the list in index.html has to be kept next to this map.
 */
const COMMANDS = {
  ' ': () => toggleAudio(),
  0: () => panic(), // S-06 / P-05: one action, back to a scene the performer trusts
  s: () => setSafeScene(),
  '\\': () => toggleTools(), // the settings drawer
  r: () => toggleReference(), // project patches and their public interfaces
  e: () => toggleCode(), // the code itself — see the composition with nothing on it
  f: () => toggleFullscreen(),
  p: () => toggleProjection(),
  l: () => toggleLoop(),
  a: () => document.getElementById('audio-file-2').click(),
  m: () => startMicrophone(),
  '?': () => toggleKeys(),
  Escape: () => toggleKeys(true),
};

window.addEventListener('keydown', (event) => {
  controls.keys.add(event.key);
  controls.shift = event.shiftKey;
  controls.alt = event.altKey;

  // Structural editor commands deliberately work with the caret still in code.
  // `event.code` keeps the brackets stable on keyboard layouts where Alt changes
  // the character reported by `event.key`.
  const accel = event.metaKey || event.ctrlKey;
  if (accel && event.altKey && event.code === 'BracketLeft') {
    event.preventDefault();
    editor.foldAll();
    return;
  }
  if (accel && event.altKey && event.code === 'BracketRight') {
    event.preventDefault();
    editor.unfoldAll();
    return;
  }
  if (accel && event.altKey && event.code === 'Slash') {
    event.preventDefault();
    toggleKeys();
    return;
  }

  const tag = document.activeElement?.tagName;
  const inField = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';
  if (inField || event.metaKey || event.ctrlKey || event.altKey) return;

  const command = COMMANDS[event.key];
  if (!command) return;
  event.preventDefault();
  command();
});
window.addEventListener('keyup', (event) => {
  controls.keys.delete(event.key);
  controls.shift = event.shiftKey;
  controls.alt = event.altKey;
});

// Save on the way out, so a mid-set refresh does not lose the last edit.
window.addEventListener('beforeunload', () => projectStore.save(editor.value));

// Exposed for the automated acceptance test (tests/e2e/degree3.spec.js) and for
// students who want to poke at the running system from the browser console.
window.AlgoLab = {
  controller,
  registry,
  stateStore,
  evaluator,
  host,
  audio,
  diagnostics,
  editor,
  projection,
  projectStore,
};
// Keep already-open console snippets and course test harnesses alive through the
// product renames. New material uses window.AlgoLab.
window.LivecodeLab = window.AlgoLab;
window.Patchlab = window.AlgoLab;
window.Patchbay = window.AlgoLab;
window.Response = window.AlgoLab;
