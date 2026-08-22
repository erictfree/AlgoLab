// Assemble the Cloudflare Workers static-asset tree.
//
// The marketing site owns `/`. The live instrument keeps its source-relative module
// paths and assets under `/live/`. Networking will be added to the Worker separately.

import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const LIVE = join(DIST, 'live');

const include = (source) => basename(source) !== '.DS_Store';

await rm(DIST, { recursive: true, force: true });
await cp(join(ROOT, 'site'), DIST, { recursive: true, filter: include });
await mkdir(LIVE, { recursive: true });
await cp(join(ROOT, 'index.html'), join(LIVE, 'index.html'));

for (const directory of ['assets', 'src', 'starter', 'vendor']) {
  await cp(join(ROOT, directory), join(LIVE, directory), {
    recursive: true,
    filter: include,
  });
}

console.log('Built Cloudflare static assets:');
console.log('  /      site/index.html');
console.log('  /live/ index.html + instrument assets');
