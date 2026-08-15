/* MCP App boundaries. Read-only is a property of what the sources call, not of
   what the bundle contains: the revision-safe read lives in the same shared
   module as the write path, so the guarantee is enforced at the call site.
   Also guards the deliberate separation from the Studio client. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { connect } = require('./_helpers');

const serverRoot = path.resolve(__dirname, '../../src/mcp-app');
const appRoot = path.resolve(__dirname, '../../src/project-manager-studio/mcp-app');
const MUTATION_ENTRY_POINTS = ['saveTaskEdit', 'checkTaskEdit', 'regenerateStatus', 'atomicProjectMutation'];

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(ts|tsx|mts|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

test('no MCP App source references a mutation entry point', () => {
  const offenders = [];
  for (const file of [...sources(serverRoot), ...sources(appRoot)]) {
    const text = fs.readFileSync(file, 'utf-8');
    for (const symbol of MUTATION_ENTRY_POINTS) {
      // Skip the comment that explains why the read path shares a module with writes.
      const stripped = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (new RegExp(`\\b${symbol}\\b`).test(stripped)) offenders.push(`${path.relative(appRoot, file)}: ${symbol}`);
    }
  }
  assert.deepEqual(offenders, [], 'the MCP App must never reach a write path');
});

test('the MCP App adapter does not import the standalone Studio client', () => {
  const offenders = [];
  for (const file of sources(appRoot)) {
    const text = fs.readFileSync(file, 'utf-8');
    if (/project-manager-studio\/client/.test(text)) offenders.push(path.relative(appRoot, file));
  }
  assert.deepEqual(offenders, [], 'the MCP App frontend is deliberately separate from Studio');
});

test('every registered tool is a read: repeated calls leave the project unchanged', async () => {
  const session = await connect();
  try {
    const before = fs.readFileSync(path.join(session.root, 'TASKS.md'), 'utf-8');
    const { tools } = await session.client.listTools();
    const status = await session.client.callTool({ name: 'pm_project_status', arguments: {} });
    const projectKey = status.structuredContent.projectKey;

    for (const tool of tools) {
      const args = Object.keys(tool.inputSchema?.properties ?? {}).includes('projectKey') ? { projectKey } : {};
      await session.client.callTool({ name: tool.name, arguments: args });
    }

    assert.equal(fs.readFileSync(path.join(session.root, 'TASKS.md'), 'utf-8'), before, 'no tool may write project state');
  } finally { await session.close(); }
});

test('the server exposes no tool whose name suggests a write', async () => {
  const session = await connect();
  try {
    const { tools } = await session.client.listTools();
    const writes = tools.filter((tool) => /\b(set|save|update|create|delete|edit|move|assign|start|complete)\b/i.test(tool.name));
    assert.deepEqual(writes.map((tool) => tool.name), []);
  } finally { await session.close(); }
});
