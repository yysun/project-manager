/* Agent Plugins 1.0 package: the repository root is the installable plugin and
   uses the standard's fixed layout and manifest constraints. Both canonical
   sibling skills are complete independently installable units. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const pkg = path.resolve(__dirname, '../..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(pkg, file), 'utf-8'));
const TEST_MANAGER_FILES = [
  'SKILL.md',
  'agents/openai.yaml',
  'assets/cases.md',
  'assets/root-status.md',
  'assets/root-suites.md',
  'assets/root-testing.md',
  'assets/runs.md',
  'assets/steps.md',
  'assets/studio.cmd',
  'assets/studio.sh',
  'assets/suite.md',
  'references/conventions.md',
  'references/execution-and-reporting.md',
  'references/test-design.md',
  'scripts/test-manager-studio.mjs',
  'scripts/test-manager.mjs',
  'tests/test-manager.test.mjs',
  'ui/studio.css',
  'ui/studio.html',
  'ui/studio.js',
  'ui/timeline-model.mjs',
];
const TEST_MANAGER_EXECUTABLES = new Set([
  'assets/studio.sh',
  'scripts/test-manager-studio.mjs',
  'scripts/test-manager.mjs',
]);

function relativeFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) return relativeFiles(root, target);
    assert.equal(entry.isFile(), true, `installable skills cannot contain non-file entry ${target}`);
    return path.relative(root, target).split(path.sep).join('/');
  });
}

test('the package uses the standard fixed root layout', () => {
  for (const entry of ['plugin.json', 'mcp.json', 'skills', 'bin', 'ui']) {
    assert.ok(fs.existsSync(path.join(pkg, entry)), `${entry} must sit at the plugin root`);
  }
  // Skills are discovered as immediate child directories containing SKILL.md.
  const skills = fs.readdirSync(path.join(pkg, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pkg, 'skills', entry.name, 'SKILL.md')));
  assert.deepEqual(
    skills.map((entry) => entry.name).sort(),
    ['project-manager', 'test-manager'],
    'the plugin exposes both canonical sibling skills',
  );
});

test('Test Manager ships the complete reviewed standalone inventory and executable modes', () => {
  const root = path.join(pkg, 'skills/test-manager');
  assert.deepEqual(relativeFiles(root).sort(), [...TEST_MANAGER_FILES].sort());
  if (process.platform !== 'win32') {
    for (const relative of TEST_MANAGER_FILES) {
      const expected = TEST_MANAGER_EXECUTABLES.has(relative) ? 0o755 : 0o644;
      assert.equal(
        fs.statSync(path.join(root, relative)).mode & 0o777,
        expected,
        `${relative} must retain mode ${expected.toString(8)}`,
      );
    }
  }
});

test('plugin.json declares the required fields and a conformant name', () => {
  const manifest = read('plugin.json');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 1 && manifest.name.length <= 64);
  assert.match(manifest.name, /^[a-z0-9][a-z0-9.-]*$/, 'lowercase alphanumeric, hyphens, and periods only');
  assert.doesNotMatch(manifest.name, /--|\.\./, 'no consecutive hyphens or periods');
  assert.match(manifest.version, /^\d+\.\d+\.\d+/, 'semantic version recommended by the standard');
});

test('the private npm workspace exposes explicit release version commands', () => {
  const pkgJson = read('package.json');
  assert.equal(pkgJson.private, true);
  assert.equal(pkgJson.version, '0.0.0', 'npm workspace version is not the product release version');
  assert.equal(pkgJson.scripts['version:check'], 'node scripts/check-version.mjs');
  assert.equal(pkgJson.scripts['release:version'], 'node scripts/release-version.mjs');
});

test('mcp.json declares one stdio server resolved through the plugin-root variable', () => {
  const manifest = read('mcp.json');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  const servers = Object.entries(manifest.mcpServers);
  assert.equal(servers.length, 1);
  const [, server] = servers[0];
  assert.equal(server.type, 'stdio');
  // Path variables expand in args, env, and cwd — never in command — so command
  // must be a bare executable name or a ./ plugin-relative path.
  assert.doesNotMatch(server.command, /\$\{/, 'command must not use a path variable');
  assert.ok(/^[\w.-]+$/.test(server.command) || server.command.startsWith('./'), 'command must be a bare name or ./ path');
  assert.ok(server.args.some((arg) => arg.includes('${PLUGIN_ROOT}')), 'the entry point resolves through ${PLUGIN_ROOT}');
  assert.ok(server.cwd === '${PLUGIN_ROOT}' || server.cwd === '${PLUGIN_DATA}' || server.cwd.startsWith('./'));
  assert.equal(server.url, undefined, 'a stdio server declares no url');
});

test('the declared server entry point exists inside the package', () => {
  const server = Object.values(read('mcp.json').mcpServers)[0];
  const entry = server.args.find((arg) => arg.includes('${PLUGIN_ROOT}')).replace('${PLUGIN_ROOT}/', '');
  assert.ok(fs.existsSync(path.join(pkg, entry)), `${entry} must ship in the package`);
  assert.match(fs.readFileSync(path.join(pkg, entry), 'utf-8').slice(0, 32), /^#!/, 'the bundle keeps its shebang');
});

test('both views ship with the package', () => {
  for (const view of ['status.html', 'board.html']) {
    assert.ok(fs.existsSync(path.join(pkg, 'ui', view)), `${view} must ship`);
  }
});

test('the packaged skill routes display requests through the UI-bearing MCP tools', () => {
  const skill = fs.readFileSync(path.join(pkg, 'skills/project-manager/SKILL.md'), 'utf-8');
  assert.match(skill, /call `pm_project_status` once/);
  assert.match(skill, /call `pm_open_board` once/);
  assert.match(skill, /Do not substitute `project-status\.js` or call both routes/);
  assert.match(skill, /If the required MCP tool is unavailable or fails, fall back to the scripts/);
});

test('compiled MCP artifacts stay outside the skill runtime', () => {
  assert.equal(fs.existsSync(path.join(pkg, 'skills/project-manager/scripts/project-manager-mcp.js')), false);
  assert.equal(fs.existsSync(path.join(pkg, 'skills/project-manager/mcp-app')), false);
});

test('no generated package directory duplicates the root plugin', () => {
  assert.equal(fs.existsSync(path.join(pkg, 'dist')), false);
  assert.equal(fs.existsSync(path.join(pkg, 'plugins')), false);
  assert.equal(fs.existsSync(path.join(pkg, '.agents/plugins/marketplace.json')), false);
});
