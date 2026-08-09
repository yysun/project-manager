/**
 * Responsibility: revision-safe Studio projection, dry-run task checking, and
 * atomic specification, disposition, and schedule edits. Invariants: separate edit authority,
 * exact field allowlists, coherent snapshots, preserved narrative/history, and
 * no live write before full candidate validation, and isolated check workspaces.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadProject, kanbanData, regenerateStatus, taskEditEligibility, scheduleEditEligibility, dispositionEditEligibility, taskDisposition } = require('./project-state');
const { atomicProjectMutation, createProjectWork, cleanupProjectWork, mutationRevision, MutationConflictError } = require('./mutations');

const PLANNING_FIELDS = [
  'title', 'outcome', 'acceptance', 'status', 'priority', 'milestone', 'owner',
  'depends_on', 'blocked_by', 'success_criteria', 'constraints', 'critical',
];
const SCHEDULE_FIELDS = ['scheduled_start', 'scheduled_end'];
const COORDINATION_FIELDS = ['disposition'];
const EDITABLE_FIELDS = [...PLANNING_FIELDS, ...COORDINATION_FIELDS, ...SCHEDULE_FIELDS];

class TaskEditError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TaskEditError';
    this.code = code;
    Object.assign(this, details);
  }
}

function assertExactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskEditError('INVALID_REQUEST', `${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new TaskEditError('PROTECTED_FIELD', `${label} contains unsupported fields: ${unknown.join(', ')}`, { fields: unknown });
}

function parseTaskRecords(text) {
  const pattern = /^## ([A-Z][A-Z0-9-]{1,63}) - ([^\r\n]+)(?:\r?\n)+```json\r?\n([^\r\n]+)\r?\n```/gm;
  return [...text.matchAll(pattern)].map((match) => {
    const raw = JSON.parse(match[3]);
    return {
      id: match[1], title: match[2].trim(), raw,
      originalBlocks: Array.isArray(raw.blocks) ? [...raw.blocks] : [],
      eol: match[0].includes('\r\n') ? '\r\n' : '\n',
      start: match.index, end: match.index + match[0].length,
    };
  });
}

function renderRecord(record) {
  const eol = record.eol;
  return `## ${record.id} - ${record.title}${eol}${eol}\`\`\`json${eol}${JSON.stringify(record.raw)}${eol}\`\`\``;
}

function transformTaskDocument(text, taskId, edit, date, observedAt = null) {
  assertExactKeys(edit, EDITABLE_FIELDS, 'edit');
  if (Object.keys(edit).length === 0) throw new TaskEditError('INVALID_REQUEST', 'edit must change at least one field');
  const records = parseTaskRecords(text);
  const target = records.find((record) => record.id === taskId);
  if (!target) throw new TaskEditError('TASK_NOT_FOUND', `Unknown task: ${taskId}`);
  const dispositionChanged = Object.hasOwn(edit, 'disposition') && edit.disposition !== (target.raw.disposition ?? 'active');
  if (Object.hasOwn(edit, 'title')) {
    if (typeof edit.title !== 'string' || edit.title.trim() === '') throw new TaskEditError('INVALID_REQUEST', 'title must be non-empty');
    target.title = edit.title.trim();
  }
  for (const key of PLANNING_FIELDS.filter((field) => field !== 'title')) {
    if (Object.hasOwn(edit, key)) target.raw[key] = edit[key];
  }
  if (SCHEDULE_FIELDS.every((key) => Object.hasOwn(edit, key))) {
    if (edit.scheduled_start === null && edit.scheduled_end === null) {
      delete target.raw.scheduled_start; delete target.raw.scheduled_end;
    } else {
      target.raw.scheduled_start = edit.scheduled_start; target.raw.scheduled_end = edit.scheduled_end;
    }
  }
  if (Object.hasOwn(edit, 'disposition')) {
    if (!['active', 'deferred', 'cancelled'].includes(edit.disposition)) throw new TaskEditError('INVALID_REQUEST', 'disposition must be active, deferred, or cancelled');
    if (!dispositionChanged) {
      // Preserve the original timestamp and schema when a wider Studio edit resubmits disposition unchanged.
    } else if (edit.disposition === 'active') {
      delete target.raw.disposition; delete target.raw.disposition_changed_at;
    } else {
      if (typeof observedAt !== 'string') throw new TaskEditError('INVALID_REQUEST', 'disposition changes require an observation timestamp');
      target.raw.disposition = edit.disposition; target.raw.disposition_changed_at = observedAt;
    }
  }
  target.raw.updated = date;
  const dependencies = new Map(records.map((record) => [record.id, Array.isArray(record.raw.depends_on) ? record.raw.depends_on : []]));
  for (const record of records) {
    const derived = records.filter((candidate) => dependencies.get(candidate.id).includes(record.id)).map((candidate) => candidate.id).sort();
    const current = Array.isArray(record.raw.blocks) ? record.raw.blocks : [];
    if (JSON.stringify(current) !== JSON.stringify(derived)) record.raw.blocks = derived;
  }
  let output = text;
  for (const record of [...records].sort((a, b) => b.start - a.start)) {
    const changed = record.id === taskId || JSON.stringify(record.raw.blocks ?? []) !== JSON.stringify(record.originalBlocks);
    if (changed) output = `${output.slice(0, record.start)}${renderRecord(record)}${output.slice(record.end)}`;
  }
  const hasSchedule = SCHEDULE_FIELDS.every((key) => Object.hasOwn(edit, key)) && edit.scheduled_start !== null;
  const hasDisposition = dispositionChanged;
  if (hasDisposition) output = output.replace(/^(schema_version: )[12](\r?)$/m, (_match, prefix, cr) => `${prefix}3${cr}`);
  else if (hasSchedule) output = output.replace(/^(schema_version: )1(\r?)$/m, (_match, prefix, cr) => `${prefix}2${cr}`);
  return output;
}

function loadRevisionedProject(root, attempts = 3) {
  let transient = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const before = mutationRevision(root);
      const state = loadProject(root);
      const data = kanbanData(state, before);
      const after = mutationRevision(root);
      if (before === after) return { state, data, mutation_revision: after };
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'ESTALE'].includes(error.code)) throw error;
      transient = error;
    }
  }
  throw new TaskEditError('PROJECT_BUSY', 'Project changed repeatedly while Studio was loading it. Refresh and retry.', { causeCode: transient?.code ?? null });
}

function validateEnvelope(snapshot, taskId, request) {
  assertExactKeys(request, ['mutationRevision', 'taskRevision', 'edit'], 'request');
  if (typeof request.mutationRevision !== 'string' || typeof request.taskRevision !== 'string') throw new TaskEditError('INVALID_REQUEST', 'mutationRevision and taskRevision are required');
  if (snapshot.mutation_revision !== request.mutationRevision) throw new TaskEditError('MUTATION_CONFLICT', 'Project changed since this task was loaded', { currentRevision: snapshot.mutation_revision });
  const task = snapshot.state.tasks.find((item) => item.id === taskId);
  if (!task) throw new TaskEditError('TASK_NOT_FOUND', `Unknown task: ${taskId}`);
  if (task.spec_sha256 !== request.taskRevision) throw new TaskEditError('TASK_CONFLICT', 'Task specification changed since it was loaded', { currentTaskRevision: task.spec_sha256, currentRevision: snapshot.mutation_revision });
  assertExactKeys(request.edit, EDITABLE_FIELDS, 'edit');
  const keys = Object.keys(request.edit);
  if (keys.length === 0) throw new TaskEditError('INVALID_REQUEST', 'edit must change at least one field');
  const planning = keys.some((key) => PLANNING_FIELDS.includes(key));
  const coordination = keys.some((key) => COORDINATION_FIELDS.includes(key));
  const schedule = keys.some((key) => SCHEDULE_FIELDS.includes(key));
  if (planning) {
    const eligibility = taskEditEligibility(snapshot.state, task);
    if (!eligibility.editable) throw new TaskEditError('TASK_READ_ONLY', eligibility.reason);
    if (Object.hasOwn(request.edit, 'status') && !['planned', 'ready'].includes(request.edit.status)) throw new TaskEditError('INVALID_REQUEST', 'Studio status edits are limited to planned and ready');
  }
  if (coordination) {
    const eligibility = dispositionEditEligibility(snapshot.state, task);
    if (!eligibility.editable) throw new TaskEditError('TASK_DISPOSITION_READ_ONLY', eligibility.reason);
    if (!['active', 'deferred', 'cancelled'].includes(request.edit.disposition)) throw new TaskEditError('INVALID_REQUEST', 'disposition must be active, deferred, or cancelled');
    if (taskDisposition(task) === 'cancelled' && request.edit.disposition !== 'cancelled') throw new TaskEditError('TASK_DISPOSITION_READ_ONLY', 'Cancellation is terminal.');
  }
  if (schedule) {
    if (!SCHEDULE_FIELDS.every((key) => Object.hasOwn(request.edit, key))) throw new TaskEditError('INVALID_REQUEST', 'scheduled_start and scheduled_end must be edited together');
    const values = SCHEDULE_FIELDS.map((key) => request.edit[key]);
    const clearing = values.every((value) => value === null);
    const dating = values.every((value) => typeof value === 'string');
    if (!clearing && !dating) throw new TaskEditError('INVALID_REQUEST', 'schedule dates must both be date strings or both be null');
    const eligibility = scheduleEditEligibility(snapshot.state, task);
    if (!eligibility.editable) throw new TaskEditError('TASK_SCHEDULE_READ_ONLY', eligibility.reason);
  }
  return task;
}

function applyCandidateEdit(candidate, logicalRoot, taskId, request) {
  const tasksPath = path.join(candidate, 'TASKS.md');
  const observedAt = new Date().toISOString();
  const date = observedAt.slice(0, 10);
  fs.writeFileSync(tasksPath, transformTaskDocument(fs.readFileSync(tasksPath, 'utf8'), taskId, request.edit, date, observedAt));
  regenerateStatus(candidate, observedAt, { logicalRoot });
  return loadProject(candidate, { logicalRoot });
}

function checkTaskEdit(root, taskId, request) {
  const snapshot = loadRevisionedProject(root);
  validateEnvelope(snapshot, taskId, request);
  const canonicalRoot = snapshot.state.root;
  const parent = path.dirname(canonicalRoot); const name = path.basename(canonicalRoot);
  const work = createProjectWork(parent, `${name}.studio-check-`, canonicalRoot);
  const candidate = path.join(work, name);
  try {
    fs.cpSync(canonicalRoot, candidate, { recursive: true, errorOnExist: true, preserveTimestamps: true, dereference: false, verbatimSymlinks: true });
    if (mutationRevision(candidate) !== request.mutationRevision) throw new TaskEditError('MUTATION_CONFLICT', 'Candidate copy did not match the loaded project', { currentRevision: mutationRevision(canonicalRoot) });
    const state = applyCandidateEdit(candidate, canonicalRoot, taskId, request);
    const task = state.tasks.find((item) => item.id === taskId);
    return { valid: true, task: kanbanData(state).tasks.find((item) => item.id === task.id) };
  } finally {
    cleanupProjectWork(work);
  }
}

function saveTaskEdit(root, taskId, request, options = {}) {
  const snapshot = loadRevisionedProject(root);
  validateEnvelope(snapshot, taskId, request);
  const canonicalRoot = snapshot.state.root;
  try {
    atomicProjectMutation(canonicalRoot, (candidate, context) => {
      applyCandidateEdit(candidate, context.logicalRoot, taskId, request);
    }, loadProject, {
      validateLive: loadProject,
      expectedMutationRevision: request.mutationRevision,
      injectFailureAfterReplace: options.injectFailureAfterReplace,
      injectRollbackFailure: options.injectRollbackFailure,
    });
  } catch (error) {
    if (error instanceof MutationConflictError) throw new TaskEditError('MUTATION_CONFLICT', error.message, { currentRevision: error.currentRevision });
    throw error;
  }
  return loadRevisionedProject(canonicalRoot).data;
}

module.exports = {
  EDITABLE_FIELDS, PLANNING_FIELDS, COORDINATION_FIELDS, SCHEDULE_FIELDS, TaskEditError, parseTaskRecords,
  renderRecord, transformTaskDocument, loadRevisionedProject, checkTaskEdit, saveTaskEdit,
};
