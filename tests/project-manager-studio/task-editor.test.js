/* Task-editor contracts: exact revisions, split planning/disposition/schedule/order
   authority, v1-v4 migration, protected history, conflicts, copy fidelity, and rollback. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { loadProject, kanbanData, regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');
const { buildTaskContract, formatTaskContract, taskSpecHash, sha256 } = require('../../skills/project-manager/scripts/lib/contracts');
const { mutationRevision, atomicProjectMutation, UnsupportedProjectEntryError } = require('../../skills/project-manager/scripts/lib/mutations');
const { loadRevisionedProject, checkTaskEdit, saveTaskEdit, saveTaskOrder, TaskEditError } = require('../../skills/project-manager/scripts/lib/task-editor');
const { completeHumanTask } = require('../../skills/project-manager/scripts/lib/human-completion');
const { makeProject, collection } = require('./_helpers');

function request(root, id, edit) { const snap = loadRevisionedProject(root); const task = snap.state.tasks.find((item) => item.id === id); return { mutationRevision: snap.mutation_revision, taskRevision: task.spec_sha256, edit }; }
function orderRequest(root, order) { return { mutationRevision: loadRevisionedProject(root).mutation_revision, order }; }

function snapshot(root) {
  return Object.fromEntries(fs.readdirSync(root).filter((name) => fs.lstatSync(path.join(root, name)).isFile())
    .map((name) => [name, sha256(fs.readFileSync(path.join(root, name)))]));
}

test('row order persists as v4 metadata without touching specification identity or updated dates', () => {
  const root = makeProject();
  const files = snapshot(root);
  const before = loadRevisionedProject(root).data.tasks;
  assert.deepEqual(before.map((task) => task.order), [null, null]);
  assert.equal(before[0].order, null);

  const data = saveTaskOrder(root, orderRequest(root, ['TASK-VAGUE', 'TASK-PLAN']));
  assert.deepEqual(data.tasks.map((task) => [task.id, task.order]), [['TASK-PLAN', 2], ['TASK-VAGUE', 1]]);
  for (const task of data.tasks) {
    const original = before.find((item) => item.id === task.id);
    assert.equal(task.task_revision, original.task_revision);
    assert.equal(task.updated, original.updated);
    assert.equal(task.status, original.status);
    assert.equal(task.disposition, original.disposition);
  }
  const text = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
  assert.match(text, /schema_version: 4/); assert.match(text, /"order":1/); assert.match(text, /Human note stays here\./);
  assert.equal(loadProject(root).status_stale, false);
  assert.equal(loadProject(root).tasks.find((task) => task.id === 'TASK-VAGUE').order, 1);
  // Only TASKS.md and its derived STATUS.md cache may change.
  assert.deepEqual(Object.entries(files).filter(([name, digest]) => digest !== snapshot(root)[name]).map(([name]) => name).sort(), ['STATUS.md', 'TASKS.md']);
});

test('clearing row order removes the field, keeps v4, and restores generated defaults', () => {
  const root = makeProject();
  saveTaskOrder(root, orderRequest(root, ['TASK-VAGUE', 'TASK-PLAN']));
  const data = saveTaskOrder(root, orderRequest(root, null));
  assert.deepEqual(data.tasks.map((task) => task.order), [null, null]);
  const text = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
  assert.doesNotMatch(text, /"order"/); assert.match(text, /schema_version: 4/);
  assert.equal(loadProject(root).status_stale, false);
});

test('row order preserves schedule and disposition metadata written at earlier versions', () => {
  const root = makeProject();
  saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' }));
  saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { disposition: 'deferred' }));
  const data = saveTaskOrder(root, orderRequest(root, ['TASK-VAGUE', 'TASK-PLAN']));
  const task = data.tasks.find((item) => item.id === 'TASK-PLAN');
  assert.equal(task.scheduled_start, '2026-08-10'); assert.equal(task.disposition, 'deferred'); assert.equal(task.order, 2);
  const text = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
  assert.match(text, /schema_version: 4/); assert.match(text, /"scheduled_start":"2026-08-10"/); assert.match(text, /"disposition":"deferred"/);
});

test('done, cancelled, and evidence-backed rows stay reorderable while a complete project does not', () => {
  const records = [
    { id: 'TASK-DONE', title: 'Shipped', data: { outcome: 'Shipped.', acceptance: ['Accepted.'], status: 'ready', success_criteria: ['SC-OUTCOME'] } },
    { id: 'TASK-STOPPED', title: 'Stopped', data: { outcome: 'Stopped.', acceptance: ['Accepted.'], status: 'planned' } },
  ];
  const root = makeProject(records, 'ORDER-AUTH');
  completeHumanTask(root, 'TASK-DONE', { ref: 'owner-signoff', result: 'Owner accepted the delivery.', observed_at: '2026-08-08T01:00:00Z' });
  saveTaskEdit(root, 'TASK-STOPPED', request(root, 'TASK-STOPPED', { disposition: 'cancelled' }));
  const before = loadRevisionedProject(root).data.tasks;
  // Neither row may be edited or rescheduled, and both must still be reorderable:
  // row order deliberately consults none of the per-task authorities.
  for (const task of before) { assert.equal(task.editable, false); assert.equal(task.schedule_editable, false); }
  assert.equal(before.find((task) => task.id === 'TASK-DONE').last_manifest !== null, true);

  const data = saveTaskOrder(root, orderRequest(root, ['TASK-STOPPED', 'TASK-DONE']));
  assert.deepEqual(data.tasks.map((task) => [task.id, task.order]), [['TASK-DONE', 2], ['TASK-STOPPED', 1]]);
  assert.equal(data.project.task_order_editable, true);
  for (const task of data.tasks) assert.equal(task.task_revision, before.find((item) => item.id === task.id).task_revision);

  const project = fs.readFileSync(path.join(root, 'PROJECT.md'), 'utf8').replace('status: "active"', 'status: "complete"');
  fs.writeFileSync(path.join(root, 'PROJECT.md'), project); regenerateStatus(root, '2026-08-08T02:00:00Z');
  const complete = loadRevisionedProject(root).data.project;
  assert.equal(complete.task_order_editable, false); assert.match(complete.task_order_edit_reason, /Completed projects/);
  const revision = mutationRevision(root);
  assert.throws(() => saveTaskOrder(root, orderRequest(root, ['TASK-DONE', 'TASK-STOPPED'])), (error) => error.code === 'TASK_ORDER_READ_ONLY');
  assert.equal(mutationRevision(root), revision);
});

test('incomplete, unknown, duplicated, stale, and interrupted row orders leave TASKS.md untouched', () => {
  const root = makeProject(); const before = mutationRevision(root);
  const bytes = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
  assert.throws(() => saveTaskOrder(root, orderRequest(root, ['TASK-PLAN'])), (error) => error.code === 'INVALID_REQUEST' && /missing/.test(error.message));
  assert.throws(() => saveTaskOrder(root, orderRequest(root, ['TASK-PLAN', 'TASK-VAGUE', 'TASK-GHOST'])), (error) => error.code === 'TASK_NOT_FOUND');
  assert.throws(() => saveTaskOrder(root, orderRequest(root, ['TASK-PLAN', 'TASK-PLAN'])), (error) => error.code === 'INVALID_REQUEST' && /repeat/.test(error.message));
  assert.throws(() => saveTaskOrder(root, { mutationRevision: 'stale', order: ['TASK-VAGUE', 'TASK-PLAN'] }), (error) => error.code === 'MUTATION_CONFLICT');
  assert.throws(() => saveTaskOrder(root, { mutationRevision: before, order: ['TASK-VAGUE', 'TASK-PLAN'], edit: {} }), (error) => error.code === 'PROTECTED_FIELD');
  assert.equal(mutationRevision(root), before);
  assert.throws(() => saveTaskOrder(root, orderRequest(root, ['TASK-VAGUE', 'TASK-PLAN']), { injectFailureAfterReplace: true }), /Injected failure/);
  assert.equal(fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8'), bytes);
  assert.equal(mutationRevision(root), before);
});

test('order is rejected before v4, accepted at v4, and never written by a read', () => {
  const records = [{ id: 'TASK-ONE', title: 'One', data: { outcome: 'One.', acceptance: ['Accepted.'], status: 'planned', order: 1 } }];
  for (const version of [1, 2, 3]) {
    const root = makeProject([{ id: 'TASK-ONE', title: 'One', data: { outcome: 'One.', acceptance: ['Accepted.'], status: 'planned' } }], 'ORDER-VERSION');
    fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, version));
    assert.throws(() => loadProject(root), (error) => /unknown fields: order/.test(error.message), `v${version} must reject order`);
  }
  const root = makeProject([{ id: 'TASK-ONE', title: 'One', data: { outcome: 'One.', acceptance: ['Accepted.'], status: 'planned' } }], 'ORDER-VERSION');
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, 4)); regenerateStatus(root, '2026-08-08T00:00:01Z');
  assert.equal(loadProject(root).tasks[0].order, 1);
  const revision = mutationRevision(root);
  loadRevisionedProject(root); kanbanData(loadProject(root));
  assert.equal(mutationRevision(root), revision);
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ ...records[0], data: { ...records[0].data, order: 0 } }], 4));
  assert.throws(() => loadProject(root), (error) => error.code === 'TASK_ORDER');
});

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

test('disposition edits upgrade to v3, preserve schedules and identity, and make cancellation terminal', () => {
  const root = makeProject(); const original = loadProject(root).tasks[0]; const originalHash = original.spec_sha256;
  saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' }));
  let data = saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { disposition: 'deferred' }));
  let task = data.tasks.find((item) => item.id === 'TASK-PLAN'); let text = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
  assert.match(text, /schema_version: 3/); assert.match(text, /"scheduled_start":"2026-08-10"/); assert.match(text, /"disposition":"deferred"/);
  assert.equal(task.task_revision, originalHash); assert.equal(task.display_status, 'deferred'); assert.equal(task.disposition_editable, true); assert.equal(task.next_rank, null);

  data = saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { disposition: 'active' })); task = data.tasks.find((item) => item.id === 'TASK-PLAN'); text = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
  assert.equal(task.disposition, 'active'); assert.equal(task.display_status, 'planned'); assert.doesNotMatch(text, /disposition_changed_at/); assert.match(text, /schema_version: 3/);

  data = saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { disposition: 'cancelled' })); task = data.tasks.find((item) => item.id === 'TASK-PLAN');
  assert.equal(task.display_status, 'cancelled'); assert.equal(task.disposition_editable, false); assert.equal(task.schedule_editable, false);
  assert.throws(() => saveTaskEdit(root, 'TASK-PLAN', request(root, 'TASK-PLAN', { disposition: 'active' })), (error) => error.code === 'TASK_DISPOSITION_READ_ONLY');
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

test('immutable handoff ancestors are matched by path segment, not string prefix', () => {
  // TASK-1 is a string prefix of TASK-10. Only TASK-10 holds a validated active
  // attempt, so a bare handoffs/TASK-1 directory is tied to no active state.
  const records = [
    { id: 'TASK-1', title: 'Prefix task', data: { outcome: 'Prefix work ships.', acceptance: ['Accepted.'], status: 'planned', priority: 'P1' } },
    { id: 'TASK-10', title: 'Active task', data: { outcome: 'Active work ships.', acceptance: ['Accepted.'], status: 'planned', priority: 'P1' } },
  ];
  const root = makeProject(records, 'PREFIX-GUARD');
  const state = loadProject(root); const active = state.tasks.find((item) => item.id === 'TASK-10');
  const contract = buildTaskContract(state.project, active, [], '2026-08-08T00:00:00Z');
  const attempt = path.join(root, 'handoffs', 'TASK-10', contract.contract_id); fs.mkdirSync(attempt, { recursive: true });
  fs.writeFileSync(path.join(attempt, 'TASK-CONTRACT.md'), formatTaskContract(contract, { story: null, executor_prompt: null, executor_prompt_sha256: null }));
  records[1].data.status = 'in_progress'; records[1].data.active_contract = contract.contract_id;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records)); regenerateStatus(root, '2026-08-08T00:00:01Z');

  const before = mutationRevision(root);
  assert.throws(() => atomicProjectMutation(root, (candidate, context) => {
    fs.mkdirSync(path.join(candidate, 'handoffs', 'TASK-1'), { recursive: true });
    regenerateStatus(candidate, '2026-08-08T00:00:02Z', context);
  }, loadProject), /not tied to validated active state/);
  assert.equal(mutationRevision(root), before);
  assert.equal(fs.existsSync(path.join(root, 'handoffs', 'TASK-1')), false);
});

test('the compact summary reports the same facts as the board projection', () => {
  const { summaryData, blockedTaskIds } = require('../../skills/project-manager/scripts/lib/project-state');
  // A task claiming in_progress with no active contract has inconsistent
  // lifecycle pointers. Under taskErrorsAsWarnings that becomes an execution
  // warning rather than a load failure, which is exactly the case where the
  // set-union `blocked` differs from a plain blocker count -- without it this
  // comparison would pass vacuously.
  const sound = [
    { id: 'TASK-BROKEN', title: 'Inconsistent work', data: { outcome: 'Work ships.', acceptance: ['Accepted.'], status: 'planned', priority: 'P1', owner: null } },
    { id: 'TASK-WAIT', title: 'Waiting work', data: { outcome: 'Later work ships.', acceptance: ['Accepted.'], status: 'planned', priority: 'P2', owner: 'Ari', blocked_by: ['Waiting on vendor'] } },
  ];
  const root = makeProject(sound, 'SUMMARY-PARITY');
  // Introduced after construction: the fixture builder regenerates STATUS under
  // strict validation and would reject the inconsistency outright.
  sound[0].data.status = 'in_progress';
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(sound));
  const state = loadProject(root, { taskErrorsAsWarnings: true });

  assert.ok(state.warnings.length > 0, 'fixture must produce a warning for this comparison to mean anything');
  assert.ok(blockedTaskIds(state).size > 0, 'fixture must produce a blocked task');

  const board = kanbanData(state);
  const summary = summaryData(state);
  assert.deepEqual(summary.tasks, { total: board.summary.tasks.total, actionable: board.summary.tasks.actionable, blocked: board.summary.tasks.blocked });
  assert.deepEqual(summary.success, { verified: board.summary.success.verified, total: board.summary.success.total });
  assert.equal(summary.owner_gaps, board.summary.owner_gaps);
  assert.equal(summary.warnings, board.warnings.length);
  assert.deepEqual(summary.next, board.next.map((task) => ({ id: task.id, title: task.title })));
});
