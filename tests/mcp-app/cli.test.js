/* MCP App CLI: argument parsing, projects-root resolution from argument and
   environment, and a stdio launch that opens no socket and keeps stdout clean
   for JSON-RPC framing. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { builtServerPath, makeProject } = require('./_helpers');

const { parseArgs, resolveProjectsRoot, buildCatalog } = require(builtServerPath);

/** A projects root holding one generated project, as a catalog launch expects. */
function makeProjectsRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-mcp-root-'));
  const project = makeProject();
  const target = path.join(root, 'delivery');
  fs.cpSync(project, target, { recursive: true });
  return fs.realpathSync(root);
}

test('arguments parse into an explicit project and projects root', () => {
  assert.deepEqual(parseArgs([]), { project: undefined, projectsRoot: undefined });
  assert.deepEqual(parseArgs(['--project', '/a']), { project: '/a', projectsRoot: undefined });
  assert.deepEqual(parseArgs(['--projects-root', '/b']), { project: undefined, projectsRoot: '/b' });
  assert.deepEqual(parseArgs(['--project', '/a', '--projects-root', '/b']), { project: '/a', projectsRoot: '/b' });
});

test('unknown, duplicate, and value-less arguments are rejected with usage', () => {
  for (const argv of [['--http'], ['--port', '3000'], ['--nope'], ['--project', '/a', '--project', '/b'], ['--project'], ['--project', '--projects-root']]) {
    assert.throws(() => parseArgs(argv), /Usage: project-manager-mcp\.js/, `${argv.join(' ')} must be rejected`);
  }
});

test('the projects root resolves from the argument, then the environment, then the default', () => {
  const env = { PROJECT_MANAGER_PROJECTS_ROOT: '/from-env' };
  assert.equal(resolveProjectsRoot({ projectsRoot: '/from-arg' }, env), path.resolve('/from-arg'));
  assert.equal(resolveProjectsRoot({}, env), path.resolve('/from-env'));
  assert.equal(resolveProjectsRoot({}, {}), path.resolve('.projects'));
});

test('a projects root supplied by argument and by environment produce the same catalog', () => {
  const root = makeProjectsRoot();
  const fromArgument = buildCatalog({ projectsRoot: root }, {}).data();
  const fromEnvironment = buildCatalog({}, { PROJECT_MANAGER_PROJECTS_ROOT: root }).data();
  assert.deepEqual(
    fromArgument.projects.map((project) => project.id),
    fromEnvironment.projects.map((project) => project.id),
  );
  assert.ok(fromArgument.projects.length >= 1);
});

test('an unusable projects root fails naming the path that was tried', () => {
  const missing = path.join(os.tmpdir(), 'pm-mcp-absent-root');
  fs.rmSync(missing, { recursive: true, force: true });
  assert.throws(
    () => buildCatalog({ projectsRoot: missing }, {}),
    (error) => error.code === 'PROJECTS_ROOT_UNAVAILABLE'
      && error.message.includes(missing)
      && error.message.includes('PROJECT_MANAGER_PROJECTS_ROOT'),
  );
});

test('an explicit project outside the projects root is refused', () => {
  const root = makeProjectsRoot();
  const outsider = makeProject();
  assert.throws(() => buildCatalog({ projectsRoot: root, project: outsider }, {}), /direct child/);
});

test('a stdio launch answers initialize on stdout and opens no socket', async () => {
  const root = makeProjectsRoot();
  const child = spawn(process.execPath, [builtServerPath, '--projects-root', root], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf-8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf-8').on('data', (chunk) => { stderr += chunk; });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cli-test', version: '1.0.0' } },
    })}\n`);

    const deadline = Date.now() + 10000;
    while (!stdout.includes('"result"') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));

    assert.match(stdout, /"jsonrpc":"2\.0"/, `expected JSON-RPC on stdout, got: ${stdout} / ${stderr}`);
    assert.equal(stderr, '', 'a healthy launch writes nothing to stderr');
    for (const line of stdout.split('\n').filter(Boolean)) JSON.parse(line); // stdout carries framing only
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('close', resolve));
  }
});

test('an unusable launch exits non-zero with usage on stderr and nothing on stdout', async () => {
  const child = spawn(process.execPath, [builtServerPath, '--http'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.setEncoding('utf-8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf-8').on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.once('close', resolve));
  assert.notEqual(code, 0);
  assert.match(stderr, /Unknown or duplicate argument: --http/);
  assert.match(stderr, /Usage: project-manager-mcp\.js/);
  assert.equal(stdout, '');
});
