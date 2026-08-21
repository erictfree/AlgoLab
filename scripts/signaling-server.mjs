// Room discovery and WebRTC signaling. Media never passes through this service.

import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const MAX_TEXT = 120;

function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT) {
    throw new Error(`${label} must be 1–${MAX_TEXT} characters`);
  }
  return value.trim();
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export function attachSignalingServer(server, {
  path = '/network',
  roomToken = process.env.ALGOLAB_NETWORK_TOKEN ?? null,
  iceServers = [],
  allowedOrigins = process.env.ALGOLAB_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? null,
} = {}) {
  const sockets = new Map();
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  const roomState = (name) => {
    let room = rooms.get(name);
    if (!room) {
      room = { members: new Map(), publications: new Map() };
      rooms.set(name, room);
    }
    return room;
  };

  function streamList(room) {
    return [...room.publications.values()].map(({ id, name, performer, clientId }) => ({
      id,
      name,
      performer,
      label: `${performer}/${name}`,
      clientId,
    }));
  }

  function broadcastStreams(roomName) {
    const room = rooms.get(roomName);
    if (!room) return;
    const message = { type: 'streams', room: roomName, streams: streamList(room) };
    for (const socket of room.members.keys()) send(socket, message);
  }

  function leave(socket, roomName) {
    const room = rooms.get(roomName);
    if (!room) return;
    const member = room.members.get(socket);
    room.members.delete(socket);
    if (member) {
      for (const [id, publication] of room.publications) {
        if (publication.clientId === member.clientId) room.publications.delete(id);
      }
    }
    if (!room.members.size) rooms.delete(roomName);
    else broadcastStreams(roomName);
  }

  function error(socket, room, message) {
    send(socket, { type: 'error', room, message });
  }

  function handle(socket, raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
      if (!message || typeof message.type !== 'string') throw new Error('Missing message type');
    } catch (cause) {
      error(socket, null, `Invalid signaling message: ${cause.message}`);
      return;
    }

    const session = sockets.get(socket);
    try {
      if (message.type === 'join') {
        const roomName = text(message.room, 'Room name');
        const performer = text(message.performer, 'Performer name');
        if (roomToken && message.token !== roomToken) throw new Error('Room access denied');
        const room = roomState(roomName);
        room.members.set(socket, { clientId: session.clientId, performer });
        session.rooms.add(roomName);
        send(socket, {
          type: 'joined',
          room: roomName,
          clientId: session.clientId,
          iceServers,
        });
        broadcastStreams(roomName);
        return;
      }

      const roomName = text(message.room, 'Room name');
      const room = rooms.get(roomName);
      const member = room?.members.get(socket);
      if (!room || !member) throw new Error(`Join room "${roomName}" first`);

      if (message.type === 'leave') {
        leave(socket, roomName);
        session.rooms.delete(roomName);
        return;
      }

      if (message.type === 'publish') {
        const publicationId = text(message.publicationId, 'Publication id');
        const name = text(message.name, 'Stream name');
        const id = `${session.clientId}/${publicationId}`;
        room.publications.set(id, {
          id,
          publicationId,
          name,
          performer: member.performer,
          clientId: session.clientId,
          socket,
        });
        broadcastStreams(roomName);
        return;
      }

      if (message.type === 'unpublish') {
        room.publications.delete(`${session.clientId}/${text(message.publicationId, 'Publication id')}`);
        broadcastStreams(roomName);
        return;
      }

      if (message.type === 'subscribe') {
        const wanted = text(message.stream, 'Stream');
        const requestId = text(message.requestId, 'Request id');
        const publication = room.publications.get(wanted)
          ?? [...room.publications.values()].find((entry) => `${entry.performer}/${entry.name}` === wanted);
        if (!publication) throw new Error(`Stream "${wanted}" is not available`);
        send(publication.socket, {
          type: 'subscriber',
          room: roomName,
          streamId: publication.id,
          publicationId: publication.publicationId,
          fromClientId: session.clientId,
          requestId,
        });
        return;
      }

      if (message.type === 'signal') {
        const toClientId = text(message.toClientId, 'Target client');
        const requestId = text(message.requestId, 'Request id');
        const target = [...room.members.entries()].find(([, entry]) => entry.clientId === toClientId);
        if (!target) throw new Error('Signaling target is no longer connected');
        send(target[0], {
          type: 'signal',
          room: roomName,
          fromClientId: session.clientId,
          requestId,
          data: message.data,
        });
        return;
      }

      throw new Error(`Unknown signaling message "${message.type}"`);
    } catch (cause) {
      error(socket, message.room ?? null, cause.message);
    }
  }

  function disconnectSocket(socket) {
    const session = sockets.get(socket);
    if (!session) return;
    for (const roomName of [...session.rooms]) leave(socket, roomName);
    sockets.delete(socket);
  }

  function acceptSocket(socket, { wireEvents = true } = {}) {
    const session = { clientId: randomUUID(), rooms: new Set() };
    sockets.set(socket, session);
    send(socket, { type: 'hello', clientId: session.clientId });
    if (wireEvents) {
      socket.on('message', (raw) => handle(socket, raw));
      socket.on('close', () => disconnectSocket(socket));
    }
    return session.clientId;
  }

  wss.on('connection', (socket) => acceptSocket(socket));

  const onUpgrade = (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== path) {
      socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    let sameOrigin = false;
    try {
      sameOrigin = Boolean(origin && new URL(origin).host === request.headers.host);
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin && !allowedOrigins?.includes(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request));
  };
  server.on('upgrade', onUpgrade);

  return {
    close() {
      server.off('upgrade', onUpgrade);
      for (const socket of sockets.keys()) socket.close();
      wss.close();
    },
    snapshot() {
      return [...rooms.entries()].map(([name, room]) => ({
        name,
        members: room.members.size,
        streams: streamList(room),
      }));
    },
    // Protocol-level entry points keep the room state machine testable without
    // opening a TCP port. Production sockets enter through WebSocketServer above.
    accept(socket) {
      return acceptSocket(socket, { wireEvents: false });
    },
    receive(socket, message) {
      handle(socket, typeof message === 'string' ? message : JSON.stringify(message));
    },
    disconnect(socket) {
      disconnectSocket(socket);
    },
  };
}
