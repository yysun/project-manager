/* MCP App tool contract: model-facing tools link a ui:// view and return a
   compact summary, app-only tools stay out of the model's list while remaining
   callable by the app, and project selection resolves only through issued keys. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { connect, text } = require('./_helpers');

const MODEL_TOOLS = ['pm_project_status', 'pm_open_board'];
const APP_TOOLS = ['pm_list_projects', 'pm_get_project'];

function uiMeta(tool) {
  const meta = tool._meta ?? {};
  return { ...(meta.ui ?? {}), legacyUri: meta['ui/resourceUri'] };
}

test('model-facing tools are listed and each links a ui:// resource', async () => {
  const session = await connect();
  try {
    const { tools } = await session.client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of MODEL_TOOLS) {
      const tool = byName.get(name);
      assert.ok(tool, `${name} should be listed`);
      const ui = uiMeta(tool);
      const uri = ui.resourceUri ?? ui.legacyUri;
      assert.match(uri, /^ui:\/\/project-manager\/(status|board)\.html$/, `${name} should link a ui:// resource`);
    }
  } finally { await session.close(); }
});

test('app-only tools declare app visibility so the host withholds them from the model', async () => {
  const session = await connect();
  try {
    const { tools } = await session.client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of APP_TOOLS) {
      const tool = byName.get(name);
      assert.ok(tool, `${name} should exist on the server`);
      assert.deepEqual(uiMeta(tool).visibility, ['app'], `${name} must be app-only`);
      assert.equal(uiMeta(tool).resourceUri, undefined, `${name} must not render a view`);
    }
    for (const name of MODEL_TOOLS) {
      const visibility = uiMeta(byName.get(name)).visibility;
      assert.ok(visibility === undefined || visibility.includes('model'), `${name} must remain model-visible`);
    }
  } finally { await session.close(); }
});

test('the status tool returns a compact summary, not the task collection', async () => {
  const session = await connect();
  try {
    const result = await session.client.callTool({ name: 'pm_project_status', arguments: {} });
    assert.equal(result.isError, undefined);
    const summary = result.structuredContent;
    assert.equal(typeof summary.projectKey, 'string');
    assert.equal(typeof summary.tasks.total, 'number');
    assert.equal(summary.lanes, undefined, 'summary must not carry lanes');
    assert.equal(summary.tasks.length, undefined, 'summary tasks must be counts, not a collection');
    assert.ok(summary.next.length <= 3, 'summary must cap the next list');
    assert.ok(text(result).length < 600, 'model-facing text must stay compact');
    assert.match(text(result), /tasks/);
  } finally { await session.close(); }
});

test('the app-only payload tool returns the full projection for an issued key', async () => {
  const session = await connect();
  try {
    const status = await session.client.callTool({ name: 'pm_project_status', arguments: {} });
    const projectKey = status.structuredContent.projectKey;
    const result = await session.client.callTool({ name: 'pm_get_project', arguments: { projectKey } });
    assert.equal(result.isError, undefined);
    const data = result.structuredContent;
    assert.ok(Array.isArray(data.tasks), 'payload carries the task collection');
    assert.ok(Array.isArray(data.lanes), 'payload carries lanes');
    assert.equal(data.project.key, projectKey);
    assert.equal(typeof data.summary.tasks.total, 'number');
  } finally { await session.close(); }
});

test('project keys that were never issued are rejected', async () => {
  const session = await connect();
  try {
    for (const projectKey of ['', 'unknown-key', '../../etc', '/tmp']) {
      const result = await session.client.callTool({ name: 'pm_get_project', arguments: { projectKey } });
      assert.equal(result.isError, true, `${JSON.stringify(projectKey)} must be rejected`);
      assert.match(text(result), /PROJECT_SELECTION_(REQUIRED|UNKNOWN)/);
    }
  } finally { await session.close(); }
});

test('an unknown project name is reported with the available projects', async () => {
  const session = await connect();
  try {
    const result = await session.client.callTool({ name: 'pm_project_status', arguments: { project: 'NOPE' } });
    assert.equal(result.isError, true);
    assert.match(text(result), /Unknown project: NOPE/);
  } finally { await session.close(); }
});

test('the project list exposes opaque keys the app can pass back', async () => {
  const session = await connect();
  try {
    const result = await session.client.callTool({ name: 'pm_list_projects', arguments: {} });
    const data = result.structuredContent;
    assert.equal(data.schema_version, 1);
    assert.ok(data.projects.length >= 1);
    assert.equal(typeof data.initial_project_key, 'string');
    for (const project of data.projects) assert.match(project.key, /^[0-9a-f]{48}$/);
  } finally { await session.close(); }
});
