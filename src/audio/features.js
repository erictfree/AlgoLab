// Audio features — the shared snapshot of PRD §9.5.
//
// Pure and p5-free on purpose: this is the part with real arithmetic in it, so it is
// the part worth unit-testing. audioEngine.js does the p5.sound plumbing and hands the
// raw numbers here.
//
// Two design decisions the PRD leaves open (§19.3) are settled here:
//
//   - Normalized 0..1 values are the top-level names. p5.sound's own scales survive
//     under `raw`, so a student can still learn the underlying API deliberately.
//   - Normalization is a decaying-peak auto-gain, not a fixed divisor. A quiet track
//     and a loud track should both drive `map(audio.bass, 0, 1, ...)` usefully, which
//     is the mapping students actually write.

const EPSILON = 1e-6;

export const FEATURE_DEFAULTS = Object.freeze({
  smoothing: 0.6, // 0 = no smoothing, ->1 = heavy
  gainDecay: 0.4, // how fast the auto-gain ceiling falls, per second
  gainFloor: 0.02, // never divide by something tiny and turn silence into noise
  autoGain: true, // A-06: off means "divide by nothing", raw 0..1 passes through
  beatThreshold: 1.3, // bass must exceed this multiple of its recent average
  beatFloor: 0.08, // ...and be at least this loud, so silence never beats
  beatRise: 0.05, // ...and must actually have risen since the previous frame
  beatMemory: 0.35, // seconds of bass history the average covers
  minBeatInterval: 0.12, // seconds; ~500 BPM ceiling, filters double-triggers
});

export function createFeatureExtractor(overrides = {}) {
  // Held in one mutable object rather than closed-over constants, so the performer
  // can tune smoothing and auto-gain from the Audio panel mid-set (A-06).
  const options = { ...FEATURE_DEFAULTS, ...overrides };

  const smoothed = { level: 0, bass: 0, mid: 0, treble: 0, centroid: 0 };
  const ceiling = {
    level: options.gainFloor,
    bass: options.gainFloor,
    mid: options.gainFloor,
    treble: options.gainFloor,
  };
  let bassAverage = 0;
  let previousBass = 0;
  let sinceBeat = 999;

  const EMPTY = new Float32Array(0);

  /**
   * @param {object} input raw values straight off p5.sound
   * @param {number} input.dt seconds since the previous frame
   * @param {number} input.level 0..1 from p5.Amplitude
   * @param {number} input.bass 0..255 from p5.FFT#getEnergy
   * @param {number} input.mid 0..255
   * @param {number} input.treble 0..255
   * @param {number} input.centroid Hz from p5.FFT#getCentroid
   * @param {number} input.nyquist Hz, half the sample rate
   */
  function compute(input) {
    const dt = clamp(input.dt ?? 0, 0, 0.25);
    const raw = {
      level: clamp(input.level ?? 0, 0, 8),
      bass: clamp((input.bass ?? 0) / 255, 0, 1),
      mid: clamp((input.mid ?? 0) / 255, 0, 1),
      treble: clamp((input.treble ?? 0) / 255, 0, 1),
    };

    // Exponential smoothing, made frame-rate independent so a 30 FPS laptop and a
    // 60 FPS one feel the same.
    const alpha = options.smoothing <= 0 ? 1 : 1 - Math.pow(options.smoothing, dt * 60);
    smoothed.level += (raw.level - smoothed.level) * alpha;
    smoothed.bass += (raw.bass - smoothed.bass) * alpha;
    smoothed.mid += (raw.mid - smoothed.mid) * alpha;
    smoothed.treble += (raw.treble - smoothed.treble) * alpha;

    const decay = Math.pow(1 - clamp(options.gainDecay, 0, 0.99), dt);
    const level = normalize('level', smoothed.level, decay);
    const bass = normalize('bass', smoothed.bass, decay);
    const mid = normalize('mid', smoothed.mid, decay);
    const treble = normalize('treble', smoothed.treble, decay);

    // Centroid on a log scale — musically, 200 Hz to 400 Hz is the same distance as
    // 2 kHz to 4 kHz, and a linear divide by nyquist would pin everything near zero.
    const nyquist = input.nyquist || 22050;
    const centroidHz = clamp(input.centroid ?? 0, 0, nyquist);
    const centroid =
      centroidHz <= 20 ? 0 : clamp(Math.log(centroidHz / 20) / Math.log(nyquist / 20), 0, 1);

    // Onset (§9.5 `beat`).
    //
    // Deliberately computed from the RAW band energy, not the auto-gained value.
    // Auto-gain exists to flatten dynamics so map() behaves consistently — which is
    // exactly the information an onset detector needs. Running detection on the
    // normalized value means a steady quiet loop reads as permanently loud and
    // nothing ever registers as a hit.
    //
    // Three conditions, and all three are load-bearing:
    //   floor   — silence and room noise must never beat
    //   rise    — the energy has to have actually gone up since the last frame, so a
    //             sustained bass note fires once rather than every frame
    //   average — the rise has to be large relative to the recent past, not just any
    //             wobble
    sinceBeat += dt;
    const memoryAlpha = options.beatMemory <= 0 ? 1 : clamp(dt / options.beatMemory, 0, 1);
    const beat =
      raw.bass > options.beatFloor &&
      raw.bass - previousBass > options.beatRise &&
      raw.bass > bassAverage * options.beatThreshold &&
      sinceBeat >= options.minBeatInterval;
    if (beat) sinceBeat = 0;
    bassAverage += (raw.bass - bassAverage) * memoryAlpha;
    previousBass = raw.bass;

    return Object.freeze({
      level,
      bass,
      mid,
      treble,
      centroid,
      beat,
      sinceBeat,
      waveform: input.waveform ?? EMPTY,
      spectrum: input.spectrum ?? EMPTY,
      raw: Object.freeze({
        level: raw.level,
        bass: input.bass ?? 0,
        mid: input.mid ?? 0,
        treble: input.treble ?? 0,
        centroid: centroidHz,
      }),
    });
  }

  /** Decaying-peak auto-gain: the ceiling jumps up instantly and sags back slowly. */
  function normalize(band, value, decay) {
    const current = ceiling[band];
    const next = Math.max(value, Math.max(options.gainFloor, current * decay));
    ceiling[band] = next;
    // With auto-gain off the ceiling still tracks, so switching it back on mid-set
    // resumes from a sensible level rather than from silence.
    if (!options.autoGain) return clamp(value, 0, 1);
    return clamp(value / (next + EPSILON), 0, 1);
  }

  /** The snapshot handed to patches when there is no sound at all (A-07). */
  function silence() {
    return Object.freeze({
      level: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      centroid: 0,
      beat: false,
      sinceBeat: 999,
      waveform: EMPTY,
      spectrum: EMPTY,
      raw: Object.freeze({ level: 0, bass: 0, mid: 0, treble: 0, centroid: 0 }),
    });
  }

  /** Tune smoothing / auto-gain live from the Audio panel (A-06). */
  function configure(changes = {}) {
    for (const [key, value] of Object.entries(changes)) {
      if (key in FEATURE_DEFAULTS) options[key] = value;
    }
    return { ...options };
  }

  function reset() {
    smoothed.level = smoothed.bass = smoothed.mid = smoothed.treble = smoothed.centroid = 0;
    ceiling.level = ceiling.bass = ceiling.mid = ceiling.treble = options.gainFloor;
    bassAverage = 0;
    previousBass = 0;
    sinceBeat = 999;
  }

  return { compute, silence, reset, configure, options: () => ({ ...options }) };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}
