import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioEngine } from '../../src/audio/audioEngine.js';

const originalGetAudioContext = globalThis.getAudioContext;
const originalUserStartAudio = globalThis.userStartAudio;
const originalLoadSound = globalThis.loadSound;

afterEach(() => {
  if (originalGetAudioContext === undefined) delete globalThis.getAudioContext;
  else globalThis.getAudioContext = originalGetAudioContext;
  if (originalUserStartAudio === undefined) delete globalThis.userStartAudio;
  else globalThis.userStartAudio = originalUserStartAudio;
  if (originalLoadSound === undefined) delete globalThis.loadSound;
  else globalThis.loadSound = originalLoadSound;
});

describe('audio file loading status', () => {
  it('reports byte progress followed by decoding and completion', async () => {
    let succeed;
    let progress;
    globalThis.loadSound = vi.fn((_url, onSuccess, _onFailure, onProgress) => {
      succeed = onSuccess;
      progress = onProgress;
    });
    const updates = [];
    const engine = createAudioEngine();
    const file = new Blob(['not real audio']);
    Object.defineProperty(file, 'name', { value: 'set.mp3' });

    const pending = engine.loadFile(file, { onProgress: (status) => updates.push(status) });
    expect(engine.status()).toMatchObject({
      source: 'set.mp3',
      loading: true,
      loadPhase: 'loading',
      loadProgress: null,
      loaded: false,
    });

    progress(0.42);
    expect(engine.status()).toMatchObject({ loadPhase: 'loading', loadProgress: 0.42 });
    progress(0.99);
    expect(engine.status()).toMatchObject({ loadPhase: 'decoding', loadProgress: 0.99 });

    const loaded = {
      duration: () => 125,
      isPlaying: () => false,
      currentTime: () => 0,
    };
    succeed(loaded);
    await expect(pending).resolves.toBe(loaded);
    expect(engine.status()).toMatchObject({
      source: 'set.mp3',
      loading: false,
      loadPhase: null,
      loadProgress: null,
      loaded: true,
    });
    expect(updates.map((update) => update.loadPhase)).toEqual([
      'loading',
      'loading',
      'decoding',
      null,
    ]);
  });

  it('clears loading state and exposes a useful error when decoding fails', async () => {
    let fail;
    globalThis.loadSound = vi.fn((_url, _onSuccess, onFailure) => {
      fail = onFailure;
    });
    const engine = createAudioEngine();
    const file = new Blob(['bad audio']);
    Object.defineProperty(file, 'name', { value: 'broken.mp3' });

    const pending = engine.loadFile(file);
    fail(new Error('decode failed'));

    await expect(pending).rejects.toThrow('decode failed');
    expect(engine.status()).toMatchObject({
      source: 'none',
      loading: false,
      loaded: false,
      failed: true,
      error: 'Could not decode broken.mp3',
    });
  });
});

describe('Safari-safe audio unlocking', () => {
  it('uses p5 userStartAudio while handling the trusted user gesture', async () => {
    const context = {
      state: 'suspended',
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
    };
    globalThis.getAudioContext = () => context;
    globalThis.userStartAudio = vi.fn(async () => {
      context.state = 'running';
    });

    await expect(createAudioEngine().unlock()).resolves.toBe('running');
    expect(globalThis.userStartAudio).toHaveBeenCalledOnce();
    expect(context.resume).not.toHaveBeenCalled();
  });

  it('falls back to AudioContext.resume when the p5 helper leaves it suspended', async () => {
    const context = {
      state: 'suspended',
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
    };
    globalThis.getAudioContext = () => context;
    globalThis.userStartAudio = vi.fn(async () => {});

    await expect(createAudioEngine().unlock()).resolves.toBe('running');
    expect(globalThis.userStartAudio).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
  });
});
