import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_PATCH_NAMES,
  LIBRARY,
  RAVE_PATCH_NAMES,
  libraryDemoSource,
  upgradeOpaqueDiagnostics,
} from '../../starter/library.js';
import { STARTER_SOURCE, upgradeLegacyPlasma } from '../../starter/starter.js';
import { createTestHost } from './helpers.js';

const RAVE_PATCHES = [
  'strobe',
  'waveScope',
  'checkerZoom',
  'laserFan',
  'glitchSlices',
  'spectrumHalo',
  'kaleido',
  'pixelRain',
  'neonTunnel',
  'beatBurst',
];

const MIX_ORDER = RAVE_PATCH_NAMES;

describe('the rave teaching library', () => {
  it('keeps the starter shader subtle and upgrades the original bright feedback version', () => {
    expect(STARTER_SOURCE).toContain('float softBlob(');
    expect(STARTER_SOURCE).toContain('float warp = 0.0012 + bass * 0.005;');
    expect(STARTER_SOURCE).toContain(
      'intensity = ({ audio }) => 0.0038 + audio.bass * 0.006 + audio.mid * 0.002;',
    );
    expect(STARTER_SOURCE).toContain(
      'this.#program.setUniform("uIntensity", this.intensity({ audio, time }));',
    );
    expect(STARTER_SOURCE).not.toContain('float bands = 0.5 + 0.5 * cos(');

    const legacy = STARTER_SOURCE
      .replace('float warp = 0.0012 + bass * 0.005;', 'float warp = 0.008 + bass * 0.035;')
      .replace(
        'float radius = length(centered);',
        'float bands = 0.5 + 0.5 * cos(\n        radius * 16.0\n      );\n      vec3 plasmaColour = mix(cyan, magenta, 0.5);\n      float radius = length(centered);',
      );

    expect(upgradeLegacyPlasma(legacy)).toBe(STARTER_SOURCE);

    const previousSubtle = STARTER_SOURCE
      .replace(
        '\n\n  // An arrow function can be a live parameter too. It receives the same changing\n  // draw context as the patch, then turns the audio into one shader value.\n  // Try doubling 0.006, or replace audio.bass with audio.treble.\n  intensity = ({ audio }) => 0.0038 + audio.bass * 0.006 + audio.mid * 0.002;',
        '',
      )
      .replace('    uniform float uIntensity;\n', '')
      .replace('ambient *= uIntensity;', 'ambient *= 0.0038 + bass * 0.006 + mid * 0.002;')
      .replace(
        '    this.#program.setUniform("uIntensity", this.intensity({ audio, time }));\n',
        '',
      );

    expect(upgradeLegacyPlasma(previousSubtle)).toBe(STARTER_SOURCE);
  });

  it('evaluates the arrow-controlled Plasma as ordinary live JavaScript', () => {
    const h = createTestHost();
    const result = h.evaluator.evaluate(STARTER_SOURCE);
    h.host.commitPendingChanges();

    expect(result.ok).toBe(true);
    expect(h.registry.hasStrategy('plasma')).toBe(true);
  });

  it('ships ten independently installable patches in varied JavaScript forms', () => {
    const entries = new Map(LIBRARY.map((entry) => [entry.name, entry]));
    for (const name of RAVE_PATCHES) {
      expect(entries.get(name)?.source).toContain(`// %% patch ${name}`);
    }

    expect(entries.get('strobe').source).toMatch(/function strobe\s*\(/);
    expect(entries.get('waveScope').source).toMatch(/const waveScope\s*=\s*\(/);
    expect(entries.get('checkerZoom').source).toMatch(/const checkerZoom\s*=\s*\(/);
    expect(entries.get('laserFan').source).toMatch(/const laserFan\s*=\s*{/);
    expect(entries.get('glitchSlices').source).toMatch(/const glitchSlices\s*=\s*{/);
    expect(entries.get('spectrumHalo').source).toMatch(/const spectrumHalo\s*=\s*{/);
    expect(entries.get('kaleido').source).toContain('function makeKaleido(');
    expect(entries.get('pixelRain').source).toContain('function makePixelRain(');
    expect(entries.get('neonTunnel').source).toContain('class NeonTunnel');
    expect(entries.get('beatBurst').source).toContain('class BeatBurst');
  });

  it('gives an arrow-function patch a declared live parameter', () => {
    const source = LIBRARY.find((entry) => entry.name === 'checkerZoom').source;
    expect(source).toContain('param("checkerSpeed", 0.08');
    expect(source).toContain('({ audio, time, params }) =>');
    expect(source).toContain('time * params.checkerSpeed');
  });

  it('ships independently installable waveform, spectrum and feature diagnostics', () => {
    const entries = new Map(LIBRARY.map((entry) => [entry.name, entry]));
    expect(DIAGNOSTIC_PATCH_NAMES).toEqual(['waveform', 'frequencyBars', 'audioMeters']);

    for (const name of DIAGNOSTIC_PATCH_NAMES) {
      const entry = entries.get(name);
      expect(entry.category).toBe('utility');
      expect(entry.source).toContain(`// %% patch ${name}`);
      expect(entry.blurb).toMatch(/^Diagnostic:/);
    }

    expect(entries.get('waveform').source).toContain('audio.waveform');
    expect(entries.get('frequencyBars').source).toContain('audio.spectrum');
    expect(entries.get('frequencyBars').source).not.toContain('fill(0, 0, 0');
    expect(entries.get('frequencyBars').source).not.toContain('rect(0, top');
    expect(entries.get('frequencyBars').source).not.toContain('opacity:');
    expect(entries.get('frequencyBars').source).not.toMatch(
      /fill\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/,
    );
    expect(entries.get('audioMeters').source).toContain('audio.bass');
    expect(entries.get('audioMeters').source).toContain('audio.mid');
    expect(entries.get('audioMeters').source).toContain('audio.treble');
    expect(entries.get('audioMeters').source).not.toContain('fill(8, 8, 12');
    expect(entries.get('audioMeters').source).not.toContain('fill(...colour,');
  });

  it('ships a transparent-friendly solid background utility', () => {
    const entry = LIBRARY.find(({ name }) => name === 'solidBackground');
    expect(entry.category).toBe('utility');
    expect(entry.source).toContain('// %% patch solidBackground');
    expect(entry.source).toContain('background(...this.colour)');
    expect(entry.source).toContain('Put it first in the scene array');
  });

  it('upgrades copied diagnostic defaults without touching other patch cells', () => {
    const source = `// %% patch frequencyBars
const frequencyBars = {
  panelHeight: 0.34,
  draw() { fill(100, 145, 255, 230); fill(190, 125, 255, 230); fill(255, 190, 95, 230); }
};

// %% patch audioMeters
const audioMeters = { draw() { fill(...colour, 220); } };

// %% patch studentPatch
const studentPatch = { draw() { fill(100, 145, 255, 230); } };`;

    const upgraded = upgradeOpaqueDiagnostics(source);
    expect(upgraded).toContain('heightRatio: 0.34');
    expect(upgraded).toContain('fill(100, 145, 255);');
    expect(upgraded).toContain('fill(...colour);');
    expect(upgraded).toContain('studentPatch = { draw() { fill(100, 145, 255, 230); } }');
  });

  it('gives every system library patch an explicit display category', () => {
    expect(LIBRARY.every(({ category }) => ['visual', 'utility', 'shader'].includes(category)))
      .toBe(true);
    expect(LIBRARY.find(({ name }) => name === 'cellularBlobular').category).toBe('shader');
  });

  it('ships a ShaderChain example with live higher-order parameters', () => {
    const entry = LIBRARY.find(({ name }) => name === 'shaderFlow');
    expect(entry.category).toBe('shader');
    expect(entry.source).toContain('new ShaderChain()');
    expect(entry.source).toContain('.rotate(({ time, audio }) =>');
    expect(entry.source).toContain('.scale(({ audio }) =>');
    expect(entry.source).toContain('.hue(({ time, audio }) =>');
  });

  it('includes the credited Hydra feedback study as a configurable shader class', () => {
    const source = LIBRARY.find((entry) => entry.name === 'cellularBlobular').source;
    const h = createTestHost();
    const result = h.evaluator.evaluate(source);
    h.host.commitPendingChanges();

    expect(source).toContain('After Mahalia H-R');
    expect(source).toContain('class CellularBlobular');
    expect(source).toContain('uniform sampler2D uFeedback;');
    expect(source).toContain('scale = ({ audio, time }) =>');
    expect(source).toContain('repeats = ({ audio, time }) =>');
    expect(result.ok).toBe(true);
    expect(h.registry.hasStrategy('cellularBlobular')).toBe(true);
  });

  it('installs every form and composes all ten without activating them early', () => {
    const h = createTestHost();
    for (const entry of LIBRARY.filter((candidate) => RAVE_PATCHES.includes(candidate.name))) {
      expect(h.evaluator.evaluate(entry.source).ok).toBe(true);
      h.frame(2);
      expect(h.registry.hasStrategy(entry.name)).toBe(true);
      expect(h.registry.activeInstancesOf(entry.name)).toHaveLength(0);
    }

    expect(h.evaluator.evaluate(libraryDemoSource()).ok).toBe(true);
    h.evaluator.applyPending();
    expect(h.registry.activeSceneName()).toBe('stacked');
    expect(h.registry.activeOrder()).toEqual(MIX_ORDER);
  });

  it('can evaluate all ten source cells as one fast installation batch', () => {
    const h = createTestHost();
    const batch = LIBRARY.filter((entry) => RAVE_PATCHES.includes(entry.name))
      .map((entry) => entry.source)
      .join('\n\n');

    expect(h.evaluator.evaluate(batch).ok).toBe(true);
    h.frame(2);
    expect(RAVE_PATCHES.every((name) => h.registry.hasStrategy(name))).toBe(true);
    expect(h.registry.activeOrder()).toEqual([]);
  });
});
