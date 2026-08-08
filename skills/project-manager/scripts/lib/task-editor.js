/**
 * Responsibility: revision-safe Studio projection, dry-run task checking, and
 * atomic edits for genuinely never-started tasks. Invariants: exact editable
 * field allowlist, coherent snapshots, preserved narrative/history, no live
 * write before full candidate validation. Initial Kanban Studio implementation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadProject, kanbanData, regenerateStatus, taskEditEligibility } = require('./project-state');
const { atomicProjectMutation, mutationRevision, MutationConflictError } = require('./mutations');

const EDITABLE_FIELDS = [
  'title', 'outcome', 'acceptance', 'status', 'priority', 'milestone', 'owner',
  'depends_on', 'blocked_by', 'success_criteria', 'constraints', 'critical',
];

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

function transformTaskDocument(text, taskId, edit, date) {
  assertExactKeys(edit, EDITABLE_FIELDS, 'edit');
  if (Object.keys(edit).length === 0) throw new TaskEditError('INVALID_REQUEST', 'edit must change at least one field');
  const records = parseTaskRecords(text);
  const target = records.find((record) => record.id === taskId);
  if (!target) throw new TaskEditError('TASK_NOT_FOUND', `Unknown task: ${taskId}`);
  if (Object.hasOwn(edit, 'title')) {
    if (typeof edit.title !== 'string' || edit.title.trim() === '') throw new TaskEditError('INVALID_REQUEST', 'title must be non-empty');
    target.title = edit.title.trim();
  }
  for (const key of EDITABLE_FIELDS.filter((field) => field !== 'title')) {
    if (Object.hasOwn(edit, key)) target.raw[key] = edit[key];
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
  const eligibility = taskEditEligibility(snapshot.state, task);
  if (!eligibility.editable) throw new TaskEditError('TASK_READ_ONLY', eligibility.reason);
  assertExactKeys(request.edit, EDITABLE_FIELDS, 'edit');
  return task;
}

function applyCandidateEdit(candidate, logicalRoot, taskId, request) {
  const tasksPath = path.join(candidate, 'TASKS.md');
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(tasksPath, transformTaskDocument(fs.readFileSync(tasksPath, 'utf8'), taskId, request.edit, date));
  regenerateStatus(candidate, new Date().toISOString(), { logicalRoot });
  return loadProject(candidate, { logicalRoot });
}

function checkTaskEdit(root, taskId, request) {
  const snapshot = loadRevisionedProject(root);
  validateEnvelope(snapshot, taskId, request);
  const parent = path.dirname(root); const name = path.basename(root);
  const work = fs.mkdtempSync(path.join(parent, `.${name}.studio-check-`));
  const candidate = path.join(work, name);
  try {
    fs.cpSync(root, candidate, { recursive: true, errorOnExist: true, preserveTimestamps: true, dereference: false, verbatimSymlinks: true });
    if (mutationRevision(candidate) !== request.mutationRevision) throw new TaskEditError('MUTATION_CONFLICT', 'Candidate copy did not match the loaded project', { currentRevision: mutationRevision(root) });
    const state = applyCandidateEdit(candidate, root, taskId, request);
    const task = state.tasks.find((item) => item.id === taskId);
    return { valid: true, task: kanbanData(state).lanes.flatMap((lane) => lane.tasks).find((item) => item.id === task.id) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function saveTaskEdit(root, taskId, request, options = {}) {
  const snapshot = loadRevisionedProject(root);
  validateEnvelope(snapshot, taskId, request);
  try {
    atomicProjectMutation(root, (candidate, context) => {
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
  return loadRevisionedProject(root).data;
}

module.exports = {
  EDITABLE_FIELDS, TaskEditError, transformTaskDocument, loadRevisionedProject,
  checkTaskEdit, saveTaskEdit,
};
