/* Agent Plugins 1.0 package: the repository root is the installable plugin and
   uses the standard's fixed layout and manifest constraints. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const pkg = path.resolve(__dirname, '../..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(pkg, file), 'utf-8'));

test('the package uses the standard fixed root layout', () => {
  for (const entry of ['plugin.json', 'mcp.json', 'skills', 'bin', 'ui']) {
    assert.ok(fs.existsSync(path.join(pkg, entry)), `${entry} must sit at the plugin root`);
  }
  // Skills are discovered as immediate child directories containing SKILL.md.
  const skills = fs.readdirSync(path.join(pkg, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pkg, 'skills', entry.name, 'SKILL.md')));
  assert.ok(skills.length >= 1, 'at least one discoverable skill');
  assert.ok(skills.some((entry) => entry.name === 'project-manager'));
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
