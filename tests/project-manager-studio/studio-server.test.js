/* Built Studio server: token, heartbeat, and SSE security; project selection,
   mutation isolation; catalog containment; CLI modes; and clean shutdown. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');
const { mutationRevision } = require('../../skills/project-manager/scripts/lib/mutations');
const { loadProject, regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');
const { buildTaskContract, formatTaskContract } = require('../../skills/project-manager/scripts/lib/contracts');
const { makeProject, startStudio, startStudioArgs, stopStudio, handshake, catalog, getProject, collection, builtServerPath } = require('./_helpers');

function placeProject(parent, name, id, records = null) { const source = makeProject(records, id); const target = path.join(parent, name); fs.renameSync(source, target); return target; }
function runFailure(args, cwd) { return require('node:child_process').spawnSync(process.execPath, [builtServerPath, ...args], { cwd, encoding: 'utf8', timeout: 6000 }); }
function staleSourceBindingProject(id = 'STALE-SOURCE', targetRoot = null) {
  const taskData = { outcome: 'Source mapping is complete.', acceptance: ['The mapping is verified.'], status: 'ready', sources: ['SRC-BRIEF'] };
  const planRecord = { id: 'TASK-PLAN', title: 'Plan follow-up', data: { outcome: 'Follow-up is planned.', acceptance: ['The plan is accepted.'], status: 'planned' } };
  const scopeRecord = { id: 'TASK-SCOPE-MAPPING', title: 'Map scope', data: taskData };
  const initialScopeRecord = { id: scopeRecord.id, title: scopeRecord.title, data: { outcome: taskData.outcome, acceptance: taskData.acceptance, status: taskData.status } };
  const root = makeProject([initialScopeRecord, planRecord], id, targetRoot);
  const source = { kind: 'document', location: 'brief.md', role: 'scope', status: 'current', version: 'v1', sha256: null };
  fs.writeFileSync(path.join(root, 'SOURCES.md'), collection([{ id: 'SRC-BRIEF', title: 'Brief', data: source }]));
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([scopeRecord, planRecord]));
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  const state = loadProject(root); const model = state.tasks[0]; const normalizedSource = state.sources.items[0];
  const contract = buildTaskContract(state.project, model, [{
    id: normalizedSource.id, version: normalizedSource.version,
    record_sha256: normalizedSource.record_sha256, content_sha256: normalizedSource.sha256,
  }], '2026-08-08T00:00:01Z');
  const attemptRoot = path.join(root, 'handoffs', model.id, contract.contract_id); fs.mkdirSync(attemptRoot, { recursive: true });
  fs.writeFileSync(path.join(attemptRoot, 'TASK-CONTRACT.md'), formatTaskContract(contract));
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{
    id: model.id, title: model.title, data: { ...taskData, status: 'in_progress', active_contract: contract.contract_id },
  }, planRecord]));
  regenerateStatus(root, '2026-08-08T00:00:02Z');
  source.version = 'v2'; fs.writeFileSync(path.join(root, 'SOURCES.md'), collection([{ id: 'SRC-BRIEF', title: 'Brief', data: source }]));
  return root;
}

test('heartbeat requires session and Studio header, renews once, and leaves project state unchanged', async () => {
  const root = makeProject(); const { createServer, ProjectCatalog } = require(builtServerPath); let renewals = 0;
  const catalogInstance = new ProjectCatalog([{ id: 'STUDIO', name: 'Studio Delivery', root }], root);
  const { app, sessionToken } = createServer({ catalog: catalogInstance, clientDistDir: path.resolve(__dirname, '../../skills/project-manager/studio/dist'), onHeartbeat: () => { renewals += 1; } });
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); const origin = `http://127.0.0.1:${address.port}`; const before = mutationRevision(root);
  try {
    let response = await fetch(`${origin}/api/heartbeat`, { method: 'POST', headers: { 'X-Project-Manager-Studio': 'heartbeat' } }); assert.equal(response.status, 401); assert.equal(renewals, 0);
    response = await fetch(`${origin}/?token=${sessionToken}`, { redirect: 'manual' }); const cookie = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(`${origin}/api/heartbeat`, { method: 'POST', headers: { Cookie: cookie } }); assert.equal(response.status, 403); assert.equal(renewals, 0);
    response = await fetch(`${origin}/api/heartbeat`, { method: 'POST', headers: { Cookie: cookie, 'X-Project-Manager-Studio': 'wrong' } }); assert.equal(response.status, 403); assert.equal(renewals, 0);
    response = await fetch(`${origin}/api/heartbeat`, { method: 'POST', headers: { Cookie: cookie, 'X-Project-Manager-Studio': 'heartbeat' } }); assert.equal(response.status, 204); assert.equal(await response.text(), ''); assert.equal(renewals, 1); assert.equal(mutationRevision(root), before);
  } finally { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); }
});

test('SSE stream requires session and issued key, sends scoped events, and closes watcher once', async () => {
  const root = fs.realpathSync(makeProject()); const { createServer, ProjectCatalog } = require(builtServerPath); let starts = 0; let stops = 0; let watcherOptions;
  const catalogInstance = new ProjectCatalog([{ id: 'STUDIO', name: 'Studio Delivery', root }], root);
  const watchProject = (options) => { starts += 1; watcherOptions = options; let stopped = false; return () => { if (!stopped) { stopped = true; stops += 1; } }; };
  const { app, sessionToken } = createServer({ catalog: catalogInstance, clientDistDir: path.resolve(__dirname, '../../skills/project-manager/studio/dist'), onHeartbeat: () => {}, watchProject });
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${origin}/api/events?project=missing`); assert.equal(response.status, 401); assert.equal(starts, 0);
    response = await fetch(`${origin}/?token=${sessionToken}`, { redirect: 'manual' }); const cookie = response.headers.get('set-cookie').split(';')[0];
    for (const project of ['', '../outside', 'not-issued']) {
      response = await fetch(`${origin}/api/events${project ? `?project=${encodeURIComponent(project)}` : ''}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 400); assert.equal(starts, 0);
    }
    const key = catalogInstance.initialKey; const controller = new AbortController();
    response = await fetch(`${origin}/api/events?project=${key}`, { headers: { Cookie: cookie }, signal: controller.signal });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^text\/event-stream/); assert.equal(starts, 1); assert.equal(watcherOptions.root, root);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = decoder.decode((await reader.read()).value);
    watcherOptions.onChange(); text += decoder.decode((await reader.read()).value);
    assert.match(text, /event: project-change/); assert.match(text, new RegExp(`data: \\{"projectKey":"${key}"\\}`)); assert.doesNotMatch(text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    controller.abort(); try { await reader.cancel(); } catch {} await new Promise((resolve) => setTimeout(resolve, 50)); assert.equal(stops, 1);
  } finally { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); }
});

test('production SSE watcher reports external edits, atomic root replacement, and later new-root edits', async () => {
  const root = fs.realpathSync(makeProject()); const handle = await startStudio(root); const controller = new AbortController();
  try {
    const { cookie } = await handshake(handle); const key = (await catalog(handle, cookie)).initial_project_key;
    const response = await fetch(`${handle.origin}/api/events?project=${key}`, { headers: { Cookie: cookie }, signal: controller.signal }); assert.equal(response.status, 200);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffered = '';
    async function nextChange() {
      const expires = setTimeout(() => controller.abort(), 3000);
      try {
        for (;;) {
          const boundary = buffered.indexOf('\n\n');
          if (boundary >= 0) {
            const block = buffered.slice(0, boundary); buffered = buffered.slice(boundary + 2);
            if (block.includes('event: project-change')) return block;
            continue;
          }
          const chunk = await reader.read(); if (chunk.done) throw new Error('SSE stream ended before project change'); buffered += decoder.decode(chunk.value, { stream: true });
        }
      } finally { clearTimeout(expires); }
    }
    fs.appendFileSync(path.join(root, 'TASKS.md'), '\nExternal edit.\n'); assert.match(await nextChange(), new RegExp(key));
    const replacement = fs.realpathSync(makeProject()); fs.renameSync(root, `${root}-old`); fs.renameSync(replacement, root); assert.match(await nextChange(), new RegExp(key));
    fs.appendFileSync(path.join(root, 'TASKS.md'), '\nNew root edit.\n'); assert.match(await nextChange(), new RegExp(key));
    assert.equal((await getProject(handle, cookie, key)).project.id, 'STUDIO'); controller.abort(); try { await reader.cancel(); } catch {}
  } finally { controller.abort(); await stopStudio(handle); }
});

test('production project stream ignores sibling project changes', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-sse-isolation-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  const alpha = placeProject(projectsRoot, 'alpha', 'ALPHA'); const beta = placeProject(projectsRoot, 'beta', 'BETA'); const handle = await startStudioArgs(['--projects-root', projectsRoot, '--project', alpha, '--no-open', '--port', '0']); const controller = new AbortController();
  try {
    const { cookie } = await handshake(handle); const options = await catalog(handle, cookie); const alphaKey = options.projects.find((item) => item.id === 'ALPHA').key;
    const response = await fetch(`${handle.origin}/api/events?project=${alphaKey}`, { headers: { Cookie: cookie }, signal: controller.signal }); const reader = response.body.getReader();
    await reader.read(); const pending = reader.read(); fs.appendFileSync(path.join(beta, 'TASKS.md'), '\nBeta-only edit.\n');
    assert.equal(await Promise.race([pending.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 250))]), false);
    fs.appendFileSync(path.join(alpha, 'TASKS.md'), '\nAlpha edit.\n'); const event = await pending; assert.match(new TextDecoder().decode(event.value), /event: project-change/);
    controller.abort(); try { await reader.cancel(); } catch {}
  } finally { controller.abort(); await stopStudio(handle); }
});

test('issued project stream stays live through an initial missing-root gap and recovers on restoration', async () => {
  const root = fs.realpathSync(makeProject()); const handle = await startStudio(root); const controller = new AbortController(); const backup = `${root}-initial-gap`;
  try {
    const { cookie } = await handshake(handle); const key = (await catalog(handle, cookie)).initial_project_key; fs.renameSync(root, backup);
    const response = await fetch(`${handle.origin}/api/events?project=${key}`, { headers: { Cookie: cookie }, signal: controller.signal }); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    const reader = response.body.getReader(); await reader.read(); fs.renameSync(backup, root);
    const expires = setTimeout(() => controller.abort(), 3000); const event = await reader.read(); clearTimeout(expires); assert.match(new TextDecoder().decode(event.value), /event: project-change/);
    assert.equal((await getProject(handle, cookie, key)).project.id, 'STUDIO'); controller.abort(); try { await reader.cancel(); } catch {}
  } finally { if (fs.existsSync(backup) && !fs.existsSync(root)) fs.renameSync(backup, root); controller.abort(); await stopStudio(handle); }
});

test('binds loopback, uses distinct 256-bit tokens, secures API, and serves client', async () => {
  const root = makeProject(); const first = await startStudio(root); const second = await startStudio(root);
  try {
    assert.match(first.token, /^[a-f0-9]{64}$/); assert.match(second.token, /^[a-f0-9]{64}$/); assert.notEqual(first.token, second.token);
    const denied = await fetch(`${first.origin}/api/projects`); assert.equal(denied.status, 401);
    const { response, cookie } = await handshake(first); assert.equal(response.status, 302); assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
    const options = await catalog(first, cookie); assert.equal(options.projects.length, 1);
    const project = await fetch(`${first.origin}/api/project?project=${options.initial_project_key}`, { headers: { Cookie: cookie } }); assert.equal(project.status, 200); assert.equal((await project.json()).data.project.id, 'STUDIO');
    const html = await fetch(first.origin); assert.equal(html.status, 200); assert.match(await html.text(), /Project Manager Studio/);
  } finally { await stopStudio(first); await stopStudio(second); }
});

test('Studio opens projects with unavailable executor roots and returns an execution warning', async () => {
  const root = makeProject();
  const missingRoot = path.join(root, 'missing-executor');
  fs.writeFileSync(path.join(root, 'PROJECT.md'), fs.readFileSync(path.join(root, 'PROJECT.md'), 'utf8').replace('adapters: ["human"]', 'adapters: ["human","agent"]'));
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{
    id: 'TASK-RUN', title: 'Run delegated work', data: {
      outcome: 'Delegated work is complete.', acceptance: ['The result is verified.'], status: 'ready',
      executor: { provider: 'agent', root: missingRoot, scope: 'absolute' },
    },
  }]));
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle);
    const key = (await catalog(handle, cookie)).initial_project_key;
    const response = await fetch(`${handle.origin}/api/project?project=${key}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.equal(data.project.id, 'STUDIO');
    assert.deepEqual(data.warnings, [{
      code: 'TASK_EXECUTOR_ROOT_UNAVAILABLE',
      task_id: 'TASK-RUN',
      path: 'TASKS.md',
      message: 'Run delegated work (TASK-RUN) cannot run because its configured working folder is missing or inaccessible. Point the task to an existing folder before running it.',
    }]);
    assert.equal(data.tasks[0].execution_issue, true);
    assert.equal(data.summary.tasks.blocked, 1);
  } finally { await stopStudio(handle); }
});

test('Studio starts from a catalog with stale task execution state and opens it with a blocking warning', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-stale-source-studio-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  placeProject(projectsRoot, 'healthy', 'HEALTHY');
  const staleTarget = staleSourceBindingProject('STALE-SOURCE', path.join(projectsRoot, 'stale-source'));
  assert.throws(() => loadProject(staleTarget), /source binding is stale/);
  const handle = await startStudioArgs(['--projects-root', projectsRoot, '--project', staleTarget, '--no-open', '--port', '0'], { cwd: workspace });
  try {
    const { cookie } = await handshake(handle); const options = await catalog(handle, cookie);
    assert.deepEqual(options.projects.map((item) => item.id), ['HEALTHY', 'STALE-SOURCE']);
    const response = await fetch(`${handle.origin}/api/project?project=${options.initial_project_key}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.equal(data.project.id, 'STALE-SOURCE');
    const affected = data.tasks.find((item) => item.id === 'TASK-SCOPE-MAPPING');
    assert.equal(affected.status, 'in_progress');
    assert.equal(affected.execution_issue, true);
    assert.match(affected.execution_issue_reason, /source information that changed/);
    assert.equal(data.summary.tasks.blocked, 1);
    const warning = data.warnings.find((item) => item.code === 'TASK_EXECUTION_INVALID');
    assert.equal(warning.task_id, 'TASK-SCOPE-MAPPING');
    assert.equal(warning.cause_code, 'CONTRACT_SOURCE_BINDING');
    assert.equal(warning.technical_message, 'Task TASK-SCOPE-MAPPING source binding is stale');
    assert.match(warning.path, /TASK-CONTRACT\.md$/);

    const editable = data.tasks.find((item) => item.id === 'TASK-PLAN');
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const body = { projectKey: options.initial_project_key, mutationRevision: data.mutation_revision, taskRevision: editable.task_revision, edit: { owner: 'Lin' } };
    assert.equal((await fetch(`${handle.origin}/api/tasks/TASK-PLAN/check`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 200);
    const saved = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify(body) });
    assert.equal(saved.status, 200);
    const savedData = (await saved.json()).data;
    assert.equal(savedData.tasks.find((item) => item.id === 'TASK-PLAN').owner, 'Lin');
    assert.equal(savedData.tasks.find((item) => item.id === 'TASK-SCOPE-MAPPING').execution_issue, true);
  } finally { await stopStudio(handle); }
});

test('check is read-only, save updates state, conflict does not poison queue, and forbidden routes stay absent', async () => {
  const root = makeProject(); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const key = (await catalog(handle, cookie)).initial_project_key;
    const snapshot = await getProject(handle, cookie, key); const task = snapshot.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const body = { projectKey: key, mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { owner: 'Lin' } }; const before = mutationRevision(root);
    const checked = await fetch(`${handle.origin}/api/tasks/TASK-PLAN/check`, { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(checked.status, 200); assert.equal(mutationRevision(root), before);
    fs.appendFileSync(path.join(root, 'TASKS.md'), '\nConcurrent note.\n');
    const conflict = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify(body) }); assert.equal(conflict.status, 409);
    const current = await getProject(handle, cookie, key); const currentTask = current.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const concurrentBody = (owner) => JSON.stringify({ projectKey: key, mutationRevision: current.mutation_revision, taskRevision: currentTask.task_revision, edit: { owner } });
    const concurrent = await Promise.all([
      fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: concurrentBody('First') }),
      fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: concurrentBody('Second') }),
    ]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    const newest = await getProject(handle, cookie, key); const newestTask = newest.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const valid = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify({ projectKey: key, mutationRevision: newest.mutation_revision, taskRevision: newestTask.task_revision, edit: { owner: 'Lin' } }) }); assert.equal(valid.status, 200);
    for (const [method, route] of [['POST', '/api/shell'], ['POST', '/api/runs'], ['PUT', '/api/contracts/x']]) assert.equal((await fetch(`${handle.origin}${route}`, { method, headers })).status, 404);
  } finally { await stopStudio(handle); }
});

test('authenticated API checks and saves paired schedules without widening lifecycle status authority', async () => {
  const root = makeProject(); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const key = (await catalog(handle, cookie)).initial_project_key;
    const snapshot = await getProject(handle, cookie, key); const task = snapshot.tasks.find((item) => item.id === 'TASK-PLAN');
    const before = mutationRevision(root); const body = { projectKey: key, mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' } };
    const checked = await fetch(`${handle.origin}/api/tasks/TASK-PLAN/check`, { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(checked.status, 200); assert.equal(mutationRevision(root), before);
    const saved = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify(body) }); assert.equal(saved.status, 200);
    const data = (await saved.json()).data; assert.equal(data.tasks.find((item) => item.id === 'TASK-PLAN').scheduled_end, '2026-08-12');
    const current = data; const currentTask = current.tasks.find((item) => item.id === 'TASK-PLAN');
    const illegal = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify({ projectKey: key, mutationRevision: current.mutation_revision, taskRevision: currentTask.task_revision, edit: { status: 'in_progress' } }) });
    assert.equal(illegal.status, 400); assert.match((await illegal.json()).errors[0].message, /planned and ready/);
  } finally { await stopStudio(handle); }
});

test('default .projects catalog is deterministic and per-request keys isolate reads and consecutive saves', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-default-root-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  const alpha = placeProject(projectsRoot, 'alpha', 'ALPHA'); const beta = placeProject(projectsRoot, 'beta', 'BETA');
  const handle = await startStudioArgs(['--no-open', '--port', '0'], { cwd: workspace });
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const options = await catalog(handle, cookie); assert.deepEqual(options.projects.map((item) => item.id), ['ALPHA', 'BETA']);
    const alphaKey = options.projects.find((item) => item.id === 'ALPHA').key; const betaKey = options.projects.find((item) => item.id === 'BETA').key;
    const alphaBefore = mutationRevision(alpha); let betaData = await getProject(handle, cookie, betaKey); const betaTask = betaData.tasks.find((item) => item.id === 'TASK-PLAN');
    const first = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify({ projectKey: betaKey, mutationRevision: betaData.mutation_revision, taskRevision: betaTask.task_revision, edit: { owner: 'Beta One' } }) });
    assert.equal(first.status, 200); betaData = (await first.json()).data; assert.equal(betaData.project.key, betaKey); assert.equal(mutationRevision(alpha), alphaBefore);
    const currentTask = betaData.tasks.find((item) => item.id === 'TASK-PLAN');
    const second = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify({ projectKey: betaKey, mutationRevision: betaData.mutation_revision, taskRevision: currentTask.task_revision, edit: { owner: 'Beta Two' } }) });
    assert.equal(second.status, 200); assert.equal((await second.json()).data.tasks.find((item) => item.id === 'TASK-PLAN').owner, 'Beta Two');
    assert.equal((await getProject(handle, cookie, alphaKey)).tasks.find((item) => item.id === 'TASK-PLAN').owner, null);
    assert.equal(fs.readdirSync(projectsRoot).some((name) => /^\.project-manager-work-[a-f0-9]{24}$/.test(name)), false, 'successful saves clean isolated work roots');
  } finally { await stopStudio(handle); }
});

test('unknown, path-shaped, and missing keys are rejected before reads or mutations', async () => {
  const root = makeProject(); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const key = (await catalog(handle, cookie)).initial_project_key; const snapshot = await getProject(handle, cookie, key); const task = snapshot.tasks.find((item) => item.id === 'TASK-PLAN'); const before = mutationRevision(root);
    for (const value of ['', '../outside', '/tmp/outside', 'not-issued']) {
      const response = await fetch(`${handle.origin}/api/project${value ? `?project=${encodeURIComponent(value)}` : ''}`, { headers }); assert.equal(response.status, 400);
    }
    for (const projectKey of [undefined, '../outside', '/tmp/outside', 'not-issued']) {
      const body = { ...(projectKey === undefined ? {} : { projectKey }), mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { owner: 'Escape' } };
      assert.equal((await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal(mutationRevision(root), before);
  } finally { await stopStudio(handle); }
});

test('same-ID real-directory replacement stays in its authorized catalog slot', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-replace-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot); const alpha = placeProject(projectsRoot, 'alpha', 'ALPHA');
  const handle = await startStudioArgs(['--projects-root', projectsRoot, '--no-open', '--port', '0']);
  try {
    const { cookie } = await handshake(handle); const key = (await catalog(handle, cookie)).initial_project_key;
    const replacement = makeProject(null, 'ALPHA'); fs.renameSync(alpha, `${alpha}-old`); fs.renameSync(replacement, alpha);
    const data = await getProject(handle, cookie, key); assert.equal(data.project.id, 'ALPHA'); assert.equal(data.project.root, fs.realpathSync(alpha));
  } finally { await stopStudio(handle); }
});

for (const [label, replace, symlinkOnly] of [
  ['removed', (root) => fs.rmSync(root, { recursive: true }), false],
  ['renamed', (root) => fs.renameSync(root, `${root}-moved`), false],
  ['replaced by a symlink', (root, sibling) => { fs.renameSync(root, `${root}-old`); fs.symlinkSync(sibling, root, 'dir'); }, true],
]) test(`catalog key becomes PROJECT_SELECTION_STALE when its project is ${label}`, { skip: symlinkOnly && process.platform === 'win32' }, async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-stale-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  const alpha = placeProject(projectsRoot, 'alpha', 'ALPHA'); const sibling = makeProject(null, 'SIBLING'); const handle = await startStudioArgs(['--projects-root', projectsRoot, '--no-open', '--port', '0']);
  try {
    const { cookie } = await handshake(handle); const key = (await catalog(handle, cookie)).initial_project_key; replace(alpha, sibling);
    const response = await fetch(`${handle.origin}/api/project?project=${key}`, { headers: { Cookie: cookie } }); assert.equal(response.status, 400); assert.equal((await response.json()).errors[0].code, 'PROJECT_SELECTION_STALE');
  } finally { await stopStudio(handle); }
});

test('project ID drift invalidates the issued key before full project loading or mutation', async () => {
  const root = makeProject(null, 'ORIGINAL'); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' }; const key = (await catalog(handle, cookie)).initial_project_key; const snapshot = await getProject(handle, cookie, key); const task = snapshot.tasks[0];
    fs.writeFileSync(path.join(root, 'PROJECT.md'), fs.readFileSync(path.join(root, 'PROJECT.md'), 'utf8').replace('id: "ORIGINAL"', 'id: "CHANGED"'));
    const get = await fetch(`${handle.origin}/api/project?project=${key}`, { headers }); assert.equal(get.status, 400); assert.equal((await get.json()).errors[0].code, 'PROJECT_SELECTION_STALE');
    const save = await fetch(`${handle.origin}/api/tasks/${task.id}`, { method: 'PUT', headers, body: JSON.stringify({ projectKey: key, mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { owner: 'Wrong' } }) }); assert.equal(save.status, 400); assert.equal((await save.json()).errors[0].code, 'PROJECT_SELECTION_STALE');
  } finally { await stopStudio(handle); }
});

test('a stale catalog sibling does not block healthy project reads or committed saves', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-sibling-stale-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  const alpha = placeProject(projectsRoot, 'alpha', 'ALPHA'); const beta = placeProject(projectsRoot, 'beta', 'BETA'); const handle = await startStudioArgs(['--projects-root', projectsRoot, '--no-open', '--port', '0']);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' }; const options = await catalog(handle, cookie); const alphaKey = options.projects.find((item) => item.id === 'ALPHA').key;
    const snapshot = await getProject(handle, cookie, alphaKey); const task = snapshot.tasks.find((item) => item.id === 'TASK-PLAN'); fs.renameSync(beta, `${beta}-moved`);
    const stillReadable = await fetch(`${handle.origin}/api/project?project=${alphaKey}`, { headers }); assert.equal(stillReadable.status, 200);
    const saved = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify({ projectKey: alphaKey, mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { owner: 'Alpha Only' } }) });
    assert.equal(saved.status, 200); const data = (await saved.json()).data; assert.equal(data.project.id, 'ALPHA'); assert.equal(data.tasks.find((item) => item.id === 'TASK-PLAN').owner, 'Alpha Only'); assert.equal(data.project.root, fs.realpathSync(alpha));
    const catalogRefresh = await fetch(`${handle.origin}/api/projects`, { headers }); assert.equal(catalogRefresh.status, 400); assert.equal((await catalogRefresh.json()).errors[0].code, 'PROJECT_SELECTION_STALE');
  } finally { await stopStudio(handle); }
});

test('explicit single-project mode exposes no sibling while combined mode selects a direct child', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-modes-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  const alpha = placeProject(projectsRoot, 'alpha', 'ALPHA'); const beta = placeProject(projectsRoot, 'beta', 'BETA');
  const single = await startStudio(alpha); const combined = await startStudioArgs(['--projects-root', projectsRoot, '--project', beta, '--no-open', '--port', '0']);
  try {
    const singleCookie = (await handshake(single)).cookie; assert.deepEqual((await catalog(single, singleCookie)).projects.map((item) => item.id), ['ALPHA']);
    const combinedCookie = (await handshake(combined)).cookie; const options = await catalog(combined, combinedCookie); assert.deepEqual(options.projects.map((item) => item.id), ['ALPHA', 'BETA']); assert.equal(options.projects.find((item) => item.key === options.initial_project_key).id, 'BETA');
  } finally { await stopStudio(single); await stopStudio(combined); }
});

test('combined mode rejects outside, nested, and symlinked explicit projects before listen', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-containment-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  const alpha = placeProject(projectsRoot, 'alpha', 'ALPHA'); const outside = makeProject(null, 'OUTSIDE');
  const nested = makeProject(null, 'NESTED'); const nestedTarget = path.join(alpha, 'nested'); fs.renameSync(nested, nestedTarget);
  for (const selected of [outside, nestedTarget]) {
    const result = runFailure(['--projects-root', projectsRoot, '--project', selected, '--no-open'], workspace); assert.notEqual(result.status, 0); assert.doesNotMatch(result.stdout, /http:\/\//);
  }
  if (process.platform !== 'win32') {
    const linked = path.join(projectsRoot, 'linked'); fs.symlinkSync(outside, linked);
    const linkedResult = runFailure(['--projects-root', projectsRoot, '--project', linked, '--no-open'], workspace); assert.notEqual(linkedResult.status, 0); assert.doesNotMatch(linkedResult.stdout, /http:\/\//);
  }
});

test('default and explicit projects roots report missing, invalid, symlinked, and empty states distinctly', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-root-errors-'));
  let result = runFailure(['--no-open'], workspace); assert.notEqual(result.status, 0); assert.match(result.stderr, /PROJECTS_ROOT_MISSING/);
  const file = path.join(workspace, 'file'); fs.writeFileSync(file, 'x'); result = runFailure(['--projects-root', file, '--no-open'], workspace); assert.match(result.stderr, /PROJECTS_ROOT_INVALID/);
  const empty = path.join(workspace, 'empty'); fs.mkdirSync(empty);
  if (process.platform !== 'win32') { const linked = path.join(workspace, 'linked'); fs.symlinkSync(empty, linked); result = runFailure(['--projects-root', linked, '--no-open'], workspace); assert.match(result.stderr, /PROJECTS_ROOT_INVALID/); }
  result = runFailure(['--projects-root', empty, '--no-open'], workspace); assert.match(result.stderr, /PROJECTS_ROOT_EMPTY/);
  const visibleLegacy = path.join(workspace, 'projects'); fs.mkdirSync(visibleLegacy); placeProject(visibleLegacy, 'legacy', 'LEGACY');
  result = runFailure(['--no-open'], workspace); assert.match(result.stderr, /PROJECTS_ROOT_MISSING/); assert.doesNotMatch(result.stdout, /http:\/\//);
});

test('catalog startup rejects malformed, symlinked, and duplicate-ID children distinctly', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-catalog-errors-'));
  const malformedRoot = path.join(workspace, 'malformed-root'); fs.mkdirSync(malformedRoot); const malformed = path.join(malformedRoot, 'bad'); fs.mkdirSync(malformed); fs.writeFileSync(path.join(malformed, 'PROJECT.md'), 'bad');
  let result = runFailure(['--projects-root', malformedRoot, '--no-open'], workspace); assert.match(result.stderr, /PROJECT_CATALOG_INVALID/);
  if (process.platform !== 'win32') { const symlinkRoot = path.join(workspace, 'symlink-root'); fs.mkdirSync(symlinkRoot); const outside = makeProject(null, 'OUTSIDE'); fs.symlinkSync(outside, path.join(symlinkRoot, 'linked')); result = runFailure(['--projects-root', symlinkRoot, '--no-open'], workspace); assert.match(result.stderr, /PROJECT_CATALOG_INVALID/); }
  const duplicateRoot = path.join(workspace, 'duplicate-root'); fs.mkdirSync(duplicateRoot); const first = placeProject(duplicateRoot, 'first', 'DUPLICATE'); fs.cpSync(first, path.join(duplicateRoot, 'copy'), { recursive: true });
  result = runFailure(['--projects-root', duplicateRoot, '--no-open'], workspace); assert.match(result.stderr, /PROJECT_ID_DUPLICATE/);
});

test('catalog startup uses safe identity only and defers unrelated PROJECT diagnostics until open', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-catalog-identity-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);
  const invalidDate = placeProject(projectsRoot, 'invalid-date', 'INVALID-DATE');
  fs.writeFileSync(path.join(invalidDate, 'PROJECT.md'), fs.readFileSync(path.join(invalidDate, 'PROJECT.md'), 'utf8').replace('target_date: null', 'target_date: "not-a-date"'));
  const invalidJson = placeProject(projectsRoot, 'invalid-json', 'INVALID-JSON');
  fs.writeFileSync(path.join(invalidJson, 'PROJECT.md'), fs.readFileSync(path.join(invalidJson, 'PROJECT.md'), 'utf8').replace('target_date: null', 'target_date: not-json'));
  const handle = await startStudioArgs(['--projects-root', projectsRoot, '--no-open', '--port', '0'], { cwd: workspace });
  try {
    const { cookie } = await handshake(handle); const options = await catalog(handle, cookie);
    assert.deepEqual(options.projects.map((item) => item.id), ['INVALID-DATE', 'INVALID-JSON']);
    for (const [id, code] of [['INVALID-DATE', 'INVALID_DATE'], ['INVALID-JSON', 'FRONTMATTER_JSON']]) {
      const key = options.projects.find((item) => item.id === id).key;
      const response = await fetch(`${handle.origin}/api/project?project=${key}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).errors[0].code, code);
    }
  } finally { await stopStudio(handle); }
});

test('catalog startup ignores Git metadata when the projects root is version-controlled', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-git-root-')); const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot); fs.mkdirSync(path.join(projectsRoot, '.git')); placeProject(projectsRoot, 'alpha', 'ALPHA');
  const handle = await startStudioArgs(['--projects-root', projectsRoot, '--no-open', '--port', '0']);
  try { assert.match(handle.origin, /^http:\/\/127\.0\.0\.1:/); } finally { await stopStudio(handle); }
});

test('packaged startup rejects unsafe reserved work roots instead of hiding malformed children', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-work-root-')); const root = path.join(workspace, '.projects'); fs.mkdirSync(root); placeProject(root, 'alpha', 'ALPHA');
  const reserved = path.join(root, `.project-manager-work-${'a'.repeat(24)}`); fs.mkdirSync(reserved); fs.writeFileSync(path.join(reserved, 'unexpected'), 'malformed child');
  let result = runFailure(['--no-open', '--port', '0'], workspace); assert.equal(result.status, 1); assert.match(result.stderr, /PROJECT_CATALOG_INVALID/);
  fs.rmSync(reserved, { recursive: true });
  if (process.platform !== 'win32') {
    fs.mkdirSync(reserved); fs.symlinkSync(path.join(reserved, 'missing'), path.join(reserved, '.rpd-project-manager-work-v1'));
    result = runFailure(['--no-open', '--port', '0'], workspace); assert.equal(result.status, 1); assert.match(result.stderr, /PROJECT_CATALOG_INVALID/);
  }
});

test('CLI rejects missing values, repeated selectors, and unknown arguments with usage', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cli-errors-'));
  const cases = [
    ['--project'], ['--projects-root'], ['--project', 'first', '--project', 'second'],
    ['--projects-root', 'first', '--projects-root', 'second'], ['--unknown'],
  ];
  for (const args of cases) {
    const result = runFailure(args, workspace); assert.notEqual(result.status, 0); assert.match(result.stderr, /Usage: project-manager-studio\.js/); assert.doesNotMatch(result.stdout, /http:\/\//);
  }
});

test('packaged skill launches outside repository module ancestry and releases its port', async () => {
  const root = makeProject(); const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-installed-')); const skill = path.join(isolated, 'project-manager');
  fs.cpSync(path.resolve(__dirname, '../../skills/project-manager'), skill, { recursive: true });
  assert.equal(fs.existsSync(path.join(skill, 'scripts/project-manager-studio.js')), true);
  const original = builtServerPath; const isolatedServer = path.join(skill, 'scripts/project-manager-studio.js');
  const child = require('node:child_process').spawn(process.execPath, [isolatedServer, '--project', root, '--no-open', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => { let text = ''; const timer = setTimeout(() => reject(new Error('isolated launch timeout')), 6000); child.stdout.on('data', (chunk) => { text += chunk; const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+/.exec(text); if (match) { clearTimeout(timer); resolve(match[0]); } }); child.once('error', reject); });
  assert.match(String(url), /^http:\/\/127\.0\.0\.1:/); child.kill('SIGTERM'); await new Promise((resolve) => child.once('exit', resolve)); assert.ok(original);
});

for (const signal of ['SIGINT', 'SIGTERM']) test(`packaged Studio exits zero and releases its port on ${signal}`, async () => {
  const root = makeProject(); const handle = await startStudio(root); const port = Number(new URL(handle.origin).port);
  const exited = new Promise((resolve) => handle.child.once('exit', (code, receivedSignal) => resolve({ code, receivedSignal })));
  handle.child.kill(signal); const result = await exited; assert.deepEqual(result, { code: 0, receivedSignal: null });
  const probe = net.createServer(); await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise((resolve) => probe.close(resolve));
});

test('root replacement cannot redirect the running server into a sibling project', { skip: process.platform === 'win32' }, async () => {
  const root = makeProject(); const sibling = makeProject(null, 'SIBLING'); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const key = (await catalog(handle, cookie)).initial_project_key; const snapshot = await getProject(handle, cookie, key);
    const task = snapshot.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const siblingBefore = mutationRevision(sibling);
    fs.renameSync(root, `${root}-original`); fs.symlinkSync(sibling, root, 'dir');
    const get = await fetch(`${handle.origin}/api/project?project=${key}`, { headers }); assert.equal(get.status, 400);
    const check = await fetch(`${handle.origin}/api/tasks/TASK-PLAN/check`, { method: 'POST', headers, body: JSON.stringify({ projectKey: key, mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { owner: 'Escape' } }) });
    assert.equal(check.status, 400); assert.equal(mutationRevision(sibling), siblingBefore);
  } finally { await stopStudio(handle); }
});

test('missing OS browser launcher does not crash the default Studio process', async () => {
  const root = makeProject(); const missingPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-no-launcher-'));
  const child = require('node:child_process').spawn(process.execPath, [builtServerPath, '--project', root, '--port', '0'], { env: { ...process.env, PATH: missingPath }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise((resolve, reject) => { let text = ''; const timer = setTimeout(() => reject(new Error('default launch timeout')), 6000); child.stdout.on('data', (chunk) => { text += chunk; const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+/.exec(text); if (match) { clearTimeout(timer); resolve(match[0]); } }); child.once('error', reject); });
    assert.match(String(url), /^http:\/\/127\.0\.0\.1:/); await new Promise((resolve) => setTimeout(resolve, 100)); assert.equal(child.exitCode, null);
  } finally { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((resolve) => child.once('exit', resolve)); } }
});

test('a degraded watcher is reported on the wire and a failed reattach does not clear it', async () => {
  const root = fs.realpathSync(makeProject()); const { createServer, ProjectCatalog } = require(builtServerPath);
  let watcherOptions;
  const watchProject = (options) => { watcherOptions = options; return () => {}; };
  const catalogInstance = new ProjectCatalog([{ id: 'STUDIO', name: 'Studio Delivery', root }], root, { confinement: null });
  const { app, sessionToken } = createServer({ catalog: catalogInstance, clientDistDir: path.resolve(__dirname, '../../skills/project-manager/studio/dist'), onHeartbeat: () => {}, watchProject });
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const controller = new AbortController();
  try {
    let response = await fetch(`${origin}/?token=${sessionToken}`, { redirect: 'manual' });
    const cookie = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(`${origin}/api/events?project=${catalogInstance.initialKey}`, { headers: { Cookie: cookie }, signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    await reader.read(); // the ": connected" preamble

    watcherOptions.onDegraded(new Error('root binding lost'));
    assert.match(decoder.decode((await reader.read()).value), /^event: project-stale/m, 'degradation reaches the wire');
    // The stream stays open rather than ending: the reads below succeeding is
    // the proof, since an ended response would yield done:true instead.

    // A failed reattach still notifies, so a change must not imply liveness.
    watcherOptions.onChange();
    assert.match(decoder.decode((await reader.read()).value), /^event: project-change/m);

    // Only a real reattach states it.
    watcherOptions.onLive();
    assert.match(decoder.decode((await reader.read()).value), /^event: project-live/m, 'recovery is stated, not inferred');
  } finally { controller.abort(); await new Promise((resolve) => server.close(resolve)); }
});
