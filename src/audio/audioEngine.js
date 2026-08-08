// Audio engine — shared infrastructure, created once (PRD §7, A-03).
//
// Exactly one p5.Amplitude and one p5.FFT exist for the whole session, no matter how
// many strategies are drawing, and no matter how many times the input source changes.
// Strategies never construct their own analyzers; they read the snapshot this module
// produces.
//
// Nothing in the evaluation path calls into this file. That is how A-04 is satisfied:
// evaluating code cannot restart playback or recreate an analyzer, because evaluating
// code has no way to reach either one.

import { createFeatureExtractor } from './features.js';

/** @typedef {'none'|'file'|'mic'} SourceKind */

export function createAudioEngine({ diagnostics } = {}) {
  const features = createFeatureExtractor();

  let amplitude = null;
  let fft = null;
  let soundFile = null;
  let mic = null;
  let objectUrl = null;

  /** @type {SourceKind} */
  let sourceKind = 'none';
  let sourceLabel = 'none';
  let sourceError = null;
  let loadPhase = null;
  let loadProgress = null;
  let lastReadAt = null;

  /** Called once from the host's setup(). */
  function init() {
    amplitude = new p5.Amplitude();
    fft = new p5.FFT(0.8, 1024);
    return { amplitude, fft };
  }

  /**
   * Point the one Amplitude and the one FFT at whatever is currently the source.
   *
   * This is the only place input routing changes. A mic is deliberately NOT connected
   * to the master output — doing so on a laptop with open speakers is a feedback loop
   * — so the analyzers have to be told about it explicitly rather than listening to
   * master as they do for a file.
   */
  function route(node) {
    if (!amplitude || !fft) return;
    amplitude.setInput(node);
    fft.setInput(node);
  }

  // --- file input (A-01) ----------------------------------------------------------

  /**
   * Load a browser-readable audio file. This is a user action, not an evaluation, so
   * it is allowed to replace the source.
   * p5 reports byte progress while the browser reads the file. Decoding happens
   * afterward and has no measurable progress, so it is exposed as its own phase.
   * @param {File} file
   * @param {{ onProgress?: (status: ReturnType<typeof status>) => void }} [options]
   */
  function loadFile(file, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const report = () => onProgress?.(status());
      stopMic();
      if (soundFile) {
        soundFile.stop();
        soundFile.dispose?.();
        soundFile = null;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      sourceKind = 'none';
      sourceLabel = file.name;
      sourceError = null;
      loadPhase = 'loading';
      loadProgress = null;
      report();

      loadSound(
        objectUrl,
        (loaded) => {
          soundFile = loaded;
          sourceKind = 'file';
          sourceLabel = file.name;
          sourceError = null;
          loadPhase = null;
          loadProgress = null;
          route(loaded);
          features.reset();
          diagnostics?.info(`Loaded ${file.name}`, `${loaded.duration().toFixed(1)}s`);
          report();
          resolve(loaded);
        },
        (error) => {
          sourceKind = 'none';
          sourceLabel = 'none';
          sourceError = `Could not decode ${file.name}`;
          loadPhase = null;
          loadProgress = null;
          // A-07: a failed input is a diagnostic, not a stopped draw loop.
          diagnostics?.error(
            sourceError,
            'Try a .mp3, .wav, .ogg, or .m4a file. The sketch keeps running on silence.',
          );
          report();
          reject(error);
        },
        (progress) => {
          if (!Number.isFinite(progress)) return;
          loadProgress = Math.min(1, Math.max(0, progress));
          // This p5.sound build deliberately caps byte progress at 0.99 while
          // decodeAudioData is running, so 99% is the handoff to decoding.
          loadPhase = loadProgress >= 0.99 ? 'decoding' : 'loading';
          report();
        },
      );
    });
  }

  // --- microphone / line input (A-02) ---------------------------------------------

  /**
   * Switch to live input. The browser prompts for permission the first time; a denial
   * is reported and leaves the system running on silence rather than throwing.
   * @param {string} [deviceId] from listInputs()
   */
  async function useMicrophone(deviceId) {
    await unlock();

    // Ask for permission before touching p5.AudioIn, so a denial produces one clear
    // message instead of a half-initialized input that silently reads zero.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      // p5.AudioIn opens its own stream; this one existed only to prompt and to prove
      // the device works.
      for (const track of stream.getTracks()) track.stop();
    } catch (error) {
      sourceError = 'Microphone permission denied';
      diagnostics?.error(
        sourceError,
        `${error.name}: the sketch keeps running on silence. Check your browser's site permissions, then try again.`,
      );
      return false;
    }

    if (soundFile?.isPlaying()) soundFile.pause();
    stopMic();

    mic = new p5.AudioIn((error) => {
      sourceError = 'Microphone failed to start';
      diagnostics?.error(sourceError, String(error));
    });
    if (deviceId) {
      const inputs = await mic.getSources();
      const index = inputs.findIndex((d) => d.deviceId === deviceId);
      if (index >= 0) mic.setSource(index);
    }
    mic.start(
      () => {
        sourceKind = 'mic';
        sourceLabel = deviceId ? 'line/mic input' : 'microphone';
        sourceError = null;
        route(mic);
        features.reset();
        diagnostics?.success('Live input running', 'Analyzing the microphone or line input.');
      },
      (error) => {
        sourceKind = 'none';
        sourceLabel = 'none';
        sourceError = 'Microphone failed to start';
        diagnostics?.error(sourceError, String(error));
      },
    );
    return true;
  }

  function stopMic() {
    if (!mic) return;
    mic.stop();
    mic.dispose?.();
    mic = null;
  }

  /** Selectable input devices, for the source picker (A-02). */
  async function listInputs() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` }));
    } catch (error) {
      diagnostics?.warn('Could not list audio inputs', error.message);
      return [];
    }
  }

  // --- transport ------------------------------------------------------------------

  /**
   * Unlock p5.sound while execution still belongs to a trusted click/change/drop.
   *
   * Safari is stricter than Chromium here: resuming only after an asynchronously
   * decoded file has loaded can be too late because the original user activation has
   * ended. p5's helper also performs the tiny platform-specific start sequence its
   * sound graph expects; the direct resume remains as a defensive fallback.
   */
  async function unlock() {
    const context = getAudioContext();
    if (typeof userStartAudio === 'function') await userStartAudio();
    if (context.state !== 'running') await context.resume();
    if (context.state !== 'running') {
      throw new Error(`Audio context stayed ${context.state}`);
    }
    return context.state;
  }

  /** The explicit user gesture browsers require before audio may start (§10.2). */
  async function start() {
    const state = await unlock();
    if (sourceKind === 'file' && soundFile && !soundFile.isPlaying()) soundFile.play();
    return state;
  }

  function pause() {
    if (soundFile?.isPlaying()) soundFile.pause();
  }

  async function toggle() {
    if (sourceKind !== 'file' || !soundFile) return false;
    if (soundFile.isPlaying()) {
      soundFile.pause();
      return false;
    }
    await unlock();
    soundFile.play();
    return true;
  }

  function setLoop(value) {
    soundFile?.setLoop(!!value);
  }

  // --- analysis -------------------------------------------------------------------

  /**
   * One analysis pass per frame, shared by every strategy that frame (A-03, A-05).
   * Returns a frozen snapshot in the shape of §9.5.
   */
  function readFrame() {
    const nowSeconds = performance.now() / 1000;
    const dt = lastReadAt === null ? 1 / 60 : Math.min(nowSeconds - lastReadAt, 0.25);
    lastReadAt = nowSeconds;

    // A-07: no source, a suspended context, or a failed input all produce a stable
    // silence snapshot. The draw loop never learns that anything went wrong.
    if (!fft || !amplitude || sourceKind === 'none' || getAudioContext().state !== 'running') {
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
      kind: sourceKind,
      source: sourceLabel,
      error: sourceError,
      failed: sourceError !== null,
      loading: loadPhase !== null,
      loadPhase,
      loadProgress,
      loaded: sourceKind !== 'none',
      playing: sourceKind === 'mic' ? mic !== null : (soundFile?.isPlaying() ?? false),
      position: soundFile?.currentTime() ?? 0,
      duration: soundFile?.duration() ?? 0,
      contextState: typeof getAudioContext === 'function' ? getAudioContext().state : 'unknown',
    };
  }

  return {
    init,
    loadFile,
    unlock,
    useMicrophone,
    listInputs,
    stopMic,
    start,
    pause,
    toggle,
    setLoop,
    readFrame,
    status,
    /** Live smoothing / auto-gain controls (A-06). */
    configure: features.configure,
    featureOptions: features.options,
  };
}
