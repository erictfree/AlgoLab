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
import { createProjectStore } from './persistence/projectStore.js';
import { STARTER_SOURCE } from '../starter/starter.js';

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

// --- editor + panels ------------------------------------------------------------

const editor = createEditor(document.getElementById('code'), {
  onEvaluate: (source, label) => evaluator.evaluate(source, { label }),
  onChange: (source) => projectStore.saveSoon(source),
  onEscape: () => document.getElementById('stage').focus(),
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
document.getElementById('file-label-2').addEventListener('click', () => {
  document.getElementById('audio-file-2').click();
});
document.getElementById('start-audio').addEventListener('click', startAudio);
document.getElementById('play-toggle').addEventListener('click', () => audio.toggle());

let looping = false;
document.getElementById('loop-toggle').addEventListener('click', (event) => {
  looping = !looping;
  audio.setLoop(looping);
  event.currentTarget.style.borderColor = looping ? 'var(--ok)' : '';
});

// Drop an audio file anywhere on the stage (§10.2 step 2).
const stage = document.getElementById('stage');
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

  if (event.key === ' ') {
    event.preventDefault();
    audio.toggle();
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
window.Response = { registry, stateStore, evaluator, host, audio, diagnostics, editor };
