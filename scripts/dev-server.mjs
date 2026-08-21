// Static development server plus the small WebSocket introduction service used by
// StreamRoom. WebRTC media still travels browser-to-browser, never through this app.
//
// AlgoLab is a plain HTML page — there is no bundler and no compile step. But ES
// modules will not load from a `file://` URL, so the page needs an HTTP origin.
// This server supplies that origin and the optional signaling control plane. The
// only runtime package is `ws`; the visual app itself remains plain browser modules.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachSignalingServer } from './signaling-server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);

function configuredIceServers() {
  const value = process.env.ALGOLAB_ICE_SERVERS;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new TypeError('expected a JSON array');
    return parsed;
  } catch (error) {
    console.error(`Invalid ALGOLAB_ICE_SERVERS: ${error.message}`);
    process.exitCode = 1;
    return [];
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve against the project root and refuse anything that escapes it.
  const filePath = join(ROOT, normalize(pathname));
  if (!filePath.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      // The performer edits and reloads constantly; never serve a stale module.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${pathname}`);
  }
});

attachSignalingServer(server, { iceServers: configuredIceServers() });

server.listen(PORT, () => {
  console.log(`AlgoLab — serving ${ROOT}`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  ws://localhost:${PORT}/network — room discovery + WebRTC signaling`);
});
