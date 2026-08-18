/**
 * Responsibility: executable contract tests for folder isolation, deterministic
 * project facts, optional modules, provider handoffs, and hostile invalid inputs.
 * Invariants: temporary fixtures only; no repository mutation. Recent changes:
 * cover TASKS v3 dispositions, rigor policies, human and agent governed
 * execution, Studio projection, strict projects-root and single-project skill
 * discovery contracts, and atomic workspace initialization with local
 * cross-platform Studio launchers.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  loadProject, loadProjectIndex, loadProjectsRoot, loadProjectCatalogRoot, resolveProjectInRoot, validateData, statusData, nextData, blockerItems, coverageData, reportData, executionData, concurrencyData, kanbanData, scheduleEditEligibility, dispositionEditEligibility, regenerateStatus, profilePolicy, successCounts, parseAttempt,
} = require('../scripts/lib/project-state');
const {
  DEFAULT_EVIDENCE, canonicalJson, sha256, taskSpecHash, buildTaskContract, deriveStory,
  renderRpdPrompt, validateManifest, validateEvidenceRequirements, validateTaskContract, formatTaskContract, formatEvidenceManifest, snapshotRpdEvidence,
} = require('../scripts/lib/contracts');
const { atomicProjectMutation, createProjectWork, cleanupProjectWork } = require('../scripts/lib/mutations');
const { completeHumanTask, loadStableProject } = require('../scripts/lib/human-completion');
const { startAgentTask, ingestAgentManifest } = require('../scripts/lib/agent-execution');
const { startRun, advanceRun, resumeRun } = require('../scripts/lib/run-execution');
const { parseTaskRecords, renderRecord } = require('../scripts/lib/task-editor');
const { MAX_PAYLOAD_BYTES, RETIRED_ROOT_LAUNCHERS, initializeWorkspaceProject } = require('../scripts/lib/workspace-init');

const SCRIPT_ROOT = path.join(__dirname, '..', 'scripts');
const SKILL_ROOT = path.join(__dirname, '..');

function frontmatter(data) {
  return `---\n${Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`;
}

function projectText(id, overrides = {}) {
  const data = {
    schema_version: 1, id, name: id.replaceAll('-', ' '), status: 'active', owner: null,
    start_date: null, target_date: null, current_milestone: null, profile: 'minimal',
    adapters: ['human'], created: '2026-08-08', updated: '2026-08-08', ...overrides,
  };
  return `${frontmatter(data)}\n## Objective\n\nDeliver ${id}.\n\n## Success Criteria\n\n- [SC-OUTCOME] The outcome is accepted.\n`;
}

function collection(records = [], schemaVersion = 1) {
  return `${frontmatter({ schema_version: schemaVersion })}${records.map((record) => `\n## ${record.id} - ${record.title}\n\n\`\`\`json\n${JSON.stringify(record.data)}\n\`\`\`\n`).join('')}`;
}

function createProject(base, id, records = [], projectOverrides = {}) {
  const root = path.join(base, id.toLowerCase());
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText(id, projectOverrides));
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records));
  fs.writeFileSync(path.join(root, 'STATUS.md'), `${frontmatter({ schema_version: 1, project_id: id, generated_at: '2026-08-08T00:00:00Z', source_sha256: '0'.repeat(64) })}\nDerived cache.\n`);
  return root;
}

function task(id, title, outcome, acceptance, extra = {}) {
  return { id, title, data: { outcome, acceptance, ...extra } };
}

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'project-manager-'));
}

function contractRoot() {
  return fs.realpathSync(temp());
}

function treeHash(root) {
  const rows = [];
  function walk(folder, relative = '') {
    for (const name of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, name); const rel = path.join(relative, name); const stat = fs.lstatSync(full);
      if (stat.isDirectory()) walk(full, rel); else rows.push([rel, sha256(fs.readFileSync(full))]);
    }
  }
  walk(root); return sha256(rows);
}

function treeState(root) {
  if (!fs.existsSync(root)) return null;
  const rows = [];
  function walk(folder, relative = '') {
    const stat = fs.lstatSync(folder);
    rows.push({ path: relative || '.', type: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file', mode: stat.mode & 0o777 });
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, name); const rel = path.join(relative, name); const child = fs.lstatSync(full);
      if (child.isDirectory()) walk(full, rel);
      else rows.push({ path: rel, type: child.isSymbolicLink() ? 'symlink' : 'file', mode: child.mode & 0o777, value: child.isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full).toString('base64') });
    }
  }
  walk(root); return rows;
}

function initPayload(id = 'WORKSPACE-DEMO') {
  return { project_md: projectText(id, { status: 'planning', created: '2026-08-15', updated: '2026-08-15' }), tasks_md: collection([]) };
}

function fakeSkill(base) {
  const root = path.join(base, 'installed skill with spaces');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true }); fs.mkdirSync(path.join(root, 'scripts'));
  for (const name of ['studio.sh', 'studio.cmd']) fs.copyFileSync(path.join(SKILL_ROOT, 'assets', name), path.join(root, 'assets', name));
  fs.chmodSync(path.join(root, 'assets', 'studio.sh'), 0o755);
  fs.writeFileSync(path.join(root, 'scripts', 'project-manager-studio.js'), `/** Test fixture: record launcher cwd and arguments, then return the requested status. */\n'use strict';\nrequire('node:fs').writeFileSync(process.env.PM_LAUNCH_RECORD, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2) }));\nprocess.exitCode = Number(process.env.PM_LAUNCH_EXIT ?? 0);\n`);
  return fs.realpathSync(root);
}

// Byte-exact copies of the launchers this skill published to the workspace root before launchers moved
// into the projects root. The digest assertion keeps the fixtures pinned to what initialization retires.
function retiredRootLauncher(name) {
  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', `retired-root-${name}`));
  assert.equal(RETIRED_ROOT_LAUNCHERS[name].includes(crypto.createHash('sha256').update(bytes).digest('hex')), true, name);
  return bytes;
}

function run(script, args, input = undefined) {
  return spawnSync(process.execPath, [path.join(SCRIPT_ROOT, script), ...args], { encoding: 'utf8', input });
}

test('minimal generic project validates without Git, milestones, traceability, or RPD', () => {
  const base = temp();
  const root = createProject(base, 'ROLLOUT', [task('TASK-LAUNCH', 'Launch', 'Launch safely.', ['Stakeholders approve launch.'], { status: 'ready', success_criteria: ['SC-OUTCOME'] })]);
  const state = loadProject(root);
  assert.equal(state.project.id, 'ROLLOUT');
  assert.deepEqual(validateData(state).modules, { milestones: false, risks: false, decisions: false, sources: false, traceability: false, changes: false, assumptions: false, issues: false, stakeholders: false, lessons: false, closure: false, runs: false, handoffs: false, reports: false });
  assert.deepEqual(statusData(state).milestones, { configured: false });
  assert.deepEqual(coverageData(state), { schema_version: 1, configured: false });
  assert.equal(nextData(state).tasks[0].id, 'TASK-LAUNCH');
  assert.equal(reportData(state).unknowns.some((item) => item.field === 'status.coverage'), true);
});

test('unavailable executor roots warn during project reads and block only when execution starts', () => {
  const base = temp();
  const missingRoot = path.join(base, 'not-created');
  const root = createProject(base, 'EXECUTOR-WARNING', [
    task('TASK-RUN', 'Run', 'Run the delegated work.', ['The delegated work is verified.'], {
      status: 'ready', executor: { provider: 'agent', root: missingRoot, scope: 'absolute' },
    }),
  ], { adapters: ['human', 'agent'] });
  regenerateStatus(root, '2026-08-08T00:00:00Z');

  const state = loadProject(root);
  assert.deepEqual(state.warnings, [{
    code: 'TASK_EXECUTOR_ROOT_UNAVAILABLE', path: 'TASKS.md', task_id: 'TASK-RUN',
    message: 'Run (TASK-RUN) cannot run because its configured working folder is missing or inaccessible. Point the task to an existing folder before running it.',
  }]);
  assert.equal(validateData(state).valid, true);
  const board = kanbanData(state);
  assert.equal(board.warnings[0].code, 'TASK_EXECUTOR_ROOT_UNAVAILABLE');
  assert.equal(board.tasks[0].execution_issue, true);
  assert.equal(board.summary.tasks.blocked, 1);
  assert.deepEqual(board.next, []);
  assert.throws(
    () => startAgentTask(root, 'TASK-RUN', { created_at: '2026-08-08T00:01:00Z' }),
    /Executor root must be an existing real directory/,
  );

  fs.mkdirSync(missingRoot);
  assert.deepEqual(loadProject(root).warnings, []);
  startAgentTask(root, 'TASK-RUN', { created_at: '2026-08-08T00:02:00Z' });
  fs.rmdirSync(missingRoot);
  assert.equal(loadProject(root).warnings[0].code, 'TASK_EXECUTOR_ROOT_UNAVAILABLE');
});

test('profile policy keeps governed execution universal while simplifying ordinary human completion', () => {
  assert.deepEqual(profilePolicy('minimal'), { human_completion: 'lightweight', delegated_execution: 'governed' });
  assert.deepEqual(profilePolicy('standard'), { human_completion: 'lightweight', delegated_execution: 'governed' });
  assert.deepEqual(profilePolicy('controlled'), { human_completion: 'governed', delegated_execution: 'governed' });
  for (const profile of ['minimal', 'standard']) {
    const base = temp(); const root = createProject(base, `HUMAN-${profile.toUpperCase()}`, [task('TASK-APPROVE', 'Approve', 'The decision is confirmed.', ['The owner approves the decision.'], { status: 'planned', success_criteria: ['SC-OUTCOME'] })], { profile });
    const result = completeHumanTask(root, 'TASK-APPROVE', { ref: 'owner-signoff', result: 'Owner approved the final decision.', observed_at: '2026-08-08T01:00:00Z' });
    const state = loadProject(root); const completed = state.tasks[0];
    assert.equal(result.status, 'done'); assert.equal(completed.status, 'done'); assert.equal(completed.active_contract, result.contract_id); assert.equal(completed.last_manifest, result.manifest_id);
    assert.equal(fs.existsSync(path.join(root, 'handoffs', completed.id, result.contract_id, 'TASK-CONTRACT.md')), true);
    assert.equal(fs.existsSync(path.join(root, 'handoffs', completed.id, result.contract_id, 'EVIDENCE-001.md')), true);
    assert.equal(statusData(state).project.policy.human_completion, 'lightweight'); assert.equal(state.status_stale, false);
  }
  const revisions = ['before-a', 'after-a', 'stable', 'stable']; let revisionIndex = 0;
  const stable = loadStableProject('/synthetic', 3, () => revisions[revisionIndex++], () => ({ read_at: revisionIndex }));
  assert.deepEqual(stable, { state: { read_at: 3 }, mutation_revision: 'stable' });
});

test('lightweight human completion rejects unprovable work and rolls back exact bytes', () => {
  const controlled = createProject(temp(), 'CONTROLLED-HUMAN', [task('TASK-A', 'A', 'A is complete.', ['A is approved.'])], { profile: 'controlled' });
  let before = treeHash(controlled);
  assert.throws(() => completeHumanTask(controlled, 'TASK-A', { ref: 'approval', result: 'Approved.', observed_at: '2026-08-08T01:00:00Z' }), (error) => error.code === 'CONTROLLED_PROFILE');
  assert.equal(treeHash(controlled), before);

  const custom = createProject(temp(), 'CUSTOM-HUMAN', [task('TASK-A', 'A', 'A is complete.', ['A is approved.'], { evidence_requirements: [{ stage: 'verified', any_of: ['review'], minimum: 1 }] })]);
  before = treeHash(custom);
  assert.throws(() => completeHumanTask(custom, 'TASK-A', { ref: 'approval', result: 'Approved.', observed_at: '2026-08-08T01:00:00Z' }), (error) => error.code === 'EVIDENCE_REQUIRES_GOVERNED');
  assert.equal(treeHash(custom), before);

  const rollback = createProject(temp(), 'ROLLBACK-HUMAN', [task('TASK-A', 'A', 'A is complete.', ['A is approved.'])]); before = treeHash(rollback);
  assert.throws(() => completeHumanTask(rollback, 'TASK-A', { ref: 'approval', result: 'Approved.', observed_at: '2026-08-08T01:00:00Z' }, { injectFailureAfterReplace: true }), /Injected failure/);
  assert.equal(treeHash(rollback), before);

  const sourced = createProject(temp(), 'SOURCED-HUMAN', [task('TASK-A', 'A', 'A is complete.', ['A is approved.'], { sources: ['SRC-LIVE'] })]);
  fs.writeFileSync(path.join(sourced, 'SOURCES.md'), collection([{ id: 'SRC-LIVE', title: 'Live source', data: { kind: 'document', location: 'brief.md', role: 'scope', status: 'current', version: null, sha256: null } }])); regenerateStatus(sourced, '2026-08-08T00:30:00Z'); before = treeHash(sourced);
  assert.throws(() => completeHumanTask(sourced, 'TASK-A', { ref: 'approval', result: 'Approved.', observed_at: '2026-08-08T01:00:00Z' }), (error) => error.code === 'SOURCE_UNVERIFIABLE');
  assert.equal(treeHash(sourced), before);
});

test('TASKS v3 dispositions preserve schedules and separate actionability, blockers, and mappings', () => {
  const records = [
    task('TASK-READY', 'Ready', 'Ready outcome.', ['Ready accepted.'], { status: 'ready', blocks: [] }),
    task('TASK-DEFERRED', 'Deferred', 'Deferred outcome.', ['Deferred accepted.'], { status: 'planned', disposition: 'deferred', disposition_changed_at: '2026-08-08T01:00:00Z', blocked_by: ['Paused externally'], success_criteria: ['SC-OUTCOME'], scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' }),
    task('TASK-CANCELLED', 'Cancelled', 'Cancelled outcome.', ['Cancelled accepted.'], { status: 'planned', disposition: 'cancelled', disposition_changed_at: '2026-08-08T01:00:00Z', blocks: ['TASK-WAITING'], blocked_by: ['No longer funded'], success_criteria: ['SC-OUTCOME'] }),
    task('TASK-WAITING', 'Waiting', 'Waiting outcome.', ['Waiting accepted.'], { status: 'planned', depends_on: ['TASK-CANCELLED'], blocked_by: [], blocks: [] }),
  ];
  const root = createProject(temp(), 'DISPOSITIONS', records); fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, 3)); regenerateStatus(root, '2026-08-08T01:01:00Z');
  const state = loadProject(root); const status = statusData(state); const report = reportData(state); const board = kanbanData(state);
  assert.deepEqual(nextData(state).tasks.map((item) => item.id), ['TASK-READY']);
  assert.deepEqual(blockerItems(state).map((item) => item.id), ['TASK-WAITING']);
  assert.deepEqual(status.tasks.by_disposition, { active: 2, deferred: 1, cancelled: 1 });
  assert.equal(status.schema_version, 3); assert.equal(report.schema_version, 3); assert.equal(status.success.covered, 1); assert.equal(status.success.verified, 0);
  assert.deepEqual(board.lanes.map((lane) => [lane.id, lane.tasks.map((item) => item.id)]), [
    ['planned', ['TASK-WAITING']], ['ready', ['TASK-READY']], ['active', []], ['done', []], ['deferred', ['TASK-DEFERRED']], ['cancelled', ['TASK-CANCELLED']],
  ]);
  assert.equal(state.tasks.find((item) => item.id === 'TASK-DEFERRED').scheduled_end, '2026-08-12');

  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, 2));
  assert.throws(() => loadProject(root), /unknown fields: disposition, disposition_changed_at/);
  const split = structuredClone(records); delete split[1].data.disposition_changed_at; fs.writeFileSync(path.join(root, 'TASKS.md'), collection(split, 3));
  assert.throws(() => loadProject(root), /disposition must contain both/);
});

test('disposition freezes later evidence and cancellation closes scope without proving it', () => {
  const base = temp(); const root = createProject(base, 'FROZEN', [task('TASK-A', 'A', 'A outcome.', ['Outcome is accepted.'], { status: 'planned' })]);
  const initial = loadProject(root); const model = initial.tasks[0]; const contract = buildTaskContract(initial.project, model, [], '2026-08-08T00:00:00Z');
  const attempt = path.join(root, 'handoffs', model.id, contract.contract_id); fs.mkdirSync(attempt, { recursive: true }); fs.writeFileSync(path.join(attempt, 'TASK-CONTRACT.md'), formatTaskContract(contract));
  const deferred = task('TASK-A', 'A', 'A outcome.', ['Outcome is accepted.'], { status: 'in_progress', active_contract: contract.contract_id, disposition: 'deferred', disposition_changed_at: '2026-08-08T00:01:00Z' });
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([deferred], 3)); regenerateStatus(root, '2026-08-08T00:01:00Z'); assert.doesNotThrow(() => loadProject(root));
  const approval = { kind: 'approval', ref: 'late', result: 'Late approval.', sha256: null };
  const late = formatEvidenceManifest(manifest(contract, 'verified', 1, [approval], [approval], { observed_at: '2026-08-08T00:02:00Z' }), contract);
  fs.writeFileSync(path.join(attempt, 'EVIDENCE-001.md'), late.document); deferred.data.status = 'verified'; deferred.data.last_manifest = late.manifest_id; fs.writeFileSync(path.join(root, 'TASKS.md'), collection([deferred], 3));
  assert.throws(() => loadProject(root), /evidence was observed after its deferred disposition/);

  const closed = createProject(temp(), 'CLOSED-SCOPE', [
    task('TASK-DONE', 'Done', 'Done outcome.', ['Done accepted.'], { status: 'planned', milestone: 'M-END', success_criteria: ['SC-OUTCOME'] }),
    task('TASK-CANCELLED', 'Cancelled', 'Cancelled outcome.', ['Cancelled accepted.'], { status: 'planned', milestone: 'M-END', disposition: 'cancelled', disposition_changed_at: '2026-08-08T00:00:00Z', success_criteria: ['SC-OUTCOME'] }),
  ]);
  fs.writeFileSync(path.join(closed, 'TASKS.md'), collection([
    task('TASK-DONE', 'Done', 'Done outcome.', ['Done accepted.'], { status: 'planned', milestone: 'M-END', success_criteria: ['SC-OUTCOME'] }),
    task('TASK-CANCELLED', 'Cancelled', 'Cancelled outcome.', ['Cancelled accepted.'], { status: 'planned', milestone: 'M-END', disposition: 'cancelled', disposition_changed_at: '2026-08-08T00:00:00Z', success_criteria: ['SC-OUTCOME'] }),
  ], 3));
  fs.writeFileSync(path.join(closed, 'MILESTONES.md'), collection([{ id: 'M-END', title: 'End', data: { status: 'planned' } }])); regenerateStatus(closed, '2026-08-08T00:00:01Z');
  completeHumanTask(closed, 'TASK-DONE', { ref: 'owner', result: 'Done work accepted.', observed_at: '2026-08-08T00:02:00Z' });
  fs.writeFileSync(path.join(closed, 'MILESTONES.md'), collection([{ id: 'M-END', title: 'End', data: { status: 'complete' } }]));
  fs.writeFileSync(path.join(closed, 'PROJECT.md'), fs.readFileSync(path.join(closed, 'PROJECT.md'), 'utf8').replace('status: "active"', 'status: "complete"'));
  regenerateStatus(closed, '2026-08-08T00:03:00Z'); const closedState = loadProject(closed);
  assert.equal(closedState.project.status, 'complete'); assert.deepEqual(successCounts(closedState), { total: 1, covered: 1, verified: 1 });

  const terminal = createProject(temp(), 'TERMINAL-CANCEL', [task('TASK-CANCELLED', 'Cancelled', 'Cancelled outcome.', ['Cancelled accepted.'], { disposition: 'cancelled', disposition_changed_at: '2026-08-08T00:00:00Z' })]);
  fs.writeFileSync(path.join(terminal, 'TASKS.md'), collection([task('TASK-CANCELLED', 'Cancelled', 'Cancelled outcome.', ['Cancelled accepted.'], { disposition: 'cancelled', disposition_changed_at: '2026-08-08T00:00:00Z' })], 3)); regenerateStatus(terminal, '2026-08-08T00:00:01Z');
  const terminalBefore = treeHash(terminal);
  assert.throws(() => atomicProjectMutation(terminal, (candidate, context) => {
    fs.writeFileSync(path.join(candidate, 'TASKS.md'), collection([task('TASK-CANCELLED', 'Cancelled', 'Cancelled outcome.', ['Cancelled accepted.'])]));
    regenerateStatus(candidate, '2026-08-08T00:01:00Z', context);
  }, loadProject), /Cancellation is terminal for task TASK-CANCELLED/);
  assert.equal(treeHash(terminal), terminalBefore);
});

test('Kanban projection groups exact lifecycle state and exposes truthful edit eligibility', () => {
  const base = temp();
  const root = createProject(base, 'KANBAN', [
    task('TASK-PLAN', 'Plan', 'Plan it.', ['Plan accepted.'], { status: 'planned', owner: null, success_criteria: ['SC-OUTCOME'] }),
    task('TASK-READY', 'Ready', 'Ready it.', ['Ready accepted.'], { status: 'ready', owner: 'Lee', priority: 'P1' }),
  ]);
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  const board = kanbanData(loadProject(root), 'a'.repeat(64));
  assert.equal(board.mutation_revision, 'a'.repeat(64));
  assert.deepEqual(board.lanes.map((lane) => [lane.id, lane.tasks.length]), [['planned', 1], ['ready', 1], ['active', 0], ['done', 0], ['deferred', 0], ['cancelled', 0]]);
  assert.equal(board.lanes[0].tasks[0].status, 'planned'); assert.equal(board.lanes[0].tasks[0].editable, true);
  assert.equal(board.summary.owner_gaps, 1); assert.equal(board.summary.coverage.configured, false);
});

test('v1 schedule support preserves legacy source hashes and schedule denial boundaries stay independent', () => {
  const base = temp(); const root = createProject(base, 'LEGACY-SCHEDULE', [task('TASK-PLAN', 'Plan', 'Plan it.', ['Plan accepted.'])]);
  const state = loadProject(root);
  const legacyTasks = state.tasks.map(({ scheduled_start, scheduled_end, ...item }) => item);
  const legacyHash = sha256({ project: { ...state.project, root: undefined }, tasks: legacyTasks, milestones: state.milestones.items, risks: state.risks.items, decisions: state.decisions.items, sources: state.sources.items, traceability: state.traceability, changes: state.changes.items });
  fs.writeFileSync(path.join(root, 'STATUS.md'), `${frontmatter({ schema_version: 1, project_id: state.project.id, generated_at: '2026-08-08T00:00:00Z', source_sha256: legacyHash })}\nLegacy cache.\n`);
  assert.equal(loadProject(root).status_stale, false);

  const activeProject = { project: { status: 'active' }, milestones: { items: [] } };
  assert.deepEqual(scheduleEditEligibility(activeProject, { status: 'done', milestone: null }), { editable: false, reason: 'Completed tasks cannot be rescheduled in Studio.' });
  assert.deepEqual(scheduleEditEligibility({ project: { status: 'active' }, milestones: { items: [{ id: 'M-DONE', status: 'complete' }] } }, { status: 'in_progress', milestone: 'M-DONE' }), { editable: false, reason: 'Tasks in completed milestones cannot be rescheduled in Studio.' });
  assert.deepEqual(dispositionEditEligibility({ project: { status: 'active' }, milestones: { items: [{ id: 'M-DONE', status: 'complete' }] } }, { status: 'planned', milestone: 'M-DONE', disposition: 'active' }), { editable: false, reason: 'Tasks in completed milestones cannot change disposition.' });
  assert.deepEqual(scheduleEditEligibility({ project: { status: 'complete' }, milestones: { items: [] } }, { status: 'in_progress', milestone: null }), { editable: false, reason: 'Completed projects cannot be rescheduled in Studio.' });
});

test('TASKS v2 schedules are exact while v1 and optional collections remain fail closed', () => {
  const base = temp(); const root = createProject(base, 'SCHEDULE', []);
  const scheduled = task('TASK-DATED', 'Dated', 'Dated outcome.', ['Dated accepted.'], { scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' });
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([scheduled]));
  assert.throws(() => loadProject(root), /unknown fields/);
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([scheduled], 2));
  assert.equal(loadProject(root).tasks[0].scheduled_end, '2026-08-12');
  const partial = structuredClone(scheduled); delete partial.data.scheduled_end;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([partial], 2));
  assert.throws(() => loadProject(root), /must contain both/);
  const nulled = structuredClone(scheduled); nulled.data.scheduled_start = null; nulled.data.scheduled_end = null;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([nulled], 2));
  assert.throws(() => loadProject(root), /schedule dates are invalid/);
  const reversed = structuredClone(scheduled); reversed.data.scheduled_start = '2026-08-13';
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([reversed], 2));
  assert.throws(() => loadProject(root), /must not be after/);
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([], 2));
  fs.writeFileSync(path.join(root, 'MILESTONES.md'), collection([], 2));
  assert.throws(() => loadProject(root), /Unsupported schema_version/);
});

test('Timeline projection exposes schedules and isolates date conflicts from lifecycle facts', () => {
  const base = temp(); const root = createProject(base, 'TIMELINE', [
    task('TASK-FIRST', 'First', 'First outcome.', ['First accepted.'], { status: 'ready', scheduled_start: '2026-08-10', scheduled_end: '2026-08-12', blocks: ['TASK-SECOND'] }),
    task('TASK-SECOND', 'Second', 'Second outcome.', ['Second accepted.'], { status: 'planned', scheduled_start: '2026-08-12', scheduled_end: '2026-08-14', depends_on: ['TASK-FIRST'] }),
  ], {});
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([
    task('TASK-FIRST', 'First', 'First outcome.', ['First accepted.'], { status: 'ready', scheduled_start: '2026-08-10', scheduled_end: '2026-08-12', blocks: ['TASK-SECOND'] }),
    task('TASK-SECOND', 'Second', 'Second outcome.', ['Second accepted.'], { status: 'planned', scheduled_start: '2026-08-12', scheduled_end: '2026-08-14', depends_on: ['TASK-FIRST'] }),
  ], 2));
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  const state = loadProject(root); const data = kanbanData(state); const second = data.tasks.find((item) => item.id === 'TASK-SECOND');
  assert.deepEqual(second.schedule_conflicts, [{ dependency_id: 'TASK-FIRST', dependency_end: '2026-08-12', task_start: '2026-08-12' }]);
  assert.deepEqual(second.blocked_by, []); assert.deepEqual(second.dependency_blockers, ['TASK-FIRST']);
  assert.equal(data.summary.tasks.blocked, 1); assert.deepEqual(data.next.map((item) => item.id), ['TASK-FIRST']);
  assert.equal(data.tasks.filter((item) => item.blocked_by.length || item.dependency_blockers.length).map((item) => item.id).join(','), 'TASK-SECOND');
  state.tasks.find((item) => item.id === 'TASK-SECOND').status = 'done';
  assert.deepEqual(kanbanData(state).tasks.find((item) => item.id === 'TASK-SECOND').schedule_conflicts, []);
});

test('ID bounds, trailing hyphens, and duplicate success criteria are rejected exactly', () => {
  const base = temp(); const max = 'A'.repeat(64); const root = createProject(base, max, [task('T'.repeat(64), 'Maximum', 'Maximum outcome.', ['Maximum accepted.'])]);
  assert.equal(loadProject(root).project.id.length, 64);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText(`${'A'.repeat(64)}B`)); assert.throws(() => loadProject(root), /Invalid project ID/);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText('DUPLICATE').replace('- [SC-OUTCOME] The outcome is accepted.', '- [SC-OUTCOME] First.\n- [SC-OUTCOME] Second.'));
  assert.throws(() => loadProject(root), /unique case-insensitively/);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText('DUPLICATE'));
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: 'TASK-BAD-', title: 'Bad', data: { outcome: 'Bad.', acceptance: ['Bad accepted.'] } }]));
  assert.throws(() => loadProject(root), /heading is invalid/);
});

test('every CLI requires one selector and emits exact selected identity without mutation', () => {
  const base = temp();
  const first = createProject(base, 'FIRST', []); const second = createProject(base, 'SECOND', []);
  const beforeFirst = treeHash(first); const beforeSecond = treeHash(second);
  const scripts = ['project-validate.js', 'project-status.js', 'project-next.js', 'project-blocked.js', 'project-coverage.js', 'project-report-data.js'];
  for (const script of scripts) {
    const result = run(script, [first, '--json']);
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, true); assert.equal(envelope.project.id, 'FIRST'); assert.equal(envelope.project.root, fs.realpathSync(first));
    assert.equal(Object.hasOwn(envelope, 'errors'), false);
    const expected = {
      'project-validate.js': ['schema_version', 'valid', 'warnings', 'modules', 'counts'],
      'project-status.js': ['schema_version', 'as_of_date', 'project', 'tailoring', 'tasks', 'success', 'milestones', 'coverage', 'concurrency', 'runs', 'risks', 'decisions', 'assumptions', 'issues', 'stakeholders', 'lessons', 'closure'],
      'project-next.js': ['schema_version', 'tasks'], 'project-blocked.js': ['schema_version', 'tasks'],
      'project-coverage.js': ['schema_version', 'configured'],
      'project-report-data.js': ['schema_version', 'status', 'risks', 'decisions', 'sources', 'changes', 'assumptions', 'issues', 'stakeholders', 'lessons', 'closure', 'ownership', 'blockers', 'execution', 'next', 'forecasts', 'unknowns'],
    };
    assert.deepEqual(Object.keys(envelope.data), expected[script]);
  }
  assert.equal(treeHash(first), beforeFirst); assert.equal(treeHash(second), beforeSecond);
  assert.equal(run('project-status.js', []).status, 2);
  assert.equal(run('project-status.js', [first, second]).status, 2);
  assert.equal(run('project-status.js', [first, '--wat']).status, 2);
});

test('discovery index finds multiple projects but rejects duplicate, stale, mismatched, and symlink paths', { skip: process.platform === 'win32' }, () => {
  const base = temp(); createProject(base, 'FIRST', []); createProject(base, 'SECOND', []);
  const indexPath = path.join(base, 'PROJECTS.md');
  fs.writeFileSync(indexPath, collection([
    { id: 'FIRST', title: 'First', data: { path: 'first' } },
    { id: 'SECOND', title: 'Second', data: { path: 'second' } },
  ]));
  assert.deepEqual(loadProjectIndex(indexPath).map((item) => item.id), ['FIRST', 'SECOND']);
  fs.writeFileSync(indexPath, collection([
    { id: 'FIRST', title: 'First', data: { path: 'first' } },
    { id: 'COPY', title: 'Copy', data: { path: 'first' } },
  ]));
  assert.throws(() => loadProjectIndex(indexPath), /duplicated/);
  fs.writeFileSync(indexPath, collection([{ id: 'MISSING', title: 'Missing', data: { path: 'missing' } }]));
  assert.throws(() => loadProjectIndex(indexPath));
  fs.symlinkSync(path.join(base, 'first'), path.join(base, 'linked'));
  fs.writeFileSync(indexPath, collection([{ id: 'FIRST', title: 'First', data: { path: 'linked' } }]));
  assert.throws(() => loadProjectIndex(indexPath), /symlink/);
});

test('projects-root discovery is direct, deterministic, and rejects invalid catalogs', () => {
  const base = temp(); const root = path.join(base, '.projects'); fs.mkdirSync(root);
  createProject(root, 'SECOND', []); createProject(root, 'FIRST', []); fs.writeFileSync(path.join(root, '.DS_Store'), 'ignored'); fs.mkdirSync(path.join(root, '.git'));
  assert.deepEqual(loadProjectsRoot(root).projects.map((item) => [item.id, item.child]), [['FIRST', 'first'], ['SECOND', 'second']]);
  const interrupted = path.join(root, `.project-manager-work-${'a'.repeat(24)}`); fs.mkdirSync(interrupted);
  assert.deepEqual(loadProjectsRoot(root).projects.map((item) => item.id), ['FIRST', 'SECOND']);
  fs.writeFileSync(path.join(interrupted, 'unexpected'), 'not a valid pre-marker root');
  assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_CATALOG_INVALID'); fs.unlinkSync(path.join(interrupted, 'unexpected'));
  fs.writeFileSync(path.join(interrupted, '.rpd-project-manager-work-v1'), 'wrong marker\n');
  assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_CATALOG_INVALID'); fs.rmSync(interrupted, { recursive: true });
  const marked = path.join(root, `.project-manager-work-${'b'.repeat(24)}`); fs.mkdirSync(marked); fs.writeFileSync(path.join(marked, '.rpd-project-manager-work-v1'), 'RPD Project Manager work area v1\n');
  assert.deepEqual(loadProjectsRoot(root).projects.map((item) => item.id), ['FIRST', 'SECOND']);
  if (process.platform !== 'win32') {
    const unsafe = path.join(root, `.project-manager-work-${'c'.repeat(24)}`); fs.mkdirSync(unsafe); fs.symlinkSync(path.join(unsafe, 'missing'), path.join(unsafe, '.rpd-project-manager-work-v1'));
    assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_CATALOG_INVALID'); fs.rmSync(unsafe, { recursive: true });
  }
  const uppercaseAlias = path.join(root, `.PROJECT-MANAGER-WORK-${'d'.repeat(24)}`); fs.mkdirSync(uppercaseAlias);
  assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_CATALOG_INVALID'); fs.rmSync(uppercaseAlias, { recursive: true });

  const malformed = path.join(root, 'malformed'); fs.mkdirSync(malformed); fs.writeFileSync(path.join(malformed, 'PROJECT.md'), 'bad');
  assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_CATALOG_INVALID'); fs.rmSync(malformed, { recursive: true });
  const invalidTasks = createProject(root, 'INVALID-TASKS', []); fs.writeFileSync(path.join(invalidTasks, 'TASKS.md'), 'bad');
  assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_CATALOG_INVALID');
  assert.equal(loadProjectCatalogRoot(root).projects.some((item) => item.id === 'INVALID-TASKS'), true);
  fs.rmSync(invalidTasks, { recursive: true });
  if (process.platform !== 'win32') {
    fs.symlinkSync(path.join(root, 'first'), path.join(root, 'linked'));
    assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_CATALOG_INVALID'); fs.unlinkSync(path.join(root, 'linked'));
  }

  const copy = createProject(root, 'COPY', []);
  fs.writeFileSync(path.join(copy, 'PROJECT.md'), projectText('FIRST'));
  fs.writeFileSync(path.join(copy, 'STATUS.md'), `${frontmatter({ schema_version: 1, project_id: 'FIRST', generated_at: '2026-08-08T00:00:00Z', source_sha256: '0'.repeat(64) })}\n`);
  regenerateStatus(copy, '2026-08-08T00:00:00Z');
  assert.throws(() => loadProjectsRoot(root), (error) => error.code === 'PROJECT_ID_DUPLICATE');
});

test('projects-root discovery distinguishes missing, invalid, symlinked, and empty roots', () => {
  const base = temp(); const missing = path.join(base, 'missing');
  assert.throws(() => loadProjectsRoot(missing), (error) => error.code === 'PROJECTS_ROOT_MISSING');
  const file = path.join(base, 'file'); fs.writeFileSync(file, 'not a directory');
  assert.throws(() => loadProjectsRoot(file), (error) => error.code === 'PROJECTS_ROOT_INVALID');
  const empty = path.join(base, 'empty'); fs.mkdirSync(empty);
  assert.throws(() => loadProjectsRoot(empty), (error) => error.code === 'PROJECTS_ROOT_EMPTY');
  if (process.platform !== 'win32') {
    const linked = path.join(base, 'linked'); fs.symlinkSync(empty, linked);
    assert.throws(() => loadProjectsRoot(linked), (error) => error.code === 'PROJECTS_ROOT_INVALID');
  }
});

test('project resolver accepts exact English and Chinese names but never guesses an ambiguous name', () => {
  const base = temp(); const root = path.join(base, '.projects'); fs.mkdirSync(root);
  const website = createProject(root, 'WEB-LAUNCH', [], { name: 'Website Launch' });
  const mobile = createProject(root, 'MOBILE-APP', [], { name: '移动应用' });
  assert.equal(resolveProjectInRoot(root, 'website launch').project.root, fs.realpathSync(website));
  assert.equal(resolveProjectInRoot(root, 'MOBILE-APP').project.root, fs.realpathSync(mobile));
  assert.equal(resolveProjectInRoot(root, 'mobile-app').project.root, fs.realpathSync(mobile));
  assert.equal(resolveProjectInRoot(root, '移动应用').project.id, 'MOBILE-APP');
  assert.throws(() => resolveProjectInRoot(root, 'Missing Project'), (error) => error.code === 'PROJECT_NAME_NOT_FOUND');

  createProject(root, 'WEB-COPY', [], { name: 'Website Launch' });
  assert.throws(() => resolveProjectInRoot(root, 'Website Launch'), (error) => error.code === 'PROJECT_NAME_AMBIGUOUS');
});

test('project-resolve CLI returns the selected root and uses stable ambiguity errors', () => {
  const base = temp(); const root = path.join(base, '.projects'); fs.mkdirSync(root);
  const selected = createProject(root, 'WEBSITE', [], { name: 'Website Launch' });
  let result = run('project-resolve.js', [root, 'Website Launch', '--json']);
  assert.equal(result.status, 0, result.stderr);
  let envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, true); assert.equal(envelope.project.id, 'WEBSITE'); assert.equal(envelope.project.root, fs.realpathSync(selected));
  assert.deepEqual(envelope.data, { projects_root: fs.realpathSync(root), selector: 'Website Launch' });

  result = run('project-resolve.js', [root, 'Unknown', '--json']);
  assert.equal(result.status, 1); envelope = JSON.parse(result.stderr); assert.equal(envelope.errors[0].code, 'PROJECT_NAME_NOT_FOUND');
  createProject(root, 'WEBSITE-COPY', [], { name: 'Website Launch' });
  result = run('project-resolve.js', [root, 'Website Launch', '--json']);
  assert.equal(result.status, 1); envelope = JSON.parse(result.stderr); assert.equal(envelope.errors[0].code, 'PROJECT_NAME_AMBIGUOUS');
  assert.equal(run('project-resolve.js', [root]).status, 2);
});

test('next work filters blockers and ranks critical, unlocks, priority, milestone, then ID', () => {
  const base = temp();
  const records = [
    task('TASK-A', 'Critical', 'A.', ['A accepted.'], { status: 'ready', critical: true, blocks: ['TASK-D'] }),
    task('TASK-B', 'Blocked', 'B.', ['B accepted.'], { priority: 'P0', blocked_by: ['Waiting for venue'] }),
    task('TASK-C', 'Priority', 'C.', ['C accepted.'], { status: 'ready', priority: 'P0' }),
    task('TASK-D', 'Dependent', 'D.', ['D accepted.'], { depends_on: ['TASK-A'] }),
  ];
  const root = createProject(base, 'ORDERING', records);
  const state = loadProject(root);
  assert.deepEqual(nextData(state).tasks.map((item) => item.id), ['TASK-A', 'TASK-C']);
  assert.deepEqual(blockerItems(state), [
    { id: 'TASK-B', title: 'Blocked', dependency_tasks: [], waiting_on: ['Waiting for venue'] },
    { id: 'TASK-D', title: 'Dependent', dependency_tasks: ['TASK-A'], waiting_on: [] },
  ]);
});

test('dependency cycles, stale reverse links, and lifecycle pointer lies fail semantically', () => {
  const base = temp();
  const stale = createProject(base, 'STALE', [
    task('TASK-A', 'A', 'A.', ['A accepted.']),
    task('TASK-B', 'B', 'B.', ['B accepted.'], { depends_on: ['TASK-A'] }),
  ]);
  assert.throws(() => loadProject(stale), /blocks is stale/);
  const cycle = createProject(base, 'CYCLE', [
    task('TASK-A', 'A', 'A.', ['A accepted.'], { depends_on: ['TASK-B'], blocks: ['TASK-B'] }),
    task('TASK-B', 'B', 'B.', ['B accepted.'], { depends_on: ['TASK-A'], blocks: ['TASK-A'] }),
  ]);
  assert.throws(() => loadProject(cycle), /Dependency cycle/);
  const lie = createProject(base, 'LIE', [task('TASK-A', 'A', 'A.', ['A accepted.'], { status: 'done' })]);
  const tolerant = loadProject(lie, { taskErrorsAsWarnings: true });
  assert.equal(tolerant.warnings[0].cause_code, 'TASK_LIFECYCLE');
  const tolerantBoard = kanbanData(tolerant);
  assert.equal(tolerantBoard.tasks[0].execution_issue, true);
  assert.equal(tolerantBoard.summary.tasks.blocked, 0);
  assert.throws(() => loadProject(lie), /lifecycle pointers/);
});

test('traceability is exact, ordered, duplicate-safe, and reports verified coverage', () => {
  const base = temp();
  const root = createProject(base, 'CONTROLLED', [task('TASK-A', 'A', 'A.', ['A accepted.'], { sources: ['SRC-ONE'], success_criteria: ['SC-OUTCOME'] })], { profile: 'controlled' });
  fs.writeFileSync(path.join(root, 'SOURCES.md'), collection([{ id: 'SRC-ONE', title: 'Source', data: { kind: 'document', location: 'brief.md', role: 'scope', status: 'current', version: 'v1', sha256: null } }]));
  fs.writeFileSync(path.join(root, 'TRACEABILITY.md'), frontmatter({ schema_version: 1, items: [{ source_id: 'SRC-ONE', criterion: 'Requirement A', tasks: ['TASK-A'] }] }));
  const coverage = coverageData(loadProject(root));
  assert.equal(coverage.configured, true); assert.equal(coverage.criteria.total, 1); assert.equal(coverage.criteria.covered, 1); assert.equal(coverage.criteria.verified, 0);
  fs.writeFileSync(path.join(root, 'TRACEABILITY.md'), frontmatter({ schema_version: 1, items: [
    { source_id: 'SRC-ONE', criterion: 'Requirement A', tasks: ['TASK-A'] },
    { source_id: 'SRC-ONE', criterion: 'Requirement A', tasks: ['TASK-A'] },
  ] }));
  assert.throws(() => loadProject(root), /unique and ordered/);
});

test('optional risks, decisions, milestones, changes, and forecasts normalize into one report truth', () => {
  const base = temp();
  const root = createProject(base, 'REPORTING', [], { current_milestone: 'M-ONE', target_date: '2026-08-07' });
  fs.writeFileSync(path.join(root, 'MILESTONES.md'), collection([{ id: 'M-ONE', title: 'One', data: { status: 'active', target_date: '2026-08-07', forecast_date: '2026-08-10', forecast_updated: '2026-08-08', forecast_evidence: [{ kind: 'note', ref: 'forecast', result: 'Vendor date confirmed', sha256: null }], critical: true } }]));
  fs.writeFileSync(path.join(root, 'RISKS.md'), collection([{ id: 'RISK-ONE', title: 'Delay', data: { status: 'open', probability: 'high', impact: 'medium', mitigation: 'Use backup', owner: null, milestone: 'M-ONE' } }]));
  fs.writeFileSync(path.join(root, 'DECISIONS.md'), collection([{ id: 'DEC-ONE', title: 'Choose', data: { status: 'proposed', decision: 'Choose vendor', owner: null, due_date: null, date: null, affects: ['milestone:M-ONE'] } }]));
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-ONE', title: 'Change', data: { date: '2026-08-08', observed_at: '2026-08-08T00:00:00Z', sources: [], affected_tasks: [], affected_milestones: ['M-ONE'], reverify_tasks: [], risk_summary: 'May delay launch' } }]));
  const state = loadProject(root); const status = statusData(state, '2026-08-08'); const report = reportData(state);
  assert.equal(status.milestones.items[0].overdue, true); assert.equal(status.risks.high, 1); assert.equal(status.decisions.proposed, 1);
  assert.equal(report.forecasts[0].date, '2026-08-10'); assert.equal(report.changes.items[0].id, 'CHG-ONE');
});

test('change ordering treats equivalent timestamp precisions as the same instant', () => {
  const base = temp(); const root = createProject(base, 'CHANGE-TIME', [task('TASK-WORK', 'Work', 'Produce the outcome.', ['Outcome is accepted.'])]);
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([
    { id: 'CHG-FIRST', title: 'First', data: { date: '2026-08-08', observed_at: '2026-08-08T00:00:00Z', sources: [], affected_tasks: ['TASK-WORK'], affected_milestones: [], reverify_tasks: ['TASK-WORK'], risk_summary: 'First change' } },
    { id: 'CHG-SAME', title: 'Same instant', data: { date: '2026-08-08', observed_at: '2026-08-08T00:00:00.000Z', sources: [], affected_tasks: ['TASK-WORK'], affected_milestones: [], reverify_tasks: ['TASK-WORK'], risk_summary: 'Ambiguous change' } },
  ]));
  assert.throws(() => loadProject(root), /ambiguous same-timestamp changes/);
});

test('provider root structure fails on read while physical availability warns until execution', () => {
  const base = temp(); const executionRoot = temp(); const projectRoot = createProject(base, 'PROVIDERS', [
    task('TASK-HUMAN', 'Human', 'Human outcome.', ['Human accepted.']),
    task('TASK-RPD', 'RPD', 'RPD outcome.', ['RPD accepted.'], { executor: { provider: 'rpd', root: executionRoot } }),
    task('TASK-AGENT', 'Agent', 'Agent outcome.', ['Agent accepted.'], { executor: { provider: 'agent', root: null } }),
    task('TASK-EXTERNAL', 'External', 'External outcome.', ['External accepted.'], { executor: { provider: 'external', root: executionRoot } }),
  ], { adapters: ['human', 'rpd', 'agent', 'external'] });
  assert.deepEqual(loadProject(projectRoot).tasks.map((item) => item.executor.provider), ['human', 'rpd', 'agent', 'external']);
  const invalid = [task('TASK-HUMAN', 'Human', 'Human outcome.', ['Human accepted.'], { executor: { provider: 'human', root: executionRoot } })];
  fs.writeFileSync(path.join(projectRoot, 'TASKS.md'), collection(invalid)); assert.throws(() => loadProject(projectRoot), /Human task/);
  const rootFile = path.join(base, 'executor.txt'); fs.writeFileSync(rootFile, 'not a directory');
  fs.writeFileSync(path.join(projectRoot, 'TASKS.md'), collection([task('TASK-RPD', 'RPD', 'RPD outcome.', ['RPD accepted.'], { executor: { provider: 'rpd', root: rootFile } })]));
  assert.equal(loadProject(projectRoot).warnings[0].code, 'TASK_EXECUTOR_ROOT_UNAVAILABLE');
  assert.throws(() => buildTaskContract({ id: 'PROVIDERS', root: fs.realpathSync(projectRoot) }, normalizedTask('rpd', rootFile), [], '2026-08-08T00:00:00Z'), /real directory/);
  if (process.platform !== 'win32') {
    const linkedRoot = path.join(base, 'linked-executor'); fs.symlinkSync(executionRoot, linkedRoot);
    fs.writeFileSync(path.join(projectRoot, 'TASKS.md'), collection([task('TASK-AGENT', 'Agent', 'Agent outcome.', ['Agent accepted.'], { executor: { provider: 'agent', root: linkedRoot } })]));
    assert.equal(loadProject(projectRoot).warnings[0].code, 'TASK_EXECUTOR_ROOT_UNAVAILABLE');
  }
});

test('project-scoped executor roots survive moving an inactive project and resolve at issuance', () => {
  const base = temp(); const root = createProject(base, 'PORTABLE', [task('TASK-RPD', 'RPD', 'RPD outcome.', ['RPD accepted.'], { executor: { provider: 'rpd', root: 'executor', scope: 'project' } })], { adapters: ['human', 'rpd'] });
  fs.mkdirSync(path.join(root, 'executor')); assert.equal(loadProject(root).tasks[0].executor.root, 'executor');
  const moved = path.join(base, 'portable-moved'); fs.renameSync(root, moved); const state = loadProject(moved); assert.equal(state.tasks[0].executor.scope, 'project');
  const contract = buildTaskContract(state.project, state.tasks[0], [], '2026-08-08T00:00:00Z');
  assert.equal(contract.payload.task.executor.root, path.join(fs.realpathSync(moved), 'executor'));
  assert.equal(contract.payload.task.executor.declared_root, 'executor');
  if (process.platform !== 'win32') {
    const outside = temp(); fs.mkdirSync(path.join(outside, 'exec')); fs.symlinkSync(outside, path.join(moved, 'linked'));
    fs.writeFileSync(path.join(moved, 'TASKS.md'), collection([task('TASK-RPD', 'RPD', 'RPD outcome.', ['RPD accepted.'], { executor: { provider: 'rpd', root: 'linked/exec', scope: 'project' } })]));
    assert.equal(loadProject(moved).warnings[0].code, 'TASK_EXECUTOR_ROOT_UNAVAILABLE');
    const escaped = normalizedTask('rpd', 'linked/exec'); escaped.executor.scope = 'project'; escaped.spec_sha256 = taskSpecHash(escaped);
    assert.throws(() => buildTaskContract(state.project, escaped, [], '2026-08-08T00:00:00Z'), /prefixes must be existing real directories/);
  }
});

test('completed project-scoped attempts survive moving the project without weakening active-root checks', () => {
  const base = temp(); const root = createProject(base, 'PORTABLE-DONE', [task('TASK-WORK', 'Work', 'Produce the outcome.', ['Outcome is accepted.'], {
    status: 'ready', success_criteria: ['SC-OUTCOME'], executor: { provider: 'agent', root: 'executor', scope: 'project' },
  })], { adapters: ['human', 'agent'] });
  fs.mkdirSync(path.join(root, 'executor'));
  const state = loadProject(root); const model = state.tasks[0];
  const contract = buildTaskContract(state.project, model, [], '2026-08-08T00:00:00Z');
  const attemptRoot = path.join(root, 'handoffs', model.id, contract.contract_id); fs.mkdirSync(attemptRoot, { recursive: true });
  fs.writeFileSync(path.join(attemptRoot, 'TASK-CONTRACT.md'), formatTaskContract(contract));
  const artifact = evidence('artifact'); const review = evidence('review');
  const formatted = formatEvidenceManifest(manifest(contract, 'verified', 1, [artifact, review], [review]), contract);
  fs.writeFileSync(path.join(attemptRoot, 'EVIDENCE-001.md'), formatted.document);
  const raw = { outcome: model.outcome, acceptance: model.acceptance, status: 'done', executor: model.executor, constraints: model.constraints, success_criteria: model.success_criteria, evidence_requirements: model.evidence_requirements, active_contract: contract.contract_id, last_manifest: formatted.manifest_id };
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.equal(loadProject(root).tasks[0].status, 'done');
  const moved = path.join(base, 'portable-done-moved'); fs.renameSync(root, moved);
  assert.equal(loadProject(moved).tasks[0].status, 'done');
});

test('optional module namespaces and cross-references fail closed', () => {
  const base = temp(); const root = createProject(base, 'REFERENCES', []);
  fs.writeFileSync(path.join(root, 'RISKS.md'), collection([{ id: 'RISK-ONE', title: 'Risk', data: { status: 'open', probability: 'low', impact: 'high', mitigation: 'Act', owner: null, milestone: 'M-MISSING' } }]));
  assert.throws(() => loadProject(root), /unknown milestone/);
  fs.unlinkSync(path.join(root, 'RISKS.md'));
  fs.writeFileSync(path.join(root, 'DECISIONS.md'), collection([{ id: 'DEC-ONE', title: 'Decision', data: { status: 'proposed', decision: 'Decide', owner: null, due_date: null, date: null, affects: ['task:TASK-MISSING'] } }]));
  assert.throws(() => loadProject(root), /unknown reference/);
  fs.unlinkSync(path.join(root, 'DECISIONS.md'));
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText('REFERENCES', { current_milestone: 'M-ONE' }));
  fs.writeFileSync(path.join(root, 'MILESTONES.md'), collection([{ id: 'M-ONE', title: 'One', data: { status: 'planned' } }]));
  assert.throws(() => loadProject(root), /must be null/);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText('REFERENCES'));
  fs.writeFileSync(path.join(root, 'MILESTONES.md'), collection([{ id: 'M-ONE', title: 'One', data: { status: 'planned', forecast_evidence: {} } }]));
  const cli = run('project-validate.js', [root, '--json']); assert.equal(cli.status, 1); assert.equal(JSON.parse(cli.stderr).errors[0].code, 'MILESTONE_EVIDENCE');
});

test('stable report arrays ignore authoring order and missing forecasts remain explicit unknowns', () => {
  const base = temp(); const root = createProject(base, 'STABLE', [
    task('TASK-ZED', 'Zed', 'Zed outcome.', ['Zed accepted.'], { owner: 'Zoe' }),
    task('TASK-ALPHA', 'Alpha', 'Alpha outcome.', ['Alpha accepted.']),
  ]);
  fs.writeFileSync(path.join(root, 'RISKS.md'), collection([
    { id: 'RISK-ZED', title: 'Zed', data: { status: 'open', probability: 'low', impact: 'low', mitigation: 'Z', owner: null, milestone: null } },
    { id: 'RISK-ALPHA', title: 'Alpha', data: { status: 'open', probability: 'low', impact: 'low', mitigation: 'A', owner: null, milestone: null } },
  ]));
  fs.writeFileSync(path.join(root, 'MILESTONES.md'), collection([{ id: 'M-ONE', title: 'One', data: { status: 'planned' } }]));
  const report = reportData(loadProject(root));
  assert.deepEqual(report.risks.items.map((item) => item.id), ['RISK-ALPHA', 'RISK-ZED']);
  assert.deepEqual(report.ownership, [{ task_id: 'TASK-ALPHA', owner: null }, { task_id: 'TASK-ZED', owner: 'Zoe' }]);
  assert.equal(report.unknowns.some((item) => item.field === 'milestones.M-ONE.forecast_date'), true);
});

test('descendant symlinked state is rejected before outside content is read', { skip: process.platform === 'win32' }, () => {
  const base = temp(); const root = createProject(base, 'SAFE', []); const outside = path.join(base, 'outside.md');
  fs.writeFileSync(outside, collection([])); fs.unlinkSync(path.join(root, 'TASKS.md')); fs.symlinkSync(outside, path.join(root, 'TASKS.md'));
  assert.throws(() => loadProject(root), /cannot be symlinks/);
});

test('symlinked ancestors of known directories are rejected', { skip: process.platform === 'win32' }, () => {
  const base = temp(); const root = createProject(base, 'ANCESTOR', []); const outside = path.join(base, 'outside');
  fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(root, 'reports'));
  assert.throws(() => loadProject(root), /real directories/);
});

function normalizedTask(provider, root = null) {
  const taskValue = {
    id: 'TASK-WORK', title: 'Work', outcome: 'Produce the outcome.', constraints: ['Stay in scope'], acceptance: ['Outcome is accepted.'],
    success_criteria: ['SC-OUTCOME'], milestone: null, executor: { provider, root, scope: root === null ? null : 'absolute' }, depends_on: [], sources: [],
    evidence_requirements: JSON.parse(JSON.stringify(DEFAULT_EVIDENCE[provider])), critical: false,
  };
  taskValue.spec_sha256 = taskSpecHash(taskValue); return taskValue;
}

function evidence(kind, ref = 'ref') {
  return { kind, ref, result: `${kind} passed`, sha256: ['file', 'artifact'].includes(kind) ? sha256(`${kind}:${ref}`) : null };
}

function manifest(contract, status, sequence, records, acceptanceRecords, extra = {}) {
  return {
    schema_version: 1, sequence, contract_id: contract.contract_id,
    project: { id: contract.payload.project.id }, task: { id: contract.payload.task.id, spec_sha256: contract.payload.task.spec_sha256 },
    status, blocker: status === 'blocked' ? 'Waiting for approval' : null, evidence: records,
    acceptance_evidence: { 'Outcome is accepted.': acceptanceRecords }, sources: [], observed_at: `2026-08-08T00:00:0${sequence}Z`, notes: [], ...extra,
  };
}

test('Task Contract carries complete work and hashes the portable task specification', () => {
  const human = normalizedTask('human');
  const contract = buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, human, [], '2026-08-08T00:00:00Z');
  assert.match(contract.contract_id, /^tc-[a-f0-9]{64}$/);
  assert.equal(contract.payload.task.outcome, human.outcome);
  assert.deepEqual(contract.payload.task.constraints, human.constraints);
  assert.deepEqual(contract.payload.task.evidence_requirements, DEFAULT_EVIDENCE.human);
  assert.equal(contract.payload.task.spec_sha256, taskSpecHash(human));
  const tampered = structuredClone(contract); tampered.payload.task.outcome = 'Changed after hashing';
  tampered.payload_sha256 = sha256(tampered.payload); tampered.contract_id = `tc-${tampered.payload_sha256}`;
  assert.throws(() => validateTaskContract(tampered), /specification hash mismatch/);
  const badId = structuredClone(contract); badId.payload.task.success_criteria = ['NOT-SUCCESS'];
  badId.payload_sha256 = sha256(badId.payload); badId.contract_id = `tc-${badId.payload_sha256}`;
  assert.throws(() => validateTaskContract(badId), /success criterion ID/);
  if (process.platform !== 'win32') {
    const real = contractRoot(); const linked = `${real}-link`; fs.symlinkSync(real, linked);
    assert.throws(() => buildTaskContract({ id: 'PROJECT-X', root: linked }, human, [], '2026-08-08T00:00:00Z'), /canonical real directory/);
  }
});

test('all provider defaults use valid deterministic staged any-of requirements', () => {
  for (const provider of ['human', 'rpd', 'agent', 'external']) assert.doesNotThrow(() => validateEvidenceRequirements(DEFAULT_EVIDENCE[provider]));
  assert.deepEqual(DEFAULT_EVIDENCE.external[0].any_of, ['approval', 'artifact']);
  assert.deepEqual(DEFAULT_EVIDENCE.rpd.map((item) => item.stage), ['implemented', 'verification', 'verified']);
  const root = temp();
  for (const provider of ['agent', 'external']) {
    const contract = buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, normalizedTask(provider, root), [], '2026-08-08T00:00:00Z');
    const records = provider === 'agent' ? [evidence('artifact'), evidence('review')] : [evidence('approval')];
    assert.doesNotThrow(() => validateManifest(manifest(contract, 'verified', 1, records, [records[0]]), contract));
  }
});

function createAgentProject(id = 'AGENT-EXECUTION', extra = {}) {
  const record = task('TASK-WORK', 'Work', 'Produce the outcome.', ['Outcome is accepted.'], {
    status: 'ready', success_criteria: ['SC-OUTCOME'], executor: { provider: 'agent', root: null },
    ...extra,
  });
  const root = createProject(temp(), id, [record], { adapters: ['human', 'agent'] });
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  return root;
}

function storedContract(contractPath) {
  const parsed = parseAttempt(fs.readFileSync(contractPath, 'utf8'), contractPath, 'contract');
  return { payload: parsed.payload, payload_sha256: parsed.envelope.payload_sha256, contract_id: parsed.envelope.contract_id };
}

function rewriteProjectStatus(root, status) {
  const target = path.join(root, 'PROJECT.md');
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(/^status: .+$/m, `status: ${JSON.stringify(status)}`));
}

function rewriteTaskRaw(root, taskId, mutate, schemaVersion = null) {
  const target = path.join(root, 'TASKS.md'); const text = fs.readFileSync(target, 'utf8');
  const record = parseTaskRecords(text).find((item) => item.id === taskId);
  assert.ok(record, `fixture task ${taskId} exists`); mutate(record.raw);
  let output = `${text.slice(0, record.start)}${renderRecord(record)}${text.slice(record.end)}`;
  if (schemaVersion !== null) output = output.replace(/^schema_version: \d+$/m, `schema_version: ${schemaVersion}`);
  fs.writeFileSync(target, output);
}

function assertNoMutation(root, operation, expected) {
  const before = treeHash(root);
  assert.throws(operation, expected);
  assert.equal(treeHash(root), before);
}

function activeAgentFixture(id, extra = {}) {
  const root = createAgentProject(id, extra);
  const started = startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' });
  return { root, started, contract: storedContract(started.data.contract_path) };
}

function blockedAgentFixture(id, blocker = 'Worker unavailable', { change = false } = {}) {
  const root = createAgentProject(id);
  if (change) {
    fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Reverify', data: {
      date: '2026-08-08', observed_at: '2026-08-08T00:00:00Z', sources: [], affected_tasks: ['TASK-WORK'],
      affected_milestones: [], reverify_tasks: ['TASK-WORK'], reverification: { 'TASK-WORK': { status: 'pending', contract_id: null, manifest_id: null } }, risk_summary: 'Changed input.',
    } }]));
    regenerateStatus(root, '2026-08-08T00:00:00.500Z');
  }
  const started = startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' });
  const contract = storedContract(started.data.contract_path);
  ingestAgentManifest(root, 'TASK-WORK', manifest(contract, 'blocked', 1, [], [], { blocker, observed_at: '2026-08-08T00:00:02Z' }));
  return { root, started, contract };
}

function activeHumanFixture(id) {
  const root = createProject(temp(), id, [], { adapters: ['human', 'agent'] });
  const model = normalizedTask('human'); model.success_criteria = ['SC-OUTCOME']; model.spec_sha256 = taskSpecHash(model);
  const contract = buildTaskContract({ id, root: fs.realpathSync(root) }, model, [], '2026-08-08T00:00:01Z');
  const attemptRoot = path.join(root, 'handoffs', model.id, contract.contract_id); fs.mkdirSync(attemptRoot, { recursive: true });
  fs.writeFileSync(path.join(attemptRoot, 'TASK-CONTRACT.md'), formatTaskContract(contract));
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: {
    outcome: model.outcome, acceptance: model.acceptance, constraints: model.constraints, success_criteria: model.success_criteria,
    executor: model.executor, evidence_requirements: model.evidence_requirements, status: 'in_progress', active_contract: contract.contract_id,
  } }]));
  regenerateStatus(root, '2026-08-08T00:00:01Z');
  return { root, contract };
}

function progressedAgentFixture(id, target) {
  const item = activeAgentFixture(id); const artifact = evidence('artifact');
  if (target === 'implemented') {
    ingestAgentManifest(item.root, 'TASK-WORK', manifest(item.contract, 'implemented', 1, [artifact], [], { observed_at: '2026-08-08T00:00:02Z' }));
  } else if (target === 'verification') {
    ingestAgentManifest(item.root, 'TASK-WORK', manifest(item.contract, 'implemented', 1, [artifact], [], { observed_at: '2026-08-08T00:00:02Z' }));
    const note = evidence('note');
    ingestAgentManifest(item.root, 'TASK-WORK', manifest(item.contract, 'verification', 2, [artifact, note], [], { observed_at: '2026-08-08T00:00:03Z' }));
  } else {
    const review = evidence('review');
    if (target === 'verified') {
      rewriteTaskRaw(item.root, 'TASK-WORK', (raw) => { raw.blocked_by = ['Release gate']; }); regenerateStatus(item.root, '2026-08-08T00:00:01.500Z');
    }
    ingestAgentManifest(item.root, 'TASK-WORK', manifest(item.contract, 'verified', 1, [artifact, review], [review], { observed_at: '2026-08-08T00:00:02Z' }));
  }
  assert.equal(loadProject(item.root).tasks[0].status, target);
  return item;
}

test('agent execution starts one immutable attempt and ingests staged evidence through done', () => {
  const root = createAgentProject();
  const started = startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' });
  assert.deepEqual(started.project, { id: 'AGENT-EXECUTION', root: fs.realpathSync(root) });
  assert.equal(started.data.status, 'in_progress'); assert.equal(started.data.retry, false);
  assert.equal(path.isAbsolute(started.data.contract_path), true); assert.equal(fs.existsSync(started.data.contract_path), true);
  assert.equal(fs.existsSync(path.join(root, '.pm-agent-exec.js')), false);
  let state = loadProject(root); assert.equal(state.tasks[0].active_contract, started.data.contract_id); assert.equal(state.tasks[0].last_manifest, null); assert.equal(state.status_stale, false);
  const contract = storedContract(started.data.contract_path); const artifact = evidence('artifact'); const review = evidence('review');
  const implemented = manifest(contract, 'implemented', 1, [artifact], [], { observed_at: '2026-08-08T00:00:02Z' });
  const first = ingestAgentManifest(root, 'TASK-WORK', implemented);
  assert.equal(first.data.status, 'implemented'); assert.equal(first.data.sequence, 1); assert.equal(fs.existsSync(first.data.manifest_path), true);
  const verified = manifest(contract, 'verified', 2, [artifact, review], [review], { observed_at: '2026-08-08T00:00:03Z' });
  const second = ingestAgentManifest(root, 'TASK-WORK', verified);
  assert.equal(second.data.status, 'done'); assert.equal(second.data.sequence, 2);
  state = loadProject(root); assert.equal(state.tasks[0].status, 'done'); assert.equal(state.tasks[0].last_manifest, second.data.manifest_id); assert.equal(state.status_stale, false);
});

test('blocked agent ingestion preserves blockers and exact retry preserves the old attempt', () => {
  const root = createAgentProject('AGENT-RETRY');
  fs.writeFileSync(path.join(root, 'CHANGES.md'), `${collection([
    { id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: '2026-08-08T00:00:00Z', sources: [], affected_tasks: ['TASK-WORK'], affected_milestones: [], reverify_tasks: ['TASK-WORK'], reverification: { 'TASK-WORK': { status: 'pending', contract_id: null, manifest_id: null } }, risk_summary: 'The source changed.' } },
    { id: 'CHG-OTHER', title: 'Other', data: { date: '2026-08-07', observed_at: '2026-08-07T00:00:00Z', sources: [], affected_tasks: [], affected_milestones: [], reverify_tasks: [], reverification: {}, risk_summary: 'Unrelated.' } },
  ])}\nSelected narrative stays exact.\n`);
  regenerateStatus(root, '2026-08-08T00:00:00.500Z');
  const unrelatedBefore = fs.readFileSync(path.join(root, 'CHANGES.md'), 'utf8').slice(fs.readFileSync(path.join(root, 'CHANGES.md'), 'utf8').indexOf('## CHG-OTHER'));
  const first = startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' });
  let changes = loadProject(root).changes.items.find((item) => item.id === 'CHG-REVERIFY');
  assert.deepEqual(changes.reverification['TASK-WORK'], { status: 'in_progress', contract_id: first.data.contract_id, manifest_id: null });
  const firstContract = storedContract(first.data.contract_path);
  const tasksPath = path.join(root, 'TASKS.md'); let tasksText = fs.readFileSync(tasksPath, 'utf8'); let taskRecords = parseTaskRecords(tasksText);
  taskRecords[0].raw.blocked_by = ['Coordinate release', 'Runtime could not spawn worker'];
  fs.writeFileSync(tasksPath, `${tasksText.slice(0, taskRecords[0].start)}${renderRecord(taskRecords[0])}${tasksText.slice(taskRecords[0].end)}`);
  regenerateStatus(root, '2026-08-08T00:00:01.500Z');
  const blocked = manifest(firstContract, 'blocked', 1, [], [], { blocker: 'Runtime could not spawn worker', observed_at: '2026-08-08T00:00:02Z' });
  ingestAgentManifest(root, 'TASK-WORK', blocked);
  let state = loadProject(root); assert.deepEqual(state.tasks[0].blocked_by, ['Coordinate release', 'Runtime could not spawn worker']); assert.equal(state.tasks[0].status, 'in_progress');
  const oldAttempt = path.dirname(first.data.contract_path); const oldHash = treeHash(oldAttempt);
  assert.throws(() => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:03Z', retry_blocker: 'different' }), (error) => error.code === 'RETRY_BLOCKER_MISMATCH');
  assert.throws(() => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:03Z', retry_blocker: 'Runtime could not spawn worker' }), (error) => error.code === 'TASK_BLOCKED');
  tasksText = fs.readFileSync(tasksPath, 'utf8'); taskRecords = parseTaskRecords(tasksText); taskRecords[0].raw.blocked_by = ['Runtime could not spawn worker'];
  fs.writeFileSync(tasksPath, `${tasksText.slice(0, taskRecords[0].start)}${renderRecord(taskRecords[0])}${tasksText.slice(taskRecords[0].end)}`);
  regenerateStatus(root, '2026-08-08T00:00:02.500Z');
  const retry = startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:03Z', retry_blocker: 'Runtime could not spawn worker' });
  assert.equal(retry.data.retry, true); assert.notEqual(retry.data.contract_id, first.data.contract_id); assert.equal(treeHash(oldAttempt), oldHash);
  state = loadProject(root); assert.equal(state.tasks[0].last_manifest, null); assert.deepEqual(state.tasks[0].blocked_by, []);
  changes = state.changes.items.find((item) => item.id === 'CHG-REVERIFY');
  assert.deepEqual(changes.reverification['TASK-WORK'], { status: 'in_progress', contract_id: retry.data.contract_id, manifest_id: null });
  const retryContract = storedContract(retry.data.contract_path); const artifact = evidence('artifact'); const review = evidence('review');
  const completed = ingestAgentManifest(root, 'TASK-WORK', manifest(retryContract, 'verified', 1, [artifact, review], [review], { observed_at: '2026-08-08T00:00:04Z' }));
  assert.equal(completed.data.status, 'done');
  changes = loadProject(root).changes.items.find((item) => item.id === 'CHG-REVERIFY');
  assert.deepEqual(changes.reverification['TASK-WORK'], { status: 'complete', contract_id: retry.data.contract_id, manifest_id: completed.data.manifest_id });
  const changesText = fs.readFileSync(path.join(root, 'CHANGES.md'), 'utf8');
  assert.equal(changesText.slice(changesText.indexOf('## CHG-OTHER')), unrelatedBefore); assert.match(changesText, /Selected narrative stays exact\./);
});

test('agent ingestion keeps verified work short of done when a blocker appears', () => {
  const root = createAgentProject('AGENT-HELD'); const started = startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' });
  const tasksPath = path.join(root, 'TASKS.md'); const text = fs.readFileSync(tasksPath, 'utf8');
  const records = parseTaskRecords(text); records[0].raw.blocked_by = ['Coordinate release'];
  fs.writeFileSync(tasksPath, `${text.slice(0, records[0].start)}${renderRecord(records[0])}${text.slice(records[0].end)}`);
  regenerateStatus(root, '2026-08-08T00:00:01.500Z');
  const contract = storedContract(started.data.contract_path); const artifact = evidence('artifact'); const review = evidence('review');
  const result = ingestAgentManifest(root, 'TASK-WORK', manifest(contract, 'verified', 1, [artifact, review], [review], { observed_at: '2026-08-08T00:00:02Z' }));
  assert.equal(result.data.status, 'verified'); assert.deepEqual(loadProject(root).tasks[0].blocked_by, ['Coordinate release']);
});

test('agent ingestion keeps verified work short of done when a dependency regresses', () => {
  const root = createProject(temp(), 'AGENT-DEPENDENCY', [
    task('TASK-GATE', 'Gate', 'Approve the gate.', ['The gate is approved.'], { status: 'planned', blocks: ['TASK-WORK'] }),
    task('TASK-WORK', 'Work', 'Produce the outcome.', ['Outcome is accepted.'], { status: 'planned', depends_on: ['TASK-GATE'], success_criteria: ['SC-OUTCOME'], executor: { provider: 'agent', root: null } }),
  ], { adapters: ['human', 'agent'] });
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  completeHumanTask(root, 'TASK-GATE', { ref: 'gate-owner', result: 'Gate approved.', observed_at: '2026-08-08T00:00:01Z' });
  rewriteTaskRaw(root, 'TASK-WORK', (raw) => { raw.status = 'ready'; raw.updated = '2026-08-08'; }); regenerateStatus(root, '2026-08-08T00:00:02Z');
  const started = startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:03Z' }); const contract = storedContract(started.data.contract_path);
  rewriteTaskRaw(root, 'TASK-GATE', (raw) => { raw.status = 'planned'; delete raw.active_contract; delete raw.last_manifest; }); regenerateStatus(root, '2026-08-08T00:00:04Z');
  const artifact = evidence('artifact'); const review = evidence('review');
  const result = ingestAgentManifest(root, 'TASK-WORK', manifest(contract, 'verified', 1, [artifact, review], [review], { observed_at: '2026-08-08T00:00:05Z' }));
  assert.equal(result.data.status, 'verified'); assert.equal(loadProject(root).tasks.find((item) => item.id === 'TASK-GATE').status, 'planned');
});

test('agent start rejection matrix preserves exact project bytes', () => {
  const cases = [
    ['inactive project', () => { const root = createAgentProject('START-INACTIVE'); rewriteProjectStatus(root, 'on_hold'); regenerateStatus(root, '2026-08-08T00:00:00Z'); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), code: 'PROJECT_NOT_ACTIVE' }; }],
    ['wrong provider', () => { const root = createProject(temp(), 'START-PROVIDER', [task('TASK-WORK', 'Work', 'Done.', ['Accepted.'], { status: 'ready' })]); regenerateStatus(root, '2026-08-08T00:00:00Z'); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), code: 'EXECUTOR_NOT_AGENT' }; }],
    ...['deferred', 'cancelled'].map((disposition) => [`${disposition} disposition`, () => {
      const root = createAgentProject(`START-${disposition.toUpperCase()}`); rewriteTaskRaw(root, 'TASK-WORK', (raw) => { raw.disposition = disposition; raw.disposition_changed_at = '2026-08-08T00:00:00Z'; }, 3); regenerateStatus(root, '2026-08-08T00:00:00Z');
      return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), code: 'TASK_NOT_ACTIVE' };
    }]),
    ['planned lifecycle', () => { const root = createAgentProject('START-PLANNED', { status: 'planned' }); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), code: 'TASK_NOT_READY' }; }],
    ...['implemented', 'verification', 'verified', 'done'].map((status) => [`${status} lifecycle`, () => { const { root } = progressedAgentFixture(`START-${status.toUpperCase()}`, status); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:04Z' }), code: 'TASK_NOT_READY' }; }]),
    ['inconsistent pointers', () => { const root = createAgentProject('START-POINTER'); rewriteTaskRaw(root, 'TASK-WORK', (raw) => { raw.active_contract = `tc-${'0'.repeat(64)}`; }); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), pattern: /lifecycle pointers/ }; }],
    ['ready blocker', () => { const root = createAgentProject('START-BLOCKER'); rewriteTaskRaw(root, 'TASK-WORK', (raw) => { raw.blocked_by = ['Not cleared']; }); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), pattern: /cannot be ready while blocked/ }; }],
    ['incomplete dependency', () => {
      const root = createProject(temp(), 'START-DEPENDENCY', [
        task('TASK-GATE', 'Gate', 'Gate.', ['Gate accepted.'], { blocks: ['TASK-WORK'] }),
        task('TASK-WORK', 'Work', 'Done.', ['Accepted.'], { status: 'ready', depends_on: ['TASK-GATE'], executor: { provider: 'agent', root: null } }),
      ], { adapters: ['human', 'agent'] });
      return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), pattern: /cannot be ready while blocked/ };
    }],
    ['active nonblocked retry', () => { const { root } = activeAgentFixture('START-ACTIVE'); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:02Z', retry_blocker: 'none' }), code: 'RETRY_NOT_BLOCKED' }; }],
    ['retry blocker mismatch', () => { const { root } = blockedAgentFixture('START-MISMATCH'); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:03Z', retry_blocker: 'different' }), code: 'RETRY_BLOCKER_MISMATCH' }; }],
    ['blocked retry not declared', () => { const { root } = blockedAgentFixture('START-NORETRY'); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:03Z' }), code: 'TASK_NOT_READY' }; }],
    ['backdated retry', () => { const { root } = blockedAgentFixture('START-BACKRETRY', 'Worker unavailable', { change: true }); return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:02Z', retry_blocker: 'Worker unavailable' }), code: 'RETRY_CHRONOLOGY' }; }],
    ['backdated re-verification start', () => {
      const root = createAgentProject('START-BACKCHANGE'); fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: '2026-08-08T00:00:02Z', sources: [], affected_tasks: ['TASK-WORK'], affected_milestones: [], reverify_tasks: ['TASK-WORK'], reverification: { 'TASK-WORK': { status: 'pending', contract_id: null, manifest_id: null } }, risk_summary: 'Changed.' } }])); regenerateStatus(root, '2026-08-08T00:00:02Z');
      return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), code: 'CHANGE_REVERIFY_CHRONOLOGY' };
    }],
    ['duplicate contract', () => {
      const root = createAgentProject('START-DUPLICATE'); const state = loadProject(root); const model = state.tasks[0]; const contract = buildTaskContract(state.project, model, [], '2026-08-08T00:00:01Z');
      const attemptRoot = path.join(root, 'handoffs', model.id, contract.contract_id); fs.mkdirSync(attemptRoot, { recursive: true }); fs.writeFileSync(path.join(attemptRoot, 'TASK-CONTRACT.md'), formatTaskContract(contract));
      return { root, run: () => startAgentTask(root, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }), code: 'CONTRACT_EXISTS' };
    }],
  ];
  for (const [name, setup] of cases) {
    const item = setup();
    assertNoMutation(item.root, item.run, item.code ? (error) => error.code === item.code : item.pattern, name);
  }
});

test('agent ingest eligibility, binding, progression, and source rejection matrix preserves exact bytes', () => {
  const verifiedPayload = (contract, extra = {}) => { const artifact = evidence('artifact'); const review = evidence('review'); return manifest(contract, 'verified', 1, [artifact, review], [review], { observed_at: '2026-08-08T00:00:02Z', ...extra }); };
  const cases = [
    ['inactive project', () => { const item = activeAgentFixture('INGEST-INACTIVE'); rewriteProjectStatus(item.root, 'on_hold'); regenerateStatus(item.root, '2026-08-08T00:00:01Z'); return { ...item, payload: verifiedPayload(item.contract), code: 'PROJECT_NOT_ACTIVE' }; }],
    ['wrong provider', () => { const item = activeHumanFixture('INGEST-PROVIDER'); return { ...item, payload: {}, code: 'EXECUTOR_NOT_AGENT' }; }],
    ...['deferred', 'cancelled'].map((disposition) => [`${disposition} disposition`, () => {
      const item = activeAgentFixture(`INGEST-${disposition.toUpperCase()}`); rewriteTaskRaw(item.root, 'TASK-WORK', (raw) => { raw.disposition = disposition; raw.disposition_changed_at = '2026-08-08T00:00:01.500Z'; }, 3); regenerateStatus(item.root, '2026-08-08T00:00:01.500Z');
      return { ...item, payload: verifiedPayload(item.contract), code: 'TASK_NOT_ACTIVE' };
    }]),
    ['ready lifecycle', () => { const root = createAgentProject('INGEST-READY'); return { root, payload: {}, code: 'TASK_NOT_INGESTIBLE' }; }],
    ['missing active pointer', () => { const item = activeAgentFixture('INGEST-POINTER'); rewriteTaskRaw(item.root, 'TASK-WORK', (raw) => { delete raw.active_contract; }); return { ...item, payload: verifiedPayload(item.contract), pattern: /lifecycle pointers/ }; }],
    ['contract binding mismatch', () => { const item = activeAgentFixture('INGEST-BINDING'); const payload = verifiedPayload(item.contract); payload.contract_id = `tc-${'0'.repeat(64)}`; return { ...item, payload, code: 'MANIFEST_INVALID' }; }],
    ['contract tampering', () => { const item = activeAgentFixture('INGEST-TAMPER'); fs.appendFileSync(item.started.data.contract_path, '\ntamper\n'); return { ...item, payload: verifiedPayload(item.contract), pattern: /canonical payload block/ }; }],
    ['invalid evidence', () => { const item = activeAgentFixture('INGEST-EVIDENCE'); const payload = verifiedPayload(item.contract); payload.evidence = []; payload.acceptance_evidence = { 'Outcome is accepted.': [] }; return { ...item, payload, code: 'MANIFEST_INVALID' }; }],
    ['duplicate manifest', () => { const item = activeAgentFixture('INGEST-DUPLICATE'); const formatted = formatEvidenceManifest(verifiedPayload(item.contract), item.contract); fs.writeFileSync(path.join(path.dirname(item.started.data.contract_path), 'EVIDENCE-001.md'), formatted.document); return { ...item, payload: verifiedPayload(item.contract), pattern: /last manifest pointer is stale/ }; }],
    ['missing source', () => { const item = activeAgentFixture('INGEST-MISSING'); return { ...item, payload: verifiedPayload(item.contract, { sources: [{ path: 'missing.bin', sha256: sha256('missing'), role: 'proof' }] }), pattern: /Missing required path/ }; }],
    ['mismatched source hash', () => { const item = activeAgentFixture('INGEST-HASH'); fs.writeFileSync(path.join(item.root, 'proof.bin'), 'actual'); return { ...item, payload: verifiedPayload(item.contract, { sources: [{ path: 'proof.bin', sha256: sha256('different'), role: 'proof' }] }), pattern: /hash mismatch/ }; }],
  ];
  for (const [name, setup] of cases) {
    const item = setup();
    assertNoMutation(item.root, () => ingestAgentManifest(item.root, 'TASK-WORK', item.payload), item.code ? (error) => error.code === item.code : item.pattern, name);
  }

  const illegal = activeAgentFixture('INGEST-ILLEGAL'); const artifact = evidence('artifact');
  ingestAgentManifest(illegal.root, 'TASK-WORK', manifest(illegal.contract, 'implemented', 1, [artifact], [], { observed_at: '2026-08-08T00:00:02Z' }));
  assertNoMutation(illegal.root, () => ingestAgentManifest(illegal.root, 'TASK-WORK', manifest(illegal.contract, 'implemented', 2, [evidence('artifact', 'new')], [], { observed_at: '2026-08-08T00:00:03Z' })), (error) => error.code === 'MANIFEST_INVALID');

  const replay = activeAgentFixture('INGEST-REPLAY'); ingestAgentManifest(replay.root, 'TASK-WORK', manifest(replay.contract, 'implemented', 1, [artifact], [], { observed_at: '2026-08-08T00:00:02Z' }));
  assertNoMutation(replay.root, () => ingestAgentManifest(replay.root, 'TASK-WORK', manifest(replay.contract, 'verification', 2, [artifact], [], { observed_at: '2026-08-08T00:00:03Z' })), (error) => error.code === 'MANIFEST_INVALID');

  const terminal = blockedAgentFixture('INGEST-BLOCKED');
  assertNoMutation(terminal.root, () => ingestAgentManifest(terminal.root, 'TASK-WORK', {}), (error) => error.code === 'ATTEMPT_BLOCKED');
  for (const status of ['verified', 'done']) {
    const item = progressedAgentFixture(`INGEST-${status.toUpperCase()}`, status);
    assertNoMutation(item.root, () => ingestAgentManifest(item.root, 'TASK-WORK', {}), (error) => error.code === 'TASK_NOT_INGESTIBLE');
  }
});

test('agent mutations reject concurrency and injected replacement failure without losing live bytes', () => {
  const concurrent = createAgentProject('AGENT-CONCURRENT');
  assert.throws(() => startAgentTask(concurrent, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }, {
    beforeMutation(root) { fs.writeFileSync(path.join(root, 'operator-note.txt'), 'newer live bytes'); },
  }), (error) => error.code === 'MUTATION_CONFLICT');
  assert.equal(fs.readFileSync(path.join(concurrent, 'operator-note.txt'), 'utf8'), 'newer live bytes'); assert.equal(fs.existsSync(path.join(concurrent, 'handoffs')), false);

  const rollback = createAgentProject('AGENT-ROLLBACK'); const before = treeHash(rollback);
  assert.throws(() => startAgentTask(rollback, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' }, { injectFailureAfterReplace: true }), /Injected failure/);
  assert.equal(treeHash(rollback), before);

  const ingestConcurrent = activeAgentFixture('INGEST-CONCURRENT'); const concurrentArtifact = evidence('artifact'); const concurrentReview = evidence('review');
  const concurrentPayload = manifest(ingestConcurrent.contract, 'verified', 1, [concurrentArtifact, concurrentReview], [concurrentReview], { observed_at: '2026-08-08T00:00:02Z' });
  assert.throws(() => ingestAgentManifest(ingestConcurrent.root, 'TASK-WORK', concurrentPayload, {
    beforeMutation(root) { fs.writeFileSync(path.join(root, 'operator-note.txt'), 'newer ingest bytes'); },
  }), (error) => error.code === 'MUTATION_CONFLICT');
  assert.equal(fs.readFileSync(path.join(ingestConcurrent.root, 'operator-note.txt'), 'utf8'), 'newer ingest bytes');
  assert.equal(fs.existsSync(path.join(path.dirname(ingestConcurrent.started.data.contract_path), 'EVIDENCE-001.md')), false);

  const ingestRollback = activeAgentFixture('INGEST-ROLLBACK'); const ingestBefore = treeHash(ingestRollback.root); const rollbackArtifact = evidence('artifact'); const rollbackReview = evidence('review');
  const rollbackPayload = manifest(ingestRollback.contract, 'verified', 1, [rollbackArtifact, rollbackReview], [rollbackReview], { observed_at: '2026-08-08T00:00:02Z' });
  assert.throws(() => ingestAgentManifest(ingestRollback.root, 'TASK-WORK', rollbackPayload, { injectFailureAfterReplace: true }), /Injected failure/);
  assert.equal(treeHash(ingestRollback.root), ingestBefore);

  const missingSource = createAgentProject('AGENT-SOURCE'); const started = startAgentTask(missingSource, 'TASK-WORK', { created_at: '2026-08-08T00:00:01Z' });
  const contract = storedContract(started.data.contract_path); const artifact = evidence('artifact'); const review = evidence('review'); const sourceBefore = treeHash(missingSource);
  const payload = manifest(contract, 'verified', 1, [artifact, review], [review], { observed_at: '2026-08-08T00:00:02Z', sources: [{ path: 'missing.bin', sha256: sha256('missing'), role: 'proof' }] });
  assert.throws(() => ingestAgentManifest(missingSource, 'TASK-WORK', payload), /Missing required path/); assert.equal(treeHash(missingSource), sourceBefore);
});

test('agent CLIs enforce exact arguments, stdin framing, envelopes, and exit classes', () => {
  let cli = run('project-start-agent.js', ['--help']); assert.equal(cli.status, 0); assert.match(cli.stdout, /^Usage:/); assert.equal(cli.stderr, '');
  cli = run('project-start-agent.js', ['--help', 'extra']); assert.equal(cli.status, 2); assert.equal(cli.stdout, ''); assert.equal(JSON.parse(cli.stderr).errors[0].code, 'INVALID_ARGUMENT');
  cli = run('project-start-agent.js', ['root', 'TASK', '--created-at', 'not-a-time']); assert.equal(cli.status, 2); assert.equal(JSON.parse(cli.stderr).errors[0].code, 'INVALID_TIMESTAMP');
  for (const args of [
    ['root', 'TASK', '--json', '--json'], ['root', 'TASK', '--unknown'], ['root'], ['root', 'TASK', '--created-at'],
    ['root', 'TASK', '--retry-blocker'], ['root', 'TASK', '--retry-blocker='], ['root', 'TASK', '--retry-blocker=one', '--retry-blocker', 'two'],
  ]) {
    cli = run('project-start-agent.js', args); assert.equal(cli.status, 2, args.join(' ')); assert.equal(cli.stdout, ''); assert.equal(JSON.parse(cli.stderr).errors[0].code, 'INVALID_ARGUMENT');
  }
  for (const args of [['root', 'TASK', '--json', '--json'], ['root', 'TASK', '--unknown'], ['root'], ['--help', 'root']]) {
    cli = run('project-ingest-agent-manifest.js', args, '{}'); assert.equal(cli.status, 2, args.join(' ')); assert.equal(cli.stdout, ''); assert.equal(JSON.parse(cli.stderr).errors[0].code, 'INVALID_ARGUMENT');
  }
  cli = run('project-ingest-agent-manifest.js', ['--help']); assert.equal(cli.status, 0); assert.match(cli.stdout, /^Usage:/); assert.equal(cli.stderr, '');
  for (const input of ['', '   \n', '{', '1', 'null', '[]', '{} {}', '{} trailing']) {
    cli = run('project-ingest-agent-manifest.js', ['root', 'TASK'], input); assert.equal(cli.status, 2, JSON.stringify(input)); assert.equal(cli.stdout, ''); assert.equal(JSON.parse(cli.stderr).errors[0].code, 'INVALID_STDIN');
  }
  cli = run('project-ingest-agent-manifest.js', [path.join(temp(), 'missing'), 'TASK'], '{}'); assert.equal(cli.status, 2); assert.equal(cli.stdout, '');

  const executorRoot = temp(); const root = createAgentProject('AGENT-CLI', { executor: { provider: 'agent', root: executorRoot, scope: 'absolute' } });
  cli = run('project-start-agent.js', [root, 'TASK-WORK', '--created-at', '2026-08-08T00:00:01Z', '--json']);
  assert.equal(cli.status, 0); assert.equal(cli.stderr, ''); const started = JSON.parse(cli.stdout);
  assert.deepEqual(Object.keys(started), ['ok', 'command', 'project', 'data']); assert.equal(started.command, 'start-agent'); assert.equal(started.data.retry, false);
  const contract = storedContract(started.data.contract_path); const artifact = evidence('artifact'); const review = evidence('review');
  const payload = manifest(contract, 'verified', 1, [artifact, review], [review], { observed_at: '2026-08-08T00:00:02Z' });
  cli = run('project-ingest-agent-manifest.js', [root, 'TASK-WORK', '--json'], `${JSON.stringify(payload)}\n  `);
  assert.equal(cli.status, 0); assert.equal(cli.stderr, ''); const ingested = JSON.parse(cli.stdout); assert.equal(ingested.data.status, 'done'); assert.equal(ingested.data.sequence, 1);
  assert.equal(fs.existsSync(path.join(root, '.pm-agent-exec.js')), false); assert.equal(fs.existsSync(path.join(executorRoot, '.pm-agent-exec.js')), false);

  const wrong = createProject(temp(), 'AGENT-WRONG', [task('TASK-WORK', 'Work', 'Done.', ['Accepted.'], { status: 'ready' })]); regenerateStatus(wrong, '2026-08-08T00:00:00Z');
  cli = run('project-start-agent.js', [wrong, 'TASK-WORK', '--json']); assert.equal(cli.status, 1); assert.equal(cli.stdout, '');
  const failure = JSON.parse(cli.stderr); assert.equal(failure.command, 'start-agent'); assert.equal(failure.errors[0].code, 'EXECUTOR_NOT_AGENT'); assert.equal(typeof failure.errors[0].usage, 'string');

  const wrongIngest = activeHumanFixture('INGEST-CLI-WRONG'); cli = run('project-ingest-agent-manifest.js', [wrongIngest.root, 'TASK-WORK', '--json'], '{}');
  assert.equal(cli.status, 1); assert.equal(cli.stdout, ''); assert.equal(JSON.parse(cli.stderr).errors[0].code, 'EXECUTOR_NOT_AGENT');

  const retry = blockedAgentFixture('AGENT-CLI-RETRY', '--runtime-offline');
  cli = run('project-start-agent.js', [retry.root, 'TASK-WORK', '--created-at', '2026-08-08T00:00:03Z', '--retry-blocker=--runtime-offline', '--json']);
  assert.equal(cli.status, 0); assert.equal(cli.stderr, ''); assert.equal(JSON.parse(cli.stdout).data.retry, true); assert.deepEqual(loadProject(retry.root).tasks[0].blocked_by, []);
  const spacedRetry = blockedAgentFixture('AGENT-CLI-SPACED', 'ordinary blocker');
  cli = run('project-start-agent.js', [spacedRetry.root, 'TASK-WORK', '--created-at', '2026-08-08T00:00:03Z', '--retry-blocker', 'ordinary blocker', '--json']);
  assert.equal(cli.status, 0); assert.equal(JSON.parse(cli.stdout).data.retry, true);
});

test('verified human manifest requires provider evidence and every exact acceptance mapping', () => {
  const contract = buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, normalizedTask('human'), [], '2026-08-08T00:00:00Z');
  const approval = evidence('approval');
  const result = validateManifest(manifest(contract, 'verified', 1, [approval], [approval]), contract);
  assert.match(result.manifest_id, /^em-[a-f0-9]{64}$/);
  assert.throws(() => validateManifest(manifest(contract, 'verified', 1, [approval], []), contract), /lacks evidence/);
  const fake = evidence('approval', 'other');
  assert.throws(() => validateManifest(manifest(contract, 'verified', 1, [approval], [fake]), contract), /reuse a main evidence record/);
  const duplicateTask = normalizedTask('human'); duplicateTask.evidence_requirements = [{ stage: 'verified', any_of: ['approval'], minimum: 2 }]; duplicateTask.spec_sha256 = taskSpecHash(duplicateTask);
  const duplicateContract = buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, duplicateTask, [], '2026-08-08T00:00:00Z');
  assert.throws(() => validateManifest(manifest(duplicateContract, 'verified', 1, [approval, approval], [approval]), duplicateContract), /duplicates/);
});

test('stored attempt documents bind lifecycle pointers to the latest validated manifest', () => {
  const base = temp(); const root = createProject(base, 'ATTEMPT', []);
  const sourceRaw = { kind: 'document', location: 'brief.md', role: 'scope', status: 'current', version: 'v1', sha256: null };
  fs.writeFileSync(path.join(root, 'SOURCES.md'), collection([{ id: 'SRC-ONE', title: 'Source', data: sourceRaw }]));
  const model = normalizedTask('human'); model.success_criteria = ['SC-OUTCOME']; model.sources = ['SRC-ONE']; model.spec_sha256 = taskSpecHash(model);
  const binding = [{ id: 'SRC-ONE', version: 'v1', record_sha256: sha256(sourceRaw), content_sha256: null }];
  const contract = buildTaskContract({ id: 'ATTEMPT', root: fs.realpathSync(root) }, model, binding, '2026-08-08T00:00:00Z');
  const attemptRoot = path.join(root, 'handoffs', model.id, contract.contract_id); fs.mkdirSync(attemptRoot, { recursive: true });
  fs.writeFileSync(path.join(attemptRoot, 'TASK-CONTRACT.md'), formatTaskContract(contract));
  const raw = { outcome: model.outcome, acceptance: model.acceptance, status: 'in_progress', executor: model.executor, constraints: model.constraints, sources: model.sources, success_criteria: model.success_criteria, evidence_requirements: model.evidence_requirements, active_contract: contract.contract_id };
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.equal(loadProject(root).tasks[0].status, 'in_progress');
  atomicProjectMutation(fs.realpathSync(root), (candidate, context) => regenerateStatus(candidate, '2026-08-08T00:00:00Z', context), loadProject, { validateLive: loadProject });
  assert.equal(loadProject(root).tasks[0].status, 'in_progress');
  fs.writeFileSync(path.join(attemptRoot, 'EVIDENCE-1.md'), 'malformed'); assert.throws(() => loadProject(root), /exact three-digit/); fs.unlinkSync(path.join(attemptRoot, 'EVIDENCE-1.md'));
  const binary = Buffer.from([0xff, 0xfe, 0x00, 0x80]); fs.writeFileSync(path.join(root, 'evidence.bin'), binary);
  const approval = evidence('approval'); const payload = manifest(contract, 'verified', 1, [approval], [approval], { sources: [{ path: 'evidence.bin', sha256: sha256(binary), role: 'binary-proof' }] });
  const formatted = formatEvidenceManifest(payload, contract);
  fs.writeFileSync(path.join(attemptRoot, 'EVIDENCE-001.md'), formatted.document);
  raw.status = 'done'; raw.last_manifest = formatted.manifest_id;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.equal(loadProject(root).tasks[0].status, 'done');
  raw.blocked_by = ['Regression']; fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.throws(() => loadProject(root), /cannot be done/); delete raw.blocked_by; fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  raw.depends_on = ['TASK-DEP'];
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([
    { id: model.id, title: model.title, data: raw },
    task('TASK-DEP', 'Dependency', 'Dependency outcome.', ['Dependency accepted.'], { blocks: [model.id] }),
  ]));
  assert.throws(() => loadProject(root), /cannot be done/); delete raw.depends_on;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  sourceRaw.version = 'v2'; fs.writeFileSync(path.join(root, 'SOURCES.md'), collection([{ id: 'SRC-ONE', title: 'Source', data: sourceRaw }]));
  const tolerant = loadProject(root, { taskErrorsAsWarnings: true });
  assert.equal(tolerant.tasks[0].status, 'done');
  assert.deepEqual(tolerant.warnings.map(({ code, cause_code, task_id }) => ({ code, cause_code, task_id })), [{
    code: 'TASK_EXECUTION_INVALID', cause_code: 'CONTRACT_SOURCE_BINDING', task_id: model.id,
  }]);
  assert.throws(() => loadProject(root), /source binding is stale/); sourceRaw.version = 'v1';
  fs.writeFileSync(path.join(root, 'SOURCES.md'), collection([{ id: 'SRC-ONE', title: 'Source', data: sourceRaw }]));
  const moved = path.join(base, 'attempt-moved'); fs.renameSync(root, moved);
  assert.equal(loadProject(moved).tasks[0].status, 'done'); fs.renameSync(moved, root);
  const changeObservedAt = '2026-08-08T00:00:00.999Z';
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: changeObservedAt, sources: [], affected_tasks: [model.id], affected_milestones: [], reverify_tasks: [model.id], risk_summary: 'Source changed' } }]));
  const tolerantPending = loadProject(root, { taskErrorsAsWarnings: true });
  assert.equal(tolerantPending.warnings.find((warning) => warning.code === 'TASK_EXECUTION_INVALID').cause_code, 'CHANGE_REVERIFY');
  assert.throws(() => loadProject(root), /must regress/);
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: changeObservedAt, sources: [], affected_tasks: [model.id], affected_milestones: [], reverify_tasks: [model.id], reverification: { [model.id]: { status: 'complete', contract_id: contract.contract_id, manifest_id: formatted.manifest_id } }, risk_summary: 'Source changed' } }]));
  const tolerantReverification = loadProject(root, { taskErrorsAsWarnings: true });
  assert.equal(tolerantReverification.warnings.find((warning) => warning.code === 'TASK_EXECUTION_INVALID').cause_code, 'CHANGE_REVERIFY_BINDING');
  const tolerantReverificationBoard = kanbanData(tolerantReverification);
  assert.equal(tolerantReverificationBoard.tasks[0].execution_issue, true);
  assert.equal(tolerantReverificationBoard.summary.tasks.blocked, 0);
  assert.throws(() => loadProject(root), /predates or mismatches/);
  const retry = buildTaskContract({ id: 'ATTEMPT', root: fs.realpathSync(root) }, model, binding, '2026-08-08T00:00:02Z');
  const retryRoot = path.join(root, 'handoffs', model.id, retry.contract_id); fs.mkdirSync(retryRoot, { recursive: true });
  fs.writeFileSync(path.join(retryRoot, 'TASK-CONTRACT.md'), formatTaskContract(retry));
  const retryPayload = manifest(retry, 'verified', 1, [approval], [approval], { observed_at: '2026-08-08T00:00:03Z', sources: [{ path: 'evidence.bin', sha256: sha256(binary), role: 'binary-proof' }] });
  const retryFormatted = formatEvidenceManifest(retryPayload, retry); fs.writeFileSync(path.join(retryRoot, 'EVIDENCE-001.md'), retryFormatted.document);
  raw.active_contract = retry.contract_id; raw.last_manifest = retryFormatted.manifest_id;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: changeObservedAt, sources: [], affected_tasks: [model.id], affected_milestones: [], reverify_tasks: [model.id], reverification: { [model.id]: { status: 'complete', contract_id: retry.contract_id, manifest_id: retryFormatted.manifest_id } }, risk_summary: 'Source changed' } }]));
  assert.equal(loadProject(root).tasks[0].status, 'done');
  const donePointers = { active_contract: raw.active_contract, last_manifest: raw.last_manifest }; raw.status = 'planned'; delete raw.active_contract; delete raw.last_manifest;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([
    { id: 'CHG-LATER', title: 'Later change', data: { date: '2026-08-09', observed_at: '2026-08-09T00:00:00Z', sources: [], affected_tasks: [model.id], affected_milestones: [], reverify_tasks: [model.id], risk_summary: 'Changed again' } },
    { id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: changeObservedAt, sources: [], affected_tasks: [model.id], affected_milestones: [], reverify_tasks: [model.id], reverification: { [model.id]: { status: 'complete', contract_id: retry.contract_id, manifest_id: retryFormatted.manifest_id } }, risk_summary: 'Source changed' } },
  ]));
  assert.equal(loadProject(root).tasks[0].status, 'planned'); raw.status = 'done'; Object.assign(raw, donePointers); fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }])); fs.unlinkSync(path.join(root, 'CHANGES.md'));
  raw.last_manifest = `em-${'0'.repeat(64)}`;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.throws(() => loadProject(root), /last manifest pointer is stale/);
});

test('blocked manifest state stores its exact blocker and retry preserves the old immutable attempt', () => {
  const base = temp(); const root = createProject(base, 'BLOCKED', []); const selectedRoot = fs.realpathSync(root); const model = normalizedTask('human');
  const first = buildTaskContract({ id: 'BLOCKED', root: selectedRoot }, model, [], '2026-08-08T00:00:00Z');
  const firstRoot = path.join(root, 'handoffs', model.id, first.contract_id); fs.mkdirSync(firstRoot, { recursive: true });
  fs.writeFileSync(path.join(firstRoot, 'TASK-CONTRACT.md'), formatTaskContract(first));
  const blockedPayload = manifest(first, 'blocked', 1, [], [], { blocker: 'Waiting for facilities' });
  const blockedDoc = formatEvidenceManifest(blockedPayload, first); fs.writeFileSync(path.join(firstRoot, 'EVIDENCE-001.md'), blockedDoc.document);
  const raw = { outcome: model.outcome, acceptance: model.acceptance, constraints: model.constraints, success_criteria: model.success_criteria, executor: model.executor, evidence_requirements: model.evidence_requirements, status: 'in_progress', active_contract: first.contract_id, last_manifest: blockedDoc.manifest_id };
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.throws(() => loadProject(root), /must store the blocked manifest blocker/);
  raw.blocked_by = ['Waiting for facilities']; fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }])); assert.equal(loadProject(root).tasks[0].status, 'in_progress');
  const oldHash = treeHash(firstRoot); const second = buildTaskContract({ id: 'BLOCKED', root: selectedRoot }, model, [], '2026-08-08T00:00:01Z');
  const secondRoot = path.join(root, 'handoffs', model.id, second.contract_id); fs.mkdirSync(secondRoot, { recursive: true }); fs.writeFileSync(path.join(secondRoot, 'TASK-CONTRACT.md'), formatTaskContract(second));
  delete raw.blocked_by; delete raw.last_manifest; raw.active_contract = second.contract_id;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.equal(loadProject(root).tasks[0].active_contract, second.contract_id); assert.equal(treeHash(firstRoot), oldHash);
});

test('RPD evidence stages are cumulative and replay fingerprint ignores sequence, status, time, and notes', () => {
  const root = temp(); const contract = buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, normalizedTask('rpd', root), [], '2026-08-08T00:00:00Z');
  const artifact = evidence('artifact');
  const firstPayload = manifest(contract, 'implemented', 1, [artifact], []);
  const first = { ...validateManifest(firstPayload, contract), status: 'implemented' };
  const replay = manifest(contract, 'verification', 2, [artifact], [], { observed_at: '2026-08-09T00:00:00Z', notes: ['same evidence, new prose'] });
  assert.throws(() => validateManifest(replay, contract, [first]), /replay/i);
  const command = evidence('command');
  const second = manifest(contract, 'verification', 2, [artifact, command], []);
  assert.doesNotThrow(() => validateManifest(second, contract, [first]));
});

test('reordering identical evidence, acceptance mappings, or sources cannot evade replay detection', () => {
  const model = normalizedTask('human'); model.evidence_requirements = [{ stage: 'implemented', any_of: ['approval'], minimum: 1 }]; model.spec_sha256 = taskSpecHash(model);
  const contract = buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, model, [], '2026-08-08T00:00:00Z');
  const one = evidence('approval', 'one'); const two = evidence('approval', 'two');
  const sources = [{ path: 'a.bin', sha256: sha256('a'), role: 'a' }, { path: 'b.bin', sha256: sha256('b'), role: 'b' }];
  const firstPayload = manifest(contract, 'implemented', 1, [one, two], [one, two], { sources });
  const first = { ...validateManifest(firstPayload, contract), status: 'implemented' };
  const reordered = manifest(contract, 'verification', 2, [two, one], [two, one], { sources: [...sources].reverse() });
  assert.throws(() => validateManifest(reordered, contract, [first]), /replay/i);
});

test('manifest rejects gaps, illegal progression, mismatched task binding, malformed fields, and escaping sources', () => {
  const contract = buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, normalizedTask('human'), [], '2026-08-08T00:00:00Z');
  const approval = evidence('approval');
  assert.throws(() => validateManifest(manifest(contract, 'verified', 2, [approval], [approval]), contract), /sequence/);
  const mismatch = manifest(contract, 'verified', 1, [approval], [approval]); mismatch.task.id = 'TASK-OTHER';
  assert.throws(() => validateManifest(mismatch, contract), /binding mismatch/);
  const escaping = manifest(contract, 'verified', 1, [approval], [approval]); escaping.sources = [{ path: '../outside', sha256: sha256('x'), role: 'bad' }];
  assert.throws(() => validateManifest(escaping, contract), /project-relative/);
  const extra = manifest(contract, 'verified', 1, [approval], [approval]); extra.extra = true;
  assert.throws(() => validateManifest(extra, contract), /fields must be exactly/);
});

test('RPD story collision expands deterministically and prompt binds both readable and portable contract paths', () => {
  const contractId = `tc-${'a'.repeat(64)}`;
  const first = deriveStory('PROJECT-X', 'TASK-WORK', contractId);
  const expanded = deriveStory('PROJECT-X', 'TASK-WORK', contractId, new Set([first]));
  assert.equal(first.endsWith('a'.repeat(12)), true); assert.equal(expanded.endsWith('a'.repeat(16)), true);
  const input = { project_id: 'PROJECT-X', task_id: 'TASK-WORK', contract_id: contractId, story: expanded, executor_root: '/tmp/executor', contract_absolute_path: '/tmp/project/handoffs/contract.md', contract_relative_path: 'handoffs/contract.md', acceptance: ['Outcome is accepted.'], constraints: [], evidence_requirements: DEFAULT_EVIDENCE.rpd };
  const prompt = renderRpdPrompt(input);
  assert.match(prompt, /\/tmp\/project\/handoffs\/contract\.md/); assert.match(prompt, /handoffs\/contract\.md/);
  assert.equal(renderRpdPrompt(input), prompt);
});

test('Studio exposes a concise RPD command for every task and prefers issued contracts', () => {
  const record = task('TASK-RPD', 'RPD work', 'Produce the outcome.', ['Outcome is accepted.'], { status: 'ready', executor: { provider: 'rpd', root: 'executor', scope: 'project' } });
  const root = createProject(temp(), 'RPD-STUDIO', [record], { adapters: ['human', 'rpd'] });
  fs.mkdirSync(path.join(root, 'executor'));
  const initial = loadProject(root); const model = initial.tasks[0];
  const executionRoot = path.join(initial.project.root, 'executor');
  const contract = buildTaskContract(initial.project, model, [], '2026-08-08T00:00:00Z');
  const story = deriveStory(initial.project.id, model.id, contract.contract_id);
  const contractPath = path.join(initial.project.root, 'handoffs', model.id, contract.contract_id, 'TASK-CONTRACT.md');
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  const relativeContract = path.relative(initial.project.root, contractPath).split(path.sep).join('/');
  const prompt = renderRpdPrompt({ project_id: initial.project.id, task_id: model.id, contract_id: contract.contract_id, story, executor_root: executionRoot, contract_absolute_path: contractPath, contract_relative_path: relativeContract, acceptance: model.acceptance, constraints: model.constraints, evidence_requirements: model.evidence_requirements });
  fs.writeFileSync(contractPath, formatTaskContract(contract, { story, executor_prompt: prompt, executor_prompt_sha256: sha256(prompt) }));
  record.data.status = 'in_progress'; record.data.active_contract = contract.contract_id;
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([record]));

  const projected = kanbanData(loadProject(root)).tasks[0];
  assert.equal(projected.rpd_command, `RPD ${story} using task contract ${JSON.stringify(contractPath)}.`);

  record.data.disposition = 'deferred'; record.data.disposition_changed_at = '2026-08-08T00:01:00Z';
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([record], 3));
  assert.equal(kanbanData(loadProject(root)).tasks[0].rpd_command, projected.rpd_command);

  fs.writeFileSync(contractPath, 'malformed contract');
  assert.throws(() => loadProject(root), /Expected opening ---/);
  const blocked = kanbanData(loadProject(root, { taskErrorsAsWarnings: true })).tasks[0];
  assert.equal(blocked.execution_issue, true);
  assert.match(blocked.rpd_command, /^Execution blocked for TASK-RPD:/);

  const genericRoot = createProject(temp(), 'RPD-FALLBACK', [task('TASK-ANY', 'Any work', 'Produce any outcome.', ['Outcome is accepted.'])]);
  assert.equal(kanbanData(loadProject(genericRoot)).tasks[0].rpd_command, `RPD "Any work" using project task ${JSON.stringify(path.join(fs.realpathSync(genericRoot), 'TASKS.md'))}.`);
});

test('RPD verified state requires exact-story project-local snapshots and untampered prompt/source hashes', () => {
  const base = temp(); const root = createProject(base, 'SOFTWARE', [], { adapters: ['human', 'rpd'] }); const selectedRoot = fs.realpathSync(root); const executor = temp();
  const model = normalizedTask('rpd', executor); model.success_criteria = ['SC-OUTCOME']; model.spec_sha256 = taskSpecHash(model);
  const contract = buildTaskContract({ id: 'SOFTWARE', root: selectedRoot }, model, [], '2026-08-08T00:00:00Z');
  const story = deriveStory('SOFTWARE', model.id, contract.contract_id);
  const attemptRoot = path.join(selectedRoot, 'handoffs', model.id, contract.contract_id); fs.mkdirSync(attemptRoot, { recursive: true });
  const contractPath = path.join(attemptRoot, 'TASK-CONTRACT.md'); const relativeContract = path.relative(selectedRoot, contractPath).split(path.sep).join('/');
  const prompt = renderRpdPrompt({ project_id: 'SOFTWARE', task_id: model.id, contract_id: contract.contract_id, story, executor_root: executor, contract_absolute_path: contractPath, contract_relative_path: relativeContract, acceptance: model.acceptance, constraints: model.constraints, evidence_requirements: model.evidence_requirements });
  fs.writeFileSync(contractPath, formatTaskContract(contract, { story, executor_prompt: prompt, executor_prompt_sha256: sha256(prompt) }));
  for (const [category, filename] of [['reqs', `req-${story}.md`], ['plans', `plan-${story}.md`], ['tests', `test-${story}.md`], ['done', `${story}.md`]]) {
    const folder = path.join(executor, '.docs', category, '2026', '08', '08'); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, filename), `${category} evidence for ${story}\n`);
  }
  const terminal = 'AR passed: no blocking architecture flaws\nAR result: pass\nCR passed: no major findings\nCR result: pass\nVR passed: all acceptance criteria complete\nVR result: pass\n';
  assert.throws(() => snapshotRpdEvidence({ executor_root: executor, project_root: selectedRoot, attempt_root: path.join(attemptRoot, 'bad-terminal'), story, terminal: 'AR passed: maybe\nCR fixed: still failing\nVR fixed: trust me\n' }), /non-conflicting/);
  assert.throws(() => snapshotRpdEvidence({ executor_root: executor, project_root: selectedRoot, attempt_root: path.join(attemptRoot, 'conflicting-terminal'), story, terminal: `${terminal}AR blocked: unresolved flaw\nVR incomplete: missing work\n` }), /non-conflicting/);
  if (process.platform !== 'win32') {
    const linkedExecutor = temp(); fs.symlinkSync(path.join(executor, '.docs'), path.join(linkedExecutor, '.docs'));
    assert.throws(() => snapshotRpdEvidence({ executor_root: linkedExecutor, project_root: selectedRoot, attempt_root: path.join(attemptRoot, 'bad-link'), story, terminal }), /real executor-root descendants/);
    const outsideSnapshot = temp(); fs.symlinkSync(outsideSnapshot, path.join(attemptRoot, 'linked-evidence'));
    assert.throws(() => snapshotRpdEvidence({ executor_root: executor, project_root: selectedRoot, attempt_root: path.join(attemptRoot, 'linked-evidence', 'rpd-evidence'), story, terminal }), /real project directories/);
  }
  const snapshotRoot = path.join(attemptRoot, 'rpd-evidence');
  const sources = snapshotRpdEvidence({ executor_root: executor, project_root: selectedRoot, attempt_root: snapshotRoot, story, terminal });
  const artifact = evidence('artifact'); const command = evidence('command'); const review = evidence('review');
  const payload = manifest(contract, 'verified', 1, [artifact, command, review], [artifact], { sources });
  const formatted = formatEvidenceManifest(payload, contract); fs.writeFileSync(path.join(attemptRoot, 'EVIDENCE-001.md'), formatted.document);
  const raw = { outcome: model.outcome, acceptance: model.acceptance, status: 'done', executor: model.executor, constraints: model.constraints, success_criteria: model.success_criteria, evidence_requirements: model.evidence_requirements, active_contract: contract.contract_id, last_manifest: formatted.manifest_id };
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection([{ id: model.id, title: model.title, data: raw }]));
  assert.equal(loadProject(root).tasks[0].status, 'done');
  const contractBytes = fs.readFileSync(contractPath, 'utf8'); fs.writeFileSync(contractPath, contractBytes.replace(sha256(prompt), '0'.repeat(64)));
  assert.throws(() => loadProject(root), /prompt\/hash/); fs.writeFileSync(contractPath, contractBytes);
  const reqSource = sources.find((item) => item.role === 'rpd-req'); fs.appendFileSync(path.join(root, reqSource.path), 'tampered\n');
  assert.throws(() => loadProject(root), /hash mismatch/);
});

test('JSON frontmatter rejects bare strings and semantic failure exits 1 without data', () => {
  const base = temp(); const root = createProject(base, 'INVALID', []);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText('INVALID').replace('status: "active"', 'status: active'));
  const result = run('project-validate.js', [root, '--json']);
  assert.equal(result.status, 2); const envelope = JSON.parse(result.stderr); assert.equal(envelope.ok, false); assert.equal(Object.hasOwn(envelope, 'data'), false);
  const semantic = createProject(base, 'SEMANTIC', [task('TASK-A', 'A', 'A.', ['A accepted.'], { priority: 'P9' })]);
  const semanticResult = run('project-validate.js', [semantic, '--json']);
  assert.equal(semanticResult.status, 1); assert.equal(Object.hasOwn(JSON.parse(semanticResult.stderr), 'data'), false);
});

test('malformed visible Markdown cannot hide from the machine parser', () => {
  const base = temp(); const root = createProject(base, 'GRAMMAR', []);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), `${projectText('GRAMMAR')}\n- malformed success line\n`);
  assert.throws(() => loadProject(root), /success-criteria line/);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), projectText('GRAMMAR'));
  fs.writeFileSync(path.join(root, 'TASKS.md'), `${collection([task('TASK-ONE', 'One', 'One.', ['One accepted.'])])}\n## Narrative only\n`);
  assert.throws(() => loadProject(root), /level-two heading/);
  fs.writeFileSync(path.join(root, 'TASKS.md'), `${collection([task('TASK-ONE', 'One', 'One.', ['One accepted.'])])}\n##   \n`);
  assert.throws(() => loadProject(root), /level-two heading/);
  fs.writeFileSync(path.join(root, 'TASKS.md'), `${collection([task('TASK-ONE', 'One', 'One.', ['One accepted.'])])}\n\`\`\`json\n{}\n\`\`\`\n`);
  assert.throws(() => loadProject(root), /exactly one json metadata block/);
});

test('impossible calendar dates, timestamps, and duplicate CLI flags are rejected', () => {
  const base = temp(); const root = createProject(base, 'DATES', [], { target_date: '2026-99-99' });
  assert.throws(() => loadProject(root), /target_date/);
  const invalidTimeTask = normalizedTask('human');
  assert.throws(() => buildTaskContract({ id: 'PROJECT-X', root: contractRoot() }, invalidTimeTask, [], '2026-99-99T00:00:00Z'), /RFC3339/);
  const valid = createProject(base, 'FLAGS', []);
  assert.equal(run('project-status.js', [valid, '--json', '--json']).status, 2);
  assert.equal(run('project-status.js', ['--help', '--help']).status, 2);
});

test('workspace initialization writes current project state and portable launch support', () => {
  const base = temp(); const workspacePath = path.join(base, 'workspace with spaces'); fs.mkdirSync(workspacePath);
  const workspace = fs.realpathSync(workspacePath); const skillRoot = fakeSkill(base);
  const first = initializeWorkspaceProject(workspace, 'first-project', initPayload('FIRST-PROJECT'), { skillRoot, generatedAt: '2026-08-15T12:00:00Z' });
  assert.equal(first.project.root, path.join(workspace, '.projects', 'first-project'));
  assert.equal(loadProject(first.project.root).status_stale, false);
  assert.deepEqual(fs.readdirSync(first.project.root).sort(), ['PROJECT.md', 'STATUS.md', 'TASKS.md']);
  assert.equal(fs.readFileSync(path.join(workspace, '.projects', '.env.local'), 'utf8'), `PROJECT_MANAGER_SKILL_PATH=${skillRoot}\n`);
  assert.equal(fs.readFileSync(path.join(workspace, '.projects', '.gitignore'), 'utf8'), '/.env.local\n');
  assert.deepEqual(fs.readdirSync(workspace).sort(), ['.projects']);
  assert.equal(fs.statSync(path.join(workspace, '.projects', 'studio.sh')).mode & 0o777, 0o755);
  assert.equal(fs.readFileSync(path.join(workspace, '.projects', 'studio.sh')).equals(fs.readFileSync(path.join(skillRoot, 'assets', 'studio.sh'))), true);
  assert.equal(fs.readFileSync(path.join(workspace, '.projects', 'studio.cmd')).equals(fs.readFileSync(path.join(skillRoot, 'assets', 'studio.cmd'))), true);
  assert.deepEqual(first.data.launchers, [path.join(workspace, '.projects', 'studio.sh'), path.join(workspace, '.projects', 'studio.cmd')]);
  assert.deepEqual(first.data.removed_retired_launchers, []);

  const envFile = path.join(workspace, '.projects', '.env.local'); const ignoreFile = path.join(workspace, '.projects', '.gitignore');
  fs.writeFileSync(envFile, `OTHER_SETTING=keep=this value\nPROJECT_MANAGER_SKILL_PATH=/stale/path\n`);
  fs.writeFileSync(ignoreFile, `reports/\n/.env.local\n`); fs.chmodSync(path.join(workspace, '.projects', 'studio.sh'), 0o644);
  initializeWorkspaceProject(workspace, 'second-project', initPayload('SECOND-PROJECT'), { skillRoot, generatedAt: '2026-08-15T12:01:00Z' });
  assert.equal(fs.readFileSync(envFile, 'utf8'), `OTHER_SETTING=keep=this value\nPROJECT_MANAGER_SKILL_PATH=${skillRoot}\n`);
  assert.equal(fs.readFileSync(ignoreFile, 'utf8'), `reports/\n/.env.local\n`);
  assert.equal(fs.statSync(path.join(workspace, '.projects', 'studio.sh')).mode & 0o777, 0o755);
  assert.deepEqual(fs.readdirSync(path.join(workspace, '.projects')).filter((name) => !name.startsWith('.') && !name.startsWith('studio.')).sort(), ['first-project', 'second-project']);
});

test('workspace initialization retires its own root launchers and never touches operator root files', () => {
  const base = temp(); const skillRoot = fakeSkill(base);
  const workspace = fs.realpathSync(temp());
  fs.writeFileSync(path.join(workspace, 'studio.sh'), retiredRootLauncher('studio.sh'), { mode: 0o755 });
  fs.writeFileSync(path.join(workspace, 'studio.cmd'), retiredRootLauncher('studio.cmd'), { mode: 0o644 });
  const migrated = initializeWorkspaceProject(workspace, 'migrated-project', initPayload('MIGRATED-PROJECT'), { skillRoot, generatedAt: '2026-08-15T12:00:00Z' });
  assert.deepEqual(migrated.data.removed_retired_launchers, [path.join(workspace, 'studio.sh'), path.join(workspace, 'studio.cmd')]);
  assert.deepEqual(fs.readdirSync(workspace).sort(), ['.projects']);
  assert.equal(fs.readFileSync(path.join(workspace, '.projects', 'studio.sh')).equals(fs.readFileSync(path.join(skillRoot, 'assets', 'studio.sh'))), true);
  assert.equal(loadProject(migrated.project.root).status_stale, false);
  const again = initializeWorkspaceProject(workspace, 'later-project', initPayload('LATER-PROJECT'), { skillRoot, generatedAt: '2026-08-15T12:01:00Z' });
  assert.deepEqual(again.data.removed_retired_launchers, []);

  const foreign = fs.realpathSync(temp());
  fs.writeFileSync(path.join(foreign, 'studio.sh'), 'operator-owned launcher\n', { mode: 0o755 });
  fs.mkdirSync(path.join(foreign, 'studio.cmd'));
  const kept = initializeWorkspaceProject(foreign, 'kept-project', initPayload('KEPT-PROJECT'), { skillRoot, generatedAt: '2026-08-15T12:00:00Z' });
  assert.deepEqual(kept.data.removed_retired_launchers, []);
  assert.deepEqual(fs.readdirSync(foreign).sort(), ['.projects', 'studio.cmd', 'studio.sh']);
  assert.equal(fs.readFileSync(path.join(foreign, 'studio.sh'), 'utf8'), 'operator-owned launcher\n');

  const rollback = fs.realpathSync(temp());
  fs.writeFileSync(path.join(rollback, 'studio.sh'), retiredRootLauncher('studio.sh'), { mode: 0o755 });
  const rollbackBefore = treeState(rollback);
  assert.throws(() => initializeWorkspaceProject(rollback, 'rollback-project', initPayload('ROLLBACK-PROJECT'), {
    skillRoot, generatedAt: '2026-08-15T12:00:00Z', injectFailureAfterExposure: 6,
  }), /Injected failure after exposure 6/);
  assert.deepEqual(treeState(rollback), rollbackBefore);
});

test('POSIX Studio launcher uses only local config and preserves cwd, arguments, and exit status', () => {
  const base = temp(); const workspacePath = path.join(base, 'launch workspace with spaces'); fs.mkdirSync(workspacePath);
  const workspace = fs.realpathSync(workspacePath); const skillRoot = fakeSkill(base);
  initializeWorkspaceProject(workspace, 'launch-project', initPayload('LAUNCH-PROJECT'), { skillRoot, generatedAt: '2026-08-15T12:00:00Z' });
  const launcher = path.join(workspace, '.projects', 'studio.sh'); const record = path.join(base, 'launch.json');
  const launched = spawnSync(launcher, ['--no-open', '--port', '43123', 'argument with spaces'], {
    cwd: path.dirname(workspace), encoding: 'utf8', env: { ...process.env, PROJECT_MANAGER_SKILL_PATH: '/inherited/wrong/path', PM_LAUNCH_RECORD: record, PM_LAUNCH_EXIT: '7' },
  });
  assert.equal(launched.status, 7); assert.equal(launched.stderr, '');
  assert.deepEqual(JSON.parse(fs.readFileSync(record, 'utf8')), { cwd: workspace, argv: ['--no-open', '--port', '43123', 'argument with spaces'] });

  const envFile = path.join(workspace, '.projects', '.env.local'); const valid = fs.readFileSync(envFile);
  const invalid = [
    null,
    'OTHER=value\n',
    'PROJECT_MANAGER_SKILL_PATH=\n',
    'PROJECT_MANAGER_SKILL_PATH=relative/path\n',
    `PROJECT_MANAGER_SKILL_PATH=${skillRoot}\nPROJECT_MANAGER_SKILL_PATH=${skillRoot}\n`,
    'PROJECT_MANAGER_SKILL_PATH=/missing/directory\n',
    `PROJECT_MANAGER_SKILL_PATH=${path.join(base, 'existing but not a skill')}\n`,
  ];
  fs.mkdirSync(path.join(base, 'existing but not a skill'));
  for (const content of invalid) {
    fs.rmSync(record, { force: true });
    if (content === null) fs.rmSync(envFile); else fs.writeFileSync(envFile, content);
    const result = spawnSync(launcher, [], { encoding: 'utf8', env: { ...process.env, PROJECT_MANAGER_SKILL_PATH: skillRoot, PM_LAUNCH_RECORD: record } });
    assert.equal(result.status, 2, content ?? 'missing env'); assert.equal(fs.existsSync(record), false, content ?? 'missing env'); assert.match(result.stderr, /Project Manager Studio:/);
  }
  fs.writeFileSync(envFile, valid);
});

test('Windows Studio launcher encodes the local-config and process contract without delayed expansion', () => {
  const text = fs.readFileSync(path.join(SKILL_ROOT, 'assets', 'studio.cmd'), 'utf8');
  assert.match(text, /^@echo off\r?\n/); assert.match(text, /setlocal/); assert.match(text, /set "PROJECT_MANAGER_SKILL_PATH="/);
  assert.match(text, /tokens=1,\* delims==/); assert.match(text, /PROJECT_MANAGER_SKILL_PATH_COUNT\+=1/);
  assert.doesNotMatch(text, /EnableDelayedExpansion/i); assert.match(text, /cd \/d "%~dp0\.\."/); assert.match(text, /set "PROJECT_MANAGER_ENV=%~dp0\.env\.local"/);
  assert.match(text, /node "%PROJECT_MANAGER_STUDIO%" %\*/); assert.match(text, /exit \/b %PROJECT_MANAGER_STUDIO_EXIT%/);
  assert.match(text, /PROJECT_MANAGER_SKILL_PATH:~0,2/); assert.match(text, /scripts\\project-manager-studio\.js/); assert.match(text, /PROJECT_MANAGER_STUDIO%\\NUL/);
});

test('initialization instructions expose the deterministic workspace and standalone contracts', () => {
  const init = fs.readFileSync(path.join(SKILL_ROOT, 'references', 'init.md'), 'utf8');
  for (const required of [
    'scripts/project-init-workspace.js', '.projects/.env.local', '.projects/.gitignore', '.projects/studio.sh', '.projects/studio.cmd',
    'PROJECT_MANAGER_SKILL_PATH', 'assets/studio.sh', 'assets/studio.cmd', 'mode `0755`', 'preserved recovery root',
    'Standalone target-folder initialization', 'Create only the three project files',
  ]) assert.match(init, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(init, /render authoritative `PROJECT\.md` and\n`TASKS\.md` in memory/);
  assert.match(init, /pass exactly one JSON object/); assert.match(init, /generates `STATUS\.md` itself/);
  assert.match(init, /preserves those lines/); assert.match(init, /rejects duplicate managed entries/);
  assert.match(init, /Refuse a symlinked, escaping, special-file, or\nnon-empty project target/);
  assert.match(init, /Treat `data\.committed: true` as committed work/); assert.match(init, /never rerun initialization/);
  const skill = fs.readFileSync(path.join(SKILL_ROOT, 'SKILL.md'), 'utf8');
  assert.match(skill, /project-init-workspace\.js/); assert.match(skill, /Standalone target-folder initialization/);
  const english = fs.readFileSync(path.join(SKILL_ROOT, 'README.md'), 'utf8'); const chinese = fs.readFileSync(path.join(SKILL_ROOT, 'README.zh-CN.md'), 'utf8');
  for (const guide of [english, chinese]) for (const required of ['.projects/.env.local', '.projects/.gitignore', 'studio.sh', 'studio.cmd']) assert.equal(guide.includes(required), true);

  const workspace = fs.realpathSync(temp()); const target = path.join(workspace, 'standalone-project'); const payload = initPayload('STANDALONE-PROJECT');
  atomicProjectMutation(target, (candidate, context) => {
    fs.writeFileSync(path.join(candidate, 'PROJECT.md'), payload.project_md); fs.writeFileSync(path.join(candidate, 'TASKS.md'), payload.tasks_md);
    fs.writeFileSync(path.join(candidate, 'STATUS.md'), `${frontmatter({ schema_version: 1, project_id: 'STANDALONE-PROJECT', generated_at: '2026-08-15T12:00:00Z', source_sha256: '0'.repeat(64) })}\n`);
    regenerateStatus(candidate, '2026-08-15T12:00:00Z', context);
  }, loadProject, { init: true, validateLive: loadProject });
  assert.deepEqual(fs.readdirSync(target).sort(), ['PROJECT.md', 'STATUS.md', 'TASKS.md']);
  assert.deepEqual(fs.readdirSync(workspace), ['standalone-project']);
});

test('project-selection instructions auto-select one valid workspace project without weakening isolation', () => {
  const skill = fs.readFileSync(path.join(SKILL_ROOT, 'SKILL.md'), 'utf8');
  assert.match(skill, /exactly one valid project, select its real path and continue without asking/);
  assert.match(skill, /If it yields more than one, present the valid candidates and ask the user to select one/);
  assert.match(skill, /Do not search upward, inspect siblings outside that root, follow symlinked directories/);
  assert.match(skill, /Prune a subtree only when its directory name exactly matches/);
  assert.match(skill, /A similar name without that exact marker is not enough to hide a legitimate project or candidate error/);
  assert.match(skill, /explicit selection or the single-valid-project rule must resolve it/);

  const english = fs.readFileSync(path.join(SKILL_ROOT, 'README.md'), 'utf8');
  const chinese = fs.readFileSync(path.join(SKILL_ROOT, 'README.zh-CN.md'), 'utf8');
  assert.match(english, /contains one valid project, Project\nManager uses it automatically/);
  assert.match(chinese, /只有一个有效项目，Project Manager 会自动使用它/);
});

test('workspace initialization rolls back every exposure and preserves explicit recovery on rollback failure', () => {
  const skillRoot = fs.realpathSync(SKILL_ROOT);
  for (let exposure = 1; exposure <= 5; exposure += 1) {
    const workspace = fs.realpathSync(temp()); const before = treeState(workspace);
    assert.throws(() => initializeWorkspaceProject(workspace, 'rollback-project', initPayload('ROLLBACK-PROJECT'), {
      skillRoot, generatedAt: '2026-08-15T12:00:00Z', injectFailureAfterExposure: exposure,
    }), new RegExp(`Injected failure after exposure ${exposure}`));
    assert.deepEqual(treeState(workspace), before, `exposure ${exposure}`);
  }

  const emptyWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(emptyWorkspace, '.projects')); fs.mkdirSync(path.join(emptyWorkspace, '.projects', 'empty-project'), { mode: 0o711 });
  const emptyBefore = treeState(emptyWorkspace);
  assert.throws(() => initializeWorkspaceProject(emptyWorkspace, 'empty-project', initPayload('EMPTY-PROJECT'), {
    skillRoot, generatedAt: '2026-08-15T12:00:00Z', injectFailureAfterExposure: 5,
  }), /Injected failure/);
  assert.deepEqual(treeState(emptyWorkspace), emptyBefore);

  const existingWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(existingWorkspace, '.projects')); fs.writeFileSync(path.join(existingWorkspace, '.projects', '.env.local'), 'OTHER=keep\nPROJECT_MANAGER_SKILL_PATH=/old/path\n', { mode: 0o640 });
  fs.writeFileSync(path.join(existingWorkspace, '.projects', '.gitignore'), 'reports/\n', { mode: 0o640 }); const existingBefore = treeState(existingWorkspace);
  assert.throws(() => initializeWorkspaceProject(existingWorkspace, 'existing-project', initPayload('EXISTING-PROJECT'), {
    skillRoot, generatedAt: '2026-08-15T12:00:00Z', injectFailureAfterExposure: 2,
  }), /Injected failure/);
  assert.deepEqual(treeState(existingWorkspace), existingBefore);

  const recoveryWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(recoveryWorkspace, '.projects')); fs.writeFileSync(path.join(recoveryWorkspace, '.projects', '.env.local'), 'OTHER=keep\n');
  let recoveryError;
  try {
    initializeWorkspaceProject(recoveryWorkspace, 'recovery-project', initPayload('RECOVERY-PROJECT'), {
      skillRoot, generatedAt: '2026-08-15T12:00:00Z', injectFailureAfterExposure: 1, injectRollbackFailure: true,
    });
  } catch (error) { recoveryError = error; }
  assert.equal(recoveryError.code, 'ROLLBACK_FAILED'); assert.equal(fs.existsSync(recoveryError.recoveryPath), true); assert.match(recoveryError.message, /recovery preserved/);
});

test('workspace initialization refuses unsafe targets and preserves concurrent external changes', () => {
  const skillRoot = fs.realpathSync(SKILL_ROOT);
  const symlinkWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(symlinkWorkspace, '.projects')); const outside = path.join(temp(), 'outside'); fs.writeFileSync(outside, 'secret\n');
  fs.symlinkSync(outside, path.join(symlinkWorkspace, '.projects', '.env.local'));
  assert.throws(() => initializeWorkspaceProject(symlinkWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), { skillRoot }), (error) => error.code === 'SYMLINK_TARGET');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'secret\n');

  const specialWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(specialWorkspace, '.projects')); fs.mkdirSync(path.join(specialWorkspace, '.projects', 'studio.sh'));
  assert.throws(() => initializeWorkspaceProject(specialWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), { skillRoot }), (error) => error.code === 'UNSUPPORTED_TARGET');
  const conflictWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(conflictWorkspace, '.projects')); fs.writeFileSync(path.join(conflictWorkspace, '.projects', 'studio.cmd'), 'operator launcher\n'); const conflictBefore = treeState(conflictWorkspace);
  assert.throws(() => initializeWorkspaceProject(conflictWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), { skillRoot }), (error) => error.code === 'LAUNCHER_CONFLICT');
  assert.deepEqual(treeState(conflictWorkspace), conflictBefore);

  const duplicateWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(duplicateWorkspace, '.projects')); fs.writeFileSync(path.join(duplicateWorkspace, '.projects', '.env.local'), 'PROJECT_MANAGER_SKILL_PATH=/one\nPROJECT_MANAGER_SKILL_PATH=/two\n'); const duplicateBefore = treeState(duplicateWorkspace);
  assert.throws(() => initializeWorkspaceProject(duplicateWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), { skillRoot }), (error) => error.code === 'DUPLICATE_ENV_KEY');
  assert.deepEqual(treeState(duplicateWorkspace), duplicateBefore);

  const linkedRootWorkspace = fs.realpathSync(temp()); const linkedOutside = fs.realpathSync(temp()); fs.symlinkSync(linkedOutside, path.join(linkedRootWorkspace, '.projects'));
  assert.throws(() => initializeWorkspaceProject(linkedRootWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), { skillRoot }), (error) => error.code === 'SYMLINK_TARGET');

  const concurrentWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(concurrentWorkspace, '.projects'));
  const externalLauncher = path.join(concurrentWorkspace, '.projects', 'studio.sh');
  assert.throws(() => initializeWorkspaceProject(concurrentWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), {
    skillRoot, generatedAt: '2026-08-15T12:00:00Z',
    beforeExposure(index) { if (index === 2) fs.writeFileSync(externalLauncher, 'external concurrent change\n'); },
  }), (error) => error.code === 'TARGET_CHANGED');
  assert.equal(fs.readFileSync(externalLauncher, 'utf8'), 'external concurrent change\n');
  assert.deepEqual(fs.readdirSync(path.join(concurrentWorkspace, '.projects')), ['studio.sh']);

  const exposedWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(exposedWorkspace, '.projects')); const exposedEnv = path.join(exposedWorkspace, '.projects', '.env.local'); const originalEnv = 'OTHER=original\nPROJECT_MANAGER_SKILL_PATH=/old/path\n';
  fs.writeFileSync(exposedEnv, originalEnv); let exposedError;
  try {
    initializeWorkspaceProject(exposedWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), {
      skillRoot, generatedAt: '2026-08-15T12:00:00Z',
      beforeExposure(index) { if (index === 1) { fs.writeFileSync(exposedEnv, 'EXTERNAL=must-survive\n'); throw new Error('Injected later failure'); } },
    });
  } catch (error) { exposedError = error; }
  assert.equal(exposedError.code, 'ROLLBACK_FAILED'); assert.equal(fs.readFileSync(exposedEnv, 'utf8'), 'EXTERNAL=must-survive\n'); assert.equal(fs.existsSync(exposedError.recoveryPath), true);
  const recoveryFiles = treeState(exposedError.recoveryPath).filter((entry) => entry.type === 'file');
  assert.equal(recoveryFiles.some((entry) => entry.path.endsWith(path.join('backups', 'env')) && Buffer.from(entry.value, 'base64').toString() === originalEnv), true);

  const backupWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(backupWorkspace, '.projects')); const backupEnv = path.join(backupWorkspace, '.projects', '.env.local'); fs.writeFileSync(backupEnv, originalEnv); let backupError;
  try {
    initializeWorkspaceProject(backupWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), {
      skillRoot, generatedAt: '2026-08-15T12:00:00Z', afterTargetMove(index, target, backup) { if (index === 0) fs.writeFileSync(backup, 'EXTERNAL=changed-backup\n'); },
    });
  } catch (error) { backupError = error; }
  assert.equal(backupError.code, 'ROLLBACK_FAILED'); assert.equal(fs.existsSync(backupEnv), false); assert.equal(fs.existsSync(backupError.recoveryPath), true);
  assert.equal(treeState(backupError.recoveryPath).some((entry) => entry.type === 'file' && entry.path.endsWith(path.join('backups', 'env')) && Buffer.from(entry.value, 'base64').toString() === 'EXTERNAL=changed-backup\n'), true);

  for (const occupiedKind of ['file', 'symlink']) {
    const occupiedWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(occupiedWorkspace, '.projects')); const occupiedEnv = path.join(occupiedWorkspace, '.projects', '.env.local'); fs.writeFileSync(occupiedEnv, originalEnv); const outsideTarget = path.join(temp(), `outside-${occupiedKind}`); fs.writeFileSync(outsideTarget, 'outside remains\n'); let occupiedError;
    try {
      initializeWorkspaceProject(occupiedWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), {
        skillRoot, generatedAt: '2026-08-15T12:00:00Z',
        afterTargetMove(index, target) { if (index === 0) { if (occupiedKind === 'file') fs.writeFileSync(target, 'EXTERNAL=occupied-target\n'); else fs.symlinkSync(outsideTarget, target); } },
      });
    } catch (error) { occupiedError = error; }
    assert.equal(occupiedError.code, 'ROLLBACK_FAILED', occupiedKind); assert.equal(fs.existsSync(occupiedError.recoveryPath), true, occupiedKind);
    if (occupiedKind === 'file') assert.equal(fs.readFileSync(occupiedEnv, 'utf8'), 'EXTERNAL=occupied-target\n');
    else { assert.equal(fs.lstatSync(occupiedEnv).isSymbolicLink(), true); assert.equal(fs.readlinkSync(occupiedEnv), outsideTarget); assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'outside remains\n'); }
    const occupiedRecovery = treeState(occupiedError.recoveryPath).filter((entry) => entry.type === 'file');
    assert.equal(occupiedRecovery.some((entry) => entry.path.endsWith(path.join('backups', 'env')) && Buffer.from(entry.value, 'base64').toString() === originalEnv), true, occupiedKind);
  }

  const parentWorkspace = fs.realpathSync(temp()); let parentError;
  try {
    initializeWorkspaceProject(parentWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), {
      skillRoot, generatedAt: '2026-08-15T12:00:00Z',
      beforeExposure(index) { if (index === 1) { fs.writeFileSync(path.join(parentWorkspace, '.projects', 'external.txt'), 'preserve me\n'); throw new Error('Injected parent change'); } },
    });
  } catch (error) { parentError = error; }
  assert.equal(parentError.code, 'ROLLBACK_FAILED'); assert.equal(fs.readFileSync(path.join(parentWorkspace, '.projects', 'external.txt'), 'utf8'), 'preserve me\n'); assert.equal(fs.existsSync(parentError.recoveryPath), true);

  const danglingParentWorkspace = fs.realpathSync(temp()); const missingParentTarget = path.join(temp(), 'missing-projects-target'); let danglingParentError;
  try {
    initializeWorkspaceProject(danglingParentWorkspace, 'safe-project', initPayload('SAFE-PROJECT'), {
      skillRoot, generatedAt: '2026-08-15T12:00:00Z',
      beforeExposure(index) { if (index === 0) { fs.rmdirSync(path.join(danglingParentWorkspace, '.projects')); fs.symlinkSync(missingParentTarget, path.join(danglingParentWorkspace, '.projects')); } },
    });
  } catch (error) { danglingParentError = error; }
  assert.equal(danglingParentError.code, 'ROLLBACK_FAILED'); assert.equal(fs.lstatSync(path.join(danglingParentWorkspace, '.projects')).isSymbolicLink(), true); assert.equal(fs.readlinkSync(path.join(danglingParentWorkspace, '.projects')), missingParentTarget); assert.equal(fs.existsSync(danglingParentError.recoveryPath), true);
});

test('workspace initialization reports committed cleanup failure with recoverable local backups', () => {
  const workspace = fs.realpathSync(temp()); const skillRoot = fs.realpathSync(SKILL_ROOT); fs.mkdirSync(path.join(workspace, '.projects'));
  const originalEnv = 'LOCAL_SECRET=preserve\nPROJECT_MANAGER_SKILL_PATH=/old/path\n'; fs.writeFileSync(path.join(workspace, '.projects', '.env.local'), originalEnv);
  let cleanupError;
  try {
    initializeWorkspaceProject(workspace, 'cleanup-project', initPayload('CLEANUP-PROJECT'), { skillRoot, generatedAt: '2026-08-15T12:00:00Z', injectCleanupFailure: true });
  } catch (error) { cleanupError = error; }
  assert.equal(cleanupError.code, 'COMMITTED_CLEANUP_FAILED'); assert.equal(cleanupError.committed, true); assert.equal(loadProject(path.join(workspace, '.projects', 'cleanup-project')).status_stale, false);
  assert.equal(fs.existsSync(cleanupError.recoveryPath), true); const recoveryFiles = treeState(cleanupError.recoveryPath).filter((entry) => entry.type === 'file');
  assert.equal(recoveryFiles.some((entry) => entry.path.endsWith(path.join('backups', 'env')) && Buffer.from(entry.value, 'base64').toString() === originalEnv), true);
});

test('workspace initialization CLI enforces exact arguments, payload framing, and envelopes', () => {
  const script = path.join(SCRIPT_ROOT, 'project-init-workspace.js'); const payload = JSON.stringify(initPayload('CLI-PROJECT'));
  function cli(args, input = payload, env = process.env) { return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', input, env }); }
  for (const result of [
    cli([]), cli(['relative', 'safe-project', '--json']), cli([fs.realpathSync(temp()), 'Unsafe_Slug', '--json']),
    cli([fs.realpathSync(temp()), 'safe-project', '--json', '--json']), cli([fs.realpathSync(temp()), 'safe-project', '--unknown']),
    cli([fs.realpathSync(temp()), 'safe-project', '--json'], ''), cli([fs.realpathSync(temp()), 'safe-project', '--json'], '{'),
    cli([fs.realpathSync(temp()), 'safe-project', '--json'], `${payload} trailing`),
    cli([fs.realpathSync(temp()), 'safe-project', '--json'], JSON.stringify({ project_md: initPayload().project_md })),
    cli([fs.realpathSync(temp()), 'safe-project', '--json'], JSON.stringify({ ...initPayload(), status_md: 'forged' })),
    cli([fs.realpathSync(temp()), 'safe-project', '--json'], 'x'.repeat(MAX_PAYLOAD_BYTES + 1)),
  ]) {
    assert.equal(result.status, 2); const envelope = JSON.parse(result.stderr); assert.equal(envelope.ok, false); assert.equal(envelope.command, 'init-workspace'); assert.equal(Array.isArray(envelope.errors), true);
  }
  const workspace = fs.realpathSync(temp()); const success = cli([workspace, 'cli-project', '--json']);
  assert.equal(success.status, 0); const envelope = JSON.parse(success.stdout); assert.equal(envelope.ok, true); assert.equal(envelope.command, 'init-workspace'); assert.equal(envelope.project.id, 'CLI-PROJECT');
  assert.equal(loadProject(envelope.project.root).status_stale, false); assert.equal(fs.readFileSync(path.join(envelope.project.root, 'STATUS.md'), 'utf8').includes('PENDING'), false);
  const conflictWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(conflictWorkspace, '.projects')); fs.writeFileSync(path.join(conflictWorkspace, '.projects', 'studio.sh'), 'operator-owned\n'); const conflict = cli([conflictWorkspace, 'cli-project', '--json']);
  assert.equal(conflict.status, 1); assert.equal(JSON.parse(conflict.stderr).errors[0].code, 'LAUNCHER_CONFLICT');
  assert.throws(() => initializeWorkspaceProject(fs.realpathSync(temp()), 'large-project', { project_md: 'x'.repeat(MAX_PAYLOAD_BYTES), tasks_md: 'y' }, { skillRoot: fs.realpathSync(SKILL_ROOT) }), (error) => error.code === 'PAYLOAD_TOO_LARGE');

  const cleanupWorkspace = fs.realpathSync(temp()); fs.mkdirSync(path.join(cleanupWorkspace, '.projects')); fs.writeFileSync(path.join(cleanupWorkspace, '.projects', '.env.local'), 'LOCAL_SECRET=keep\nPROJECT_MANAGER_SKILL_PATH=/old/path\n');
  const preloadRoot = path.join(temp(), 'preload fixture with spaces'); fs.mkdirSync(preloadRoot); const preload = path.join(preloadRoot, 'fail-cleanup.cjs');
  fs.writeFileSync(preload, `/** Test fixture: fail only deletion of the committed env backup. */\n'use strict';\nconst fs = require('node:fs');\nconst original = fs.rmSync;\nfs.rmSync = function(target, options) { if (String(target).endsWith(require('node:path').join('backups', 'env'))) throw new Error('Injected process cleanup failure'); return original.call(this, target, options); };\n`);
  const cleanup = cli([cleanupWorkspace, 'cleanup-project', '--json'], payload, { ...process.env, NODE_OPTIONS: `--require=${JSON.stringify(preload)}` });
  assert.equal(cleanup.status, 1); const cleanupEnvelope = JSON.parse(cleanup.stderr); assert.equal(cleanupEnvelope.errors[0].code, 'COMMITTED_CLEANUP_FAILED');
  assert.deepEqual(cleanupEnvelope.project, { id: 'CLI-PROJECT', root: path.join(cleanupWorkspace, '.projects', 'cleanup-project') });
  assert.deepEqual(cleanupEnvelope.data, { committed: true, recovery_path: cleanupEnvelope.data.recovery_path }); assert.equal(fs.existsSync(cleanupEnvelope.data.recovery_path), true);
  assert.equal(loadProject(cleanupEnvelope.project.root).status_stale, false);
});

test('atomic project mutation restores exact prior bytes after validation and replacement failures', () => {
  const base = temp(); const root = createProject(base, 'ROLLBACK', []); const absolute = fs.realpathSync(root); regenerateStatus(absolute, '2026-08-08T00:00:00Z');
  atomicProjectMutation(absolute, (candidate) => {
    fs.writeFileSync(path.join(candidate, 'TASKS.md'), collection([task('TASK-NEW', 'New', 'New outcome.', ['New accepted.'])]));
    regenerateStatus(candidate, '2026-08-08T00:00:01Z');
  }, loadProject, { validateLive: loadProject });
  assert.equal(loadProject(root).tasks[0].id, 'TASK-NEW'); assert.equal(loadProject(root).status_stale, false);
  const before = treeHash(root);
  assert.throws(() => atomicProjectMutation(absolute, (candidate) => fs.writeFileSync(path.join(candidate, 'TASKS.md'), collection([])), loadProject), /regenerate STATUS/);
  assert.equal(treeHash(root), before);
  assert.throws(() => atomicProjectMutation(absolute, (candidate) => fs.writeFileSync(path.join(candidate, 'PROJECT.md'), 'invalid'), loadProject));
  assert.equal(treeHash(root), before);
  assert.throws(() => atomicProjectMutation(absolute, (candidate) => regenerateStatus(candidate, '2026-08-08T00:00:01Z'), loadProject, { injectFailureAfterReplace: true }));
  assert.equal(treeHash(root), before);
  const empty = path.join(base, 'empty'); fs.mkdirSync(empty);
  assert.throws(() => atomicProjectMutation(empty, () => { throw new Error('init failed'); }, () => {}, { init: true }));
  assert.equal(fs.existsSync(empty) && fs.readdirSync(empty).length === 0, true);
});

test('atomic mutation protects immutable history and preserves recovery bytes when rollback fails', () => {
  const base = temp(); const root = createProject(base, 'IMMUTABLE', []); createProject(base, 'SIBLING', []); const absolute = fs.realpathSync(root);
  const history = path.join(root, 'reports', 'history'); fs.mkdirSync(history, { recursive: true }); fs.writeFileSync(path.join(history, 'report.md'), 'immutable report\n');
  const oldAttempt = path.join(root, 'handoffs', 'TASK-OLD', `tc-${'a'.repeat(64)}`); fs.mkdirSync(oldAttempt, { recursive: true }); fs.writeFileSync(path.join(oldAttempt, 'TASK-CONTRACT.md'), 'immutable contract\n');
  regenerateStatus(absolute, '2026-08-08T00:00:00Z'); const before = treeHash(root);
  assert.throws(() => atomicProjectMutation(absolute, (candidate, context) => {
    fs.writeFileSync(path.join(candidate, 'reports', 'history', 'report.md'), 'rewritten\n'); regenerateStatus(candidate, '2026-08-08T00:00:01Z', context);
  }, loadProject), /Immutable project history changed/);
  assert.equal(treeHash(root), before);
  assert.throws(() => atomicProjectMutation(absolute, (candidate, context) => {
    fs.writeFileSync(path.join(candidate, path.relative(root, oldAttempt), 'extra.md'), 'misleading history\n'); regenerateStatus(candidate, '2026-08-08T00:00:01Z', context);
  }, loadProject), /inactive or terminal/);
  assert.equal(treeHash(root), before);
  let recoveryError;
  try {
    atomicProjectMutation(absolute, (candidate, context) => regenerateStatus(candidate, '2026-08-08T00:00:02Z', context), loadProject, { injectFailureAfterReplace: true, injectRollbackFailure: true });
  } catch (error) { recoveryError = error; }
  assert.match(recoveryError.message, /recovery preserved/); assert.equal(fs.existsSync(recoveryError.recoveryPath), true); assert.equal(fs.existsSync(root), false);
  assert.deepEqual(loadProjectsRoot(base).projects.map((item) => item.id), ['SIBLING'], 'an interrupted recovery tree does not poison catalog restart');
  const transactionRoot = path.dirname(recoveryError.recoveryPath); fs.renameSync(recoveryError.recoveryPath, root); cleanupProjectWork(transactionRoot);
  assert.equal(treeHash(root), before);
});

test('isolated work roots cannot alias a project and clean independently', () => {
  const base = temp(); const source = createProject(base, 'WORKNAME', []); const root = path.join(base, `.project-manager-work-${'e'.repeat(24)}`); fs.renameSync(source, root);
  assert.deepEqual(loadProjectsRoot(base).projects.map((item) => item.id), ['WORKNAME'], 'a valid exact-pattern project wins over recovery-root recognition');
  atomicProjectMutation(fs.realpathSync(root), (candidate, context) => regenerateStatus(candidate, '2026-08-08T00:00:01Z', context), loadProject);
  assert.equal(loadProject(root).project.id, 'WORKNAME');
  const first = createProjectWork(base, 'first-', root); const second = createProjectWork(base, 'second-', root); const secondArea = path.dirname(second);
  cleanupProjectWork(first); assert.equal(fs.existsSync(secondArea), true, 'one cleanup cannot remove another operation work root');
  cleanupProjectWork(second);
  assert.deepEqual(fs.readdirSync(base).filter((name) => /^\.project-manager-work-[a-f0-9]{24}$/.test(name)), [path.basename(root)], 'only the legitimate exact-pattern project remains');
});

const AREAS = ['integration', 'scope', 'schedule', 'cost', 'quality', 'resource', 'communications', 'risk', 'procurement', 'stakeholder'];

function tailoring(overrides = {}) {
  return Object.fromEntries(AREAS.map((area) => [area, { applied: true, rationale: null, decided: '2026-08-11', ...(overrides[area] ?? {}) }]));
}

function v2Project(base, id, records = [], tailoringOverrides = {}, projectOverrides = {}) {
  return createProject(base, id, records, { schema_version: 2, tailoring: tailoring(tailoringOverrides), ...projectOverrides });
}

function writeModule(root, name, records, schemaVersion = 1) {
  fs.writeFileSync(path.join(root, name), collection(records, schemaVersion));
}

function loadError(root) {
  try { loadProject(root); return null; } catch (error) { return error; }
}

test('PROJECT v2 tailoring is declare-only, exact, and fails closed on an incomplete or dishonest declaration', () => {
  const base = temp();
  const ok = v2Project(base, 'TAILORED', [], { cost: { applied: false, rationale: 'No budget; effort absorbed by standing team.' } });
  const state = loadProject(ok);
  assert.equal(state.project.tailoring.integration.applied, true);
  const summary = statusData(state).tailoring;
  assert.equal(summary.declared, true);
  assert.deepEqual(summary.tailored_out, [{ area: 'cost', rationale: 'No budget; effort absorbed by standing team.', decided: '2026-08-11' }]);
  assert.equal(summary.applied.includes('cost'), false);
  assert.equal(reportData(state).unknowns.some((item) => item.field === 'tailoring.cost' && /No budget/.test(item.reason)), true);

  // Declaring an area out without a reason is the exact failure tailoring exists to prevent.
  const noRationale = v2Project(base, 'NORATIONALE', [], { cost: { applied: false, rationale: null } });
  assert.match(loadError(noRationale).message, /tailored out and requires a rationale/);
  const emptyRationale = v2Project(base, 'EMPTYRATIONALE', [], { cost: { applied: false, rationale: '   ' } });
  assert.match(loadError(emptyRationale).message, /rationale/);

  const missingArea = createProject(base, 'MISSINGAREA', [], { schema_version: 2, tailoring: (() => { const value = tailoring(); delete value.procurement; return value; })() });
  assert.match(loadError(missingArea).message, /tailoring has unknown fields|must declare knowledge area procurement/);
  const unknownArea = createProject(base, 'UNKNOWNAREA', [], { schema_version: 2, tailoring: { ...tailoring(), governance: { applied: true, rationale: null, decided: '2026-08-11' } } });
  assert.match(loadError(unknownArea).message, /unknown fields: governance/);
  const badApplied = v2Project(base, 'BADAPPLIED', [], { scope: { applied: 'yes' } });
  assert.match(loadError(badApplied).message, /applied must be boolean/);
  const badDecided = v2Project(base, 'BADDECIDED', [], { scope: { decided: '2026-02-30' } });
  assert.match(loadError(badDecided).message, /decided must be a date-only value/);
  const badEntry = createProject(base, 'BADENTRY', [], { schema_version: 2, tailoring: { ...tailoring(), scope: { applied: true } } });
  assert.match(loadError(badEntry).message, /tailoring scope fields|tailoring scope has unknown|missing/i);
});

test('PROJECT v1 keeps its exact field set, rejects tailoring, and needs no migration', () => {
  const base = temp();
  const legacy = createProject(base, 'LEGACY', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  const state = loadProject(legacy);
  assert.equal(state.project.schema_version, 1);
  assert.equal(Object.hasOwn(state.project, 'tailoring'), false);
  assert.deepEqual(statusData(state).tailoring, { declared: false });
  assert.equal(reportData(state).unknowns.some((item) => item.field === 'tailoring' && /undeclared/.test(item.reason)), true);
  const smuggled = createProject(base, 'SMUGGLED', [], { tailoring: tailoring() });
  assert.match(loadError(smuggled).message, /unknown fields: tailoring/);
  assert.equal(loadError(createProject(base, 'BADVERSION', [], { schema_version: 3 })).code, 'SCHEMA_VERSION');
});

test('installing PMI modules cannot stale an existing STATUS cache', () => {
  const base = temp();
  const root = createProject(base, 'HASHSTABLE', [task('TASK-A', 'A', 'Done.', ['Accepted.'], { success_criteria: ['SC-OUTCOME'] })]);
  writeModule(root, 'RISKS.md', [{ id: 'RISK-ONE', title: 'Slip', data: { status: 'open', probability: 'high', impact: 'high', mitigation: 'Add buffer.', owner: 'Ana', milestone: null } }]);
  const before = loadProject(root).source_sha256;
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  assert.equal(loadProject(root).status_stale, false);
  // Adding an unconfigured-module capability must not perturb the hash of a project that uses none of them.
  assert.equal(loadProject(root).source_sha256, before);
  writeModule(root, 'ISSUES.md', [{ id: 'ISS-ONE', title: 'Late vendor', data: { status: 'open', severity: 'high', description: 'Vendor is late.', owner: 'Ana', raised_date: '2026-08-10', due_date: null, resolved_date: null, resolution: null, affects: ['task:TASK-A'], escalated: false } }]);
  assert.notEqual(loadProject(root).source_sha256, before, 'configuring a module is a real state change');
  assert.equal(loadProject(root).status_stale, true);
});

test('new PMI modules are optional, exact, and fail closed on schema and reference errors', () => {
  const base = temp();
  const bare = createProject(base, 'BARE', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  const bareStatus = statusData(loadProject(bare));
  for (const key of ['assumptions', 'issues', 'stakeholders', 'lessons', 'closure']) {
    assert.deepEqual(bareStatus[key], { configured: false }, `${key} must be unconfigured, not zero`);
    assert.deepEqual(reportData(loadProject(bare))[key], { configured: false });
  }

  const root = createProject(base, 'MODULES', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(root, 'ASSUMPTIONS.md', [{ id: 'ASM-ONE', title: 'Vendor capacity', data: { status: 'open', kind: 'assumption', statement: 'The vendor has capacity.', impact_if_false: 'Delivery slips a month.', owner: 'Ana', due_date: '2026-09-01', validated_date: null, affects: ['task:TASK-A'] } }]);
  writeModule(root, 'ISSUES.md', [{ id: 'ISS-ONE', title: 'Late vendor', data: { status: 'resolved', severity: 'high', description: 'Vendor missed the date.', owner: 'Ana', raised_date: '2026-08-01', due_date: null, resolved_date: '2026-08-05', resolution: 'Vendor rescheduled and confirmed.', affects: ['task:TASK-A'], escalated: true } }]);
  writeModule(root, 'STAKEHOLDERS.md', [{ id: 'STK-ONE', title: 'Finance director', data: { role: 'Approver', organization: 'Finance', interest: 'high', influence: 'high', current_engagement: 'neutral', target_engagement: 'supportive', strategy: 'Weekly briefing on cost exposure.', owner: 'Ana' } }]);
  writeModule(root, 'LESSONS.md', [{ id: 'LES-ONE', title: 'Estimate earlier', data: { category: 'estimation', statement: 'Vendor lead time was underestimated.', recommendation: 'Confirm lead times before committing dates.', date: '2026-08-06', source_tasks: ['TASK-A'], source_milestone: null } }]);
  writeModule(root, 'CLOSURE.md', [{ id: 'CLO-PROJECT', title: 'Project closure', data: { scope: 'project', milestone: null, status: 'pending', accepted_by: null, accepted_date: null, acceptance_evidence: [], outstanding_items: ['Archive vendor correspondence.'], archive_ref: null } }]);
  const state = loadProject(root);
  const status = statusData(state);
  assert.deepEqual(status.assumptions, { configured: true, total: 1, open: 1, invalidated: 0 });
  assert.deepEqual(status.issues, { configured: true, total: 1, open: 0, critical: 0, escalated: 0 });
  assert.deepEqual(status.stakeholders, { configured: true, total: 1, engagement_gaps: 1 });
  assert.deepEqual(status.lessons, { configured: true, total: 1 });
  assert.deepEqual(status.closure, { configured: true, total: 1, accepted: 0, pending: 1 });
  assert.deepEqual(validateData(state).counts.assumptions, 1);

  const bad = (name, records) => { const target = createProject(base, `BAD${name.replace(/\W/g, '').toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`, [task('TASK-A', 'A', 'Done.', ['Accepted.'])]); writeModule(target, name, records); return loadError(target); };
  assert.match(bad('ASSUMPTIONS.md', [{ id: 'ASM-ONE', title: 'X', data: { status: 'open', kind: 'assumption', statement: 'S.', impact_if_false: 'I.', owner: null, due_date: null, validated_date: '2026-08-01', affects: [] } }]).message, /validated_date exactly when it is no longer open/);
  assert.match(bad('ASSUMPTIONS.md', [{ id: 'ASSUME-ONE', title: 'X', data: { status: 'open', kind: 'assumption', statement: 'S.', impact_if_false: 'I.', owner: null, due_date: null, validated_date: null, affects: [] } }]).message, /Invalid assumption ID/);
  assert.match(bad('ASSUMPTIONS.md', [{ id: 'ASM-ONE', title: 'X', data: { status: 'open', kind: 'assumption', statement: 'S.', impact_if_false: 'I.', owner: null, due_date: null, validated_date: null, affects: ['task:TASK-GHOST'] } }]).message, /unknown reference task:TASK-GHOST/);
  assert.match(bad('ISSUES.md', [{ id: 'ISS-ONE', title: 'X', data: { status: 'closed', severity: 'low', description: 'D.', owner: null, raised_date: '2026-08-01', due_date: null, resolved_date: null, resolution: null, affects: [], escalated: false } }]).message, /resolution and resolved_date exactly when resolved or closed/);
  assert.match(bad('ISSUES.md', [{ id: 'ISS-ONE', title: 'X', data: { status: 'resolved', severity: 'low', description: 'D.', owner: null, raised_date: '2026-08-10', due_date: null, resolved_date: '2026-08-01', resolution: 'R.', affects: [], escalated: false } }]).message, /cannot be resolved before it was raised/);
  assert.match(bad('STAKEHOLDERS.md', [{ id: 'STK-ONE', title: 'X', data: { role: 'Approver', organization: null, interest: 'high', influence: 'high', current_engagement: 'neutral', target_engagement: 'supportive', strategy: null, owner: null } }]).message, /declares an engagement gap and requires a strategy/);
  assert.match(bad('STAKEHOLDERS.md', [{ id: 'STK-ONE', title: 'X', data: { role: 'Approver', organization: null, interest: 'high', influence: 'high', current_engagement: 'devoted', target_engagement: 'supportive', strategy: 'S.', owner: null } }]).message, /engagement levels are invalid/);
  assert.match(bad('LESSONS.md', [{ id: 'LES-ONE', title: 'X', data: { category: 'estimation', statement: 'S.', recommendation: 'R.', date: '2026-08-06', source_tasks: ['TASK-GHOST'], source_milestone: null } }]).message, /unknown source task/);
  assert.match(bad('LESSONS.md', [{ id: 'LES-ONE', title: 'X', data: { category: 'vibes', statement: 'S.', recommendation: 'R.', date: '2026-08-06', source_tasks: [], source_milestone: null } }]).message, /invalid category/);
  assert.match(bad('ISSUES.md', [{ id: 'ISS-ONE', title: 'X', data: { status: 'open', severity: 'low', description: 'D.', owner: null, raised_date: '2026-08-01', due_date: null, resolved_date: null, resolution: null, affects: [], escalated: false, notes: 'extra' } }]).message, /unknown fields: notes/);
});

test('RISKS v2 constrains response strategy to risk direction while v1 stays exact', () => {
  const base = temp();
  const root = createProject(base, 'RISKV2', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(root, 'RISKS.md', [
    { id: 'RISK-THREAT', title: 'Vendor slips', data: { status: 'open', probability: 'high', impact: 'high', mitigation: 'Add buffer.', owner: 'Ana', milestone: null, direction: 'threat', strategy: 'mitigate', trigger: 'Vendor misses a weekly checkpoint.', residual: 'medium' } },
    { id: 'RISK-UPSIDE', title: 'Early vendor slot', data: { status: 'open', probability: 'medium', impact: 'medium', mitigation: 'Prepare to pull work forward.', owner: 'Ana', milestone: null, direction: 'opportunity', strategy: 'exploit', trigger: 'Vendor offers an earlier slot.', residual: 'low' } },
  ], 2);
  const risks = loadProject(root).risks.items;
  assert.deepEqual(risks.map((item) => [item.id, item.direction, item.strategy]), [['RISK-THREAT', 'threat', 'mitigate'], ['RISK-UPSIDE', 'opportunity', 'exploit']]);

  const wrongStrategy = createProject(base, 'WRONGSTRAT', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(wrongStrategy, 'RISKS.md', [{ id: 'RISK-UPSIDE', title: 'Upside', data: { status: 'open', probability: 'low', impact: 'low', mitigation: 'M.', owner: null, milestone: null, direction: 'opportunity', strategy: 'mitigate', trigger: null, residual: null } }], 2);
  assert.match(loadError(wrongStrategy).message, /strategy is not valid for a opportunity/);

  const v1Rejects = createProject(base, 'RISKV1', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(v1Rejects, 'RISKS.md', [{ id: 'RISK-ONE', title: 'Slip', data: { status: 'open', probability: 'low', impact: 'low', mitigation: 'M.', owner: null, milestone: null, direction: 'threat', strategy: 'mitigate', trigger: null, residual: null } }], 1);
  assert.match(loadError(v1Rejects).message, /unknown fields: direction, strategy, trigger, residual/);

  const v1Plain = createProject(base, 'RISKV1PLAIN', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(v1Plain, 'RISKS.md', [{ id: 'RISK-ONE', title: 'Slip', data: { status: 'open', probability: 'low', impact: 'low', mitigation: 'M.', owner: null, milestone: null } }], 1);
  assert.deepEqual(Object.keys(loadProject(v1Plain).risks.items[0]).sort(), ['id', 'impact', 'milestone', 'mitigation', 'owner', 'probability', 'status', 'title'], 'v1 normalized risk shape is unchanged');
});

test('a configured module cannot contradict a tailored-out knowledge area', () => {
  const base = temp();
  const riskContradiction = v2Project(base, 'RISKFICTION', [task('TASK-A', 'A', 'Done.', ['Accepted.'])], { risk: { applied: false, rationale: 'Risk is managed in the programme register.' } });
  writeModule(riskContradiction, 'RISKS.md', [{ id: 'RISK-ONE', title: 'Slip', data: { status: 'open', probability: 'low', impact: 'low', mitigation: 'M.', owner: null, milestone: null } }]);
  const riskError = loadError(riskContradiction);
  assert.equal(riskError.code, 'TAILORING_CONTRADICTION');
  assert.match(riskError.message, /risk is declared tailored out but RISKS\.md is configured/);

  const stakeholderContradiction = v2Project(base, 'STKFICTION', [task('TASK-A', 'A', 'Done.', ['Accepted.'])], { stakeholder: { applied: false, rationale: 'Single sponsor, no external parties.' } });
  writeModule(stakeholderContradiction, 'STAKEHOLDERS.md', [{ id: 'STK-ONE', title: 'Sponsor', data: { role: 'Sponsor', organization: null, interest: 'high', influence: 'high', current_engagement: 'supportive', target_engagement: 'supportive', strategy: null, owner: null } }]);
  assert.match(loadError(stakeholderContradiction).message, /stakeholder is declared tailored out but STAKEHOLDERS\.md is configured/);

  // Tailoring out an area you genuinely do not use stays legal.
  const honest = v2Project(base, 'HONEST', [task('TASK-A', 'A', 'Done.', ['Accepted.'])], { risk: { applied: false, rationale: 'Risk is managed in the programme register.' } });
  assert.equal(loadProject(honest).project.id, 'HONEST');
});

test('closure records bind acceptance to real project and milestone completion', () => {
  const base = temp();
  const premature = createProject(base, 'PREMATURE', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(premature, 'CLOSURE.md', [{ id: 'CLO-PROJECT', title: 'Closure', data: { scope: 'project', milestone: null, status: 'accepted', accepted_by: 'Sponsor', accepted_date: '2026-08-11', acceptance_evidence: [{ kind: 'approval', ref: 'sign-off', result: 'accepted', sha256: null }], outstanding_items: [], archive_ref: null } }]);
  assert.match(loadError(premature).message, /accepts a project that is not complete/);

  const noEvidence = createProject(base, 'NOEVIDENCE', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(noEvidence, 'CLOSURE.md', [{ id: 'CLO-PROJECT', title: 'Closure', data: { scope: 'project', milestone: null, status: 'accepted', accepted_by: 'Sponsor', accepted_date: '2026-08-11', acceptance_evidence: [], outstanding_items: [], archive_ref: null } }]);
  assert.match(loadError(noEvidence).message, /acceptance requires accepted_by, accepted_date, and evidence/);

  const pendingWithEvidence = createProject(base, 'PENDINGEV', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(pendingWithEvidence, 'CLOSURE.md', [{ id: 'CLO-PROJECT', title: 'Closure', data: { scope: 'project', milestone: null, status: 'pending', accepted_by: 'Sponsor', accepted_date: null, acceptance_evidence: [], outstanding_items: [], archive_ref: null } }]);
  assert.match(loadError(pendingWithEvidence).message, /pending and cannot bind acceptance evidence/);

  const scopeMismatch = createProject(base, 'SCOPEMISMATCH', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(scopeMismatch, 'CLOSURE.md', [{ id: 'CLO-ONE', title: 'Closure', data: { scope: 'milestone', milestone: null, status: 'pending', accepted_by: null, accepted_date: null, acceptance_evidence: [], outstanding_items: [], archive_ref: null } }]);
  assert.match(loadError(scopeMismatch).message, /must name a milestone exactly when its scope is milestone/);

  const duplicate = createProject(base, 'DUPCLOSURE', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(duplicate, 'CLOSURE.md', [
    { id: 'CLO-ONE', title: 'Closure', data: { scope: 'project', milestone: null, status: 'pending', accepted_by: null, accepted_date: null, acceptance_evidence: [], outstanding_items: [], archive_ref: null } },
    { id: 'CLO-TWO', title: 'Closure again', data: { scope: 'project', milestone: null, status: 'pending', accepted_by: null, accepted_date: null, acceptance_evidence: [], outstanding_items: [], archive_ref: null } },
  ]);
  assert.match(loadError(duplicate).message, /At most one project-scoped closure record/);

  const unknownMilestone = createProject(base, 'GHOSTMS', [task('TASK-A', 'A', 'Done.', ['Accepted.'])]);
  writeModule(unknownMilestone, 'CLOSURE.md', [{ id: 'CLO-ONE', title: 'Closure', data: { scope: 'milestone', milestone: 'M-GHOST', status: 'pending', accepted_by: null, accepted_date: null, acceptance_evidence: [], outstanding_items: [], archive_ref: null } }]);
  assert.match(loadError(unknownMilestone).message, /unknown milestone/);
});

test('the run record is optional and installing it cannot stale an existing STATUS cache', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const records = [
    task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready', blocks: ['TASK-B'] }),
    task('TASK-B', 'Beta', 'B.', ['B accepted.'], { depends_on: ['TASK-A'] }),
  ];
  // A project with no RUNS.md must hash exactly as it did before runs existed,
  // or every existing project's cached STATUS.md goes stale on upgrade.
  const without = createProject(base, 'NORUNS', records);
  const bare = loadProject(without);
  assert.equal(bare.runs.configured, false);
  assert.deepEqual(bare.runs.items, []);

  // Baseline derived by loading this exact fixture with the pre-change module at
  // commit 1f139a1, before RUNS.md existed. Adding an unconfigured module must not
  // move this hash, or every project's cached STATUS.md goes stale on upgrade.
  assert.equal(bare.source_sha256, '567b6942d9898cea095a8ac2ef3bb4fdb9846edabd7b62b423c7125c76f0a5a1');

  const withRuns = createProject(base, 'NORUNS2', records);
  const hashBefore = loadProject(withRuns).source_sha256;
  writeModule(withRuns, 'RUNS.md', [{
    id: 'RUN-A1B2C3D4',
    title: 'First run',
    data: {
      status: 'active', started: '2026-08-18T00:00:00Z', updated: '2026-08-18T01:00:00Z',
      repositories: [{ name: 'app', integration_branch: 'pm/x-a1b2c3d4', base_branch: 'main', base_commit: 'a'.repeat(40), coordinator_worktree: '/tmp/wt/app-integration' }],
      tasks: { 'TASK-A': { branch: 'pm/x-a1b2c3d4-task-a', executor_root: '/tmp/wt/task-a', integrated: false } },
    },
  }]);
  const loaded = loadProject(withRuns);
  assert.equal(loaded.runs.configured, true);
  assert.equal(loaded.runs.items[0].id, 'RUN-A1B2C3D4');
  assert.equal(loaded.runs.items[0].repositories[0].base_branch, 'main');
  assert.equal(loaded.runs.items[0].tasks['TASK-A'].integrated, false);
  assert.notEqual(loaded.source_sha256, hashBefore, 'a configured run record must participate in the hash');
  assert.equal(validateData(loaded).modules.runs, true);
});

test('run records fail closed on schema and cross-record reference errors', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const records = [
    task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready' }),
  ];
  const run = (data, over = {}) => ({
    id: 'RUN-ONE',
    title: 'Run',
    data: {
      status: 'active', started: '2026-08-18T00:00:00Z', updated: '2026-08-18T01:00:00Z',
      repositories: [], tasks: {}, ...data, ...over,
    },
  });
  const check = (name, data, pattern) => {
    const root = createProject(base, name, records);
    writeModule(root, 'RUNS.md', [run(data)]);
    assert.match(loadError(root).message, pattern, name);
  };
  check('BADSTATUS', { status: 'running' }, /status must be one of/);
  check('BADTIME', { started: '2026-08-18' }, /must be RFC3339 UTC/);
  check('BACKWARDS', { started: '2026-08-18T02:00:00Z', updated: '2026-08-18T01:00:00Z' }, /cannot advance before it started/);
  check('BADCOMMIT', { repositories: [{ name: 'app', integration_branch: 'b', base_branch: 'main', base_commit: 'abc', coordinator_worktree: '/tmp/w' }] }, /base_commit must be a full Git object ID/);
  check('RELROOT', { tasks: { 'TASK-A': { branch: 'b', executor_root: 'relative/path', integrated: false } } }, /executor_root must be an absolute path/);
  check('GHOSTTASK', { tasks: { 'TASK-Z': { branch: 'b', executor_root: '/tmp/w', integrated: false } } }, /names unknown task TASK-Z/);
  // A task cannot be claimed as integrated while its own status contradicts that.
  check('LYINGRUN', { tasks: { 'TASK-A': { branch: 'b', executor_root: '/tmp/w', integrated: true } } }, /marks task TASK-A integrated while the task is ready/);

  const twoActive = createProject(base, 'TWORUNS', records);
  writeModule(twoActive, 'RUNS.md', [run({}), { ...run({}), id: 'RUN-TWO' }]);
  assert.match(loadError(twoActive).message, /Only one run may be active at a time/);
});

test('a run opens once, records progress, and resumes from recorded state alone', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = createProject(base, 'RUNLIFE', [
    task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready' }),
    task('TASK-B', 'Beta', 'B.', ['B accepted.'], { status: 'ready' }),
  ]);
  const repositories = [{ name: 'app', integration_branch: 'pm/runlife-a1b2c3d4', base_branch: 'main', base_commit: 'b'.repeat(40), coordinator_worktree: '/tmp/wt/app-integration' }];

  const opened = startRun(root, { run_id: 'RUN-A1B2C3D4', title: 'First run', repositories }, '2026-08-18T00:00:00Z');
  assert.equal(opened.data.run_id, 'RUN-A1B2C3D4');
  assert.equal(opened.data.status, 'active');

  // A second run must not silently fork beside an unfinished one.
  assert.throws(
    () => startRun(root, { run_id: 'RUN-E5F6A7B8', title: 'Second run', repositories }, '2026-08-18T00:10:00Z'),
    (error) => error.code === 'RUN_ACTIVE' && /RUN-A1B2C3D4 is still active/.test(error.message),
  );

  advanceRun(root, { bind_task: { task_id: 'TASK-A', branch: 'pm/runlife-a1b2c3d4-task-a', executor_root: '/tmp/wt/task-a' } }, '2026-08-18T00:20:00Z');
  advanceRun(root, { bind_task: { task_id: 'TASK-B', branch: 'pm/runlife-a1b2c3d4-task-b', executor_root: '/tmp/wt/task-b' } }, '2026-08-18T00:30:00Z');
  assert.throws(
    () => advanceRun(root, { bind_task: { task_id: 'TASK-Z', branch: 'b', executor_root: '/tmp/w' } }, '2026-08-18T00:40:00Z'),
    (error) => error.code === 'RUN_TASK_UNKNOWN',
  );

  const resumed = resumeRun(root);
  assert.equal(resumed.data.resumable, true);
  assert.equal(resumed.data.run.run_id, 'RUN-A1B2C3D4');
  assert.deepEqual(resumed.data.run.repositories, repositories);
  assert.deepEqual(resumed.data.run.integrated_tasks, []);
  assert.deepEqual(resumed.data.run.pending_tasks, ['TASK-A', 'TASK-B']);
  assert.equal(resumed.data.run.tasks['TASK-A'].branch, 'pm/runlife-a1b2c3d4-task-a');

  // Resume must answer from RUNS.md alone — no branch or worktree on disk exists here.
  assert.equal(fs.existsSync('/tmp/wt/task-a'), false);

  const fresh = loadProject(root);
  assert.equal(fresh.runs.items.length, 1);
  assert.equal(fresh.runs.items[0].updated, '2026-08-18T00:30:00Z');
});

test('a run with no active record reports not resumable rather than inventing one', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = createProject(base, 'NORUN', [task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready' })]);
  const resumed = resumeRun(root);
  assert.equal(resumed.data.resumable, false);
  assert.equal(resumed.data.run, null);
  assert.throws(() => advanceRun(root, { status: 'complete' }, '2026-08-18T00:00:00Z'), (error) => error.code === 'RUN_MISSING');
});

test('ready work ranks by longest downstream chain, not immediate fan-out', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  // CHAIN heads a chain of three; LEAVES has more immediate successors, all leaves.
  const root = createProject(base, 'CRITPATH', [
    task('TASK-CHAIN', 'Chain head', 'C.', ['C accepted.'], { status: 'ready', blocks: ['TASK-C1'] }),
    task('TASK-C1', 'Chain 1', 'C1.', ['C1 accepted.'], { depends_on: ['TASK-CHAIN'], blocks: ['TASK-C2'] }),
    task('TASK-C2', 'Chain 2', 'C2.', ['C2 accepted.'], { depends_on: ['TASK-C1'], blocks: ['TASK-C3'] }),
    task('TASK-C3', 'Chain 3', 'C3.', ['C3 accepted.'], { depends_on: ['TASK-C2'] }),
    task('TASK-LEAVES', 'Fan out', 'L.', ['L accepted.'], { status: 'ready', blocks: ['TASK-L1', 'TASK-L2', 'TASK-L3'] }),
    task('TASK-L1', 'Leaf 1', 'L1.', ['L1 accepted.'], { depends_on: ['TASK-LEAVES'] }),
    task('TASK-L2', 'Leaf 2', 'L2.', ['L2 accepted.'], { depends_on: ['TASK-LEAVES'] }),
    task('TASK-L3', 'Leaf 3', 'L3.', ['L3 accepted.'], { depends_on: ['TASK-LEAVES'] }),
  ]);
  const rows = nextData(loadProject(root)).tasks;
  assert.deepEqual(rows.map((row) => row.id), ['TASK-CHAIN', 'TASK-LEAVES']);
  assert.equal(rows[0].depth, 3, 'chain head sees three remaining links');
  assert.equal(rows[1].depth, 1, 'fan-out to leaves is one link deep');
  // Immediate fan-out alone would have ranked LEAVES first.
  assert.ok(rows[1].unlocks > rows[0].unlocks);
});

test('critical-path depth counts a reconverging task once and is deterministic', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  // A DAG, not a tree: both branches reconverge on TASK-JOIN.
  const root = createProject(base, 'DIAMOND', [
    task('TASK-ROOT', 'Root', 'R.', ['R accepted.'], { status: 'ready', blocks: ['TASK-LEFT', 'TASK-RIGHT'] }),
    task('TASK-LEFT', 'Left', 'L.', ['L accepted.'], { depends_on: ['TASK-ROOT'], blocks: ['TASK-JOIN'] }),
    task('TASK-RIGHT', 'Right', 'R2.', ['R2 accepted.'], { depends_on: ['TASK-ROOT'], blocks: ['TASK-JOIN'] }),
    task('TASK-JOIN', 'Join', 'J.', ['J accepted.'], { depends_on: ['TASK-LEFT', 'TASK-RIGHT'], blocks: ['TASK-TAIL'] }),
    task('TASK-TAIL', 'Tail', 'T.', ['T accepted.'], { depends_on: ['TASK-JOIN'] }),
  ]);
  const state = loadProject(root);
  const rows = nextData(state).tasks;
  assert.equal(rows.length, 1);
  // ROOT -> LEFT -> JOIN -> TAIL is four nodes, so three remaining links, not five.
  assert.equal(rows[0].depth, 3);
  assert.deepEqual(nextData(state).tasks, rows, 'ranking is deterministic across calls');
});

test('ranking is unchanged when every ready task has the same downstream depth', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = createProject(base, 'FLATDEPTH', [
    task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready', priority: 'P2' }),
    task('TASK-B', 'Beta', 'B.', ['B accepted.'], { status: 'ready', priority: 'P0' }),
    task('TASK-C', 'Gamma', 'C.', ['C accepted.'], { status: 'ready', priority: 'P1' }),
  ]);
  const rows = nextData(loadProject(root)).tasks;
  assert.ok(rows.every((row) => row.depth === 0));
  // With depth tied, the pre-existing priority tie-break decides, exactly as before.
  assert.deepEqual(rows.map((row) => row.id), ['TASK-B', 'TASK-C', 'TASK-A']);
});

test('execution telemetry is version-gated, additive, and never invents a zero', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const { root, contract } = activeAgentFixture('TELEM');
  const artifact = evidence('artifact', 'build');

  // A stored schema_version 1 manifest must keep validating: readAttempt
  // re-validates every stored manifest on every read.
  const v1 = manifest(contract, 'implemented', 1, [artifact], [], { observed_at: '2026-08-08T00:00:31Z' });
  assert.doesNotThrow(() => validateManifest(v1, contract, []));

  const review = evidence('review', 'cr');
  const v2 = (sequence, status, execution, observedAt) => manifest(
    contract, status, sequence,
    status === 'verified' ? [artifact, review] : [artifact],
    status === 'verified' ? [review] : [],
    { schema_version: 2, execution, observed_at: observedAt },
  );

  // Version 1 must reject the new field; version 2 must require it.
  assert.throws(() => validateManifest({ ...v1, execution: { llm_calls: 1, tool_calls: 1, input_tokens: 1, output_tokens: 1 } }, contract, []), /manifest payload/);
  assert.throws(() => validateManifest({ ...v1, schema_version: 2 }, contract, []), /manifest payload/);
  assert.throws(() => validateManifest({ ...v1, schema_version: 3 }, contract, []), /Unsupported manifest schema version/);

  const bad = (execution) => () => validateManifest(v2(1, 'implemented', execution, '2026-08-08T00:00:31Z'), contract, []);
  assert.throws(bad({ llm_calls: -1, tool_calls: 0, input_tokens: 0, output_tokens: 0 }), /non-negative integer or null/);
  assert.throws(bad({ llm_calls: 1.5, tool_calls: 0, input_tokens: 0, output_tokens: 0 }), /non-negative integer or null/);
  assert.throws(bad({ llm_calls: '4', tool_calls: 0, input_tokens: 0, output_tokens: 0 }), /non-negative integer or null/);
  assert.throws(bad({ llm_calls: 1, tool_calls: 0, input_tokens: 0 }), /manifest execution/);

  // Two manifests, the second reporting no LLM count at all.
  ingestAgentManifest(root, 'TASK-WORK', v2(1, 'implemented', { llm_calls: 10, tool_calls: 40, input_tokens: 1000, output_tokens: 200 }, '2026-08-08T00:00:31Z'));
  ingestAgentManifest(root, 'TASK-WORK', v2(2, 'verified', { llm_calls: null, tool_calls: 5, input_tokens: 300, output_tokens: 50 }, '2026-08-08T00:01:01Z'));

  const telemetry = executionData(loadProject(root));
  assert.equal(telemetry.configured, true);
  const entry = telemetry.tasks.find((item) => item.task_id === 'TASK-WORK');
  assert.equal(entry.attempts, 1);
  // Counts are incremental per manifest, so one summation rule composes.
  assert.deepEqual(entry.metrics.tool_calls, { reported: 45, unreported: 0 });
  assert.deepEqual(entry.metrics.input_tokens, { reported: 1300, unreported: 0 });
  assert.deepEqual(entry.metrics.output_tokens, { reported: 250, unreported: 0 });
  // An omitted count is carried as unreported, never folded in as zero.
  assert.deepEqual(entry.metrics.llm_calls, { reported: 10, unreported: 1 });
  // Elapsed comes from timestamps the skill owns: contract 00:00:01 -> manifest 00:01:01.
  assert.equal(entry.elapsed_seconds, 60);
});

test('telemetry is observational: recorded counts change no decision output', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const { root, contract } = activeAgentFixture('OBSERV');
  const artifact = evidence('artifact', 'build');
  ingestAgentManifest(root, 'TASK-WORK', manifest(contract, 'implemented', 1, [artifact], [], {
    schema_version: 2, execution: { llm_calls: 7, tool_calls: 9, input_tokens: 11, output_tokens: 13 }, observed_at: '2026-08-08T00:00:31Z',
  }));
  const state = loadProject(root);
  const decisions = JSON.stringify({
    next: nextData(state).tasks, status: statusData(state, '2026-08-08'), valid: validateData(state).valid,
    blockers: blockerItems(state),
  });
  const telemetry = executionData(state);
  assert.notEqual(telemetry.tasks.length, 0, 'telemetry was actually recorded');
  // Recompute against a state whose recorded counts differ by orders of magnitude.
  const { root: other, contract: otherContract } = activeAgentFixture('OBSERV2');
  ingestAgentManifest(other, 'TASK-WORK', manifest(otherContract, 'implemented', 1, [artifact], [], {
    schema_version: 2, execution: { llm_calls: 70000, tool_calls: 90000, input_tokens: 110000, output_tokens: 130000 }, observed_at: '2026-08-08T00:00:31Z',
  }));
  const otherState = loadProject(other);
  const otherDecisions = JSON.stringify({
    next: nextData(otherState).tasks, status: statusData(otherState, '2026-08-08'), valid: validateData(otherState).valid,
    blockers: blockerItems(otherState),
  });
  assert.equal(otherDecisions, decisions, 'decision output must not vary with recorded counts');
});

test('a failed run mutation leaves every state file byte-unchanged', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = createProject(base, 'RUNROLL', [task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready' })]);
  const repositories = [{ name: 'app', integration_branch: 'pm/runroll-a1b2c3d4', base_branch: 'main', base_commit: 'c'.repeat(40), coordinator_worktree: '/tmp/wt/app-integration' }];
  startRun(root, { run_id: 'RUN-A1B2C3D4', title: 'Run', repositories }, '2026-08-18T00:00:00Z');
  advanceRun(root, { bind_task: { task_id: 'TASK-A', branch: 'pm/runroll-a1b2c3d4-task-a', executor_root: '/tmp/wt/task-a' } }, '2026-08-18T00:10:00Z');

  // Every rejected mutation must roll the candidate back completely.
  assertNoMutation(root, () => startRun(root, { run_id: 'RUN-E5F6A7B8', title: 'Second', repositories }, '2026-08-18T00:20:00Z'), (error) => error.code === 'RUN_ACTIVE');
  assertNoMutation(root, () => advanceRun(root, { bind_task: { task_id: 'TASK-GHOST', branch: 'b', executor_root: '/tmp/w' } }, '2026-08-18T00:20:00Z'), (error) => error.code === 'RUN_TASK_UNKNOWN');
  assertNoMutation(root, () => advanceRun(root, { bind_task: { task_id: 'TASK-A', branch: 'b', executor_root: '/tmp/w' } }, '2026-08-18T00:20:00Z'), (error) => error.code === 'RUN_TASK_BOUND');
  assertNoMutation(root, () => advanceRun(root, { integrate_task: 'TASK-GHOST' }, '2026-08-18T00:20:00Z'), (error) => error.code === 'RUN_TASK_UNBOUND');
  // The active-run guard fires before payload validation, so a malformed id while a
  // run is open still reports RUN_ACTIVE. Payload validation is checked on a clean project.
  const clean = createProject(base, 'RUNROLL2', [task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready' })]);
  assertNoMutation(clean, () => startRun(clean, { run_id: 'not-a-run-id', title: 'Bad', repositories }, '2026-08-18T00:20:00Z'), (error) => error.code === 'INVALID_INPUT');
  assertNoMutation(clean, () => startRun(clean, { run_id: 'RUN-OK', title: 'Bad', repositories: [] }, '2026-08-18T00:20:00Z'), (error) => error.code === 'INVALID_INPUT');

  // The surviving record is still the one the first two calls wrote.
  const resumed = resumeRun(root);
  assert.equal(resumed.data.run.run_id, 'RUN-A1B2C3D4');
  assert.deepEqual(resumed.data.run.pending_tasks, ['TASK-A']);
});

test('run records and telemetry apply to any project shape, not only multi-task RPD runs', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  // A single-task project with a non-RPD executor provider.
  const solo = createProject(base, 'SOLO', [task('TASK-ONLY', 'Only', 'O.', ['O accepted.'], {
    status: 'ready', executor: { provider: 'external', root: null, scope: null },
  })], { adapters: ['human', 'external'] });
  const soloState = loadProject(solo);
  assert.equal(soloState.runs.configured, false);
  assert.deepEqual(nextData(soloState).tasks.map((row) => row.id), ['TASK-ONLY']);
  assert.equal(nextData(soloState).tasks[0].depth, 0);
  assert.equal(executionData(soloState).configured, false);
  assert.deepEqual(executionData(soloState).tasks, []);
  assert.equal(reportData(soloState).execution.configured, false);
  assert.equal(statusData(soloState, '2026-08-18').runs.configured, false);

  // The same run record works for that non-RPD single-task project.
  startRun(solo, {
    run_id: 'RUN-50105010', title: 'Solo run',
    repositories: [{ name: 'app', integration_branch: 'pm/solo-50105010', base_branch: 'main', base_commit: 'd'.repeat(40), coordinator_worktree: '/tmp/wt/app-integration' }],
  }, '2026-08-18T00:00:00Z');
  advanceRun(solo, { bind_task: { task_id: 'TASK-ONLY', branch: 'pm/solo-50105010-task-only', executor_root: '/tmp/wt/task-only' } }, '2026-08-18T00:05:00Z');
  const withRun = loadProject(solo);
  assert.equal(statusData(withRun, '2026-08-18').runs.active.tasks_bound, 1);
  assert.equal(statusData(withRun, '2026-08-18').runs.active.tasks_integrated, 0);
  assert.equal(executionData(withRun).runs[0].tasks_measured, 0, 'a run with no attempts measures nothing rather than zero');
});

test('an injected mid-write failure rolls the run record back completely', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = createProject(base, 'RUNINJECT', [task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'ready' })]);
  const repositories = [{ name: 'app', integration_branch: 'pm/runinject-a1b2c3d4', base_branch: 'main', base_commit: 'e'.repeat(40), coordinator_worktree: '/tmp/wt/app-integration' }];

  // Failure injected after the candidate is swapped in: the run must not survive.
  assertNoMutation(root, () => startRun(root, { run_id: 'RUN-A1B2C3D4', title: 'Run', repositories }, '2026-08-18T00:00:00Z', { injectFailureAfterReplace: true }), /Injected failure/);
  assert.equal(loadProject(root).runs.configured, false, 'no RUNS.md survives a rolled-back start');

  startRun(root, { run_id: 'RUN-A1B2C3D4', title: 'Run', repositories }, '2026-08-18T00:00:00Z');
  assertNoMutation(root, () => advanceRun(root, { bind_task: { task_id: 'TASK-A', branch: 'b', executor_root: '/tmp/wt/a' } }, '2026-08-18T00:10:00Z', { injectFailureAfterReplace: true }), /Injected failure/);
  const after = loadProject(root);
  assert.deepEqual(after.runs.items[0].tasks, {}, 'a rolled-back advance binds nothing');
  assert.equal(after.runs.items[0].updated, '2026-08-18T00:00:00Z', 'a rolled-back advance does not move the timestamp');
});

test('the concurrency ceiling exposes what a plan permits, independent of any scheduler', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  // The real M-HOST milestone shape: 13 tasks, 12 dependent, a 4-level serial prefix.
  const edges = {
    'TASK-BOUNDARY': [], 'TASK-STORE': ['TASK-BOUNDARY'], 'TASK-ACCESS': ['TASK-STORE'],
    'TASK-RUNTIME': ['TASK-ACCESS', 'TASK-STORE'], 'TASK-READS': ['TASK-RUNTIME'],
    'TASK-RUNCONTROL': ['TASK-ACCESS', 'TASK-RUNTIME', 'TASK-STORE'],
    'TASK-CHECKPOINTS': ['TASK-RUNCONTROL'],
    'TASK-HTTPAPI': ['TASK-ACCESS', 'TASK-CHECKPOINTS', 'TASK-READS', 'TASK-RUNTIME'],
    'TASK-SSE': ['TASK-CHECKPOINTS', 'TASK-HTTPAPI', 'TASK-RUNCONTROL'],
    'TASK-MUTATION': ['TASK-CHECKPOINTS', 'TASK-READS'], 'TASK-SCRIPTS': ['TASK-MUTATION'],
    'TASK-MCP': ['TASK-CHECKPOINTS', 'TASK-RUNTIME'],
    'TASK-FIXTURE': ['TASK-MCP', 'TASK-SCRIPTS', 'TASK-SSE'],
  };
  const blocks = {};
  for (const [id, parents] of Object.entries(edges)) for (const parent of parents) (blocks[parent] ??= []).push(id);
  const records = Object.entries(edges).map(([id, parents]) => task(id, id, `${id}.`, [`${id} accepted.`], {
    status: parents.length === 0 ? 'ready' : 'planned',
    depends_on: parents.sort(), ...(blocks[id] ? { blocks: blocks[id].sort() } : {}),
  }));
  const chainy = concurrencyData(loadProject(createProject(base, 'CHAINY', records)));
  assert.equal(chainy.remaining_tasks, 13);
  assert.equal(chainy.dependent_tasks, 12);
  assert.equal(chainy.critical_path, 9, 'nine dependency levels');
  assert.equal(chainy.widest_level, 3);
  assert.equal(chainy.serial_prefix, 4, 'four leading levels admit exactly one task each');
  assert.equal(chainy.concurrency_ceiling, 1.44, 'no scheduler can beat 13/9 on this plan');

  // The same task count with no declared dependencies has a far higher ceiling.
  const flat = concurrencyData(loadProject(createProject(base, 'FLAT',
    Object.keys(edges).map((id) => task(id, id, `${id}.`, [`${id} accepted.`], { status: 'ready' })))));
  assert.equal(flat.critical_path, 1);
  assert.equal(flat.serial_prefix, 0);
  assert.equal(flat.concurrency_ceiling, 13);

  // Completed work leaves the remaining plan's ceiling, not the original one.
  assert.equal(concurrencyData(loadProject(createProject(base, 'EMPTY', []))).configured, false);
});

test('a dependency on non-runnable work still counts as a dependency', (t) => {
  const base = temp();
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  // TASK-B depends on a cancelled TASK-A, so it can never run. The edge forms no
  // chain among runnable work, but reporting TASK-B as dependency-free is a lie.
  const records = [
    task('TASK-A', 'Alpha', 'A.', ['A accepted.'], { status: 'planned', blocks: ['TASK-B'], disposition: 'cancelled', disposition_changed_at: '2026-08-08T00:00:00Z' }),
    task('TASK-B', 'Beta', 'B.', ['B accepted.'], { status: 'planned', depends_on: ['TASK-A'] }),
    task('TASK-C', 'Gamma', 'C.', ['C accepted.'], { status: 'ready' }),
  ];
  const root = createProject(base, 'CANCELDEP', records);
  // Disposition fields require task schema 3.
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, 3));
  const state = loadProject(root);
  const concurrency = concurrencyData(state);
  assert.equal(concurrency.remaining_tasks, 2);
  assert.equal(concurrency.dependent_tasks, 1, 'TASK-B has an unsatisfied dependency');
  assert.deepEqual(blockerItems(state).map((item) => item.id), ['TASK-B'], 'and blockers agree');
});
