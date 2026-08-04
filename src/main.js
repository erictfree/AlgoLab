// Response — wiring.
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
import { STARTER_SOURCE } from '../starter/starter.js';
import { LIBRARY, LIBRARY_DEMO } from '../starter/library.js';

const diagnostics = createDiagnostics();
const registry = createRegistry();
const stateStore = createStateStore({ diagnostics });
const evaluator = createEvaluator({ registry, stateStore, diagnostics });
const audio = createAudioEngine({ diagnostics });

// Read-only keyboard state, handed to patches as `context.controls` (§9.4).
const controls = { keys: new Set(), shift: false, alt: false };

/**
 * p5 drawing isolation for one patch invocation (R-05, §7).
 *
 * push()/pop() already save and restore p5's style and transform stack. The reset in
 * between exists for a subtler reason: without it, a patch inherits whatever the
 * *host* last set, so reordering a scene could silently change how a patch looks.
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

const host = createHostLoop({ registry, stateStore, evaluator, diagnostics, drawing, controls });
const projectStore = createProjectStore({ registry, diagnostics });
const projection = createProjection({ registry, diagnostics });
const dialog = createConfirmDialog();

// --- editor + panels ------------------------------------------------------------

const stage = document.getElementById('stage');

const editor = createEditor(document.getElementById('code'), {
  onEvaluate: (source, label) => {
    const result = evaluator.evaluate(source, { label });
    // P-02: the projection's code layout shows the block that was actually accepted,
    // never a failed candidate — the audience should not be shown a broken edit.
    if (result.ok) projection.setActiveCode(source);
    return result;
  },
  onChange: (source) => projectStore.saveSoon(source),
  onEscape: () => stage.focus(),
});

// D-01 covers the patch registry and scenes, not just the editor text — so a scene
// reorder or a parameter tweak is saved too, not only typing.
registry.subscribe(() => projectStore.saveSoon(editor.value));

const panels = createPanels({
  registry,
  stateStore,
  diagnostics,
  audio,
  host,
  evaluator,
  editor,
  onRevert: (name, version, source) => projection.setActiveCode(source),
  // The shelf lists the library's patches alongside the registered ones, so bringing
  // one in is the same "+" as adding another copy of something already there.
  library: LIBRARY,
  onAddLibrary: (entry) => insertFromLibrary(entry.source, `patch ${entry.name}`),
  onDemoScene: () => buildDemoScene(),
});

// --- p5 lifecycle ---------------------------------------------------------------

window.setup = function setup() {
  const stage = document.getElementById('stage');
  const canvas = createCanvas(stage.clientWidth, stage.clientHeight);
  canvas.parent(stage);
  // One device pixel per canvas pixel. §13.5 budgets 60 FPS at 1280x720 on a
  // classroom laptop, and a retina backing store quadruples the fill cost.
  pixelDensity(1);
  frameRate(60);
  background(8, 8, 12);

  audio.init();

  const saved = projectStore.load();
  editor.value = saved?.source ?? STARTER_SOURCE;
  // The starter goes through the ordinary evaluation path — no privileged loading.
  evaluator.evaluate(editor.value, { label: saved ? 'saved project' : 'starter' });
  // Register everything the source defines before restoring the saved composition,
  // so a hand-reordered scene is not overwritten by the scene(...) call in the source.
  evaluator.applyPending();
  projectStore.restoreComposition(saved);
  // Panic needs somewhere to go from the first minute, not only after the performer
  // has thought to designate a safe scene (S-06).
  if (registry.safeSceneName() === null) registry.setSafeScene();

  diagnostics.info(
    saved ? 'Restored your saved project' : 'Starter project loaded',
    'Cmd/Ctrl+Enter evaluates the block your cursor is in.',
  );
};

window.draw = function draw() {
  const snapshot = audio.readFrame(); // once per frame, shared by every patch
  const frame = host.beginFrame(snapshot);

  for (const name of registry.activeOrder()) {
    host.drawPatch(name, frame);
  }

  host.commitPendingChanges();
  panels.setSnapshot(snapshot);

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
    await audio.loadFile(file);
    await startAudio();
  } catch {
    /* loadFile already reported it */
  }
}

for (const id of ['audio-file', 'audio-file-2']) {
  document.getElementById(id).addEventListener('change', (event) => chooseFile(event.target));
}
document.getElementById('load-audio').addEventListener('click', () => {
  document.getElementById('audio-file-2').click();
});
document.getElementById('start-audio').addEventListener('click', startAudio);
document.getElementById('play-toggle').addEventListener('click', () => audio.toggle());

let looping = false;
document.getElementById('loop-toggle').addEventListener('click', (event) => {
  looping = !looping;
  audio.setLoop(looping);
  event.currentTarget.classList.toggle('is-on', looping);
});

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

projectionButton.addEventListener('click', () => {
  if (projection.isOpen()) {
    projection.close();
  } else {
    projection.open();
    projection.setLayout(layoutSelect.value);
  }
  projectionButton.classList.toggle('is-on', projection.isOpen());
});
layoutSelect.addEventListener('change', () => projection.setLayout(layoutSelect.value));

document.getElementById('fullscreen-toggle').addEventListener('click', async () => {
  // R-06: fullscreen changes the canvas size, never the registrations or their state.
  if (document.fullscreenElement) await document.exitFullscreen();
  else await stage.requestFullscreen().catch((error) => diagnostics.warn('Fullscreen refused', error.message));
});
document.addEventListener('fullscreenchange', () => {
  document.getElementById('fullscreen-toggle').classList.toggle('is-on', !!document.fullscreenElement);
  // Wait a frame so the stage has been laid out at its new size before measuring it.
  requestAnimationFrame(() => resizeCanvas(stage.clientWidth, stage.clientHeight));
});

const fpsThresholdInput = document.getElementById('fps-threshold');
fpsThresholdInput.addEventListener('change', () => {
  const value = Number(fpsThresholdInput.value);
  if (!Number.isFinite(value) || value <= 0) return;
  host.setFpsThreshold(value); // S-07 calls the threshold configurable
  diagnostics.info(`Frame rate warning set to ${value} FPS`);
});

function setSafeScene() {
  const name = registry.setSafeScene();
  if (name) diagnostics.success(`Safe scene set to "${name}"`, 'Press 0 or "panic" to return here.');
  else diagnostics.warn('No active scene to mark as safe');
}

function panic() {
  const name = registry.panic();
  if (name) diagnostics.success(`Panic — returned to "${name}"`);
  else diagnostics.warn('No safe scene set', 'Press "set safe" while a scene you trust is active.');
}

document.getElementById('set-safe').addEventListener('click', setSafeScene);
document.getElementById('panic').addEventListener('click', panic);

// --- patch library ---------------------------------------------------------------

/**
 * Insert a library patch into the editor and register it.
 *
 * It goes through the ordinary evaluation path — no privileged loading — so a library
 * patch is exactly as replaceable as one the student typed, and appears in the shelf
 * with a version number like any other.
 */
function insertFromLibrary(source, label) {
  editor.value = `${editor.value.trimEnd()}\n\n${source}\n`;
  const result = evaluator.evaluate(source, { label });
  if (result.ok) projection.setActiveCode(source);
  return result;
}

function buildDemoScene() {
  // The demo scene names every library patch, so they all have to be registered
  // before it can be composed.
  for (const entry of LIBRARY) {
    if (!registry.hasPatch(entry.name)) insertFromLibrary(entry.source, `patch ${entry.name}`);
  }
  evaluator.applyPending();
  insertFromLibrary(LIBRARY_DEMO, 'scene stacked');
}

// --- project export / import (D-02, D-03) ----------------------------------------

document.getElementById('export-project').addEventListener('click', () => {
  const name = projectStore.download(editor.value);
  diagnostics.success(`Exported ${name}`);
});

document.getElementById('import-project').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

/**
 * Start over — the counterpart to "↺" on a single patch.
 *
 * Deliberately NOT a page reload. Everything the performer authored goes, but the
 * canvas, the host clock, and the music keep running, which is the same promise the
 * rest of the system makes. It is behind a confirmation because it discards source
 * that is not saved anywhere else.
 */
document.getElementById('reset-project').addEventListener('click', async () => {
  const patchCount = registry.listPatches().length;
  const confirmed = await dialog.ask({
    title: 'Reset this project?',
    body:
      `This discards your editor contents, all ${patchCount} registered patch(es), ` +
      `their versions and history, every scene, and all patch state, and goes back to ` +
      `the starter project. The music and the canvas keep running.`,
    warning: 'There is no undo for this. Export first if you might want it back.',
    confirmLabel: 'Reset to starter',
  });
  if (!confirmed) return;

  evaluator.discardPending();
  projectStore.clear();
  registry.reset();
  stateStore.clear();
  host.reset();

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
      `and ${parsed.data.scenes.length} scene definition(s). Importing replaces your current ` +
      `editor contents and runs this code immediately.`,
    preview: parsed.data.source.slice(0, 1200),
    warning:
      'Response runs imported code with the same privileges as your own. It is not a ' +
      'sandbox — imported code can freeze this tab. Only import projects from someone you trust.',
    confirmLabel: 'Import and run',
  });
  if (!confirmed) {
    diagnostics.info('Import cancelled');
    return;
  }

  editor.value = parsed.data.source;
  evaluator.evaluate(parsed.data.source, { label: file.name });
  evaluator.applyPending();
  projectStore.restoreComposition(parsed.data);
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
    await audio.loadFile(file);
    await startAudio();
  } catch {
    /* reported */
  }
});

// --- performer shortcuts (available once editor focus is released) --------------

window.addEventListener('keydown', (event) => {
  controls.keys.add(event.key);
  controls.shift = event.shiftKey;
  controls.alt = event.altKey;

  const inEditor = document.activeElement?.tagName === 'TEXTAREA';
  if (inEditor || event.metaKey || event.ctrlKey) return;

  // P-04: performer shortcuts stay live once editor focus is released.
  if (event.key === ' ') {
    event.preventDefault();
    audio.toggle();
  }
  if (event.key === '0') {
    event.preventDefault();
    panic(); // S-06 / P-05: one action, back to a scene the performer trusts
  }
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
window.Response = {
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
