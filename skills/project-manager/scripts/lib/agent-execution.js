/**
 * Responsibility: atomically issue agent Task Contracts and ingest exact agent
 * Evidence Manifest payloads. Invariants: agent-only eligibility, canonical
 * stored-attempt parsing, immutable retries, exact CHANGES bindings, stable
 * revisions, gap-free evidence, and exact rollback on every failed mutation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildTaskContract, formatTaskContract, formatEvidenceManifest, validateManifest,
  validateTaskContract, validTimestamp,
} = require('./contracts');
const {
  loadProject, regenerateStatus, taskDisposition, parseAttempt,
} = require('./project-state');
const {
  atomicProjectMutation, mutationRevision, MutationConflictError,
} = require('./mutations');
const { parseTaskRecords, renderRecord } = require('./task-editor');

class AgentExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgentExecutionError';
    this.code = code;
    this.path = details.path ?? null;
    this.project = details.project ?? null;
  }
}

function projectRef(state) {
  return state ? { id: state.project.id, root: state.root } : null;
}

function reject(code, message, state = null, filePath = null) {
  throw new AgentExecutionError(code, message, { path: filePath, project: projectRef(state) });
}

function loadStableAgentProject(root, attempts = 3, revision = mutationRevision, load = loadProject) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const before = revision(root);
    const state = load(root);
    const after = revision(root);
    if (before === after) return { state, mutation_revision: after };
  }
  reject('PROJECT_BUSY', 'Project changed repeatedly while agent execution was reading it');
}

function sourceBindings(state, task) {
  return task.sources.map((id) => {
    const source = state.sources.items.find((item) => item.id === id);
    return { id, version: source.version, record_sha256: source.record_sha256, content_sha256: source.sha256 };
  });
}

function latestReverification(state, taskId) {
  return state.changes.items
    .filter((change) => Object.hasOwn(change.reverification, taskId))
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at) || a.id.localeCompare(b.id))
    .at(-1) ?? null;
}

function rewriteRecord(text, recordId, mutate, missingCode, missingLabel) {
  const records = parseTaskRecords(text);
  const target = records.find((record) => record.id === recordId);
  if (!target) throw new AgentExecutionError(missingCode, `${missingLabel}: ${recordId}`);
  mutate(target.raw);
  return `${text.slice(0, target.start)}${renderRecord(target)}${text.slice(target.end)}`;
}

function rewriteTask(text, taskId, values, remove = []) {
  return rewriteRecord(text, taskId, (raw) => {
    Object.assign(raw, values);
    for (const key of remove) delete raw[key];
  }, 'TASK_NOT_FOUND', 'Unknown task');
}

function rewriteReverification(text, changeId, taskId, value) {
  return rewriteRecord(text, changeId, (raw) => {
    if (!raw.reverification || !Object.hasOwn(raw.reverification, taskId)) {
      throw new AgentExecutionError('CHANGE_REVERIFY_STATE', `Change ${changeId} does not bind task ${taskId}`);
    }
    raw.reverification[taskId] = value;
  }, 'CHANGE_NOT_FOUND', 'Unknown change');
}

function readContract(state, task) {
  const contractPath = path.join(state.root, 'handoffs', task.id, task.active_contract, 'TASK-CONTRACT.md');
  const parsed = parseAttempt(fs.readFileSync(contractPath, 'utf8'), contractPath, 'contract');
  const contract = {
    payload: parsed.payload,
    payload_sha256: parsed.envelope.payload_sha256,
    contract_id: parsed.envelope.contract_id,
  };
  validateTaskContract(contract);
  return { contract, contractPath };
}

function readAttempt(state, task) {
  const { contract, contractPath } = readContract(state, task);
  const attemptRoot = path.dirname(contractPath);
  const reserved = fs.readdirSync(attemptRoot).filter((name) => name.startsWith('EVIDENCE-')).sort();
  const previous = [];
  const payloads = [];
  for (const [index, name] of reserved.entries()) {
    const expected = `EVIDENCE-${String(index + 1).padStart(3, '0')}.md`;
    if (name !== expected) reject('MANIFEST_SEQUENCE', 'Stored manifests are not gap-free', state, attemptRoot);
    const manifestPath = path.join(attemptRoot, name);
    const parsed = parseAttempt(fs.readFileSync(manifestPath, 'utf8'), manifestPath, 'manifest');
    const validated = validateManifest(parsed.payload, contract, previous);
    if (parsed.envelope.manifest_id !== validated.manifest_id || parsed.envelope.evidence_sha256 !== validated.evidence_sha256) {
      reject('MANIFEST_HASH', 'Stored manifest envelope does not match its payload', state, manifestPath);
    }
    previous.push({ ...validated, status: parsed.payload.status, blocker: parsed.payload.blocker, observed_at: parsed.payload.observed_at });
    payloads.push(parsed.payload);
  }
  return { contract, contractPath, attemptRoot, previous, payloads };
}

function assertCommonEligibility(state, task) {
  if (!task) reject('TASK_NOT_FOUND', 'Unknown task', state, 'TASKS.md');
  if (state.project.status !== 'active') reject('PROJECT_NOT_ACTIVE', 'Agent execution requires an active project', state, 'PROJECT.md');
  if (task.executor.provider !== 'agent') reject('EXECUTOR_NOT_AGENT', 'Task executor provider must be agent', state, 'TASKS.md');
  if (taskDisposition(task) !== 'active') reject('TASK_NOT_ACTIVE', 'Deferred or cancelled work cannot execute', state, 'TASKS.md');
}

function unfinishedDependencies(state, task) {
  return task.depends_on.filter((id) => state.tasks.find((candidate) => candidate.id === id)?.status !== 'done');
}

function assertReverificationStart(state, task, createdAt, retry) {
  const change = latestReverification(state, task.id);
  if (!change) return null;
  const binding = change.reverification[task.id];
  if (retry) {
    if (binding.status !== 'in_progress' || binding.contract_id !== task.active_contract || binding.manifest_id !== null) {
      reject('CHANGE_REVERIFY_STATE', 'Retry requires the latest re-verification binding to reference the blocked active contract', state, 'CHANGES.md');
    }
  } else if (binding.status !== 'pending' || binding.contract_id !== null || binding.manifest_id !== null) {
    reject('CHANGE_REVERIFY_STATE', 'Normal start requires a pending latest re-verification binding', state, 'CHANGES.md');
  }
  if (Date.parse(createdAt) <= Date.parse(change.observed_at)) {
    reject('CHANGE_REVERIFY_CHRONOLOGY', 'Agent contract must be created strictly after the governing change', state, 'CHANGES.md');
  }
  return change;
}

function assertNormalStart(state, task, createdAt) {
  if (task.status !== 'ready' || task.active_contract !== null || task.last_manifest !== null) {
    reject('TASK_NOT_READY', 'Normal agent start requires ready lifecycle with no active pointers', state, 'TASKS.md');
  }
  if (task.blocked_by.length > 0) reject('TASK_BLOCKED', 'Blocked work cannot start', state, 'TASKS.md');
  const unfinished = unfinishedDependencies(state, task);
  if (unfinished.length > 0) reject('DEPENDENCY_INCOMPLETE', `Unfinished dependencies: ${unfinished.join(', ')}`, state, 'TASKS.md');
  return assertReverificationStart(state, task, createdAt, false);
}

function assertRetry(state, task, blocker, createdAt) {
  if (typeof blocker !== 'string' || blocker === '') reject('RETRY_BLOCKER_REQUIRED', 'Retry requires the exact cleared blocker', state, 'TASKS.md');
  if (task.status !== 'in_progress' || task.active_contract === null || task.last_manifest === null) {
    reject('RETRY_NOT_BLOCKED', 'Retry requires an active attempt ending in a blocked manifest', state, 'TASKS.md');
  }
  const attempt = readAttempt(state, task);
  const last = attempt.previous.at(-1);
  if (!last || last.status !== 'blocked' || last.manifest_id !== task.last_manifest) {
    reject('RETRY_NOT_BLOCKED', 'Retry requires the active attempt to end in its pointed blocked manifest', state, attempt.attemptRoot);
  }
  if (blocker !== last.blocker || !task.blocked_by.includes(blocker)) {
    reject('RETRY_BLOCKER_MISMATCH', 'Retry blocker must exactly match the blocked manifest and current task blocker', state, 'TASKS.md');
  }
  const remaining = task.blocked_by.filter((value) => value !== blocker);
  if (remaining.length > 0) reject('TASK_BLOCKED', `Retry cannot start while blockers remain: ${remaining.join(', ')}`, state, 'TASKS.md');
  const unfinished = unfinishedDependencies(state, task);
  if (unfinished.length > 0) reject('DEPENDENCY_INCOMPLETE', `Unfinished dependencies: ${unfinished.join(', ')}`, state, 'TASKS.md');
  if (Date.parse(createdAt) <= Date.parse(last.observed_at)) {
    reject('RETRY_CHRONOLOGY', 'Retry contract must be created strictly after the blocked manifest', state, attempt.attemptRoot);
  }
  const change = assertReverificationStart(state, task, createdAt, true);
  return { attempt, change };
}

function normalizeStartInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('INVALID_INPUT', 'Start input must be an object');
  const unknown = Object.keys(input).filter((key) => !['created_at', 'retry_blocker'].includes(key));
  if (unknown.length > 0) reject('INVALID_INPUT', `Unsupported start fields: ${unknown.join(', ')}`);
  const createdAt = input.created_at ?? new Date().toISOString();
  if (!validTimestamp(createdAt)) reject('INVALID_TIMESTAMP', 'created_at must be RFC3339 UTC');
  return { createdAt, retryBlocker: input.retry_blocker, retry: Object.hasOwn(input, 'retry_blocker') };
}

function startAgentTask(root, taskId, input = {}, options = {}) {
  const request = normalizeStartInput(input);
  const snapshot = loadStableAgentProject(root);
  const initial = snapshot.state;
  const initialTask = initial.tasks.find((item) => item.id === taskId);
  assertCommonEligibility(initial, initialTask);
  if (request.retry) assertRetry(initial, initialTask, request.retryBlocker, request.createdAt);
  else assertNormalStart(initial, initialTask, request.createdAt);
  options.beforeMutation?.(initial.root);
  let result = null;
  try {
    atomicProjectMutation(initial.root, (candidate, context) => {
      const state = loadProject(candidate, context);
      const task = state.tasks.find((item) => item.id === taskId);
      assertCommonEligibility(state, task);
      const retryState = request.retry ? assertRetry(state, task, request.retryBlocker, request.createdAt) : null;
      const change = request.retry ? retryState.change : assertNormalStart(state, task, request.createdAt);
      const contract = buildTaskContract(state.project, task, sourceBindings(state, task), request.createdAt);
      const attemptRoot = path.join(candidate, 'handoffs', task.id, contract.contract_id);
      if (fs.existsSync(attemptRoot)) reject('CONTRACT_EXISTS', 'Task Contract ID already exists and cannot be overwritten', state, path.relative(candidate, attemptRoot));
      fs.mkdirSync(attemptRoot, { recursive: true });
      fs.writeFileSync(path.join(attemptRoot, 'TASK-CONTRACT.md'), formatTaskContract(contract), { flag: 'wx' });
      const tasksPath = path.join(candidate, 'TASKS.md');
      const nextBlockers = request.retry ? task.blocked_by.filter((value) => value !== request.retryBlocker) : task.blocked_by;
      fs.writeFileSync(tasksPath, rewriteTask(fs.readFileSync(tasksPath, 'utf8'), taskId, {
        status: 'in_progress', active_contract: contract.contract_id, blocked_by: nextBlockers,
        updated: request.createdAt.slice(0, 10),
      }, ['last_manifest']));
      if (change) {
        const changesPath = path.join(candidate, 'CHANGES.md');
        fs.writeFileSync(changesPath, rewriteReverification(fs.readFileSync(changesPath, 'utf8'), change.id, taskId, {
          status: 'in_progress', contract_id: contract.contract_id, manifest_id: null,
        }));
      }
      regenerateStatus(candidate, request.createdAt, context);
      result = {
        task_id: taskId, status: 'in_progress', contract_id: contract.contract_id,
        contract_path: path.join(initial.root, 'handoffs', task.id, contract.contract_id, 'TASK-CONTRACT.md'),
        retry: request.retry,
      };
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

function assertIngestEligible(state, task) {
  assertCommonEligibility(state, task);
  if (!['in_progress', 'implemented', 'verification'].includes(task.status) || task.active_contract === null) {
    reject('TASK_NOT_INGESTIBLE', 'Manifest ingestion requires an active nonterminal agent attempt', state, 'TASKS.md');
  }
  const attempt = readAttempt(state, task);
  if (attempt.previous.at(-1)?.status === 'blocked') {
    reject('ATTEMPT_BLOCKED', 'A blocked attempt cannot ingest more evidence; retry it explicitly', state, attempt.attemptRoot);
  }
  return attempt;
}

function assertManifestObject(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) reject('INVALID_MANIFEST_INPUT', 'Manifest payload must be one JSON object');
}

function ingestAgentManifest(root, taskId, payload, options = {}) {
  assertManifestObject(payload);
  const snapshot = loadStableAgentProject(root);
  const initial = snapshot.state;
  const initialTask = initial.tasks.find((item) => item.id === taskId);
  const initialAttempt = assertIngestEligible(initial, initialTask);
  let initialValidated;
  try { initialValidated = validateManifest(payload, initialAttempt.contract, initialAttempt.previous); }
  catch (error) { reject('MANIFEST_INVALID', error.message, initial, 'stdin'); }
  options.beforeMutation?.(initial.root);
  let result = null;
  try {
    atomicProjectMutation(initial.root, (candidate, context) => {
      const state = loadProject(candidate, context);
      const task = state.tasks.find((item) => item.id === taskId);
      const attempt = assertIngestEligible(state, task);
      let formatted;
      try { formatted = formatEvidenceManifest(payload, attempt.contract, attempt.previous); }
      catch (error) { reject('MANIFEST_INVALID', error.message, state, 'stdin'); }
      if (formatted.manifest_id !== initialValidated.manifest_id) reject('MUTATION_CONFLICT', 'Manifest validation changed during mutation', state, 'stdin');
      const filename = `EVIDENCE-${String(payload.sequence).padStart(3, '0')}.md`;
      const manifestPath = path.join(attempt.attemptRoot, filename);
      if (fs.existsSync(manifestPath)) reject('MANIFEST_EXISTS', 'Evidence Manifest sequence already exists', state, path.relative(candidate, manifestPath));
      fs.writeFileSync(manifestPath, formatted.document, { flag: 'wx' });

      let status = payload.status === 'blocked' ? 'in_progress' : payload.status;
      const blockers = [...task.blocked_by];
      if (payload.status === 'blocked' && !blockers.includes(payload.blocker)) blockers.push(payload.blocker);
      if (payload.status === 'verified' && unfinishedDependencies(state, task).length === 0 && blockers.length === 0) status = 'done';
      const tasksPath = path.join(candidate, 'TASKS.md');
      fs.writeFileSync(tasksPath, rewriteTask(fs.readFileSync(tasksPath, 'utf8'), taskId, {
        status, active_contract: attempt.contract.contract_id, last_manifest: formatted.manifest_id,
        blocked_by: blockers, updated: payload.observed_at.slice(0, 10),
      }));

      const change = latestReverification(state, taskId);
      if (change) {
        const binding = change.reverification[taskId];
        if (binding.status !== 'in_progress' || binding.contract_id !== attempt.contract.contract_id || binding.manifest_id !== null) {
          reject('CHANGE_REVERIFY_STATE', 'Manifest ingestion requires the latest re-verification binding to reference the active contract', state, 'CHANGES.md');
        }
        const changesPath = path.join(candidate, 'CHANGES.md');
        fs.writeFileSync(changesPath, rewriteReverification(fs.readFileSync(changesPath, 'utf8'), change.id, taskId,
          status === 'done' && payload.status === 'verified'
            ? { status: 'complete', contract_id: attempt.contract.contract_id, manifest_id: formatted.manifest_id }
            : { status: 'in_progress', contract_id: attempt.contract.contract_id, manifest_id: null }));
      }
      regenerateStatus(candidate, payload.observed_at, context);
      result = {
        task_id: taskId, status, contract_id: attempt.contract.contract_id,
        manifest_id: formatted.manifest_id,
        manifest_path: path.join(initial.root, 'handoffs', task.id, attempt.contract.contract_id, filename),
        sequence: payload.sequence,
      };
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

module.exports = {
  AgentExecutionError, loadStableAgentProject, latestReverification,
  startAgentTask, ingestAgentManifest,
};
