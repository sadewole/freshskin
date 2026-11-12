// Runs the HTTP server in development: one initial TypeScript build, then `tsc --watch`
// alongside `node --watch`. No extra dependency and no stale `.js` files: the watched process
// only ever runs the compiled output.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const children = new Set();
let shuttingDown = false;

function start(args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) other.kill('SIGTERM');
    process.exitCode = signal === null ? (code ?? 1) : 1;
  });
  return child;
}

async function buildOnce() {
  const build = spawn(process.execPath, [tsc, '-p', 'tsconfig.server.json'], {
    cwd: root,
    stdio: 'inherit',
  });
  const code = await new Promise((resolveExit) => build.on('exit', resolveExit));
  if (code !== 0) process.exit(code ?? 1);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await buildOnce();
start([tsc, '-p', 'tsconfig.server.json', '--watch', '--preserveWatchOutput']);
start(['--watch', 'dist/app/server.js']);
