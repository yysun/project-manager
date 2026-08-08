/* Task-editor contracts: exact revisions, split planning/schedule authority,
   v1-to-v2 migration, protected history, conflicts, copy fidelity, and rollback. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { loadProject, regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');
const { buildTaskContract, formatTaskContract, taskSpecHash, sha256 } = require('../../skills/project-manager/scripts/lib/contracts');
const { mutationRevision, atomicProjectMutation, UnsupportedProjectEntryError } = require('../../skills/project-manager/scripts/lib/mutations');
const { loadRevisionedProject, checkTaskEdit, saveTaskEdit, TaskEditError } = require('../../skills/project-manager/scripts/lib/task-editor');
const { makeProject, collection } = require('./_helpers');

function request(root, id, edit) { const snap = loadRevisionedProject(root); const task = snap.state.tasks.find((item) => item.id === id); return { mutationRevision: snap.mutation_revision, taskRevision: task.spec_sha256, edit }; }

test('check is byte-invariant and save supports every editable field while preserving narrative', () => {
  const root = makeProject(); const before = mutationRevision(root);
  const edit = { title: 'Frame the delivery', outcome: 'Delivery scope is explicit.', acceptance: ['Scope is approved.', 'Owner is named.'], status: 'planned', priority: 'P0', milestone: null, owner: 'Ari', depends_on: [], blocked_by: ['Waiting for brief'], success_criteria: ['SC-OUTCOME'], constraints: ['Keep scope small.'], critical: true };
  const body = request(root, 'TASK-PLAN', edit); const checked = checkTaskEdit(root, 'TASK-PLAN', body);
  assert.equal(checked.valid, true); assert.equal(mutationRevision(root), before);
  const data = saveTaskEdit(root, 'TASK-PLAN', body); const task = data.lanes.flatMap((lane) => lane.tasks).find((item) => item.id === 'TASK-PLAN');
  assert.equal(task.title, edit.title); assert.equal(task.owner, 'Ari'); assert.equal(task.critical, true);
  assert.match(fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8'), /Human note stays here\./);
  assert.match(fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8'), /schema_version: 1/);
  assert.equal(loadProject(root).status_stale, false);
});

test('schedule edits migrate v1 to v2, clear canonically, and preserve task identity', () => {
  const root = makeProject(); const beforeTask = loadProject(root).tasks.find((item) => item.id === 'TASK-PLAN');
  const beforeHash = beforeTask.spec_sha256;
  const scheduled = saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' }));
  const task = scheduled.tasks.find((item) => item.id === 'TASK-PLAN');
  assert.equal(task.scheduled_start, '2026-08-10'); assert.equal(task.scheduled_end, '2026-08-12'); assert.equal(task.task_revision, beforeHash);
  let text = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8'); assert.match(text, /schema_version: 2/); assert.match(text, /"scheduled_start":"2026-08-10"/); assert.match(text, /Human note stays here\./);
  saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { scheduled_start: null, scheduled_end: null }));
  text = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8'); assert.match(text, /schema_version: 2/); assert.doesNotMatch(text, /scheduled_start|scheduled_end/); assert.equal(loadProject(root).tasks[0].spec_sha256, beforeHash);
});

test('partial, mixed, reversed, and stale schedules fail without live mutation', () => {
  const root = makeProject(); const before = mutationRevision(root);
  assert.throws(() => checkTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { scheduled_start: '2026-08-10' })), /must be edited together/);
  assert.throws(() => checkTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { scheduled_start: null, scheduled_end: '2026-08-12' })), /both be date strings or both be null/);
  assert.throws(() => checkTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { scheduled_start: '2026-08-13', scheduled_end: '2026-08-12' })), /must not be after/);
  assert.equal(mutationRevision(root), before);
  const stale = request(root, 'TASK-PLAN', { scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' }); fs.appendFileSync(path.join(root, 'TASKS.md'), '\nConcurrent schedule note.\n'); const concurrent = mutationRevision(root);
  assert.throws(() => saveTaskEdit(root, 'TASK-PLAN', stale), (error) => error.code === 'MUTATION_CONFLICT'); assert.equal(mutationRevision(root), concurrent);
});

test('active work can be rescheduled without changing contract identity or lifecycle authority', () => {
  const records = [{ id: 'TASK-ACTIVE', title: 'Active work', data: { outcome: 'Active work ships.', acceptance: ['Active work is accepted.'], status: 'planned', priority: 'P1' } }];
  const root = makeProject(records, 'ACTIVE-SCHEDULE'); const state = loadProject(root); const original = state.tasks[0];
  const contract = buildTaskContract(state.project, original, [], '2026-08-08T00:00:00Z');
  const attempt = path.join(root, 'handoffs', original.id, contract.contract_id); fs.mkdirSync(attempt, { recursive: true });
  const contractPath = path.join(attempt, 'TASK-CONTRACT.md'); fs.writeFileSync(contractPath, formatTaskContract(contract, { story: null, executor_prompt: null, executor_prompt_sha256: null }));
  records[0].data.status = 'in_progress'; records[0].data.active_contract = contract.contract_id;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records)); regenerateStatus(root, '2026-08-08T00:00:01Z');
  const beforeContract = sha256(fs.readFileSync(contractPath)); const beforeSpec = loadProject(root).tasks[0].spec_sha256;
  assert.equal(beforeSpec, taskSpecHash(original));
  const data = saveTaskEdit(root, 'TASK-ACTIVE', request(root, 'TASK-ACTIVE', { scheduled_start: '2026-08-11', scheduled_end: '2026-08-15' }));
  const active = data.tasks.find((item) => item.id === 'TASK-ACTIVE');
  assert.equal(active.status, 'in_progress'); assert.equal(active.scheduled_end, '2026-08-15'); assert.equal(active.task_revision, beforeSpec); assert.equal(sha256(fs.readFileSync(contractPath)), beforeContract);
  assert.doesNotThrow(() => loadProject(root));
  assert.throws(() => checkTaskEdit(root, 'TASK-ACTIVE', request(root, 'TASK-ACTIVE', { status: 'ready' })), (error) => error.code === 'TASK_READ_ONLY');
});

test('protected fields, invalid graphs, historical tasks, and stale revisions fail without mutation', () => {
  const root = makeProject();
  const protectedBody = request(root, 'TASK-PLAN', { active_contract: null });
  assert.throws(() => checkTaskEdit(root, 'TASK-PLAN', protectedBody), (error) => error instanceof TaskEditError && error.code === 'PROTECTED_FIELD');
  const stale = request(root, 'TASK-PLAN', { owner: 'New owner' }); fs.appendFileSync(path.join(root, 'TASKS.md'), '\nExternal narrative.\n'); const external = mutationRevision(root);
  assert.throws(() => saveTaskEdit(root, 'TASK-PLAN', stale), (error) => error.code === 'MUTATION_CONFLICT'); assert.equal(mutationRevision(root), external);
  const historyRoot = makeProject(); fs.mkdirSync(path.join(historyRoot, 'handoffs', 'TASK-PLAN'), { recursive: true });
  const historyRequest = request(historyRoot, 'TASK-PLAN', { owner: 'Blocked edit' });
  assert.throws(() => checkTaskEdit(historyRoot, 'TASK-PLAN', historyRequest), (error) => error.code === 'TASK_READ_ONLY');
  const reverifyRoot = makeProject();
  fs.writeFileSync(path.join(reverifyRoot, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Revalidate delivery', data: { date: '2026-08-08', observed_at: '2026-08-08T00:00:01Z', sources: [], affected_tasks: ['TASK-PLAN'], affected_milestones: [], reverify_tasks: ['TASK-PLAN'], risk_summary: 'Delivery assumptions changed.' } }]));
  const reverifyRequest = request(reverifyRoot, 'TASK-PLAN', { owner: 'Blocked edit' });
  assert.throws(() => checkTaskEdit(reverifyRoot, 'TASK-PLAN', reverifyRequest), (error) => error.code === 'TASK_READ_ONLY' && /re-verification/.test(error.message));
});

test('cycle candidates, stale task revisions, and reverse dependency links are exact', () => {
  const records = [
    { id: 'TASK-PLAN', title: 'Plan', data: { outcome: 'Plan exists.', acceptance: ['Plan approved.'], status: 'planned', depends_on: [], blocks: ['TASK-VAGUE'] } },
    { id: 'TASK-VAGUE', title: 'Execute', data: { outcome: 'Execution exists.', acceptance: ['Execution approved.'], status: 'planned', depends_on: ['TASK-PLAN'], blocks: [] } },
  ];
  const root = makeProject(records); const before = mutationRevision(root);
  const cycle = request(root, 'TASK-PLAN', { depends_on: ['TASK-VAGUE'] });
  assert.throws(() => checkTaskEdit(root, 'TASK-PLAN', cycle), /Dependency cycle/); assert.equal(mutationRevision(root), before);
  const staleTask = request(root, 'TASK-PLAN', { owner: 'Stale' }); staleTask.taskRevision = '0'.repeat(64);
  assert.throws(() => saveTaskEdit(root, 'TASK-PLAN', staleTask), (error) => error.code === 'TASK_CONFLICT'); assert.equal(mutationRevision(root), before);
  saveTaskEdit(root, 'TASK-VAGUE', request(root, 'TASK-VAGUE', { depends_on: [] }));
  const state = loadProject(root); assert.deepEqual(state.tasks.find((task) => task.id === 'TASK-PLAN').blocks, []);
});

test('mutation revisions preserve symlink text, ignore creation order, and reject special entries', { skip: process.platform === 'win32' }, () => {
  const first = makeProject(); const second = makeProject();
  fs.writeFileSync(path.join(first, 'z.txt'), 'z'); fs.writeFileSync(path.join(first, 'a.txt'), 'a');
  fs.writeFileSync(path.join(second, 'a.txt'), 'a'); fs.writeFileSync(path.join(second, 'z.txt'), 'z');
  fs.symlinkSync('../relative-target', path.join(first, 'relative-link')); fs.symlinkSync('/tmp/absolute-target', path.join(first, 'absolute-link'));
  fs.symlinkSync('../relative-target', path.join(second, 'relative-link')); fs.symlinkSync('/tmp/absolute-target', path.join(second, 'absolute-link'));
  assert.equal(mutationRevision(first), mutationRevision(second));
  const requestRevision = mutationRevision(first);
  atomicProjectMutation(first, (candidate, context) => require('../../skills/project-manager/scripts/lib/project-state').regenerateStatus(candidate, '2026-08-08T00:00:01Z', context), loadProject, { expectedMutationRevision: requestRevision });
  assert.equal(fs.readlinkSync(path.join(first, 'relative-link')), '../relative-target'); assert.equal(fs.readlinkSync(path.join(first, 'absolute-link')), '/tmp/absolute-target');
  const fifoRoot = makeProject(); const fifo = path.join(fifoRoot, 'pipe'); spawnSync('mkfifo', [fifo]);
  assert.throws(() => mutationRevision(fifoRoot), UnsupportedProjectEntryError); fs.rmSync(fifo);
});

test('a replaced project-root symlink is rejected before check can touch its target', { skip: process.platform === 'win32' }, () => {
  const root = makeProject(); const sibling = makeProject();
  const body = request(root, 'TASK-PLAN', { owner: 'Escaped write' }); const siblingBefore = mutationRevision(sibling);
  fs.renameSync(root, `${root}-original`); fs.symlinkSync(sibling, root, 'dir');
  assert.throws(() => checkTaskEdit(root, 'TASK-PLAN', body), (error) => error instanceof UnsupportedProjectEntryError && error.path === '.');
  assert.equal(mutationRevision(sibling), siblingBefore);
});

test('valid CRLF task documents remain editable and preserve their line endings', () => {
  const root = makeProject(); const tasksPath = path.join(root, 'TASKS.md');
  fs.writeFileSync(tasksPath, fs.readFileSync(tasksPath, 'utf8').replace(/\r?\n/g, '\r\n'));
  require('../../skills/project-manager/scripts/lib/project-state').regenerateStatus(root, '2026-08-08T00:00:01Z');
  const body = request(root, 'TASK-PLAN', { owner: 'CRLF owner' });
  assert.equal(checkTaskEdit(root, 'TASK-PLAN', body).valid, true);
  saveTaskEdit(root, 'TASK-PLAN', body);
  const saved = fs.readFileSync(tasksPath, 'utf8');
  assert.equal(/(^|[^\r])\n/.test(saved), false); assert.match(saved, /"owner":"CRLF owner"/);
});

test('post-replacement failure restores the exact prior tree', () => {
  const root = makeProject(); const before = mutationRevision(root); const body = request(root, 'TASK-PLAN', { owner: 'Rollback' });
  assert.throws(() => saveTaskEdit(root, 'TASK-PLAN', body, { injectFailureAfterReplace: true }), /Injected failure/);
  assert.equal(mutationRevision(root), before);
});
