// Public live-coding objects for networked canvas streams.

import { getDefaultNetworkManager } from './networkManager.js';

const FITS = new Set(['cover', 'contain', 'stretch']);

function required(label, value) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} must be a non-empty string`);
  return result;
}

class PublisherPatch {
  constructor(room, options = {}) {
    this.room = room.name;
    this.performer = room.performer;
    this.name = required('Published stream name', options.name);
    this.fps = Number.isFinite(options.fps) ? Math.max(1, Math.min(60, options.fps)) : 30;
    this.source = options.source ?? null;
    this.status = 'idle';
    this.#roomConfig = room;
    this.#manager = room.manager;
    this.#owner = Symbol(`publish:${this.name}`);
    this.#id = options.id ?? this.name;
  }

  #roomConfig;
  #manager;
  #owner;
  #id;
  #handle = null;
  #activeCount = 0;

  enter(inputs) {
    this.#activeCount += 1;
    if (this.#handle) return;
    try {
      this.#handle = this.#manager.acquirePublisher({
        id: this.#id,
        name: this.name,
        fps: this.fps,
        source: this.source,
        owner: this.#owner,
        room: this.#roomConfig,
      }, inputs);
      this.status = this.#handle.status;
    } catch (error) {
      this.#activeCount = Math.max(0, this.#activeCount - 1);
      this.status = 'error';
      throw error;
    }
  }

  draw(inputs) {
    // Host instance identity survives live replacement, so a replacement definition
    // may draw without receiving a second enter(). Lazily acquiring here preserves
    // the stream while still keeping construction side-effect free.
    if (!this.#handle) this.enter(inputs);
    if (this.#handle) this.status = this.#handle.room.joined ? 'publishing' : 'connecting';
  }

  exit() {
    this.#release();
  }

  dispose() {
    this.#release(true);
  }

  #release(force = false) {
    this.#activeCount = force ? 0 : Math.max(0, this.#activeCount - 1);
    if (this.#activeCount > 0) return;
    this.#manager.releasePublisher(this.#handle, this.#owner);
    this.#handle = null;
    this.status = 'idle';
  }
}

class ReceiverPatch {
  constructor(room, options = {}) {
    this.room = room.name;
    this.performer = room.performer;
    this.stream = required('Received stream', options.stream);
    this.fit = options.fit ?? 'cover';
    if (!FITS.has(this.fit)) throw new TypeError('Receiver fit must be cover, contain, or stretch');
    this.opacity = Number.isFinite(options.opacity)
      ? Math.max(0, Math.min(1, options.opacity))
      : 1;
    this.status = 'idle';
    this.#roomConfig = room;
    this.#manager = room.manager;
    this.#owner = Symbol(`receive:${this.stream}`);
  }

  #roomConfig;
  #manager;
  #owner;
  #handle = null;
  #activeCount = 0;

  get texture() {
    return this.#handle?.media ?? null;
  }

  get video() {
    return this.#handle?.video ?? null;
  }

  enter() {
    this.#activeCount += 1;
    if (this.#handle) return;
    this.#handle = this.#manager.acquireReceiver({
      room: this.#roomConfig,
      stream: this.stream,
      owner: this.#owner,
    });
    this.status = this.#handle.status;
  }

  draw(inputs) {
    if (!this.#handle) this.enter(inputs);
    this.status = this.#handle.status;
    this.#manager.drawReceiver(this.#handle, inputs, {
      fit: this.fit,
      opacity: this.opacity,
    });
  }

  exit() {
    this.#release();
  }

  dispose() {
    this.#release(true);
  }

  #release(force = false) {
    this.#activeCount = force ? 0 : Math.max(0, this.#activeCount - 1);
    if (this.#activeCount > 0) return;
    this.#manager.releaseReceiver(this.#handle, this.#owner);
    this.#handle = null;
    this.status = 'idle';
  }
}

/**
 * A declarative performance-room configuration.
 *
 * It does not connect by itself. Its publisher and receiver objects retain the
 * shared host connection only while they are active in a scene.
 */
export class StreamRoom {
  constructor({
    name,
    performer,
    token = null,
    iceServers = null,
    manager = getDefaultNetworkManager(),
  } = {}) {
    this.name = required('Room name', name);
    this.performer = required('Performer name', performer);
    this.token = token;
    this.iceServers = iceServers;
    this.manager = manager;
  }

  publish(options) {
    return new PublisherPatch(this, options);
  }

  receive(options) {
    return new ReceiverPatch(this, options);
  }

  get streams() {
    return this.manager.snapshot().rooms.find((room) => room.name === this.name)?.streams ?? [];
  }
}
