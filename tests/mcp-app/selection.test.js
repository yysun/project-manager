/* Agent-supplied project selection: an unconfigured server serving tools, folder
   and ID selection, rejection of unusable folders, opt-in confinement, key
   stability for a rendered view, and the view's key-only boundary. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { builtServerPath, connect, makeProject, text } = require('./_helpers');

// Deliberately Studio's bundle, not the MCP App's: the point is that Studio's
// own copy of the shared catalog keeps rejecting an empty seed list.
const { ProjectCatalog } = require('../../skills/project-manager/scripts/project-manager-studio.js');

function tempDir(prefix) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); }

/** A projects root holding one project, named so it can be selected by folder. */
function makeProjectsRoot(child = 'delivery') {
  const root = tempDir('pm-sel-root-');
  fs.cpSync(makeProject(), path.join(root, child), { recursive: true });
  return root;
}

test('an unconfigured server still serves its model-facing tools', async () => {
  const session = await connect({ configured: false });
  try {
    const { tools } = await session.client.listTools();
    assert.ok(tools.some((tool) => tool.name === 'pm_project_status'));
    const projects = await session.client.callTool({ name: 'pm_list_projects', arguments: {} });
    assert.deepEqual(projects.structuredContent.projects, []);
    assert.equal(projects.structuredContent.initial_project_key, '');
  } finally { await session.close(); }
});

test('a project folder path selects a project on an unconfigured server', async () => {
  const root = makeProject();
  const session = await connect({ configured: false });
  try {
    const result = await session.client.callTool({ name: 'pm_project_status', arguments: { project: root } });
    assert.equal(result.isError, undefined, text(result));
    assert.equal(result.structuredContent.id, 'STUDIO');
    assert.equal(typeof result.structuredContent.projectKey, 'string');
    assert.notEqual(result.structuredContent.projectKey, '');
  } finally { await session.close(); }
});

test('a configured project is still selectable by ID and by name', async () => {
  const session = await connect();
  try {
    for (const selector of ['STUDIO', 'studio', 'Studio Delivery']) {
      const result = await session.client.callTool({ name: 'pm_project_status', arguments: { project: selector } });
      assert.equal(result.isError, undefined, `${selector}: ${text(result)}`);
      assert.equal(result.structuredContent.id, 'STUDIO');
    }
  } finally { await session.close(); }
});

test('an unusable folder is refused with the rejected path named', async () => {
  const missing = path.join(os.tmpdir(), 'pm-sel-absent-project');
  fs.rmSync(missing, { recursive: true, force: true });
  const notAProject = tempDir('pm-sel-plain-');
  const linkHome = tempDir('pm-sel-link-');
  const link = path.join(linkHome, 'linked');
  fs.symlinkSync(makeProject(), link, 'dir');

  const session = await connect({ configured: false });
  try {
    for (const [selector, pattern] of [[missing, /does not exist/], [notAProject, /not a Project Manager project/], [link, /not a real directory/]]) {
      const result = await session.client.callTool({ name: 'pm_project_status', arguments: { project: selector } });
      assert.equal(result.isError, true, `${selector} must be refused`);
      assert.match(text(result), pattern);
      assert.ok(text(result).includes(selector), 'the error names the rejected path');
    }
  } finally { await session.close(); }
});

test('a configured projects root confines selection to projects inside it', async () => {
  const projectsRoot = makeProjectsRoot();
  const outsider = makeProject();
  const session = await connect({ projectsRoot });
  try {
    const refused = await session.client.callTool({ name: 'pm_project_status', arguments: { project: outsider } });
    assert.equal(refused.isError, true, 'a project outside the configured root must be refused');
    assert.match(text(refused), /outside the configured projects root/);
    assert.ok(text(refused).includes(projectsRoot), 'the error names the configured root');
    assert.ok(text(refused).includes(outsider), 'the error names the rejected path');

    const allowed = await session.client.callTool({ name: 'pm_project_status', arguments: { project: path.join(projectsRoot, 'delivery') } });
    assert.equal(allowed.isError, undefined, text(allowed));
    assert.equal(allowed.structuredContent.id, 'STUDIO');
  } finally { await session.close(); }
});

test('selecting the same folder twice yields the same key, so a rendered view stays valid', async () => {
  const root = makeProject();
  const session = await connect({ configured: false });
  try {
    const first = await session.client.callTool({ name: 'pm_project_status', arguments: { project: root } });
    const second = await session.client.callTool({ name: 'pm_project_status', arguments: { project: root } });
    assert.equal(first.structuredContent.projectKey, second.structuredContent.projectKey);

    // A non-canonical spelling of the same folder resolves to the same entry.
    const viaDot = await session.client.callTool({ name: 'pm_project_status', arguments: { project: path.join(root, '.') } });
    assert.equal(viaDot.structuredContent.projectKey, first.structuredContent.projectKey);

    const payload = await session.client.callTool({ name: 'pm_get_project', arguments: { projectKey: first.structuredContent.projectKey } });
    assert.equal(payload.isError, undefined, text(payload));
    assert.ok(Array.isArray(payload.structuredContent.tasks));
  } finally { await session.close(); }
});

test('app-only tools take issued keys only, never a filesystem path', async () => {
  const root = makeProject();
  const session = await connect({ configured: false });
  try {
    const selected = await session.client.callTool({ name: 'pm_project_status', arguments: { project: root } });
    const refused = await session.client.callTool({ name: 'pm_get_project', arguments: { projectKey: root } });
    assert.equal(refused.isError, true, 'a path is not a project key');
    assert.match(text(refused), /PROJECT_SELECTION_UNKNOWN/);

    const accepted = await session.client.callTool({ name: 'pm_get_project', arguments: { projectKey: selected.structuredContent.projectKey } });
    assert.equal(accepted.isError, undefined, text(accepted));
  } finally { await session.close(); }
});

test('an unconfigured server with no project argument says to pass a folder', async () => {
  const session = await connect({ configured: false });
  try {
    const result = await session.client.callTool({ name: 'pm_project_status', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(text(result), /Pass the project folder/);
  } finally { await session.close(); }
});

test('Studio still rejects an empty catalog unless a caller opts in', () => {
  assert.throws(() => new ProjectCatalog([], ''), (error) => error.code === 'PROJECTS_ROOT_EMPTY');
  const permitted = new ProjectCatalog([], '', { allowEmpty: true });
  assert.deepEqual(permitted.data().projects, []);
  assert.equal(permitted.initialKey, '');
});

test('an ID shared by two selected folders is refused rather than guessed', async () => {
  // Two distinct folders can carry the same project ID once both are selected by
  // path, so ID lookup becomes ambiguous. "Ambiguity is not selection."
  const first = makeProject();
  const second = tempDir('pm-sel-dup-');
  fs.cpSync(first, path.join(second, 'copy'), { recursive: true });

  const session = await connect({ configured: false });
  try {
    await session.client.callTool({ name: 'pm_project_status', arguments: { project: first } });
    await session.client.callTool({ name: 'pm_project_status', arguments: { project: path.join(second, 'copy') } });
    const ambiguous = await session.client.callTool({ name: 'pm_project_status', arguments: { project: 'STUDIO' } });
    assert.equal(ambiguous.isError, true, 'an ambiguous ID must be refused');
    assert.match(text(ambiguous), /matches more than one project/);
  } finally { await session.close(); }
});

test('registering the same root through the catalog reuses its entry', () => {
  const { buildCatalog } = require(builtServerPath);
  const root = makeProject();
  const { catalog } = buildCatalog({}, {});
  const first = catalog.register(root);
  const second = catalog.register(path.join(root, '.'));
  assert.equal(first.key, second.key);
  assert.equal(first.root, fs.realpathSync(root));
  assert.throws(() => catalog.register(''), (error) => error.code === 'PROJECT_SELECTION_REQUIRED');
});
