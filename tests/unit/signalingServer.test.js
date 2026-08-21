import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachSignalingServer } from '../../scripts/signaling-server.mjs';

class FakeSocket {
  constructor() {
    this.readyState = WebSocket.OPEN;
    this.messages = [];
  }

  send(raw) {
    this.messages.push(JSON.parse(String(raw)));
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }

  find(predicate) {
    return this.messages.find(predicate);
  }
}

describe('signaling service', () => {
  it('discovers publications and routes subscriptions and peer signals within a room', () => {
    const server = createServer();
    const signaling = attachSignalingServer(server, {
      iceServers: [{ urls: 'stun:example.test' }],
    });
    const alice = new FakeSocket();
    const bob = new FakeSocket();
    const aliceId = signaling.accept(alice);
    const bobId = signaling.accept(bob);

    signaling.receive(alice, { type: 'join', room: 'Thursday', performer: 'Alice' });
    signaling.receive(bob, { type: 'join', room: 'Thursday', performer: 'Bob' });
    expect(bob.find((message) => message.type === 'joined').iceServers)
      .toEqual([{ urls: 'stun:example.test' }]);

    signaling.receive(alice, {
      type: 'publish',
      room: 'Thursday',
      publicationId: 'main',
      name: 'main-output',
    });
    const listing = bob.messages.findLast(
      (message) => message.type === 'streams' && message.streams.length === 1,
    );
    expect(listing.streams[0]).toMatchObject({
      name: 'main-output',
      performer: 'Alice',
      label: 'Alice/main-output',
      clientId: aliceId,
    });

    signaling.receive(bob, {
      type: 'subscribe',
      room: 'Thursday',
      stream: listing.streams[0].id,
      requestId: 'request-1',
    });
    expect(alice.find((message) => message.type === 'subscriber')).toMatchObject({
      fromClientId: bobId,
      requestId: 'request-1',
      publicationId: 'main',
    });

    signaling.receive(bob, {
      type: 'signal',
      room: 'Thursday',
      toClientId: aliceId,
      requestId: 'request-1',
      data: { candidate: { candidate: 'ice' } },
    });
    expect(alice.find((message) => message.type === 'signal')).toMatchObject({
      fromClientId: bobId,
      requestId: 'request-1',
      data: { candidate: { candidate: 'ice' } },
    });

    signaling.disconnect(alice);
    expect(signaling.snapshot()[0].streams).toEqual([]);
    signaling.close();
    server.close();
  });

  it('rejects optional-token failures', () => {
    const server = createServer();
    const signaling = attachSignalingServer(server, { roomToken: 'invite-only' });
    const outsider = new FakeSocket();
    signaling.accept(outsider);
    signaling.receive(outsider, { type: 'join', room: 'private', performer: 'Eve' });
    expect(outsider.find((message) => message.type === 'error')).toMatchObject({
      room: 'private',
      message: 'Room access denied',
    });
    expect(signaling.snapshot()).toEqual([]);
    signaling.close();
    server.close();
  });
});
