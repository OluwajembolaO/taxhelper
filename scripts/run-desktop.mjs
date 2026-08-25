// Launches the desktop app locally without packaging it.
// Exists only to strip ELECTRON_RUN_AS_NODE, which VS Code's terminal sets and
// which silently turns electron.exe into plain Node (every API undefined).
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Spawn the binary directly: no shell, so arguments are passed as an array.
const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
