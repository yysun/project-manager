/* Built Studio server: loopback/token security, selected-project schedule and
   planning edits, conflicts, queue recovery, forbidden routes, and shutdown. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const { mutationRevision } = require('../../skills/project-manager/scripts/lib/mutations');
const { makeProject, startStudio, stopStudio, handshake, builtServerPath } = require('./_helpers');

test('binds loopback, uses distinct 256-bit tokens, secures API, and serves client', async () => {
  const root = makeProject(); const first = await startStudio(root); const second = await startStudio(root);
  try {
    assert.match(first.token, /^[a-f0-9]{64}$/); assert.match(second.token, /^[a-f0-9]{64}$/); assert.notEqual(first.token, second.token);
    const denied = await fetch(`${first.origin}/api/project`); assert.equal(denied.status, 401);
    const { response, cookie } = await handshake(first); assert.equal(response.status, 302); assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
    const project = await fetch(`${first.origin}/api/project`, { headers: { Cookie: cookie } }); assert.equal(project.status, 200); assert.equal((await project.json()).data.project.id, 'STUDIO');
    const html = await fetch(first.origin); assert.equal(html.status, 200); assert.match(await html.text(), /Project Manager Studio/);
  } finally { await stopStudio(first); await stopStudio(second); }
});

test('check is read-only, save updates state, conflict does not poison queue, and forbidden routes stay absent', async () => {
  const root = makeProject(); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const snapshot = (await (await fetch(`${handle.origin}/api/project`, { headers })).json()).data; const task = snapshot.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const body = { mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { owner: 'Lin' } }; const before = mutationRevision(root);
    const checked = await fetch(`${handle.origin}/api/tasks/TASK-PLAN/check`, { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(checked.status, 200); assert.equal(mutationRevision(root), before);
    fs.appendFileSync(path.join(root, 'TASKS.md'), '\nConcurrent note.\n');
    const conflict = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify(body) }); assert.equal(conflict.status, 409);
    const current = (await (await fetch(`${handle.origin}/api/project`, { headers })).json()).data; const currentTask = current.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const concurrentBody = (owner) => JSON.stringify({ mutationRevision: current.mutation_revision, taskRevision: currentTask.task_revision, edit: { owner } });
    const concurrent = await Promise.all([
      fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: concurrentBody('First') }),
      fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: concurrentBody('Second') }),
    ]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    const newest = (await (await fetch(`${handle.origin}/api/project`, { headers })).json()).data; const newestTask = newest.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const valid = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify({ mutationRevision: newest.mutation_revision, taskRevision: newestTask.task_revision, edit: { owner: 'Lin' } }) }); assert.equal(valid.status, 200);
    for (const [method, route] of [['POST', '/api/shell'], ['POST', '/api/runs'], ['PUT', '/api/contracts/x']]) assert.equal((await fetch(`${handle.origin}${route}`, { method, headers })).status, 404);
  } finally { await stopStudio(handle); }
});

test('authenticated API checks and saves paired schedules without widening lifecycle status authority', async () => {
  const root = makeProject(); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const snapshot = (await (await fetch(`${handle.origin}/api/project`, { headers })).json()).data; const task = snapshot.tasks.find((item) => item.id === 'TASK-PLAN');
    const before = mutationRevision(root); const body = { mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' } };
    const checked = await fetch(`${handle.origin}/api/tasks/TASK-PLAN/check`, { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(checked.status, 200); assert.equal(mutationRevision(root), before);
    const saved = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify(body) }); assert.equal(saved.status, 200);
    const data = (await saved.json()).data; assert.equal(data.tasks.find((item) => item.id === 'TASK-PLAN').scheduled_end, '2026-08-12');
    const current = data; const currentTask = current.tasks.find((item) => item.id === 'TASK-PLAN');
    const illegal = await fetch(`${handle.origin}/api/tasks/TASK-PLAN`, { method: 'PUT', headers, body: JSON.stringify({ mutationRevision: current.mutation_revision, taskRevision: currentTask.task_revision, edit: { status: 'in_progress' } }) });
    assert.equal(illegal.status, 400); assert.match((await illegal.json()).errors[0].message, /planned and ready/);
  } finally { await stopStudio(handle); }
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

test('root replacement cannot redirect the running server into a sibling project', { skip: process.platform === 'win32' }, async () => {
  const root = makeProject(); const sibling = makeProject(null, 'SIBLING'); const handle = await startStudio(root);
  try {
    const { cookie } = await handshake(handle); const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const snapshot = (await (await fetch(`${handle.origin}/api/project`, { headers })).json()).data;
    const task = snapshot.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
    const siblingBefore = mutationRevision(sibling);
    fs.renameSync(root, `${root}-original`); fs.symlinkSync(sibling, root, 'dir');
    const get = await fetch(`${handle.origin}/api/project`, { headers }); assert.equal(get.status, 400);
    const check = await fetch(`${handle.origin}/api/tasks/TASK-PLAN/check`, { method: 'POST', headers, body: JSON.stringify({ mutationRevision: snapshot.mutation_revision, taskRevision: task.task_revision, edit: { owner: 'Escape' } }) });
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
