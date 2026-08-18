/**
 * Responsibility: open, advance, and resume one execution run recorded in
 * RUNS.md. Invariants: at most one active run per project, atomic mutation with
 * exact rollback, resume answered from recorded state alone with no filesystem
 * discovery of branches or worktrees, and no coupling to any executor provider.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson } = require('./contracts');
const { loadProject, regenerateStatus } = require('./project-state');
const { atomicProjectMutation, mutationRevision, MutationConflictError } = require('./mutations');
const { loadStableSnapshot } = require('./task-editor');

const RUNS_FILE = 'RUNS.md';

class RunExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RunExecutionError';
    this.code = code;
    this.path = details.path ?? null;
    this.project = details.project ?? null;
  }
}

function projectRef(state) {
  return state ? { id: state.project.id, root: state.root } : null;
}

function reject(code, message, state = null, filePath = null) {
  throw new RunExecutionError(code, message, { path: filePath, project: projectRef(state) });
}

function loadStableRunProject(root) {
  const snapshot = loadStableSnapshot(root, 3, {
    revision: mutationRevision,
    load: (folder) => loadProject(folder),
    guardFirstRead: false,
    onBusy: () => reject('PROJECT_BUSY', 'Project changed repeatedly while run execution was reading it'),
  });
  return { state: snapshot.value, mutation_revision: snapshot.mutation_revision };
}

function activeRun(state) {
  return state.runs.items.find((run) => run.status === 'active') ?? null;
}

/** Render RUNS.md in the exact collection grammar the loader parses. */
function renderRuns(runs) {
  const body = [...runs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((run) => {
      const payload = {
        status: run.status, started: run.started, updated: run.updated,
        repositories: run.repositories, tasks: run.tasks,
      };
      return `\n## ${run.id} - ${run.title}\n\n\`\`\`json\n${canonicalJson(payload)}\n\`\`\`\n`;
    })
    .join('');
  return `---\nschema_version: 1\n---\n${body}`;
}

function readRuns(state) {
  return state.runs.items.map((run) => ({
    id: run.id, title: run.title, status: run.status, started: run.started,
    updated: run.updated, repositories: run.repositories, tasks: run.tasks,
  }));
}

function writeRuns(candidate, runs) {
  fs.writeFileSync(path.join(candidate, RUNS_FILE), renderRuns(runs));
}

function mutate(root, observedAt, apply, options = {}) {
  const snapshot = loadStableRunProject(root);
  const initial = snapshot.state;
  let result = null;
  try {
    atomicProjectMutation(initial.root, (candidate, context) => {
      const state = loadProject(candidate, context);
      const outcome = apply(state, readRuns(state));
      writeRuns(candidate, outcome.runs);
      regenerateStatus(candidate, observedAt, context);
      result = outcome.data;
    }, loadProject, {
      validateLive: loadProject,
      expectedMutationRevision: snapshot.mutation_revision,
      injectFailureAfterReplace: options.injectFailureAfterReplace,
      injectRollbackFailure: options.injectRollbackFailure,
    });
  } catch (error) {
    if (error instanceof MutationConflictError) reject('MUTATION_CONFLICT', error.message, initial, initial.root);
    throw error;
  }
  return { project: projectRef(initial), data: result };
}

function assertRunShape(input, observedAt) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('INVALID_INPUT', 'Run input must be an object');
  const { run_id: runId, title, repositories } = input;
  if (typeof runId !== 'string' || !/^RUN-[A-Z0-9-]*[A-Z0-9]$/.test(runId)) reject('INVALID_INPUT', 'run_id must be a RUN- namespaced identifier');
  if (typeof title !== 'string' || title.trim() === '') reject('INVALID_INPUT', 'Run title is required');
  if (!Array.isArray(repositories) || repositories.length === 0) reject('INVALID_INPUT', 'A run must record at least one repository');
  return {
    id: runId, title: title.trim(), status: 'active', started: observedAt, updated: observedAt,
    repositories, tasks: {},
  };
}

/** Open a run. Refuses while any run is still active, so a lost session cannot silently fork one. */
function startRun(root, input = {}, observedAt = new Date().toISOString(), options = {}) {
  return mutate(root, observedAt, (state, runs) => {
    const open = activeRun(state);
    if (open) reject('RUN_ACTIVE', `Run ${open.id} is still active; resume it or close it before opening another`, state, RUNS_FILE);
    const record = assertRunShape(input, observedAt);
    if (runs.some((run) => run.id === record.id)) reject('RUN_EXISTS', `Run ${record.id} already exists`, state, RUNS_FILE);
    return { runs: [...runs, record], data: { run_id: record.id, status: record.status, started: record.started } };
  }, options);
}

/** Record run progress: bind a task, mark it integrated, or move the run's own status. */
function advanceRun(root, input = {}, observedAt = new Date().toISOString(), options = {}) {
  return mutate(root, observedAt, (state, runs) => {
    const open = activeRun(state);
    if (!open) reject('RUN_MISSING', 'No active run to advance', state, RUNS_FILE);
    const target = runs.find((run) => run.id === open.id);
    const next = { ...target, tasks: { ...target.tasks }, updated: observedAt };
    if (input.bind_task) {
      const { task_id: taskId, branch, executor_root: executorRoot } = input.bind_task;
      if (!state.tasks.some((task) => task.id === taskId)) reject('RUN_TASK_UNKNOWN', `Unknown task ${taskId}`, state, RUNS_FILE);
      if (Object.hasOwn(next.tasks, taskId)) reject('RUN_TASK_BOUND', `Task ${taskId} is already bound to run ${next.id}`, state, RUNS_FILE);
      next.tasks[taskId] = { branch, executor_root: executorRoot, integrated: false };
    }
    if (input.integrate_task) {
      const taskId = input.integrate_task;
      if (!Object.hasOwn(next.tasks, taskId)) reject('RUN_TASK_UNBOUND', `Task ${taskId} is not bound to run ${next.id}`, state, RUNS_FILE);
      next.tasks[taskId] = { ...next.tasks[taskId], integrated: true };
    }
    if (input.status) next.status = input.status;
    return {
      runs: runs.map((run) => (run.id === next.id ? next : run)),
      data: { run_id: next.id, status: next.status, updated: next.updated, tasks: next.tasks },
    };
  }, options);
}

/**
 * Answer "what run is in flight and how far did it get" from RUNS.md alone.
 * Deliberately performs no Git or filesystem discovery: a resumed session must
 * adopt the recorded run rather than reconstruct one by scanning branches.
 */
function resumeRun(root) {
  const { state } = loadStableRunProject(root);
  const open = activeRun(state);
  if (!open) {
    return { project: projectRef(state), data: { resumable: false, run: null, reason: 'No active run is recorded' } };
  }
  const entries = Object.entries(open.tasks);
  return {
    project: projectRef(state),
    data: {
      resumable: true,
      run: {
        run_id: open.id, title: open.title, status: open.status, started: open.started, updated: open.updated,
        repositories: open.repositories,
        integrated_tasks: entries.filter(([, binding]) => binding.integrated).map(([id]) => id).sort(),
        pending_tasks: entries.filter(([, binding]) => !binding.integrated).map(([id]) => id).sort(),
        tasks: open.tasks,
      },
    },
  };
}

module.exports = { RunExecutionError, startRun, advanceRun, resumeRun, renderRuns };
