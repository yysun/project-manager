/**
 * Responsibility: executable contract tests for folder isolation, deterministic
 * project facts, optional modules, provider handoffs, and hostile invalid inputs.
 * Invariants: temporary fixtures only; no repository mutation. Recent changes:
 * cover TASKS v2 schedules, Studio projection, and strict projects-root discovery.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  loadProject, loadProjectIndex, loadProjectsRoot, validateData, statusData, nextData, blockerItems, coverageData, reportData, kanbanData, scheduleEditEligibility, regenerateStatus,
} = require('../scripts/lib/project-state');
const {
  DEFAULT_EVIDENCE, canonicalJson, sha256, taskSpecHash, buildTaskContract, deriveStory,
  renderRpdPrompt, validateManifest, validateEvidenceRequirements, validateTaskContract, formatTaskContract, formatEvidenceManifest, snapshotRpdEvidence,
} = require('../scripts/lib/contracts');
const { atomicProjectMutation, createProjectWork, cleanupProjectWork } = require('../scripts/lib/mutations');

const SCRIPT_ROOT = path.join(__dirname, '..', 'scripts');

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

function run(script, args) {
  return spawnSync(process.execPath, [path.join(SCRIPT_ROOT, script), ...args], { encoding: 'utf8' });
}

test('minimal generic project validates without Git, milestones, traceability, or RPD', () => {
  const base = temp();
  const root = createProject(base, 'ROLLOUT', [task('TASK-LAUNCH', 'Launch', 'Launch safely.', ['Stakeholders approve launch.'], { status: 'ready', success_criteria: ['SC-OUTCOME'] })]);
  const state = loadProject(root);
  assert.equal(state.project.id, 'ROLLOUT');
  assert.deepEqual(validateData(state).modules, { milestones: false, risks: false, decisions: false, sources: false, traceability: false, changes: false, handoffs: false, reports: false });
  assert.deepEqual(statusData(state).milestones, { configured: false });
  assert.deepEqual(coverageData(state), { schema_version: 1, configured: false });
  assert.equal(nextData(state).tasks[0].id, 'TASK-LAUNCH');
  assert.equal(reportData(state).unknowns.some((item) => item.field === 'status.coverage'), true);
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
  assert.deepEqual(board.lanes.map((lane) => [lane.id, lane.tasks.length]), [['planned', 1], ['ready', 1], ['active', 0], ['verified', 0], ['done', 0]]);
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
  const data = kanbanData(loadProject(root)); const second = data.tasks.find((item) => item.id === 'TASK-SECOND');
  assert.deepEqual(second.schedule_conflicts, [{ dependency_id: 'TASK-FIRST', dependency_end: '2026-08-12', task_start: '2026-08-12' }]);
  assert.deepEqual(second.blocked_by, []); assert.deepEqual(second.dependency_blockers, ['TASK-FIRST']);
  assert.equal(data.summary.tasks.blocked, 1); assert.deepEqual(data.next.map((item) => item.id), ['TASK-FIRST']);
  assert.equal(data.tasks.filter((item) => item.blocked_by.length || item.dependency_blockers.length).map((item) => item.id).join(','), 'TASK-SECOND');
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
      'project-status.js': ['schema_version', 'as_of_date', 'project', 'tasks', 'success', 'milestones', 'coverage', 'risks', 'decisions'],
      'project-next.js': ['schema_version', 'tasks'], 'project-blocked.js': ['schema_version', 'tasks'],
      'project-coverage.js': ['schema_version', 'configured'],
      'project-report-data.js': ['schema_version', 'status', 'risks', 'decisions', 'sources', 'changes', 'ownership', 'blockers', 'next', 'forecasts', 'unknowns'],
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
  createProject(root, 'SECOND', []); createProject(root, 'FIRST', []); fs.writeFileSync(path.join(root, '.DS_Store'), 'ignored');
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

test('provider root rules apply uniformly to human, RPD, agent, and external tasks', () => {
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
  assert.throws(() => loadProject(projectRoot), /real directory/);
  assert.throws(() => buildTaskContract({ id: 'PROVIDERS', root: fs.realpathSync(projectRoot) }, normalizedTask('rpd', rootFile), [], '2026-08-08T00:00:00Z'), /real directory/);
  if (process.platform !== 'win32') {
    const linkedRoot = path.join(base, 'linked-executor'); fs.symlinkSync(executionRoot, linkedRoot);
    fs.writeFileSync(path.join(projectRoot, 'TASKS.md'), collection([task('TASK-AGENT', 'Agent', 'Agent outcome.', ['Agent accepted.'], { executor: { provider: 'agent', root: linkedRoot } })]));
    assert.throws(() => loadProject(projectRoot), /real directory/);
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
    assert.throws(() => loadProject(moved), /prefixes must be real directories/);
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
  assert.throws(() => loadProject(root), /source binding is stale/); sourceRaw.version = 'v1';
  fs.writeFileSync(path.join(root, 'SOURCES.md'), collection([{ id: 'SRC-ONE', title: 'Source', data: sourceRaw }]));
  const moved = path.join(base, 'attempt-moved'); fs.renameSync(root, moved);
  assert.equal(loadProject(moved).tasks[0].status, 'done'); fs.renameSync(moved, root);
  const changeObservedAt = '2026-08-08T00:00:00.999Z';
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: changeObservedAt, sources: [], affected_tasks: [model.id], affected_milestones: [], reverify_tasks: [model.id], risk_summary: 'Source changed' } }]));
  assert.throws(() => loadProject(root), /must regress/);
  fs.writeFileSync(path.join(root, 'CHANGES.md'), collection([{ id: 'CHG-REVERIFY', title: 'Reverify', data: { date: '2026-08-08', observed_at: changeObservedAt, sources: [], affected_tasks: [model.id], affected_milestones: [], reverify_tasks: [model.id], reverification: { [model.id]: { status: 'complete', contract_id: contract.contract_id, manifest_id: formatted.manifest_id } }, risk_summary: 'Source changed' } }]));
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
