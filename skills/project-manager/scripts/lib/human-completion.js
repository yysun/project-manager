/**
 * Responsibility: atomically record lightweight human completion through the
 * existing Task Contract and Evidence Manifest engine. Invariants: profile and
 * eligibility gates, specific approval evidence, immutable attempts, and exact rollback.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildTaskContract, formatTaskContract, formatEvidenceManifest, validateEvidenceRecord, validTimestamp,
} = require('./contracts');
const { loadProject, regenerateStatus, profilePolicy, taskDisposition } = require('./project-state');
const { atomicProjectMutation, mutationRevision } = require('./mutations');
const { parseTaskRecords, renderRecord } = require('./task-editor');

class HumanCompletionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HumanCompletionError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new HumanCompletionError(code, message);
}

function loadStableProject(root, attempts = 3, revision = mutationRevision, load = loadProject) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const before = revision(root);
    const state = load(root);
    const after = revision(root);
    if (before === after) return { state, mutation_revision: after };
  }
  reject('PROJECT_BUSY', 'Project changed repeatedly while lightweight completion was reading it');
}

function sourceBindings(state, task) {
  return task.sources.map((id) => {
    const source = state.sources.items.find((item) => item.id === id);
    return { id, version: source.version, record_sha256: source.record_sha256, content_sha256: source.sha256 };
  });
}

function approvalSatisfies(requirements) {
  return requirements.reduce((total, group) => total + group.minimum, 0) === 1
    && requirements.every((group) => group.any_of.includes('approval'));
}

function assertEligible(state, task, approval) {
  if (!task) reject('TASK_NOT_FOUND', 'Unknown task');
  if (state.project.status !== 'active') reject('PROJECT_NOT_ACTIVE', 'Lightweight completion requires an active project');
  if (profilePolicy(state.project.profile).human_completion !== 'lightweight') reject('CONTROLLED_PROFILE', 'Controlled projects require governed human execution');
  if (task.executor.provider !== 'human') reject('EXECUTOR_NOT_HUMAN', 'Lightweight completion is limited to human tasks');
  if (taskDisposition(task) !== 'active') reject('TASK_NOT_ACTIVE', 'Deferred or cancelled work cannot be completed');
  if (!['planned', 'ready'].includes(task.status) || task.active_contract !== null || task.last_manifest !== null) reject('TASK_ALREADY_STARTED', 'Lightweight completion requires a never-started planned or ready task');
  if (fs.existsSync(path.join(state.root, 'handoffs', task.id))) reject('TASK_HAS_HISTORY', 'Lightweight completion cannot replace existing attempt history');
  if (task.blocked_by.length > 0) reject('TASK_BLOCKED', 'Blocked work cannot be completed');
  const unfinished = task.depends_on.filter((id) => state.tasks.find((candidate) => candidate.id === id).status !== 'done');
  if (unfinished.length > 0) reject('DEPENDENCY_INCOMPLETE', `Unfinished dependencies: ${unfinished.join(', ')}`);
  if (!approvalSatisfies(task.evidence_requirements)) reject('EVIDENCE_REQUIRES_GOVERNED', 'One approval cannot satisfy this task\'s custom evidence requirements');
  if (task.sources.some((id) => {
    const source = state.sources.items.find((item) => item.id === id);
    return source.version === null && source.sha256 === null;
  })) reject('SOURCE_UNVERIFIABLE', 'Lightweight completion requires immutable versions or hashes for every bound source');
  try { validateEvidenceRecord(approval, 'approval'); }
  catch (error) { reject('APPROVAL_INVALID', error.message); }
  if (approval.kind !== 'approval') reject('APPROVAL_INVALID', 'Lightweight completion requires approval evidence');
}

function rewriteCompletedTask(text, taskId, contractId, manifestId, date) {
  const records = parseTaskRecords(text);
  const target = records.find((record) => record.id === taskId);
  if (!target) reject('TASK_NOT_FOUND', `Unknown task: ${taskId}`);
  target.raw.status = 'done';
  target.raw.active_contract = contractId;
  target.raw.last_manifest = manifestId;
  target.raw.updated = date;
  return `${text.slice(0, target.start)}${renderRecord(target)}${text.slice(target.end)}`;
}

function completeHumanTask(root, taskId, input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('INVALID_INPUT', 'Completion input must be an object');
  const unknown = Object.keys(input).filter((key) => !['observed_at', 'ref', 'result'].includes(key));
  if (unknown.length > 0) reject('INVALID_INPUT', `Unsupported completion fields: ${unknown.join(', ')}`);
  const observedAt = input.observed_at ?? new Date().toISOString();
  if (!validTimestamp(observedAt)) reject('INVALID_INPUT', 'observed_at must be RFC3339 UTC');
  const approval = { kind: 'approval', ref: input.ref, result: input.result, sha256: null };
  const snapshot = loadStableProject(root);
  const initial = snapshot.state;
  const task = initial.tasks.find((item) => item.id === taskId);
  assertEligible(initial, task, approval);
  const expectedRevision = snapshot.mutation_revision;
  let result = null;

  atomicProjectMutation(initial.root, (candidate, context) => {
    const state = loadProject(candidate, context);
    const candidateTask = state.tasks.find((item) => item.id === taskId);
    assertEligible(state, candidateTask, approval);
    const contract = buildTaskContract(state.project, candidateTask, sourceBindings(state, candidateTask), observedAt);
    const payload = {
      schema_version: 1,
      sequence: 1,
      contract_id: contract.contract_id,
      project: { id: state.project.id },
      task: { id: candidateTask.id, spec_sha256: candidateTask.spec_sha256 },
      status: 'verified',
      blocker: null,
      evidence: [approval],
      acceptance_evidence: Object.fromEntries(candidateTask.acceptance.map((criterion) => [criterion, [approval]])),
      sources: [],
      observed_at: observedAt,
      notes: ['Reported human completion recorded at observation time; no pre-authorization asserted.'],
    };
    const manifest = formatEvidenceManifest(payload, contract);
    const attemptRoot = path.join(candidate, 'handoffs', candidateTask.id, contract.contract_id);
    fs.mkdirSync(attemptRoot, { recursive: true });
    fs.writeFileSync(path.join(attemptRoot, 'TASK-CONTRACT.md'), formatTaskContract(contract));
    fs.writeFileSync(path.join(attemptRoot, 'EVIDENCE-001.md'), manifest.document);
    const tasksPath = path.join(candidate, 'TASKS.md');
    fs.writeFileSync(tasksPath, rewriteCompletedTask(fs.readFileSync(tasksPath, 'utf8'), taskId, contract.contract_id, manifest.manifest_id, observedAt.slice(0, 10)));
    regenerateStatus(candidate, observedAt, context);
    result = { task_id: taskId, status: 'done', contract_id: contract.contract_id, manifest_id: manifest.manifest_id };
  }, loadProject, {
    validateLive: loadProject,
    expectedMutationRevision: expectedRevision,
    injectFailureAfterReplace: options.injectFailureAfterReplace,
    injectRollbackFailure: options.injectRollbackFailure,
  });
  return result;
}

module.exports = { HumanCompletionError, completeHumanTask, approvalSatisfies, loadStableProject };
