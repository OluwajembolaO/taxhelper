// Post-build step: bake the real asset list into the service worker.
//
// WHY: Vite fingerprints asset filenames (index-C1x9.js), so a hand-written
// precache list can never name them. Worse, the first page load races the
// worker — those requests go out before it takes control, so they are never
// cached, and the next offline visit serves the shell then dies fetching its
// own scripts. Precaching at install time is what actually makes it work.
//
// Runs automatically as part of `npm run build`.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIST = 'dist';

/** Every file under dist/, as root-relative URLs. */
function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ url: '/' + rel.replace(/\\/g, '/'), full });
  }
  return out;
}

const files = walk(DIST);

// Precache what the app needs to boot. Screenshots, source maps and the worker
// itself are excluded — a worker must never precache itself.
const precache = files
  .filter(({ url }) => !/\.map$/.test(url))
  .filter(({ url }) => url !== '/sw.js')
  .map(({ url }) => url)
  // '/' and '/index.html' are the same document; keep both so a bare
  // navigation hits the cache either way.
  .concat(['/']);

const unique = [...new Set(precache)].sort();

// Cache name derives from content, so a new build invalidates the old cache
// and the activate handler deletes it.
const hash = createHash('sha256');
for (const { full } of files.filter((f) => !/\.map$/.test(f.url))) {
  hash.update(readFileSync(full));
}
const version = hash.digest('hex').slice(0, 8);

const swPath = join(DIST, 'sw.js');
let sw = readFileSync(swPath, 'utf8');

const before = sw;
sw = sw
  .replace(/const CACHE = .*;/, `const CACHE = 'taxhelper-${version}';`)
  .replace(/const SHELL = \[[^\]]*\];/, `const SHELL = ${JSON.stringify(unique, null, 2)};`);

if (sw === before) {
  console.error('build-sw: could not find CACHE / SHELL declarations in sw.js — aborting');
  process.exit(1);
}

writeFileSync(swPath, sw);
console.log(`build-sw: precaching ${unique.length} files as taxhelper-${version}`);
