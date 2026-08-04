// Audio engine — shared infrastructure, created once (PRD §7, A-03).
//
// Exactly one p5.Amplitude and one p5.FFT exist for the whole session, no matter how
// many patches are drawing. Patches never construct their own analyzers; they read the
// snapshot this module produces.
//
// Nothing in the evaluation path calls into this file. That is how A-04 is satisfied:
// evaluating code cannot restart playback or recreate an analyzer, because evaluating
// code has no way to reach either one.

import { createFeatureExtractor } from './features.js';

export function createAudioEngine({ diagnostics } = {}) {
  const features = createFeatureExtractor();

  let amplitude = null;
  let fft = null;
  let soundFile = null;
  let objectUrl = null;
  let sourceLabel = 'none';
  let lastReadAt = null;
  let failed = false;

  /** Called once from the host's setup(). */
  function init() {
    amplitude = new p5.Amplitude();
    fft = new p5.FFT(0.8, 1024);
    return { amplitude, fft };
  }

  /**
   * Load a browser-readable audio file (A-01). This is a user action, not an
   * evaluation, so it is allowed to replace the source.
   * @param {File} file
   */
  function loadFile(file) {
    return new Promise((resolve, reject) => {
      if (soundFile) {
        soundFile.stop();
        soundFile.dispose?.();
        soundFile = null;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);

      loadSound(
        objectUrl,
        (loaded) => {
          soundFile = loaded;
          sourceLabel = file.name;
          failed = false;
          features.reset();
          diagnostics?.info(`Loaded ${file.name}`, `${loaded.duration().toFixed(1)}s`);
          resolve(loaded);
        },
        (error) => {
          failed = true;
          sourceLabel = 'none';
          // A-07: a failed input is a diagnostic, not a stopped draw loop.
          diagnostics?.error(
            `Could not decode ${file.name}`,
            'Try a .mp3, .wav, .ogg, or .m4a file. The sketch keeps running on silence.',
          );
          reject(error);
        },
      );
    });
  }

  /** The explicit user gesture browsers require before audio may start (§10.2). */
  async function start() {
    const context = getAudioContext();
    if (context.state !== 'running') await context.resume();
    if (soundFile && !soundFile.isPlaying()) soundFile.play();
    return context.state;
  }

  function pause() {
    if (soundFile?.isPlaying()) soundFile.pause();
  }

  function toggle() {
    if (!soundFile) return false;
    if (soundFile.isPlaying()) {
      soundFile.pause();
      return false;
    }
    soundFile.play();
    return true;
  }

  function setLoop(value) {
    soundFile?.setLoop(!!value);
  }

  /**
   * One analysis pass per frame, shared by every patch that frame (A-03, A-05).
   * Returns a frozen snapshot in the shape of §9.5.
   */
  function readFrame() {
    const nowSeconds = performance.now() / 1000;
    const dt = lastReadAt === null ? 1 / 60 : Math.min(nowSeconds - lastReadAt, 0.25);
    lastReadAt = nowSeconds;

    if (!fft || !amplitude || getAudioContext().state !== 'running') {
      return features.silence();
    }

    const spectrum = fft.analyze();
    return features.compute({
      dt,
      level: amplitude.getLevel(),
      bass: fft.getEnergy('bass'),
      mid: fft.getEnergy('mid'),
      treble: fft.getEnergy('treble'),
      centroid: fft.getCentroid(),
      nyquist: getAudioContext().sampleRate / 2,
      waveform: fft.waveform(),
      spectrum,
    });
  }

  function status() {
    return {
      source: sourceLabel,
      failed,
      loaded: soundFile !== null,
      playing: soundFile?.isPlaying() ?? false,
      position: soundFile?.currentTime() ?? 0,
      duration: soundFile?.duration() ?? 0,
      contextState: typeof getAudioContext === 'function' ? getAudioContext().state : 'unknown',
    };
  }

  return { init, loadFile, start, pause, toggle, setLoop, readFrame, status };
}
