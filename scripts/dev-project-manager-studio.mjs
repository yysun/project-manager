// Dev loop for Project Manager Studio: esbuild watches and rebuilds the server
// bundle, restarting the server on every successful rebuild via an onEnd hook
// (node --watch does not reliably notice esbuild's rewritten output file).
// vite watches and rebuilds the client. Pass CLI args through to the server,
// e.g. `npm run pm-studio:dev -- --project /abs/path`. Defaults to the
// checked-in demo project when no --project/--projects-root is passed.
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(root, 'src/project-manager-studio/server/cli.ts');
const serverOut = path.join(root, 'skills/project-manager/scripts/project-manager-studio.js');
const vitePath = path.join(root, 'node_modules/.bin/vite');
const passedArgs = process.argv.slice(2);
const hasProjectArg = passedArgs.includes('--project') || passedArgs.includes('--projects-root');
const serverArgs = hasProjectArg ? passedArgs : ['--project', path.join(root, 'demo/pm-studio-demo'), ...passedArgs];

let shuttingDown = false;
let serverChild = null;
let viteChild = null;

function startServer() {
  serverChild = spawn(process.execPath, [serverOut, ...serverArgs], { cwd: root, stdio: 'inherit' });
  serverChild.on('exit', (code) => {
    if (!shuttingDown && code) console.error(`[studio] exited with code ${code}`);
  });
}

function restartServer() {
  if (serverChild && serverChild.exitCode === null) {
    serverChild.once('exit', startServer);
    serverChild.kill('SIGTERM');
  } else {
    startServer();
  }
}

const restartPlugin = {
  name: 'restart-server',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        console.log('[server] rebuilt, restarting studio...');
        restartServer();
      } else {
        console.error('[server] build failed, keeping previous server running');
      }
    });
  },
};

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (viteChild && viteChild.exitCode === null) viteChild.kill('SIGTERM');
  if (serverChild && serverChild.exitCode === null) serverChild.kill('SIGTERM');
  await ctx.dispose();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const ctx = await esbuild.context({
  entryPoints: [serverEntry],
  outfile: serverOut,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
  plugins: [restartPlugin],
});
await ctx.watch();

viteChild = spawn(vitePath, ['build', '--watch', '--config', 'vite.project-manager.config.mts'], { cwd: root, stdio: 'inherit' });
viteChild.on('exit', (code) => {
  if (!shuttingDown && code) console.error(`[client] exited with code ${code}`);
});
