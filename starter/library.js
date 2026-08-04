// The patch library — five more behaviors, ready to insert and perform with.
//
// These are deliberately not in the starter file. The starter's job is to teach the
// one idea (§10.2: a first successful replacement in fifteen minutes), and a wall of
// code works against that. These are what you reach for once that has landed.
//
// Every one of them reads `config`, so a scene can hold several copies that differ:
//
//   add("ribbon", { y: 0.3, hue: 190 });
//   add("ribbon", { y: 0.7, hue: 40, mirror: true });
//
// and each copy keeps its own state. Between them they cover the spread of techniques
// the course teaches: spectrum arrays, waveform arrays, a particle system, a
// beat-triggered lifecycle hook, and nested-loop grid math.

/**
 * @typedef {{ name: string, blurb: string, source: string }} LibraryEntry
 */

/** @type {LibraryEntry[]} */
export const LIBRARY = [
  {
    name: 'bars',
    blurb: 'Spectrum bars. Copies can split the frequency range between them.',
    source: `// bars — the spectrum, read straight out of the FFT array.
//
// audio.spectrum is 0..255 over the whole frequency range. Slicing it with
// config.from/config.to lets two copies own different halves of the spectrum.
//
//   add("bars", { to: 0.25, hue: 200 });          // just the low end, tall
//   add("bars", { from: 0.25, to: 1, hue: 40 });  // everything above it
patch("bars", ({ audio, config }) => {
  const spectrum = audio.spectrum;
  if (spectrum.length === 0) return;

  const from = Math.floor((config.from ?? 0) * spectrum.length);
  const to = Math.floor((config.to ?? 0.5) * spectrum.length);
  const count = config.count ?? 48;
  const hue = config.hue ?? 200;
  const baseline = config.baseline ?? 1;   // 1 = bottom, 0.5 = middle
  const step = width / count;

  colorMode(HSB, 360, 100, 100, 1);
  noStroke();

  for (let i = 0; i < count; i++) {
    // Average a slice of bins into one bar, so the bar count is yours to choose
    // rather than being dictated by the FFT size.
    const lo = Math.floor(map(i, 0, count, from, to));
    const hi = Math.max(lo + 1, Math.floor(map(i + 1, 0, count, from, to)));
    let sum = 0;
    for (let b = lo; b < hi; b++) sum += spectrum[b];
    const energy = sum / (hi - lo) / 255;

    const h = energy * height * (config.scale ?? 0.6);
    fill(hue, 70, 40 + energy * 60, 0.85);
    rect(i * step, height * baseline - h, step - 2, h);
  }
});`,
  },

  {
    name: 'ribbon',
    blurb: 'A waveform ribbon. Stack copies at different heights and hues.',
    source: `// ribbon — the raw waveform as a line across the screen.
//
// audio.waveform is roughly -1..1, one value per sample window. This is the most
// direct picture of the sound there is: it is literally the speaker cone's path.
//
//   add("ribbon", { y: 0.35, hue: 190 });
//   add("ribbon", { y: 0.65, hue: 40, mirror: true });
patch("ribbon", {
  state: () => ({ smoothed: [] }),

  draw({ audio, state, config, dt }) {
    const wave = audio.waveform;
    if (wave.length === 0) return;

    const y = height * (config.y ?? 0.5);
    const amp = (config.amp ?? 0.25) * height;
    const hue = config.hue ?? 190;
    const mirror = config.mirror ?? false;

    // Smooth the waveform toward its new shape instead of snapping to it, so the
    // ribbon reads as a moving object rather than as noise. State is per copy, so
    // two ribbons smooth independently.
    if (state.smoothed.length !== wave.length) state.smoothed = Array.from(wave);
    const k = Math.min(1, dt * (config.responsiveness ?? 14));
    for (let i = 0; i < wave.length; i++) {
      state.smoothed[i] += (wave[i] - state.smoothed[i]) * k;
    }

    colorMode(HSB, 360, 100, 100, 1);
    noFill();
    strokeWeight(config.weight ?? 2);
    stroke(hue, 60, 100, 0.9);

    beginShape();
    for (let i = 0; i < state.smoothed.length; i++) {
      const x = map(i, 0, state.smoothed.length - 1, 0, width);
      vertex(x, y + state.smoothed[i] * amp);
    }
    endShape();

    if (mirror) {
      stroke(hue, 60, 100, 0.35);
      beginShape();
      for (let i = 0; i < state.smoothed.length; i++) {
        const x = map(i, 0, state.smoothed.length - 1, 0, width);
        vertex(x, y - state.smoothed[i] * amp);
      }
      endShape();
    }
  },
});`,
  },

  {
    name: 'swarm',
    blurb: 'A particle system pulled toward a moving point. Copies swarm separately.',
    source: `// swarm — a particle system. Objects in an array, each with its own velocity.
//
// The classic course exercise, made audio-reactive: treble sets how twitchy the
// particles are, bass sets how hard they are pulled home.
//
//   add("swarm", { count: 120, hue: 210 });
//   add("swarm", { count: 40, hue: 330, orbit: 0.6, size: 6 });
patch("swarm", {
  state: () => ({ particles: [], seeded: false }),

  draw({ audio, state, config, dt, time }) {
    const count = config.count ?? 90;
    const hue = config.hue ?? 210;
    const orbit = config.orbit ?? 0.3;
    const size = config.size ?? 3;

    // Seed once, and offset by a random phase so two copies never sit on top of
    // each other even with identical config.
    if (!state.seeded) {
      state.phase = random(TWO_PI);
      state.seeded = true;
    }
    while (state.particles.length < count) {
      state.particles.push({ x: random(width), y: random(height), vx: 0, vy: 0 });
    }
    if (state.particles.length > count) state.particles.length = count;

    // The point everything is pulled toward, circling slowly.
    const a = time * (config.speed ?? 0.4) + state.phase;
    const tx = width / 2 + cos(a) * width * orbit;
    const ty = height / 2 + sin(a * 1.3) * height * orbit;

    const pull = map(audio.bass, 0, 1, 20, 220);
    const jitter = map(audio.treble, 0, 1, 0, 340);
    const drag = config.drag ?? 0.94;

    colorMode(HSB, 360, 100, 100, 1);
    noStroke();

    for (const p of state.particles) {
      const dx = tx - p.x;
      const dy = ty - p.y;
      const distance = Math.max(1, Math.hypot(dx, dy));

      p.vx += (dx / distance) * pull * dt + random(-jitter, jitter) * dt;
      p.vy += (dy / distance) * pull * dt + random(-jitter, jitter) * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;

      const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 120);
      fill(hue + speed * 40, 70, 60 + speed * 40, 0.8);
      circle(p.x, p.y, size + speed * size * 2);
    }
  },
});`,
  },

  {
    name: 'pulse',
    blurb: 'Rings fired on every detected beat. Uses the beat() lifecycle hook.',
    source: `// pulse — expanding rings, one fired per detected onset.
//
// This is what the beat() lifecycle handler is for. beat() runs once on the rising
// edge of an onset; draw() runs every frame. Keeping "spawn" and "animate" in
// separate handlers is what makes the rhythm read as rhythm.
//
//   add("pulse", { hue: 50 });
//   add("pulse", { hue: 190, from: 0.7, thickness: 1 });
patch("pulse", {
  state: () => ({ rings: [] }),

  beat({ state, config }) {
    // Bounded, always. A ring per beat for thirty minutes is a memory leak.
    if (state.rings.length > (config.max ?? 24)) state.rings.shift();
    state.rings.push({ r: (config.from ?? 0) * width * 0.5, life: 1 });
  },

  draw({ state, config, dt, audio }) {
    const hue = config.hue ?? 50;
    const speed = (config.speed ?? 0.55) * width;
    const fade = config.fade ?? 0.55;

    colorMode(HSB, 360, 100, 100, 1);
    noFill();

    for (let i = state.rings.length - 1; i >= 0; i--) {
      const ring = state.rings[i];
      ring.r += speed * dt;
      ring.life -= fade * dt;
      if (ring.life <= 0) {
        state.rings.splice(i, 1);
        continue;
      }
      strokeWeight((config.thickness ?? 3) * ring.life);
      stroke(hue, 60, 100, ring.life * 0.9);
      circle(width / 2, height / 2, ring.r * 2);
    }

    // A soft floor so the patch is not invisible in a passage with no onsets.
    if (state.rings.length === 0 && audio.level > 0.05) {
      strokeWeight(1);
      stroke(hue, 40, 60, 0.3);
      circle(width / 2, height / 2, audio.level * width * 0.4);
    }
  },
});`,
  },

  {
    name: 'grid',
    blurb: 'A reactive grid of cells. Copies can be offset and rotated over each other.',
    source: `// grid — nested loops, and one band of the spectrum per cell.
//
// Each cell picks its own frequency band by position, so the grid is a picture of
// the whole spectrum laid out in two dimensions. Rotating a second copy on top of
// the first is worth trying.
//
//   add("grid", { cols: 16, rows: 9 });
//   add("grid", { cols: 8, rows: 5, rotate: 0.02, hue: 300, scale: 0.5 });
patch("grid", ({ audio, config, time }) => {
  const cols = config.cols ?? 12;
  const rows = config.rows ?? 7;
  const hue = config.hue ?? 160;
  const scale = config.scale ?? 0.9;
  const spectrum = audio.spectrum;

  const cellW = width / cols;
  const cellH = height / rows;

  colorMode(HSB, 360, 100, 100, 1);
  noStroke();
  rectMode(CENTER);

  // Rotating about the centre — push()/pop() is already wrapped around the whole
  // patch by the host, so this cannot leak into the next patch in the scene.
  if (config.rotate) {
    translate(width / 2, height / 2);
    rotate(time * config.rotate);
    translate(-width / 2, -height / 2);
  }

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      // Map the cell's position onto a frequency band, low at the left.
      const index = (x + y * cols) / (cols * rows);
      const energy =
        spectrum.length > 0
          ? spectrum[Math.floor(index * spectrum.length * 0.7)] / 255
          : audio.level;

      const size = Math.min(cellW, cellH) * scale * (0.15 + energy * 0.85);
      fill(hue + energy * 60, 60, 30 + energy * 70, 0.9);
      rect(x * cellW + cellW / 2, y * cellH + cellH / 2, size, size);
    }
  }
});`,
  },
];

/**
 * Ready-made source that stacks copies of the library patches into one scene.
 *
 * Takes the wash layer as a parameter rather than naming the starter's `wash`
 * outright. A scene(...) naming a patch that does not exist fails validation and is
 * rejected whole (S-02) — correct behavior, but it would mean the demo button
 * silently did nothing if the performer had renamed or reset away the starter. The
 * demo should not depend on anything outside the library.
 *
 * @param {boolean} withWash whether a patch named "wash" is currently registered
 */
export const libraryDemoSource = (withWash = true) => `// A scene built from several copies of the same patches.
//
// Each copy keeps its own state and its own config. Try removing one from the
// Scene panel, or adding a third ribbon.
scene("stacked", [${withWash ? '\n  "wash",' : ''}
  { patch: "grid",   config: { cols: 14, rows: 8, hue: 220, scale: 0.7 } },
  { patch: "grid",   config: { cols: 7,  rows: 4, hue: 320, scale: 0.35, rotate: 0.05 } },
  { patch: "ribbon", config: { y: 0.32, hue: 190 } },
  { patch: "ribbon", config: { y: 0.68, hue: 45, mirror: true } },
  { patch: "pulse",  config: { hue: 50 } },
]);
go("stacked");`;
