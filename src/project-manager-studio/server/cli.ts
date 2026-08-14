// Packaged Studio entry point: project discovery, loopback server, browser
// launch, browser-renewed idle lease, and one-shot graceful shutdown.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { ProjectCatalog, type ProjectSeed } from './project-catalog.js';
import { createServer } from './server.js';
import { createHeartbeatLease, createShutdownController, createStudioWatchdog } from './studio-lifecycle.mjs';

export { createServer } from './server.js';
export { ProjectCatalog } from './project-catalog.js';

const { loadProjectIdentity, loadProjectCatalogRoot } = require('../../../skills/project-manager/scripts/lib/project-state.js');
const SKILL_DIR = path.resolve(__dirname, '..');
const CLIENT_DIST_DIR = path.join(SKILL_DIR, 'studio', 'dist');
const USAGE = 'Usage: project-manager-studio.js [--project <folder>] [--projects-root <folder>] [--port <port>] [--no-open]';

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a folder value. ${USAGE}`);
  return value;
}

function parseArgs(argv: string[]): { project?: string; projectsRoot?: string; port?: number; open: boolean } {
  let project: string | undefined; let projectsRoot: string | undefined; let port: number | undefined; let open = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project' && project === undefined) project = valueAfter(argv, index++, arg);
    else if (arg === '--projects-root' && projectsRoot === undefined) projectsRoot = valueAfter(argv, index++, arg);
    else if (arg === '--port' && port === undefined) port = Number(valueAfter(argv, index++, arg));
    else if (arg === '--no-open' && open) open = false;
    else throw new Error(`Unknown or duplicate argument: ${arg}. ${USAGE}`);
  }
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('--port must be an integer from 0 to 65535');
  return { project, projectsRoot, port, open };
}

function buildCatalog(args: ReturnType<typeof parseArgs>): ProjectCatalog {
  if (args.project && !args.projectsRoot) {
    const identity = loadProjectIdentity(path.resolve(args.project));
    const seed: ProjectSeed = { id: identity.project.id, name: identity.project.name, root: identity.root };
    return new ProjectCatalog([seed], seed.root);
  }
  const requestedRoot = path.resolve(args.projectsRoot ?? '.projects');
  const discovered = loadProjectCatalogRoot(requestedRoot) as { root: string; projects: ProjectSeed[] };
  let initialRoot = discovered.projects[0].root;
  if (args.project) {
    const requestedProject = path.resolve(args.project);
    let stat;
    try { stat = fs.lstatSync(requestedProject); } catch { throw new Error('Explicit project must be an existing direct child of --projects-root'); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Explicit project must be a real direct child of --projects-root');
    const real = fs.realpathSync(requestedProject);
    const selected = discovered.projects.find((project) => project.root === real);
    if (!selected || path.dirname(real) !== discovered.root) throw new Error('Explicit project must be a direct child of --projects-root');
    initialRoot = selected.root;
  }
  return new ProjectCatalog(discovered.projects, initialRoot);
}

function openBrowser(url: string): ChildProcess | null {
  try {
    const child = process.platform === 'darwin'
      ? spawn('open', [url], { stdio: 'ignore', detached: true })
      : process.platform === 'win32'
        ? spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true })
        : spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return child;
  } catch { return null; }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const catalog = buildCatalog(args);
  const lease = createHeartbeatLease();
  const { app, sessionToken } = createServer({ catalog, clientDistDir: CLIENT_DIST_DIR, onHeartbeat: lease.heartbeat });
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : args.port;
  const url = `http://127.0.0.1:${port}/?token=${sessionToken}`;
  const browser = args.open ? openBrowser(url) : null;
  let closing: Promise<void> | null = null;
  let stopWatchdog = () => {};
  const close = () => closing ?? (closing = new Promise<void>((resolve) => {
    stopWatchdog();
    server.close(() => resolve()); server.closeAllConnections();
    if (browser && !browser.killed) browser.kill();
  }));
  const shutdown = createShutdownController({ close, exit: (code) => process.exit(code) });
  const watchdog = createStudioWatchdog({ lease, onExpired: shutdown });
  stopWatchdog = watchdog.stop;
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  return { url, close };
}

if (require.main === module) main().then(({ url }) => console.log(url)).catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error ? `${String(error.code)}: ` : '';
  console.error(`${code}${error instanceof Error ? error.message : error}`); process.exit(1);
});
