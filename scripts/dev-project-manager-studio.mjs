// Dev loop for Project Manager Studio: esbuild watches and rebuilds the server
// bundle, restarting the server on every successful rebuild via an onEnd hook
// (node --watch does not reliably notice esbuild's rewritten output file).
// vite watches and rebuilds the client. Pass CLI args through to the server,
// e.g. `npm run pm-studio:dev -- --project /abs/path`. With no selector it
// materializes a disposable demo because Task Contracts bind absolute roots.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(root, 'src/project-manager-studio/server/cli.ts');
const serverOut = path.join(root, 'skills/project-manager/scripts/project-manager-studio.js');
const vitePath = path.join(root, 'node_modules/.bin/vite');
const passedArgs = process.argv.slice(2);
const hasProjectArg = passedArgs.includes('--project') || passedArgs.includes('--projects-root');
let disposableDemoRoot = null;

function createDisposableDemo() {
  const fixtureScript = path.join(root, 'tests/project-manager-studio/create-browser-fixture.js');
  const result = spawnSync(process.execPath, [fixtureScript, '--project-only'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`;
    throw new Error(`Could not create the Project Manager Studio demo: ${detail}`);
  }
  let fixture;
  try { fixture = JSON.parse(result.stdout.trim()); } catch {
    throw new Error('Could not create the Project Manager Studio demo: fixture output was not valid JSON');
  }
  if (!fixture.project) throw new Error('Could not create the Project Manager Studio demo: project root was missing');
  disposableDemoRoot = fixture.project;
  return fixture.project;
}

const serverArgs = hasProjectArg ? passedArgs : ['--project', createDisposableDemo(), ...passedArgs];

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
  if (disposableDemoRoot) {
    const temporaryRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
    const resolvedDemoRoot = path.resolve(disposableDemoRoot);
    if (resolvedDemoRoot.startsWith(temporaryRoot) && path.basename(resolvedDemoRoot).startsWith('pm-studio-')) {
      fs.rmSync(resolvedDemoRoot, { recursive: true, force: true });
    }
  }
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
