// Builds the Windows desktop installer.
//
// WHY THIS EXISTS instead of calling electron-builder directly:
//
// 1. Windows Defender holds a lock on Electron's freshly extracted binaries
//    while it scans them. electron-builder renames the staging directory the
//    instant extraction finishes, which fails with EPERM inside a watched
//    project folder. Staging in %TEMP% avoids the race entirely; the finished
//    installer is then copied back, which Defender does not block.
//
// 2. VS Code's terminal exports ELECTRON_RUN_AS_NODE=1, which makes
//    electron.exe behave as plain Node — every Electron API comes back
//    undefined. It must be *deleted* from the environment, not set to ''.
//
// Usage: npm run dist

import { build, Platform } from 'electron-builder';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const STAGING = join(tmpdir(), 'taxhelper-build');
const OUT = 'release';

rmSync(STAGING, { recursive: true, force: true });
mkdirSync(STAGING, { recursive: true });

// See note 2 above — must be deleted, not set to ''. Done in-process so every
// tool electron-builder launches inherits a clean environment.
delete process.env.ELECTRON_RUN_AS_NODE;

console.log(`building in ${STAGING} …`);
try {
  // Called through the API rather than spawned, so there is no shell involved
  // and no argument concatenation.
  await build({
    targets: Platform.WINDOWS.createTarget(),
    config: { directories: { output: STAGING } },
  });
} catch (err) {
  console.error('\nelectron-builder failed:', err.message);
  process.exit(1);
}

// Copy just the installer back — not win-unpacked/, which is ~388 MB of
// intermediate output nobody needs.
mkdirSync(OUT, { recursive: true });
const installers = readdirSync(STAGING).filter((f) => f.endsWith('.exe'));

if (!installers.length) {
  console.error(`No installer produced in ${STAGING}`);
  process.exit(1);
}

for (const name of installers) {
  const from = join(STAGING, name);
  const to = join(OUT, name);
  cpSync(from, to);
  const mb = (statSync(to).size / 1048576).toFixed(0);
  console.log(`\n  ${to}  (${mb} MB)`);
}

if (existsSync(STAGING)) rmSync(STAGING, { recursive: true, force: true });

console.log(`
Installer ready in ${OUT}/.

It is unsigned, so Windows SmartScreen will show
"Windows protected your PC" the first time you run it.
Click More info -> Run anyway. Signing it would need a
code-signing certificate, which costs money.
`);
