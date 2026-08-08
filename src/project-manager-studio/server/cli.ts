// Packaged Studio entry point: strict explicit-project CLI, validation before
// listen, loopback-only server, optional browser launch, and clean shutdown.
import http from 'node:http';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from './server.js';

const { loadRevisionedProject } = require('../../../skills/project-manager/scripts/lib/task-editor.js');
const SKILL_DIR = path.resolve(__dirname, '..');
const CLIENT_DIST_DIR = path.join(SKILL_DIR, 'studio', 'dist');

function parseArgs(argv: string[]): { project: string; port?: number; open: boolean } {
  let project: string | undefined; let port: number | undefined; let open = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project' && project === undefined) project = argv[++index];
    else if (arg === '--port' && port === undefined) port = Number(argv[++index]);
    else if (arg === '--no-open' && open) open = false;
    else throw new Error(`Unknown or duplicate argument: ${arg}`);
  }
  if (!project) throw new Error('Usage: project-manager-studio.js --project <folder> [--port <port>] [--no-open]');
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('--port must be an integer from 0 to 65535');
  return { project: path.resolve(project), port, open };
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
  const initial = loadRevisionedProject(args.project);
  const projectRoot = initial.state.root;
  const { app, sessionToken } = createServer({ projectRoot, clientDistDir: CLIENT_DIST_DIR });
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
  const close = () => closing ?? (closing = new Promise<void>((resolve) => {
    server.close(() => resolve()); server.closeAllConnections();
    if (browser && !browser.killed) browser.kill();
  }));
  process.on('SIGINT', () => void close().then(() => process.exit(0)));
  process.on('SIGTERM', () => void close().then(() => process.exit(0)));
  return { url, close };
}

if (require.main === module) main().then(({ url }) => console.log(url)).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
