/**
 * Responsibility: load and validate one explicitly selected Markdown project,
 * then calculate deterministic status, ranking, blockers, coverage, and Studio views.
 * Invariants: read-only operation, selected-root isolation, exact schema versions,
 * and schedule metadata that never changes execution-contract identity.
 * Recent changes: add PROJECT v2 tailoring, optional PMI modules, exact
 * project-name resolution, safe identity-only Studio discovery, and scoped
 * read-time warnings while retaining strict execution-time enforcement.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_EVIDENCE, canonicalJson, sha256, taskSpecHash, validateEvidenceRecord, validateEvidenceRequirements, validateTaskContract, validateManifest, renderRpdPrompt, validTimestamp, validateRpdTerminal } = require('./contracts');
const { PROJECT_WORK_NAME, PROJECT_WORK_MARKER, PROJECT_WORK_MARKER_TEXT } = require('./work-area');

const REQUIRED = ['PROJECT.md', 'TASKS.md', 'STATUS.md'];
const OPTIONAL_FILES = ['MILESTONES.md', 'RISKS.md', 'DECISIONS.md', 'SOURCES.md', 'TRACEABILITY.md', 'CHANGES.md', 'ASSUMPTIONS.md', 'ISSUES.md', 'STAKEHOLDERS.md', 'LESSONS.md', 'CLOSURE.md'];
const OPTIONAL_DIRS = ['handoffs', path.join('reports', 'history')];
const TASK_STATUSES = ['planned', 'ready', 'in_progress', 'implemented', 'verification', 'verified', 'done'];
const TASK_DISPOSITIONS = ['active', 'deferred', 'cancelled'];
const PROVIDERS = ['human', 'rpd', 'agent', 'external'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
// PMBOK 6 knowledge areas. PROJECT v2 declares each one applied or tailored out;
// the declaration is mandatory, the content of any area never is.
const KNOWLEDGE_AREAS = ['integration', 'scope', 'schedule', 'cost', 'quality', 'resource', 'communications', 'risk', 'procurement', 'stakeholder'];
// Only unambiguous area/module pairs are cross-checked. MILESTONES.md is deliberately
// unbound: milestones serve scope and integration reporting, not schedule alone.
const TAILORING_MODULES = { risk: { file: 'RISKS.md', key: 'risks' }, stakeholder: { file: 'STAKEHOLDERS.md', key: 'stakeholders' } };
const LEVELS = ['low', 'medium', 'high'];
const ENGAGEMENT_LEVELS = ['unaware', 'resistant', 'neutral', 'supportive', 'leading'];
const THREAT_STRATEGIES = ['avoid', 'transfer', 'mitigate', 'accept', 'escalate'];
const OPPORTUNITY_STRATEGIES = ['exploit', 'share', 'enhance', 'accept', 'escalate'];
const TYPED_REFERENCE_KINDS = ['project', 'task', 'milestone', 'risk', 'source', 'success'];
const ID = /^[A-Z](?:[A-Z0-9-]{0,62}[A-Z0-9])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[a-f0-9]{64}$/;

class ProjectError extends Error {
  constructor(kind, code, filePath, message, project = null) {
    super(message);
    this.kind = kind;
    this.code = code;
    this.path = filePath;
    this.project = project;
  }
}

function fail(kind, code, filePath, message, project) {
  throw new ProjectError(kind, code, filePath, message, project);
}

function assert(condition, code, filePath, message, project) {
  if (!condition) fail('semantic', code, filePath, message, project);
}

function exactKeys(value, allowed, filePath, label, project) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_OBJECT', filePath, `${label} must be an object`, project);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  assert(unknown.length === 0, 'UNKNOWN_FIELD', filePath, `${label} has unknown fields: ${unknown.join(', ')}`, project);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validDate(value) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function profilePolicy(profile) {
  return {
    human_completion: profile === 'controlled' ? 'governed' : 'lightweight',
    delegated_execution: 'governed',
  };
}

function taskDisposition(task) {
  return task.disposition ?? 'active';
}

function displayStatus(task) {
  const disposition = taskDisposition(task);
  if (disposition !== 'active') return disposition;
  if (task.status === 'done') return 'done';
  if (task.status === 'planned' || task.status === 'ready') return task.status;
  return 'active';
}

function taskClosed(task) {
  return task.status === 'done' || taskDisposition(task) === 'cancelled';
}

function taskLabel(task) {
  return `${task.title} (${task.id})`;
}

function rpdCommand(state, task, executionWarning = null) {
  if (executionWarning) return `${taskClosed(task) ? 'Execution history warning' : 'Execution blocked'} for ${task.id}: ${executionWarning.cause_code ?? executionWarning.code}.`;
  if (task.executor.provider === 'rpd' && task.active_contract !== null) {
    const contractPath = path.join(state.root, 'handoffs', task.id, task.active_contract, 'TASK-CONTRACT.md');
    const contractDoc = readSafe(state.root, path.relative(state.root, contractPath), true);
    const parsedContract = parseAttempt(contractDoc, contractPath, 'contract');
    return `RPD ${parsedContract.envelope.story} using task contract ${JSON.stringify(contractPath)}.`;
  }
  return `RPD ${JSON.stringify(task.title)} using project task ${JSON.stringify(path.join(state.root, 'TASKS.md'))}.`;
}

function namespacedId(value, prefix) {
  return ID.test(value) && value.startsWith(prefix);
}

// Tailoring is declare-only: it proves the omission of a knowledge area was a
// recorded decision, and never requires that any area actually be practiced.
function validateTailoring(value, filePath) {
  exactKeys(value, KNOWLEDGE_AREAS, filePath, 'tailoring');
  for (const area of KNOWLEDGE_AREAS) {
    assert(Object.hasOwn(value, area), 'TAILORING_AREA', filePath, `tailoring must declare knowledge area ${area}`);
    const entry = value[area];
    exactKeys(entry, ['applied', 'rationale', 'decided'], filePath, `tailoring ${area}`);
    for (const key of ['applied', 'rationale', 'decided']) assert(Object.hasOwn(entry, key), 'TAILORING_FIELD', filePath, `tailoring ${area} missing ${key}`);
    assert(typeof entry.applied === 'boolean', 'TAILORING_APPLIED', filePath, `tailoring ${area} applied must be boolean`);
    assert(entry.rationale === null || nonEmpty(entry.rationale), 'TAILORING_RATIONALE', filePath, `tailoring ${area} rationale must be null or a non-empty string`);
    assert(entry.applied || nonEmpty(entry.rationale), 'TAILORING_RATIONALE', filePath, `tailoring ${area} is tailored out and requires a rationale`);
    assert(validDate(entry.decided), 'TAILORING_DECIDED', filePath, `tailoring ${area} decided must be a date-only value`);
  }
}

function typedReferenceShape(value) {
  const index = value.indexOf(':');
  return index > 0 && TYPED_REFERENCE_KINDS.includes(value.slice(0, index)) && ID.test(value.slice(index + 1));
}

function assertTypedReferences(list, filePath, label, project) {
  assert(list.every(typedReferenceShape), 'TYPED_REFERENCE', filePath, `${label} contains an invalid typed reference`, project);
}

function resolveTypedReferences(list, typed, code, filePath, label, project) {
  for (const reference of list) {
    const split = reference.indexOf(':');
    const kind = reference.slice(0, split);
    const id = reference.slice(split + 1);
    assert(typed[kind]?.has(id), code, filePath, `${label} has unknown reference ${reference}`, project);
  }
}

function uniqueStrings(value, filePath, label, project, { sorted = true, allowEmpty = true } = {}) {
  assert(Array.isArray(value), 'INVALID_ARRAY', filePath, `${label} must be an array`, project);
  assert(allowEmpty || value.length > 0, 'EMPTY_ARRAY', filePath, `${label} must not be empty`, project);
  assert(value.every(nonEmpty), 'INVALID_STRING', filePath, `${label} must contain non-empty strings`, project);
  assert(new Set(value).size === value.length, 'DUPLICATE_VALUE', filePath, `${label} must be unique`, project);
  if (sorted) assert(canonicalJson([...value].sort()) === canonicalJson(value), 'UNSTABLE_ORDER', filePath, `${label} must be lexically ordered`, project);
  return value;
}

function parseFrontmatter(text, filePath) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') fail('grammar', 'FRONTMATTER_OPEN', filePath, 'Expected opening ---');
  const end = lines.indexOf('---', 1);
  if (end < 0) fail('grammar', 'FRONTMATTER_CLOSE', filePath, 'Expected closing ---');
  const data = {};
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    const match = /^([a-z][a-z0-9_]*): (.+)$/.exec(line);
    if (!match) fail('grammar', 'FRONTMATTER_LINE', filePath, `Invalid frontmatter line ${index + 1}`);
    if (Object.hasOwn(data, match[1])) fail('grammar', 'DUPLICATE_KEY', filePath, `Duplicate key ${match[1]}`);
    try { data[match[1]] = JSON.parse(match[2]); } catch { fail('grammar', 'FRONTMATTER_JSON', filePath, `Value for ${match[1]} must be complete JSON`); }
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}

function parseCollection(text, filePath, options = {}) {
  const parsed = parseFrontmatter(text, filePath);
  exactKeys(parsed.data, ['schema_version'], filePath, 'collection frontmatter');
  const schemaVersions = options.schemaVersions ?? [1];
  if (!schemaVersions.includes(parsed.data.schema_version)) fail('grammar', 'SCHEMA_VERSION', filePath, 'Unsupported schema_version');
  const heading = /^## ([A-Z][A-Z0-9-]{1,63}) - (.+)$/gm;
  const matches = [...parsed.body.matchAll(heading)];
  const allHeadings = [...parsed.body.matchAll(/^##(?:[ \t].*)?$/gm)];
  if (allHeadings.length !== matches.length) fail('grammar', 'RECORD_HEADING', filePath, 'Every level-two heading must be a valid record heading');
  const records = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const chunkEnd = index + 1 < matches.length ? matches[index + 1].index : parsed.body.length;
    const chunk = parsed.body.slice(match.index + match[0].length, chunkEnd);
    const metadata = /^\n+```json\n([^\n]+)\n```(?:\n|$)/.exec(chunk);
    if (!metadata) fail('grammar', 'RECORD_METADATA', filePath, `Record ${match[1]} must immediately contain one single-line json block`);
    let value;
    try { value = JSON.parse(metadata[1]); } catch { fail('grammar', 'RECORD_JSON', filePath, `Record ${match[1]} metadata is invalid JSON`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('grammar', 'RECORD_OBJECT', filePath, `Record ${match[1]} metadata must be an object`);
    if ([...chunk.matchAll(/```json/g)].length !== 1) fail('grammar', 'RECORD_METADATA_COUNT', filePath, `Record ${match[1]} must contain exactly one json metadata block`);
    if (!ID.test(match[1]) || match[2].trim() === '') fail('grammar', 'RECORD_HEADING', filePath, `Record ${match[1]} heading is invalid`);
    records.push({ id: match[1], title: match[2].trim(), raw: value });
  }
  const ids = records.map((record) => record.id.toLowerCase());
  if (new Set(ids).size !== ids.length) fail('semantic', 'DUPLICATE_ID', filePath, 'Record IDs must be unique case-insensitively');
  Object.defineProperty(records, 'schema_version', { value: parsed.data.schema_version, enumerable: false });
  return records;
}

function parseAttempt(text, filePath, type) {
  const parsed = parseFrontmatter(text, filePath);
  const contractKeys = ['schema_version', 'contract_id', 'payload_sha256', 'story', 'executor_prompt', 'executor_prompt_sha256'];
  const manifestKeys = ['schema_version', 'manifest_id', 'payload_sha256', 'evidence_sha256'];
  exactKeys(parsed.data, type === 'contract' ? contractKeys : manifestKeys, filePath, `${type} envelope`);
  for (const key of type === 'contract' ? contractKeys : manifestKeys) assert(Object.hasOwn(parsed.data, key), 'ATTEMPT_FIELD', filePath, `Missing ${type} envelope field ${key}`);
  const payloadMatch = /^\n*## Payload\n+```json\n([^\n]+)\n```\s*$/.exec(parsed.body);
  if (!payloadMatch) fail('grammar', 'ATTEMPT_PAYLOAD', filePath, `${type} must contain one canonical payload block`);
  let payload;
  try { payload = JSON.parse(payloadMatch[1]); } catch { fail('grammar', 'ATTEMPT_JSON', filePath, `${type} payload is invalid JSON`); }
  assert(canonicalJson(payload) === payloadMatch[1], 'ATTEMPT_CANONICAL', filePath, `${type} payload is not canonical`);
  assert(parsed.data.schema_version === 1 && parsed.data.payload_sha256 === sha256(payload), 'ATTEMPT_HASH', filePath, `${type} payload hash mismatch`);
  return { envelope: parsed.data, payload };
}

function readSafeBuffer(root, relative, required = false) {
  const normalized = path.normalize(relative);
  if (path.isAbsolute(relative) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) fail('path', 'ESCAPE', relative, 'Project state path escapes selected root');
  const target = path.join(root, relative);
  const parentRelative = path.dirname(normalized);
  if (parentRelative !== '.') assertRealDirectoryChain(root, parentRelative);
  let stat;
  try { stat = fs.lstatSync(target); } catch (error) {
    if (!required && error.code === 'ENOENT') return null;
    fail('path', 'MISSING_PATH', target, `Missing required path ${relative}`);
  }
  if (stat.isSymbolicLink()) fail('path', 'SYMLINK', target, 'Known project state paths cannot be symlinks');
  if (!stat.isFile()) fail('path', 'NOT_FILE', target, 'Expected a regular file');
  const real = fs.realpathSync(target);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) fail('path', 'ESCAPE', target, 'Project state escapes selected root');
  return fs.readFileSync(target);
}

function readSafe(root, relative, required = false) {
  const value = readSafeBuffer(root, relative, required);
  return value === null ? null : value.toString('utf8');
}

function assertRealDirectoryChain(root, relative) {
  let cursor = root;
  for (const piece of relative.split(path.sep)) {
    cursor = path.join(cursor, piece);
    if (!fs.existsSync(cursor)) return false;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('path', 'UNSAFE_DIRECTORY', cursor, 'Known project directories must be real directories');
  }
  return true;
}

function checkOptionalDirectories(root) {
  for (const relative of OPTIONAL_DIRS) {
    assertRealDirectoryChain(root, relative);
  }
}

function parseProject(text, filePath, root) {
  const { data, body } = parseFrontmatter(text, filePath);
  // Version is read before the field list is built: v1 keeps its exact historical
  // field set and rejects `tailoring`, so existing projects need no migration.
  assert(data.schema_version === 1 || data.schema_version === 2, 'SCHEMA_VERSION', filePath, 'Unsupported project schema');
  const fields = ['schema_version', 'id', 'name', 'status', 'owner', 'start_date', 'target_date', 'current_milestone', 'profile', 'adapters', 'created', 'updated'];
  if (data.schema_version === 2) fields.push('tailoring');
  exactKeys(data, fields, filePath, 'PROJECT frontmatter');
  for (const field of fields) assert(Object.hasOwn(data, field), 'MISSING_FIELD', filePath, `PROJECT missing ${field}`);
  if (data.schema_version === 2) validateTailoring(data.tailoring, filePath);
  assert(ID.test(data.id), 'INVALID_ID', filePath, 'Invalid project ID');
  assert(nonEmpty(data.name), 'INVALID_NAME', filePath, 'Project name is required');
  assert(['planning', 'active', 'on_hold', 'complete'].includes(data.status), 'INVALID_STATUS', filePath, 'Invalid project status');
  assert(data.owner === null || nonEmpty(data.owner), 'INVALID_OWNER', filePath, 'Owner must be null or non-empty');
  for (const key of ['start_date', 'target_date']) assert(data[key] === null || validDate(data[key]), 'INVALID_DATE', filePath, `${key} must be date-only or null`);
  assert(data.current_milestone === null || namespacedId(data.current_milestone, 'M-'), 'INVALID_MILESTONE', filePath, 'Invalid current milestone');
  assert(['minimal', 'standard', 'controlled'].includes(data.profile), 'INVALID_PROFILE', filePath, 'Invalid profile');
  uniqueStrings(data.adapters, filePath, 'adapters', null, { sorted: false, allowEmpty: false });
  assert(data.adapters.includes('human') && data.adapters.every((item) => PROVIDERS.includes(item)), 'INVALID_ADAPTER', filePath, 'Adapters must include human and known providers');
  assert(validDate(data.created) && validDate(data.updated), 'INVALID_DATE', filePath, 'created/updated must be date-only');
  const objective = /(?:^|\n)## Objective\n+([\s\S]*?)(?=\n## |$)/.exec(body)?.[1]?.trim();
  assert(nonEmpty(objective), 'MISSING_OBJECTIVE', filePath, 'Objective is required');
  const successBody = /(?:^|\n)## Success Criteria\n+([\s\S]*?)(?=\n## |$)/.exec(body)?.[1] ?? '';
  const successLines = successBody.split('\n').map((line) => line.trim()).filter(Boolean);
  assert(successLines.length > 0 && successLines.every((line) => /^- \[SC-[A-Z0-9-]+\] .+$/.test(line)), 'MALFORMED_SUCCESS', filePath, 'Every success-criteria line must use - [SC-ID] text');
  const success = successLines.map((line) => { const match = /^- \[(SC-[A-Z0-9-]+)\] (.+)$/.exec(line); return { id: match[1], text: match[2].trim() }; });
  assert(success.length > 0 && success.every((item) => nonEmpty(item.text)), 'MISSING_SUCCESS', filePath, 'At least one valid success criterion is required');
  assert(success.every((item) => namespacedId(item.id, 'SC-')), 'INVALID_SUCCESS', filePath, 'Success criterion IDs are invalid');
  assert(new Set(success.map((item) => item.id.toLowerCase())).size === success.length, 'DUPLICATE_SUCCESS', filePath, 'Success criteria must be unique case-insensitively');
  return { ...data, root, objective, success_criteria_items: success };
}

function normalizeTask(record, project, filePath, schemaVersion = 1) {
  const allowed = ['outcome', 'acceptance', 'status', 'priority', 'milestone', 'owner', 'executor', 'depends_on', 'blocks', 'blocked_by', 'sources', 'success_criteria', 'constraints', 'evidence_requirements', 'external_refs', 'critical', 'active_contract', 'last_manifest', 'created', 'updated'];
  if (schemaVersion >= 2) allowed.push('scheduled_start', 'scheduled_end');
  if (schemaVersion === 3) allowed.push('disposition', 'disposition_changed_at');
  exactKeys(record.raw, allowed, filePath, `task ${record.id}`, project);
  assert(nonEmpty(record.raw.outcome), 'TASK_OUTCOME', filePath, `Task ${record.id} requires outcome`, project);
  uniqueStrings(record.raw.acceptance, filePath, `task ${record.id} acceptance`, project, { sorted: false, allowEmpty: false });
  const rawExecutor = record.raw.executor ?? { provider: 'human', root: null, scope: null };
  exactKeys(rawExecutor, ['provider', 'root', 'scope'], filePath, `task ${record.id} executor`, project);
  const executor = { provider: rawExecutor.provider, root: rawExecutor.root, scope: rawExecutor.scope ?? (rawExecutor.root === null ? null : 'absolute') };
  assert(PROVIDERS.includes(executor.provider) && project.adapters.includes(executor.provider), 'TASK_EXECUTOR', filePath, `Task ${record.id} provider is not enabled`, project);
  const nullRootAllowed = ['human', 'agent', 'external'].includes(executor.provider) && executor.root === null && executor.scope === null;
  assert(nullRootAllowed || ['absolute', 'project'].includes(executor.scope), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} executor scope is invalid`, project);
  if (executor.scope === 'absolute') assert(path.isAbsolute(executor.root), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} absolute executor root is invalid`, project);
  if (executor.scope === 'project') assert(nonEmpty(executor.root) && !path.isAbsolute(executor.root) && !executor.root.split(/[\\/]/).includes('..'), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} project executor root must be a safe relative path`, project);
  assert(executor.provider !== 'rpd' || executor.root !== null, 'TASK_EXECUTOR_ROOT', filePath, `RPD task ${record.id} requires a root`, project);
  assert(executor.provider !== 'human' || executor.root === null, 'TASK_EXECUTOR_ROOT', filePath, `Human task ${record.id} root must be null`, project);
  const providerRequirements = JSON.parse(JSON.stringify(DEFAULT_EVIDENCE[executor.provider]));
  const task = {
    id: record.id, title: record.title, outcome: record.raw.outcome, acceptance: record.raw.acceptance,
    status: record.raw.status ?? 'planned', priority: record.raw.priority ?? 'P2', milestone: record.raw.milestone ?? null,
    owner: record.raw.owner ?? null, executor, depends_on: record.raw.depends_on ?? [], blocks: record.raw.blocks ?? [],
    blocked_by: record.raw.blocked_by ?? [], sources: record.raw.sources ?? [], success_criteria: record.raw.success_criteria ?? [],
    constraints: record.raw.constraints ?? [], evidence_requirements: record.raw.evidence_requirements ?? providerRequirements,
    external_refs: record.raw.external_refs ?? {}, critical: record.raw.critical ?? false,
    active_contract: record.raw.active_contract ?? null, last_manifest: record.raw.last_manifest ?? null,
    created: record.raw.created ?? null, updated: record.raw.updated ?? null,
  };
  // Keep the normalized v1 shape byte-compatible with the original reader so
  // merely installing schedule support cannot make an untouched STATUS stale.
  if (schemaVersion === 2) {
    task.scheduled_start = record.raw.scheduled_start ?? null;
    task.scheduled_end = record.raw.scheduled_end ?? null;
  }
  if (schemaVersion === 3) {
    task.scheduled_start = record.raw.scheduled_start ?? null;
    task.scheduled_end = record.raw.scheduled_end ?? null;
    task.disposition = record.raw.disposition ?? 'active';
    task.disposition_changed_at = record.raw.disposition_changed_at ?? null;
  }
  assert(TASK_STATUSES.includes(task.status), 'TASK_STATUS', filePath, `Task ${task.id} has invalid status`, project);
  assert(PRIORITIES.includes(task.priority), 'TASK_PRIORITY', filePath, `Task ${task.id} has invalid priority`, project);
  assert(task.milestone === null || namespacedId(task.milestone, 'M-'), 'TASK_MILESTONE', filePath, `Task ${task.id} has invalid milestone`, project);
  assert(task.owner === null || nonEmpty(task.owner), 'TASK_OWNER', filePath, `Task ${task.id} owner is invalid`, project);
  for (const key of ['depends_on', 'blocks', 'blocked_by', 'sources', 'success_criteria', 'constraints']) uniqueStrings(task[key], filePath, `task ${task.id} ${key}`, project, { sorted: key !== 'constraints' });
  assert(typeof task.critical === 'boolean', 'TASK_CRITICAL', filePath, `Task ${task.id} critical must be boolean`, project);
  assert(task.active_contract === null || /^tc-[a-f0-9]{64}$/.test(task.active_contract), 'TASK_CONTRACT', filePath, `Task ${task.id} active contract is invalid`, project);
  assert(task.last_manifest === null || /^em-[a-f0-9]{64}$/.test(task.last_manifest), 'TASK_MANIFEST', filePath, `Task ${task.id} last manifest is invalid`, project);
  const scheduleKeys = ['scheduled_start', 'scheduled_end'].filter((key) => Object.hasOwn(record.raw, key));
  assert(scheduleKeys.length === 0 || scheduleKeys.length === 2, 'TASK_SCHEDULE', filePath, `Task ${task.id} schedule must contain both scheduled_start and scheduled_end`, project);
  if (scheduleKeys.length === 2) {
    assert(validDate(task.scheduled_start) && validDate(task.scheduled_end), 'TASK_SCHEDULE', filePath, `Task ${task.id} schedule dates are invalid`, project);
    assert(task.scheduled_start <= task.scheduled_end, 'TASK_SCHEDULE', filePath, `Task ${task.id} scheduled_start must not be after scheduled_end`, project);
  }
  const dispositionKeys = ['disposition', 'disposition_changed_at'].filter((key) => Object.hasOwn(record.raw, key));
  assert(dispositionKeys.length === 0 || dispositionKeys.length === 2, 'TASK_DISPOSITION', filePath, `Task ${task.id} disposition must contain both disposition and disposition_changed_at`, project);
  if (schemaVersion === 3 && dispositionKeys.length === 2) {
    assert(['deferred', 'cancelled'].includes(task.disposition), 'TASK_DISPOSITION', filePath, `Task ${task.id} disposition must be deferred or cancelled when persisted`, project);
    assert(validTimestamp(task.disposition_changed_at), 'TASK_DISPOSITION', filePath, `Task ${task.id} disposition_changed_at must be RFC3339 UTC`, project);
  }
  if (schemaVersion === 3 && dispositionKeys.length === 0) {
    assert(task.disposition === 'active' && task.disposition_changed_at === null, 'TASK_DISPOSITION', filePath, `Task ${task.id} active disposition must be implicit`, project);
  }
  assert(TASK_DISPOSITIONS.includes(taskDisposition(task)), 'TASK_DISPOSITION', filePath, `Task ${task.id} disposition is invalid`, project);
  assert(task.created === null || validDate(task.created), 'INVALID_DATE', filePath, `Task ${task.id} created is invalid`, project);
  assert(task.updated === null || validDate(task.updated), 'INVALID_DATE', filePath, `Task ${task.id} updated is invalid`, project);
  assert(task.external_refs && typeof task.external_refs === 'object' && !Array.isArray(task.external_refs), 'TASK_EXTERNAL_REFS', filePath, `Task ${task.id} external_refs must be an object`, project);
  for (const [key, value] of Object.entries(task.external_refs)) assert(/^[a-z][a-z0-9_-]{1,31}$/.test(key) && nonEmpty(value), 'TASK_EXTERNAL_REFS', filePath, `Task ${task.id} external_refs is invalid`, project);
  try { validateEvidenceRequirements(task.evidence_requirements); } catch (error) { fail('semantic', 'TASK_EVIDENCE', filePath, `Task ${task.id}: ${error.message}`, project); }
  task.spec_sha256 = taskSpecHash(task);
  return task;
}

function executorRootWarning(task, physicalProjectRoot) {
  if (task.status === 'done' || task.executor.root === null) return null;
  const executorRoot = task.executor.scope === 'project'
    ? path.resolve(physicalProjectRoot, task.executor.root)
    : task.executor.root;
  let available = false;
  try {
    if (task.executor.scope === 'project') {
      let cursor = physicalProjectRoot;
      available = true;
      for (const piece of task.executor.root.split(/[\\/]/)) {
        cursor = path.join(cursor, piece);
        if (!fs.existsSync(cursor)) { available = false; break; }
        const stat = fs.lstatSync(cursor);
        if (stat.isSymbolicLink() || !stat.isDirectory()) { available = false; break; }
      }
      if (available) available = fs.realpathSync(executorRoot).startsWith(`${fs.realpathSync(physicalProjectRoot)}${path.sep}`);
    } else if (fs.existsSync(executorRoot)) {
      const stat = fs.lstatSync(executorRoot);
      available = !stat.isSymbolicLink() && stat.isDirectory();
    }
  } catch {
    available = false;
  }
  if (available) return null;
  return {
    code: 'TASK_EXECUTOR_ROOT_UNAVAILABLE',
    path: 'TASKS.md',
    task_id: task.id,
    message: `${taskLabel(task)} cannot run because its configured working folder is missing or inaccessible. Point the task to an existing folder before running it.`,
  };
}

function normalizeSimple(record, kind, project, filePath, schemaVersion = 1) {
  const raw = record.raw;
  if (kind === 'milestones') {
    assert(namespacedId(record.id, 'M-'), 'MILESTONE_ID', filePath, `Invalid milestone ID ${record.id}`, project);
    exactKeys(raw, ['status', 'target_date', 'forecast_date', 'forecast_updated', 'forecast_evidence', 'critical'], filePath, `milestone ${record.id}`, project);
    const item = { id: record.id, title: record.title, status: raw.status, target_date: raw.target_date ?? null, forecast_date: raw.forecast_date ?? null, forecast_updated: raw.forecast_updated ?? null, forecast_evidence: raw.forecast_evidence ?? [], critical: raw.critical ?? false };
    assert(['planned', 'active', 'complete'].includes(item.status), 'MILESTONE_STATUS', filePath, 'Invalid milestone status', project);
    for (const key of ['target_date', 'forecast_date', 'forecast_updated']) assert(item[key] === null || validDate(item[key]), 'INVALID_DATE', filePath, `Invalid milestone ${key}`, project);
    assert(Array.isArray(item.forecast_evidence), 'MILESTONE_EVIDENCE', filePath, 'forecast_evidence must be an array', project);
    item.forecast_evidence.forEach((value, index) => { try { validateEvidenceRecord(value, `forecast_evidence[${index}]`); } catch (error) { fail('semantic', 'MILESTONE_EVIDENCE', filePath, error.message, project); } });
    assert(typeof item.critical === 'boolean', 'MILESTONE_CRITICAL', filePath, 'Milestone critical must be boolean', project);
    const forecastParts = [item.forecast_date, item.forecast_updated, item.forecast_evidence.length ? true : null];
    assert(forecastParts.every((value) => value === null) || forecastParts.every((value) => value !== null), 'MILESTONE_FORECAST', filePath, 'Forecast fields must be populated together', project);
    return item;
  }
  if (kind === 'risks') {
    assert(namespacedId(record.id, 'RISK-'), 'RISK_ID', filePath, `Invalid risk ID ${record.id}`, project);
    const riskFields = ['status', 'probability', 'impact', 'mitigation', 'owner', 'milestone'];
    exactKeys(raw, schemaVersion === 2 ? [...riskFields, 'direction', 'strategy', 'trigger', 'residual'] : riskFields, filePath, `risk ${record.id}`, project);
    const item = { id: record.id, title: record.title, status: raw.status, probability: raw.probability, impact: raw.impact, mitigation: raw.mitigation, owner: raw.owner ?? null, milestone: raw.milestone ?? null };
    assert(['open', 'mitigated', 'accepted', 'closed'].includes(item.status) && ['low', 'medium', 'high'].includes(item.probability) && ['low', 'medium', 'high'].includes(item.impact) && nonEmpty(item.mitigation), 'RISK_SCHEMA', filePath, 'Invalid risk record', project);
    assert(item.owner === null || nonEmpty(item.owner), 'RISK_OWNER', filePath, 'Invalid risk owner', project);
    assert(item.milestone === null || namespacedId(item.milestone, 'M-'), 'RISK_MILESTONE', filePath, 'Invalid risk milestone', project);
    // v1 keeps its exact historical normalized shape so adding response-strategy
    // support cannot change any existing project's source hash.
    if (schemaVersion === 2) {
      item.direction = raw.direction ?? 'threat';
      item.strategy = raw.strategy ?? null;
      item.trigger = raw.trigger ?? null;
      item.residual = raw.residual ?? null;
      assert(['threat', 'opportunity'].includes(item.direction), 'RISK_DIRECTION', filePath, `Risk ${record.id} direction must be threat or opportunity`, project);
      const strategies = item.direction === 'opportunity' ? OPPORTUNITY_STRATEGIES : THREAT_STRATEGIES;
      assert(item.strategy === null || strategies.includes(item.strategy), 'RISK_STRATEGY', filePath, `Risk ${record.id} strategy is not valid for a ${item.direction}`, project);
      assert(item.trigger === null || nonEmpty(item.trigger), 'RISK_TRIGGER', filePath, `Risk ${record.id} trigger must be null or non-empty`, project);
      assert(item.residual === null || LEVELS.includes(item.residual), 'RISK_RESIDUAL', filePath, `Risk ${record.id} residual must be null or a level`, project);
    }
    return item;
  }
  if (kind === 'assumptions') {
    assert(namespacedId(record.id, 'ASM-'), 'ASSUMPTION_ID', filePath, `Invalid assumption ID ${record.id}`, project);
    exactKeys(raw, ['status', 'kind', 'statement', 'impact_if_false', 'owner', 'due_date', 'validated_date', 'affects'], filePath, `assumption ${record.id}`, project);
    const item = { id: record.id, title: record.title, status: raw.status, kind: raw.kind, statement: raw.statement, impact_if_false: raw.impact_if_false, owner: raw.owner ?? null, due_date: raw.due_date ?? null, validated_date: raw.validated_date ?? null, affects: raw.affects ?? [] };
    assert(['open', 'confirmed', 'invalidated'].includes(item.status), 'ASSUMPTION_STATUS', filePath, `Assumption ${record.id} has invalid status`, project);
    assert(['assumption', 'constraint'].includes(item.kind), 'ASSUMPTION_KIND', filePath, `Assumption ${record.id} kind must be assumption or constraint`, project);
    assert(nonEmpty(item.statement) && nonEmpty(item.impact_if_false), 'ASSUMPTION_SCHEMA', filePath, `Assumption ${record.id} requires statement and impact_if_false`, project);
    assert(item.owner === null || nonEmpty(item.owner), 'ASSUMPTION_OWNER', filePath, `Assumption ${record.id} owner is invalid`, project);
    for (const key of ['due_date', 'validated_date']) assert(item[key] === null || validDate(item[key]), 'INVALID_DATE', filePath, `Assumption ${record.id} ${key} is invalid`, project);
    assert(item.status === 'open' ? item.validated_date === null : item.validated_date !== null, 'ASSUMPTION_VALIDATION', filePath, `Assumption ${record.id} must record validated_date exactly when it is no longer open`, project);
    uniqueStrings(item.affects, filePath, `assumption ${record.id} affects`, project);
    assertTypedReferences(item.affects, filePath, `assumption ${record.id} affects`, project);
    return item;
  }
  if (kind === 'issues') {
    assert(namespacedId(record.id, 'ISS-'), 'ISSUE_ID', filePath, `Invalid issue ID ${record.id}`, project);
    exactKeys(raw, ['status', 'severity', 'description', 'owner', 'raised_date', 'due_date', 'resolved_date', 'resolution', 'affects', 'escalated'], filePath, `issue ${record.id}`, project);
    const item = { id: record.id, title: record.title, status: raw.status, severity: raw.severity, description: raw.description, owner: raw.owner ?? null, raised_date: raw.raised_date, due_date: raw.due_date ?? null, resolved_date: raw.resolved_date ?? null, resolution: raw.resolution ?? null, affects: raw.affects ?? [], escalated: raw.escalated ?? false };
    assert(['open', 'in_progress', 'resolved', 'closed'].includes(item.status), 'ISSUE_STATUS', filePath, `Issue ${record.id} has invalid status`, project);
    assert(['low', 'medium', 'high', 'critical'].includes(item.severity), 'ISSUE_SEVERITY', filePath, `Issue ${record.id} has invalid severity`, project);
    assert(nonEmpty(item.description), 'ISSUE_SCHEMA', filePath, `Issue ${record.id} requires a description`, project);
    assert(item.owner === null || nonEmpty(item.owner), 'ISSUE_OWNER', filePath, `Issue ${record.id} owner is invalid`, project);
    assert(validDate(item.raised_date), 'INVALID_DATE', filePath, `Issue ${record.id} raised_date is invalid`, project);
    for (const key of ['due_date', 'resolved_date']) assert(item[key] === null || validDate(item[key]), 'INVALID_DATE', filePath, `Issue ${record.id} ${key} is invalid`, project);
    assert(typeof item.escalated === 'boolean', 'ISSUE_ESCALATED', filePath, `Issue ${record.id} escalated must be boolean`, project);
    const settled = ['resolved', 'closed'].includes(item.status);
    assert(settled ? item.resolved_date !== null && nonEmpty(item.resolution) : item.resolved_date === null && item.resolution === null, 'ISSUE_RESOLUTION', filePath, `Issue ${record.id} must record resolution and resolved_date exactly when resolved or closed`, project);
    assert(item.resolved_date === null || item.resolved_date >= item.raised_date, 'ISSUE_DATES', filePath, `Issue ${record.id} cannot be resolved before it was raised`, project);
    uniqueStrings(item.affects, filePath, `issue ${record.id} affects`, project);
    assertTypedReferences(item.affects, filePath, `issue ${record.id} affects`, project);
    return item;
  }
  if (kind === 'stakeholders') {
    assert(namespacedId(record.id, 'STK-'), 'STAKEHOLDER_ID', filePath, `Invalid stakeholder ID ${record.id}`, project);
    exactKeys(raw, ['role', 'organization', 'interest', 'influence', 'current_engagement', 'target_engagement', 'strategy', 'owner'], filePath, `stakeholder ${record.id}`, project);
    const item = { id: record.id, title: record.title, role: raw.role, organization: raw.organization ?? null, interest: raw.interest, influence: raw.influence, current_engagement: raw.current_engagement, target_engagement: raw.target_engagement, strategy: raw.strategy ?? null, owner: raw.owner ?? null };
    assert(nonEmpty(item.role), 'STAKEHOLDER_SCHEMA', filePath, `Stakeholder ${record.id} requires a role`, project);
    assert(item.organization === null || nonEmpty(item.organization), 'STAKEHOLDER_SCHEMA', filePath, `Stakeholder ${record.id} organization is invalid`, project);
    assert(LEVELS.includes(item.interest) && LEVELS.includes(item.influence), 'STAKEHOLDER_LEVEL', filePath, `Stakeholder ${record.id} interest and influence must be low, medium, or high`, project);
    assert(ENGAGEMENT_LEVELS.includes(item.current_engagement) && ENGAGEMENT_LEVELS.includes(item.target_engagement), 'STAKEHOLDER_ENGAGEMENT', filePath, `Stakeholder ${record.id} engagement levels are invalid`, project);
    assert(item.strategy === null || nonEmpty(item.strategy), 'STAKEHOLDER_STRATEGY', filePath, `Stakeholder ${record.id} strategy must be null or non-empty`, project);
    // Declaring an engagement gap without a strategy is an unowned intention.
    assert(item.current_engagement === item.target_engagement || nonEmpty(item.strategy), 'STAKEHOLDER_STRATEGY', filePath, `Stakeholder ${record.id} declares an engagement gap and requires a strategy`, project);
    assert(item.owner === null || nonEmpty(item.owner), 'STAKEHOLDER_OWNER', filePath, `Stakeholder ${record.id} owner is invalid`, project);
    return item;
  }
  if (kind === 'lessons') {
    assert(namespacedId(record.id, 'LES-'), 'LESSON_ID', filePath, `Invalid lesson ID ${record.id}`, project);
    exactKeys(raw, ['category', 'statement', 'recommendation', 'date', 'source_tasks', 'source_milestone'], filePath, `lesson ${record.id}`, project);
    const item = { id: record.id, title: record.title, category: raw.category, statement: raw.statement, recommendation: raw.recommendation, date: raw.date, source_tasks: raw.source_tasks ?? [], source_milestone: raw.source_milestone ?? null };
    assert(['process', 'technical', 'communication', 'estimation', 'risk', 'other'].includes(item.category), 'LESSON_CATEGORY', filePath, `Lesson ${record.id} has invalid category`, project);
    assert(nonEmpty(item.statement) && nonEmpty(item.recommendation), 'LESSON_SCHEMA', filePath, `Lesson ${record.id} requires statement and recommendation`, project);
    assert(validDate(item.date), 'INVALID_DATE', filePath, `Lesson ${record.id} date is invalid`, project);
    uniqueStrings(item.source_tasks, filePath, `lesson ${record.id} source_tasks`, project);
    assert(item.source_milestone === null || namespacedId(item.source_milestone, 'M-'), 'LESSON_MILESTONE', filePath, `Lesson ${record.id} source_milestone is invalid`, project);
    return item;
  }
  if (kind === 'closure') {
    assert(namespacedId(record.id, 'CLO-'), 'CLOSURE_ID', filePath, `Invalid closure ID ${record.id}`, project);
    exactKeys(raw, ['scope', 'milestone', 'status', 'accepted_by', 'accepted_date', 'acceptance_evidence', 'outstanding_items', 'archive_ref'], filePath, `closure ${record.id}`, project);
    const item = { id: record.id, title: record.title, scope: raw.scope, milestone: raw.milestone ?? null, status: raw.status, accepted_by: raw.accepted_by ?? null, accepted_date: raw.accepted_date ?? null, acceptance_evidence: raw.acceptance_evidence ?? [], outstanding_items: raw.outstanding_items ?? [], archive_ref: raw.archive_ref ?? null };
    assert(['project', 'milestone'].includes(item.scope), 'CLOSURE_SCOPE', filePath, `Closure ${record.id} scope must be project or milestone`, project);
    assert(['pending', 'accepted'].includes(item.status), 'CLOSURE_STATUS', filePath, `Closure ${record.id} status must be pending or accepted`, project);
    assert(item.scope === 'milestone' ? namespacedId(item.milestone ?? '', 'M-') : item.milestone === null, 'CLOSURE_SCOPE', filePath, `Closure ${record.id} must name a milestone exactly when its scope is milestone`, project);
    assert(item.accepted_date === null || validDate(item.accepted_date), 'INVALID_DATE', filePath, `Closure ${record.id} accepted_date is invalid`, project);
    assert(Array.isArray(item.acceptance_evidence), 'CLOSURE_EVIDENCE', filePath, `Closure ${record.id} acceptance_evidence must be an array`, project);
    item.acceptance_evidence.forEach((value, index) => { try { validateEvidenceRecord(value, `acceptance_evidence[${index}]`); } catch (error) { fail('semantic', 'CLOSURE_EVIDENCE', filePath, `Closure ${record.id}: ${error.message}`, project); } });
    // Acceptance is a claim about reality, so it must carry an acceptor, a date, and evidence.
    if (item.status === 'accepted') assert(nonEmpty(item.accepted_by) && item.accepted_date !== null && item.acceptance_evidence.length > 0, 'CLOSURE_ACCEPTANCE', filePath, `Closure ${record.id} acceptance requires accepted_by, accepted_date, and evidence`, project);
    else assert(item.accepted_by === null && item.accepted_date === null && item.acceptance_evidence.length === 0, 'CLOSURE_ACCEPTANCE', filePath, `Closure ${record.id} is pending and cannot bind acceptance evidence`, project);
    uniqueStrings(item.outstanding_items, filePath, `closure ${record.id} outstanding_items`, project, { sorted: false });
    assert(item.archive_ref === null || nonEmpty(item.archive_ref), 'CLOSURE_ARCHIVE', filePath, `Closure ${record.id} archive_ref must be null or non-empty`, project);
    return item;
  }
  if (kind === 'decisions') {
    assert(namespacedId(record.id, 'DEC-'), 'DECISION_ID', filePath, `Invalid decision ID ${record.id}`, project);
    exactKeys(raw, ['status', 'decision', 'owner', 'due_date', 'date', 'affects'], filePath, `decision ${record.id}`, project);
    const item = { id: record.id, title: record.title, status: raw.status, decision: raw.decision, owner: raw.owner ?? null, due_date: raw.due_date ?? null, date: raw.date ?? null, affects: raw.affects ?? [] };
    assert(['proposed', 'decided', 'superseded'].includes(item.status) && nonEmpty(item.decision), 'DECISION_SCHEMA', filePath, 'Invalid decision record', project);
    assert(item.owner === null || nonEmpty(item.owner), 'DECISION_OWNER', filePath, 'Invalid decision owner', project);
    for (const key of ['due_date', 'date']) assert(item[key] === null || validDate(item[key]), 'INVALID_DATE', filePath, `Invalid decision ${key}`, project);
    uniqueStrings(item.affects, filePath, `decision ${record.id} affects`, project);
    assert(item.affects.every((value) => { const index = value.indexOf(':'); return index > 0 && ['project', 'task', 'milestone', 'risk', 'source', 'success'].includes(value.slice(0, index)) && ID.test(value.slice(index + 1)); }), 'DECISION_AFFECTS', filePath, 'Invalid decision affects reference', project);
    return item;
  }
  if (kind === 'sources') {
    assert(namespacedId(record.id, 'SRC-'), 'SOURCE_ID', filePath, `Invalid source ID ${record.id}`, project);
    exactKeys(raw, ['kind', 'location', 'role', 'status', 'version', 'sha256'], filePath, `source ${record.id}`, project);
    const item = { id: record.id, title: record.title, kind: raw.kind, location: raw.location, role: raw.role, status: raw.status, version: raw.version ?? null, sha256: raw.sha256 ?? null };
    assert(['document', 'pdf', 'sheet', 'requirement', 'specification', 'code', 'url', 'other'].includes(item.kind) && nonEmpty(item.location) && nonEmpty(item.role) && ['current', 'superseded'].includes(item.status), 'SOURCE_SCHEMA', filePath, 'Invalid source record', project);
    assert(item.version === null || nonEmpty(item.version), 'SOURCE_VERSION', filePath, 'Invalid source version', project);
    assert(item.sha256 === null || HASH.test(item.sha256), 'SOURCE_HASH', filePath, 'Invalid source hash', project);
    item.record_sha256 = sha256(raw);
    return item;
  }
  if (kind === 'changes') {
    assert(namespacedId(record.id, 'CHG-'), 'CHANGE_ID', filePath, `Invalid change ID ${record.id}`, project);
    exactKeys(raw, ['date', 'observed_at', 'sources', 'affected_tasks', 'affected_milestones', 'reverify_tasks', 'reverification', 'risk_summary'], filePath, `change ${record.id}`, project);
    const item = { id: record.id, title: record.title, ...raw, reverification: raw.reverification ?? Object.fromEntries((raw.reverify_tasks ?? []).map((id) => [id, { status: 'pending', contract_id: null, manifest_id: null }])) };
    assert(validDate(item.date) && validTimestamp(item.observed_at) && item.observed_at.slice(0, 10) === item.date && nonEmpty(item.risk_summary), 'CHANGE_SCHEMA', filePath, 'Invalid change record timestamp or risk summary', project);
    for (const key of ['sources', 'affected_tasks', 'affected_milestones', 'reverify_tasks']) uniqueStrings(item[key], filePath, `change ${record.id} ${key}`, project);
    assert(item.reverify_tasks.every((id) => item.affected_tasks.includes(id)), 'CHANGE_REVERIFY', filePath, 'reverify_tasks must be affected', project);
    assert(item.reverification && typeof item.reverification === 'object' && !Array.isArray(item.reverification) && canonicalJson(Object.keys(item.reverification).sort()) === canonicalJson([...item.reverify_tasks].sort()), 'CHANGE_REVERIFY', filePath, 'reverification must map every reverify task', project);
    for (const [taskId, value] of Object.entries(item.reverification)) {
      exactKeys(value, ['status', 'contract_id', 'manifest_id'], filePath, `change ${record.id} reverification ${taskId}`, project);
      assert(['pending', 'in_progress', 'complete'].includes(value.status), 'CHANGE_REVERIFY', filePath, 'Invalid reverification status', project);
      assert(value.contract_id === null || /^tc-[a-f0-9]{64}$/.test(value.contract_id), 'CHANGE_REVERIFY', filePath, 'Invalid reverification contract ID', project);
      assert(value.manifest_id === null || /^em-[a-f0-9]{64}$/.test(value.manifest_id), 'CHANGE_REVERIFY', filePath, 'Invalid reverification manifest ID', project);
      if (value.status === 'pending') assert(value.contract_id === null && value.manifest_id === null, 'CHANGE_REVERIFY', filePath, 'Pending reverification cannot bind evidence', project);
      if (value.status === 'in_progress') assert(value.contract_id !== null && value.manifest_id === null, 'CHANGE_REVERIFY', filePath, 'In-progress reverification requires only a contract', project);
      if (value.status === 'complete') assert(value.contract_id !== null && value.manifest_id !== null, 'CHANGE_REVERIFY', filePath, 'Complete reverification requires contract and manifest', project);
    }
    return item;
  }
  return record;
}

function loadTraceability(text, filePath, project, tasks, sources) {
  if (text === null) return { configured: false };
  const parsed = parseFrontmatter(text, filePath);
  exactKeys(parsed.data, ['schema_version', 'items'], filePath, 'TRACEABILITY frontmatter', project);
  assert(Object.hasOwn(parsed.data, 'schema_version') && Object.hasOwn(parsed.data, 'items') && parsed.data.schema_version === 1 && Array.isArray(parsed.data.items), 'TRACEABILITY_SCHEMA', filePath, 'Invalid traceability schema', project);
  const pairs = new Set();
  let prior = '';
  const taskIds = new Set(tasks.map((item) => item.id));
  const sourceIds = new Set(sources.map((item) => item.id));
  for (const item of parsed.data.items) {
    exactKeys(item, ['source_id', 'criterion', 'tasks'], filePath, 'traceability item', project);
    assert(sourceIds.has(item.source_id) && nonEmpty(item.criterion), 'TRACEABILITY_REFERENCE', filePath, 'Traceability source/criterion is invalid', project);
    uniqueStrings(item.tasks, filePath, 'traceability tasks', project);
    assert(item.tasks.every((id) => taskIds.has(id)), 'TRACEABILITY_REFERENCE', filePath, 'Traceability task is unknown', project);
    const key = `${item.source_id}\0${item.criterion}`;
    assert(!pairs.has(key) && key > prior, 'TRACEABILITY_ORDER', filePath, 'Traceability pairs must be unique and ordered', project);
    pairs.add(key); prior = key;
  }
  return { configured: true, items: parsed.data.items };
}

function validateGraph(state, options = {}) {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  const successIds = new Set(state.project.success_criteria_items.map((item) => item.id));
  const milestoneIds = new Set(state.milestones.items.map((item) => item.id));
  const sourceIds = new Set(state.sources.items.map((item) => item.id));
  const riskIds = new Set(state.risks.items.map((item) => item.id));
  for (const task of state.tasks) {
    assert(task.depends_on.every((id) => byId.has(id) && id !== task.id), 'TASK_DEPENDENCY', 'TASKS.md', `Task ${task.id} has invalid dependency`, state.project);
    const expectedBlocks = state.tasks.filter((candidate) => candidate.depends_on.includes(task.id)).map((item) => item.id).sort();
    assert(canonicalJson(task.blocks) === canonicalJson(expectedBlocks), 'TASK_REVERSE_LINK', 'TASKS.md', `Task ${task.id} blocks is stale`, state.project);
    assert(task.success_criteria.every((id) => successIds.has(id)), 'TASK_SUCCESS_REF', 'TASKS.md', `Task ${task.id} has unknown success criterion`, state.project);
    assert(task.milestone === null || milestoneIds.has(task.milestone), 'TASK_MILESTONE_REF', 'TASKS.md', `Task ${task.id} has unknown milestone`, state.project);
    assert(task.sources.every((id) => sourceIds.has(id) && state.sources.items.find((source) => source.id === id).status === 'current'), 'TASK_SOURCE_REF', 'TASKS.md', `Task ${task.id} has invalid source`, state.project);
    try {
      const active = task.active_contract !== null;
      assert((['planned', 'ready'].includes(task.status) && !active && task.last_manifest === null) || (!['planned', 'ready'].includes(task.status) && active), 'TASK_LIFECYCLE', 'TASKS.md', `Task ${task.id} lifecycle pointers are inconsistent`, state.project);
      assert(!['implemented', 'verification', 'verified', 'done'].includes(task.status) || task.last_manifest !== null, 'TASK_LIFECYCLE', 'TASKS.md', `Task ${task.id} requires a manifest pointer`, state.project);
    } catch (error) {
      if (!options.taskErrorsAsWarnings || !(error instanceof ProjectError)) throw error;
      recordTaskExecutionWarning(state, task.id, error);
    }
    if (task.status === 'ready' && taskDisposition(task) === 'active') assert(task.blocked_by.length === 0 && task.depends_on.every((id) => byId.get(id).status === 'done'), 'TASK_READY', 'TASKS.md', `Task ${task.id} cannot be ready while blocked`, state.project);
    if (task.status === 'done') {
      assert(taskDisposition(task) === 'active', 'TASK_DONE', 'TASKS.md', `Task ${task.id} cannot be done with a non-active disposition`, state.project);
      assert(task.blocked_by.length === 0 && task.depends_on.every((id) => byId.get(id).status === 'done'), 'TASK_DONE', 'TASKS.md', `Task ${task.id} cannot be done while blocked or dependency-incomplete`, state.project);
    }
  }
  const visiting = new Set(); const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) assert(false, 'TASK_CYCLE', 'TASKS.md', `Dependency cycle includes ${id}`, state.project);
    if (visited.has(id)) return;
    visiting.add(id); byId.get(id).depends_on.forEach(visit); visiting.delete(id); visited.add(id);
  }
  state.tasks.forEach((task) => visit(task.id));
  if (state.project.current_milestone !== null) assert(milestoneIds.has(state.project.current_milestone), 'PROJECT_MILESTONE_REF', 'PROJECT.md', 'Current milestone is unknown', state.project);
  const activeMilestones = state.milestones.items.filter((item) => item.status === 'active');
  assert(activeMilestones.length <= 1, 'MILESTONE_ACTIVE', 'MILESTONES.md', 'Only one milestone may be active', state.project);
  if (activeMilestones.length === 1) assert(state.project.current_milestone === activeMilestones[0].id, 'MILESTONE_CURRENT', 'PROJECT.md', 'Current milestone must match active milestone', state.project);
  if (activeMilestones.length === 0) assert(state.project.current_milestone === null, 'MILESTONE_CURRENT', 'PROJECT.md', 'Current milestone must be null when no milestone is active', state.project);
  for (const milestone of state.milestones.items.filter((item) => item.status === 'complete')) assert(state.tasks.filter((task) => task.milestone === milestone.id).every(taskClosed), 'MILESTONE_COMPLETE', 'MILESTONES.md', `Milestone ${milestone.id} has unfinished tasks`, state.project);
  for (const risk of state.risks.items) assert(risk.milestone === null || milestoneIds.has(risk.milestone), 'RISK_REFERENCE', 'RISKS.md', `Risk ${risk.id} has unknown milestone`, state.project);
  const typed = { project: new Set([state.project.id]), task: new Set(byId.keys()), milestone: milestoneIds, risk: riskIds, source: sourceIds, success: successIds };
  for (const decision of state.decisions.items) for (const reference of decision.affects) {
    const split = reference.indexOf(':'); const kind = reference.slice(0, split); const id = reference.slice(split + 1);
    assert(typed[kind]?.has(id), 'DECISION_REFERENCE', 'DECISIONS.md', `Decision ${decision.id} has unknown reference ${reference}`, state.project);
  }
  // A declared-out knowledge area whose module is configured would make the
  // tailoring record fiction, so the contradiction fails closed.
  if (state.project.tailoring) {
    for (const [area, target] of Object.entries(TAILORING_MODULES)) {
      if (state[target.key].configured) assert(state.project.tailoring[area].applied, 'TAILORING_CONTRADICTION', 'PROJECT.md', `Knowledge area ${area} is declared tailored out but ${target.file} is configured`, state.project);
    }
  }
  for (const assumption of state.assumptions.items) resolveTypedReferences(assumption.affects, typed, 'ASSUMPTION_REFERENCE', 'ASSUMPTIONS.md', `Assumption ${assumption.id}`, state.project);
  for (const issue of state.issues.items) resolveTypedReferences(issue.affects, typed, 'ISSUE_REFERENCE', 'ISSUES.md', `Issue ${issue.id}`, state.project);
  for (const lesson of state.lessons.items) {
    assert(lesson.source_tasks.every((id) => byId.has(id)), 'LESSON_REFERENCE', 'LESSONS.md', `Lesson ${lesson.id} has unknown source task`, state.project);
    assert(lesson.source_milestone === null || milestoneIds.has(lesson.source_milestone), 'LESSON_REFERENCE', 'LESSONS.md', `Lesson ${lesson.id} has unknown source milestone`, state.project);
  }
  const projectClosures = state.closure.items.filter((item) => item.scope === 'project');
  assert(projectClosures.length <= 1, 'CLOSURE_DUPLICATE', 'CLOSURE.md', 'At most one project-scoped closure record may exist', state.project);
  const milestoneClosures = state.closure.items.filter((item) => item.scope === 'milestone');
  assert(new Set(milestoneClosures.map((item) => item.milestone)).size === milestoneClosures.length, 'CLOSURE_DUPLICATE', 'CLOSURE.md', 'Each milestone may have at most one closure record', state.project);
  for (const closure of milestoneClosures) assert(milestoneIds.has(closure.milestone), 'CLOSURE_REFERENCE', 'CLOSURE.md', `Closure ${closure.id} has unknown milestone`, state.project);
  for (const closure of state.closure.items.filter((item) => item.status === 'accepted')) {
    if (closure.scope === 'project') assert(state.project.status === 'complete', 'CLOSURE_COMPLETE', 'CLOSURE.md', `Closure ${closure.id} accepts a project that is not complete`, state.project);
    else assert(state.milestones.items.find((item) => item.id === closure.milestone)?.status === 'complete', 'CLOSURE_COMPLETE', 'CLOSURE.md', `Closure ${closure.id} accepts a milestone that is not complete`, state.project);
  }
  for (const change of state.changes.items) {
    assert(change.sources.every((id) => sourceIds.has(id)), 'CHANGE_REFERENCE', 'CHANGES.md', `Change ${change.id} has unknown source`, state.project);
    assert([...change.affected_tasks, ...change.reverify_tasks].every((id) => byId.has(id)), 'CHANGE_REFERENCE', 'CHANGES.md', `Change ${change.id} has unknown task`, state.project);
    assert(change.affected_milestones.every((id) => milestoneIds.has(id)), 'CHANGE_REFERENCE', 'CHANGES.md', `Change ${change.id} has unknown milestone`, state.project);
  }
  const latestReverification = new Map();
  const seenReverifyTimes = new Set();
  for (const change of [...state.changes.items].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at) || a.id.localeCompare(b.id))) {
    for (const id of change.reverify_tasks) {
      const key = `${id}\0${Date.parse(change.observed_at)}`;
      assert(!seenReverifyTimes.has(key), 'CHANGE_REVERIFY_ORDER', 'CHANGES.md', `Task ${id} has ambiguous same-timestamp changes`, state.project); seenReverifyTimes.add(key);
    }
    for (const [id, value] of Object.entries(change.reverification)) latestReverification.set(id, { change, value });
  }
  for (const [id, { value }] of latestReverification) {
    const target = byId.get(id);
    try {
      if (value.status === 'pending') assert(['planned', 'ready'].includes(target.status) && target.active_contract === null && target.last_manifest === null, 'CHANGE_REVERIFY', 'CHANGES.md', `Task ${id} must regress and clear execution pointers before re-verification`, state.project);
      if (value.status === 'in_progress') assert(['in_progress', 'implemented', 'verification', 'verified'].includes(target.status) && target.active_contract === value.contract_id, 'CHANGE_REVERIFY', 'CHANGES.md', `Task ${id} re-verification must use its bound active contract`, state.project);
      if (value.status === 'complete') assert(target.status === 'done' && target.active_contract === value.contract_id && target.last_manifest === value.manifest_id, 'CHANGE_REVERIFY', 'CHANGES.md', `Task ${id} re-verification is not complete on its bound evidence`, state.project);
    } catch (error) {
      if (!options.taskErrorsAsWarnings || !(error instanceof ProjectError)) throw error;
      recordTaskExecutionWarning(state, id, error);
    }
  }
  if (state.project.status === 'complete') {
    assert(state.tasks.every(taskClosed), 'PROJECT_COMPLETE', 'PROJECT.md', 'Complete project has unfinished tasks', state.project);
    assert(state.milestones.items.every((item) => item.status === 'complete'), 'PROJECT_COMPLETE', 'PROJECT.md', 'Complete project has unfinished milestones', state.project);
    for (const criterion of successIds) assert(state.tasks.some((task) => taskDisposition(task) !== 'cancelled' && task.status === 'done' && task.success_criteria.includes(criterion)), 'PROJECT_COMPLETE', 'PROJECT.md', `Success criterion ${criterion} is not backed by done work`, state.project);
  }
}

function validateAttempt(state, task) {
    const attemptRoot = path.join(state.root, 'handoffs', task.id, task.active_contract);
    const contractPath = path.join(attemptRoot, 'TASK-CONTRACT.md');
    const contractDoc = readSafe(state.root, path.relative(state.root, contractPath), true);
    const parsedContract = parseAttempt(contractDoc, contractPath, 'contract');
    const contract = { payload: parsedContract.payload, payload_sha256: parsedContract.envelope.payload_sha256, contract_id: parsedContract.envelope.contract_id };
    const allowHistoricalRoot = task.status === 'done';
    const allowUnavailableExecutorRoot = state.warnings.some((warning) => warning.code === 'TASK_EXECUTOR_ROOT_UNAVAILABLE' && warning.task_id === task.id);
    try { validateTaskContract(contract, { allowHistoricalRoot, allowUnavailableExecutorRoot }); } catch (error) { fail('semantic', 'CONTRACT_INVALID', contractPath, error.message, state.project); }
    if (taskDisposition(task) !== 'active') {
      assert(Date.parse(contract.payload.created_at) <= Date.parse(task.disposition_changed_at), 'DISPOSITION_EXECUTION', contractPath, `Task ${task.id} contract was issued after its ${taskDisposition(task)} disposition`, state.project);
    }
    const executing = task.status !== 'done';
    assert(contract.contract_id === task.active_contract && contract.payload.project.id === state.project.id && (!executing || contract.payload.project.root === state.project.root) && contract.payload.task.id === task.id && contract.payload.task.spec_sha256 === task.spec_sha256, 'CONTRACT_BINDING', contractPath, `Task ${task.id} contract binding or active root is stale`, state.project);
    const liveBindings = task.sources.map((id) => {
      const source = state.sources.items.find((item) => item.id === id);
      return { id, version: source.version, record_sha256: source.record_sha256, content_sha256: source.sha256 };
    });
    assert(canonicalJson(liveBindings) === canonicalJson(contract.payload.task.sources), 'CONTRACT_SOURCE_BINDING', contractPath, `Task ${task.id} source binding is stale`, state.project);
    const derived = parsedContract.envelope; const provider = task.executor.provider;
    if (provider !== 'rpd') {
      assert(derived.story === null && derived.executor_prompt === null && derived.executor_prompt_sha256 === null, 'CONTRACT_DERIVED', contractPath, 'Non-RPD derived fields must be null', state.project);
    } else {
      const digest = contract.contract_id.slice(3); const storyPrefix = `pm-${state.project.id.toLowerCase()}-${task.id.toLowerCase()}-`;
      assert([12, 16, 32, 64].some((length) => derived.story === `${storyPrefix}${digest.slice(0, length)}`), 'RPD_STORY', contractPath, 'RPD story is not derived from this attempt', state.project);
      const relativeContract = path.relative(state.root, contractPath).split(path.sep).join('/');
      const issuanceContractPath = path.join(contract.payload.project.root, relativeContract);
      const expectedPrompt = renderRpdPrompt({ project_id: state.project.id, task_id: task.id, contract_id: contract.contract_id, story: derived.story, executor_root: contract.payload.task.executor.root, contract_absolute_path: issuanceContractPath, contract_relative_path: relativeContract, acceptance: task.acceptance, constraints: task.constraints, evidence_requirements: task.evidence_requirements });
      assert(derived.executor_prompt === expectedPrompt && derived.executor_prompt_sha256 === sha256(expectedPrompt), 'RPD_PROMPT', contractPath, 'RPD executor prompt/hash is stale or tampered', state.project);
    }
    const allEntries = fs.readdirSync(attemptRoot);
    const reservedEvidence = allEntries.filter((name) => name.startsWith('EVIDENCE-'));
    assert(reservedEvidence.every((name) => /^EVIDENCE-\d{3}\.md$/.test(name)), 'MANIFEST_FILENAME', attemptRoot, 'Every EVIDENCE-* entry must use exact three-digit numbering', state.project);
    const entries = reservedEvidence.sort();
    const previous = [];
    for (const [index, name] of entries.entries()) {
      assert(name === `EVIDENCE-${String(index + 1).padStart(3, '0')}.md`, 'MANIFEST_SEQUENCE', attemptRoot, 'Manifest filenames must be gap-free', state.project);
      const manifestPath = path.join(attemptRoot, name);
      const manifestDoc = readSafe(state.root, path.relative(state.root, manifestPath), true);
      const parsed = parseAttempt(manifestDoc, manifestPath, 'manifest');
      let result;
      try { result = validateManifest(parsed.payload, contract, previous, { allowHistoricalRoot, allowUnavailableExecutorRoot }); } catch (error) { fail('semantic', 'MANIFEST_INVALID', manifestPath, error.message, state.project); }
      assert(parsed.envelope.manifest_id === result.manifest_id && parsed.envelope.evidence_sha256 === result.evidence_sha256, 'MANIFEST_HASH', manifestPath, 'Manifest envelope hash mismatch', state.project);
      if (taskDisposition(task) !== 'active') {
        assert(Date.parse(parsed.payload.observed_at) <= Date.parse(task.disposition_changed_at), 'DISPOSITION_EXECUTION', manifestPath, `Task ${task.id} evidence was observed after its ${taskDisposition(task)} disposition`, state.project);
      }
      for (const source of parsed.payload.sources) {
        const sourceBytes = readSafeBuffer(state.root, source.path, true);
        assert(sha256(sourceBytes) === source.sha256, 'MANIFEST_SOURCE_HASH', manifestPath, `Manifest source ${source.path} hash mismatch`, state.project);
      }
      if (provider === 'rpd' && parsed.payload.status === 'verified') {
        const requiredPrefix = `handoffs/${task.id}/${contract.contract_id}/rpd-evidence/`;
        assert(parsed.payload.sources.every((source) => source.path.startsWith(requiredPrefix)), 'RPD_SOURCE_PATH', manifestPath, 'RPD sources must be snapshotted into this attempt', state.project);
        const roles = parsed.payload.sources.map((source) => source.role).sort();
        const allowedRoles = ['rpd-done', 'rpd-plan', 'rpd-req', 'rpd-terminal'];
        const allowedWithTest = [...allowedRoles, 'rpd-test'].sort();
        assert(canonicalJson(roles) === canonicalJson(allowedRoles.sort()) || canonicalJson(roles) === canonicalJson(allowedWithTest), 'RPD_SOURCE_ROLE', manifestPath, 'RPD source roles must be exact and unique', state.project);
        const byRole = new Map(parsed.payload.sources.map((source) => [source.role, source]));
        for (const role of ['rpd-req', 'rpd-plan', 'rpd-done', 'rpd-terminal']) assert(byRole.has(role), 'RPD_SOURCE_ROLE', manifestPath, `RPD verified evidence missing ${role}`, state.project);
        assert(path.basename(byRole.get('rpd-req').path) === `req-${derived.story}.md` && path.basename(byRole.get('rpd-plan').path) === `plan-${derived.story}.md` && path.basename(byRole.get('rpd-done').path) === `${derived.story}.md`, 'RPD_SOURCE_STORY', manifestPath, 'RPD artifacts do not match the attempt story', state.project);
        assert(byRole.get('rpd-req').path === `${requiredPrefix}reqs/req-${derived.story}.md` && byRole.get('rpd-plan').path === `${requiredPrefix}plans/plan-${derived.story}.md` && byRole.get('rpd-done').path === `${requiredPrefix}done/${derived.story}.md` && byRole.get('rpd-terminal').path === `${requiredPrefix}RPD-TERMINAL.md` && (!byRole.has('rpd-test') || byRole.get('rpd-test').path === `${requiredPrefix}tests/test-${derived.story}.md`), 'RPD_SOURCE_LAYOUT', manifestPath, 'RPD source layout is invalid', state.project);
        const terminal = readSafe(state.root, byRole.get('rpd-terminal').path, true);
        try { validateRpdTerminal(terminal); } catch (error) { fail('semantic', 'RPD_TERMINAL', manifestPath, error.message, state.project); }
      }
      previous.push({ ...result, status: parsed.payload.status, blocker: parsed.payload.blocker, observed_at: parsed.payload.observed_at });
    }
    const last = previous.at(-1) ?? null;
    assert((task.last_manifest === null && last === null) || (last && task.last_manifest === last.manifest_id), 'MANIFEST_POINTER', attemptRoot, `Task ${task.id} last manifest pointer is stale`, state.project);
    const expected = last === null ? 'in_progress' : last.status === 'blocked' ? 'in_progress' : last.status;
    assert(task.status === expected || (last?.status === 'verified' && ['verified', 'done'].includes(task.status)), 'MANIFEST_LIFECYCLE', attemptRoot, `Task ${task.id} status does not match latest manifest`, state.project);
    if (last?.status === 'blocked') {
      assert(task.blocked_by.includes(last.blocker), 'MANIFEST_BLOCKER', attemptRoot, `Task ${task.id} must store the blocked manifest blocker`, state.project);
    }
}

function taskExecutionWarning(state, taskId) {
  return state.warnings.find((warning) => warning.task_id === taskId && warning.code === 'TASK_EXECUTION_INVALID')
    ?? state.warnings.find((warning) => warning.task_id === taskId && warning.code === 'TASK_EXECUTOR_ROOT_UNAVAILABLE')
    ?? null;
}

function taskExecutionMessage(state, taskId, error) {
  const task = state.tasks.find((item) => item.id === taskId);
  const label = task ? taskLabel(task) : taskId;
  if (error.code === 'CONTRACT_SOURCE_BINDING') {
    return `${label} uses source information that changed after this run started. Review the updated source and create a fresh run before continuing.`;
  }
  if (error.code === 'CONTRACT_INVALID' && /project\.root/.test(error.message)) {
    return `${label} was started from a project folder that moved or no longer exists. Create a fresh run from the current project folder.`;
  }
  if (error.code === 'CONTRACT_INVALID' && /executor root/i.test(error.message)) {
    return `${label} cannot run because its configured working folder is missing or inaccessible. Point the task to an existing folder, then create a fresh run.`;
  }
  if (['CONTRACT_BINDING', 'CONTRACT_DERIVED', 'RPD_STORY', 'RPD_PROMPT'].includes(error.code)) {
    return `${label} has a saved run that no longer matches the current task or project. Review the task and create a fresh run before continuing.`;
  }
  if (error.code === 'TASK_LIFECYCLE') {
    return `${label} has a status that does not match its saved run. Repair or restart the run before continuing.`;
  }
  if (['CHANGE_REVERIFY', 'CHANGE_REVERIFY_BINDING'].includes(error.code)) {
    return `${label} is out of sync with a recorded project change. Review that change and verify the task again before continuing.`;
  }
  if (error.code.startsWith('MANIFEST') || ['ATTEMPT_FIELD', 'ATTEMPT_PAYLOAD', 'ATTEMPT_JSON', 'ATTEMPT_CANONICAL', 'ATTEMPT_HASH'].includes(error.code)) {
    return `${label} has incomplete or inconsistent saved execution records. Review its run history before continuing.`;
  }
  return `${label} has invalid saved execution data and cannot continue. Review the task's run history and fix the problem before trying again.`;
}

function recordTaskExecutionWarning(state, taskId, error) {
  const existing = taskExecutionWarning(state, taskId);
  if (existing?.code === 'TASK_EXECUTION_INVALID') return existing;
  const warning = {
    code: 'TASK_EXECUTION_INVALID',
    cause_code: error.code,
    path: error.path,
    task_id: taskId,
    technical_message: error.message,
    message: taskExecutionMessage(state, taskId, error),
  };
  state.warnings.push(warning);
  return warning;
}

function validateAttempts(state, options = {}) {
  for (const task of state.tasks.filter((item) => item.active_contract !== null)) {
    try {
      validateAttempt(state, task);
    } catch (error) {
      if (!options.taskErrorsAsWarnings || !(error instanceof ProjectError)) throw error;
      recordTaskExecutionWarning(state, task.id, error);
    }
  }
}

function validateReverificationBinding(state, change, taskId, value) {
  const attemptRoot = path.join(state.root, 'handoffs', taskId, value.contract_id);
  const contractPath = path.join(attemptRoot, 'TASK-CONTRACT.md');
  const parsedContract = parseAttempt(readSafe(state.root, path.relative(state.root, contractPath), true), contractPath, 'contract');
  assert(parsedContract.envelope.contract_id === value.contract_id && parsedContract.payload.task.id === taskId && Date.parse(parsedContract.payload.created_at) > Date.parse(change.observed_at), 'CHANGE_REVERIFY_BINDING', 'CHANGES.md', `Change ${change.id} reverification contract predates or mismatches the change`, state.project);
  if (value.status === 'complete') {
    const evidenceNames = fs.readdirSync(attemptRoot).filter((name) => /^EVIDENCE-\d{3}\.md$/.test(name));
    const matched = evidenceNames.some((name) => {
      const manifestPath = path.join(attemptRoot, name); const parsed = parseAttempt(readSafe(state.root, path.relative(state.root, manifestPath), true), manifestPath, 'manifest');
      return parsed.envelope.manifest_id === value.manifest_id && parsed.payload.status === 'verified' && parsed.payload.task.id === taskId && parsed.payload.contract_id === value.contract_id;
    });
    assert(matched, 'CHANGE_REVERIFY_BINDING', 'CHANGES.md', `Change ${change.id} complete reverification manifest is missing or not verified`, state.project);
  }
}

function validateReverificationBindings(state, options = {}) {
  for (const change of state.changes.items) for (const [taskId, value] of Object.entries(change.reverification)) {
    if (value.status === 'pending') continue;
    if (options.taskErrorsAsWarnings && state.warnings.some((warning) => warning.task_id === taskId && warning.code === 'TASK_EXECUTION_INVALID')) continue;
    try { validateReverificationBinding(state, change, taskId, value); }
    catch (error) {
      if (!options.taskErrorsAsWarnings || !(error instanceof ProjectError)) throw error;
      recordTaskExecutionWarning(state, taskId, error);
    }
  }
}

function resolveProjectRoot(folder) {
  if (!folder) fail('path', 'MISSING_SELECTOR', '', 'Project folder is required');
  let root;
  try { root = fs.realpathSync(folder); } catch { fail('path', 'INVALID_SELECTOR', folder, 'Project folder does not exist'); }
  if (!fs.lstatSync(root).isDirectory()) fail('path', 'INVALID_SELECTOR', folder, 'Project folder must be a directory');
  return root;
}

function parseProjectIdentity(text, filePath, root) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') fail('grammar', 'FRONTMATTER_OPEN', filePath, 'Expected opening ---');
  const end = lines.indexOf('---', 1);
  if (end < 0) fail('grammar', 'FRONTMATTER_CLOSE', filePath, 'Expected closing ---');
  const identity = {};
  for (let index = 1; index < end; index += 1) {
    const match = /^([a-z][a-z0-9_]*): (.+)$/.exec(lines[index]);
    if (!match || !['schema_version', 'id', 'name'].includes(match[1])) continue;
    if (Object.hasOwn(identity, match[1])) fail('grammar', 'DUPLICATE_KEY', filePath, `Duplicate key ${match[1]}`);
    try { identity[match[1]] = JSON.parse(match[2]); }
    catch { fail('grammar', 'FRONTMATTER_JSON', filePath, `Value for ${match[1]} must be complete JSON`); }
  }
  assert(identity.schema_version === 1 || identity.schema_version === 2, 'SCHEMA_VERSION', filePath, 'Unsupported project schema');
  assert(ID.test(identity.id), 'INVALID_ID', filePath, 'Invalid project ID');
  assert(nonEmpty(identity.name), 'INVALID_NAME', filePath, 'Project name is required');
  return { ...identity, root };
}

function loadProjectIdentity(folder, options = {}) {
  const root = resolveProjectRoot(folder);
  const logicalRoot = options.logicalRoot ?? root;
  if (!path.isAbsolute(logicalRoot)) fail('path', 'INVALID_LOGICAL_ROOT', logicalRoot, 'Logical project root must be absolute');
  const projectPath = path.join(root, 'PROJECT.md');
  const project = parseProjectIdentity(readSafe(root, 'PROJECT.md', true), projectPath, logicalRoot);
  return { root, project };
}

function loadProject(folder, options = {}) {
  const root = resolveProjectRoot(folder);
  const logicalRoot = options.logicalRoot ?? root;
  if (!path.isAbsolute(logicalRoot)) fail('path', 'INVALID_LOGICAL_ROOT', logicalRoot, 'Logical project root must be absolute');
  const project = parseProject(readSafe(root, 'PROJECT.md', true), path.join(root, 'PROJECT.md'), logicalRoot);
  checkOptionalDirectories(root);
  const texts = Object.fromEntries(REQUIRED.filter((name) => name !== 'PROJECT.md').map((name) => [name, readSafe(root, name, true)]));
  for (const name of OPTIONAL_FILES) texts[name] = readSafe(root, name, false);
  const taskRecords = parseCollection(texts['TASKS.md'], path.join(root, 'TASKS.md'), { schemaVersions: [1, 2, 3] });
  const tasks = taskRecords.map((record) => normalizeTask(record, project, path.join(root, 'TASKS.md'), taskRecords.schema_version));
  const warnings = tasks.map((task) => executorRootWarning(task, root)).filter(Boolean);
  function module(name, kind, schemaVersions = [1]) {
    const text = texts[name];
    if (text === null) return { configured: false, items: [] };
    const records = parseCollection(text, path.join(root, name), { schemaVersions });
    const items = records.map((record) => normalizeSimple(record, kind, project, path.join(root, name), records.schema_version)).sort((a, b) => a.id.localeCompare(b.id));
    return { configured: true, items };
  }
  const state = {
    root, project, tasks, warnings, tasks_schema_version: taskRecords.schema_version,
    milestones: module('MILESTONES.md', 'milestones'), risks: module('RISKS.md', 'risks', [1, 2]),
    decisions: module('DECISIONS.md', 'decisions'), sources: module('SOURCES.md', 'sources'),
    changes: module('CHANGES.md', 'changes'), assumptions: module('ASSUMPTIONS.md', 'assumptions'),
    issues: module('ISSUES.md', 'issues'), stakeholders: module('STAKEHOLDERS.md', 'stakeholders'),
    lessons: module('LESSONS.md', 'lessons'), closure: module('CLOSURE.md', 'closure'),
  };
  state.traceability = loadTraceability(texts['TRACEABILITY.md'], path.join(root, 'TRACEABILITY.md'), project, tasks, state.sources.items);
  validateGraph(state, options);
  // Unconfigured modules contribute `undefined`, which canonical JSON omits, so
  // installing this capability cannot stale any existing STATUS.md cache.
  const whenConfigured = (entry) => (entry.configured ? entry.items : undefined);
  state.source_sha256 = sha256({
    project: { ...project, root: undefined }, tasks, milestones: state.milestones.items, risks: state.risks.items,
    decisions: state.decisions.items, sources: state.sources.items, traceability: state.traceability, changes: state.changes.items,
    assumptions: whenConfigured(state.assumptions), issues: whenConfigured(state.issues),
    stakeholders: whenConfigured(state.stakeholders), lessons: whenConfigured(state.lessons), closure: whenConfigured(state.closure),
  });
  const statusParsed = parseFrontmatter(texts['STATUS.md'], path.join(root, 'STATUS.md'));
  exactKeys(statusParsed.data, ['schema_version', 'project_id', 'generated_at', 'source_sha256'], path.join(root, 'STATUS.md'), 'STATUS frontmatter', project);
  assert(statusParsed.data.schema_version === 1 && statusParsed.data.project_id === project.id && validTimestamp(statusParsed.data.generated_at) && HASH.test(statusParsed.data.source_sha256), 'STATUS_SCHEMA', path.join(root, 'STATUS.md'), 'Invalid STATUS cache envelope', project);
  state.status_stale = statusParsed.data.source_sha256 !== state.source_sha256;
  validateAttempts(state, options);
  validateReverificationBindings(state, options);
  return state;
}

function loadProjectIndex(indexPath) {
  if (fs.lstatSync(indexPath).isSymbolicLink()) fail('path', 'INDEX_SYMLINK', indexPath, 'Discovery index cannot be a symlink');
  const indexRoot = fs.realpathSync(path.dirname(indexPath));
  const text = fs.readFileSync(indexPath, 'utf8');
  const records = parseCollection(text, indexPath);
  const seenPaths = new Set(); const projects = [];
  for (const record of records) {
    exactKeys(record.raw, ['path'], indexPath, `index ${record.id}`);
    assert(nonEmpty(record.raw.path) && !path.isAbsolute(record.raw.path), 'INDEX_PATH', indexPath, `Index path for ${record.id} must be relative`);
    const pieces = record.raw.path.split(/[\\/]/);
    assert(!pieces.includes('..') && !pieces.includes('') && !pieces.includes('.'), 'INDEX_PATH', indexPath, `Index path for ${record.id} escapes or is empty`);
    let cursor = indexRoot;
    for (const piece of pieces) {
      cursor = path.join(cursor, piece);
      const stat = fs.lstatSync(cursor);
      assert(!stat.isSymbolicLink(), 'INDEX_SYMLINK', indexPath, `Index path for ${record.id} contains a symlink`);
    }
    const real = fs.realpathSync(cursor);
    assert(real.startsWith(`${indexRoot}${path.sep}`), 'INDEX_PATH', indexPath, `Index path for ${record.id} escapes index root`);
    const pathKey = real.toLowerCase();
    assert(!seenPaths.has(pathKey), 'INDEX_DUPLICATE', indexPath, `Index path for ${record.id} is duplicated`);
    seenPaths.add(pathKey);
    const state = loadProject(real);
    assert(state.project.id === record.id, 'INDEX_ID', indexPath, `Index ID ${record.id} does not match target project`, state.project);
    projects.push({ id: record.id, name: record.title, path: record.raw.path, root: real });
  }
  return projects;
}

function loadProjectsRootWith(folder, identityOnly) {
  let rootStat;
  try { rootStat = fs.lstatSync(folder); }
  catch (error) {
    if (error.code === 'ENOENT') fail('path', 'PROJECTS_ROOT_MISSING', folder, `Projects root does not exist: ${folder}`);
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail('path', 'PROJECTS_ROOT_INVALID', folder, 'Projects root must be a real directory');
  const root = fs.realpathSync(folder);
  const projects = [];
  for (const name of fs.readdirSync(root).sort()) {
    // A projects root may itself be version-controlled. Git's metadata is
    // infrastructure for the catalog, not a candidate project folder.
    if (name === '.git') continue;
    const target = path.join(root, name); const stat = fs.lstatSync(target);
    const projectFile = path.join(target, 'PROJECT.md');
    let hasProjectFile = false;
    if (stat.isDirectory()) {
      try { fs.lstatSync(projectFile); hasProjectFile = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (PROJECT_WORK_NAME.test(name) && stat.isDirectory() && !hasProjectFile) {
      const marker = path.join(target, PROJECT_WORK_MARKER);
      let markerStat;
      try { markerStat = fs.lstatSync(marker); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (fs.readdirSync(target).length === 0) continue; // interruption between mkdir and marker write
        fail('path', 'PROJECT_CATALOG_INVALID', target, 'Markerless project work area must be empty');
      }
      if (markerStat.isSymbolicLink() || !markerStat.isFile() || fs.readFileSync(marker, 'utf8') !== PROJECT_WORK_MARKER_TEXT) {
        fail('path', 'PROJECT_CATALOG_INVALID', target, 'Reserved project work area marker is unsafe');
      }
      continue;
    }
    if (stat.isSymbolicLink()) fail('path', 'PROJECT_CATALOG_INVALID', target, `Project catalog child cannot be a symlink: ${name}`);
    if (!stat.isDirectory()) continue;
    let loaded;
    try {
      loaded = identityOnly ? loadProjectIdentity(target) : (() => {
        const state = loadProject(target);
        return { root: state.root, project: state.project };
      })();
    }
    catch (error) {
      const detail = error instanceof ProjectError ? `${error.code}: ${error.message}` : error.message;
      fail('semantic', 'PROJECT_CATALOG_INVALID', target, `Invalid project catalog child ${name}: ${detail}`);
    }
    projects.push({ id: loaded.project.id, name: loaded.project.name, child: name, root: loaded.root });
  }
  if (projects.length === 0) fail('semantic', 'PROJECTS_ROOT_EMPTY', root, 'Projects root contains no valid direct-child projects');
  const seen = new Set();
  for (const project of projects) {
    const key = project.id.toLowerCase();
    if (seen.has(key)) fail('semantic', 'PROJECT_ID_DUPLICATE', root, `Project ID is duplicated in projects root: ${project.id}`);
    seen.add(key);
  }
  projects.sort((left, right) => left.id.localeCompare(right.id) || left.child.localeCompare(right.child));
  return { root, projects };
}

function loadProjectsRoot(folder) {
  return loadProjectsRootWith(folder, false);
}

function loadProjectCatalogRoot(folder) {
  return loadProjectsRootWith(folder, true);
}

function resolveProjectInRoot(folder, selector) {
  if (!nonEmpty(selector)) fail('semantic', 'PROJECT_SELECTOR_REQUIRED', folder, 'Project selector must be a non-empty name, ID, or folder name');
  const catalog = loadProjectsRoot(folder);
  const normalized = selector.trim().normalize('NFKC').toLowerCase();
  const matches = catalog.projects.filter((project) => [project.id, project.name, project.child]
    .some((value) => value.normalize('NFKC').toLowerCase() === normalized));
  if (matches.length === 0) {
    fail('semantic', 'PROJECT_NAME_NOT_FOUND', catalog.root, `No project exactly matches ${JSON.stringify(selector.trim())} in the selected projects root`);
  }
  if (matches.length > 1) {
    const labels = matches.map((project) => `${project.id} (${JSON.stringify(project.name)} at ${project.child})`).join(', ');
    fail('semantic', 'PROJECT_NAME_AMBIGUOUS', catalog.root, `Project selector ${JSON.stringify(selector.trim())} is ambiguous: ${labels}`);
  }
  return { projects_root: catalog.root, selector: selector.trim(), project: matches[0] };
}

function unfinishedDependencies(task, state) {
  const byId = new Map(state.tasks.map((item) => [item.id, item]));
  return task.depends_on.filter((id) => byId.get(id).status !== 'done');
}

function blockerItems(state) {
  return state.tasks.filter((task) => taskDisposition(task) === 'active' && (task.blocked_by.length || unfinishedDependencies(task, state).length)).map((task) => ({
    id: task.id, title: task.title, dependency_tasks: unfinishedDependencies(task, state), waiting_on: task.blocked_by,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function successCounts(state) {
  const result = { total: state.project.success_criteria_items.length, covered: 0, verified: 0 };
  for (const criterion of state.project.success_criteria_items) {
    const mapped = state.tasks.filter((task) => taskDisposition(task) !== 'cancelled' && task.success_criteria.includes(criterion.id));
    if (mapped.length) result.covered += 1;
    if (mapped.length && mapped.every((task) => task.status === 'done' && task.last_manifest !== null)) result.verified += 1;
  }
  return result;
}

function coverageData(state) {
  if (!state.traceability.configured) return { schema_version: 1, configured: false };
  const items = state.traceability.items.map((item) => {
    const mapped = item.tasks.map((id) => state.tasks.find((task) => task.id === id)).filter((task) => taskDisposition(task) !== 'cancelled');
    return { ...item, covered: mapped.length > 0, verified: mapped.length > 0 && mapped.every((task) => task.status === 'done' && task.last_manifest !== null) };
  });
  return { schema_version: 1, configured: true, criteria: { total: items.length, covered: items.filter((item) => item.covered).length, verified: items.filter((item) => item.verified).length, uncovered: items.filter((item) => !item.covered).length }, items };
}

function nextData(state) {
  if (state.project.status !== 'active') return { schema_version: 1, tasks: [] };
  const candidates = state.tasks.filter((task) => taskDisposition(task) === 'active' && task.status === 'ready' && !task.blocked_by.length && !unfinishedDependencies(task, state).length && !taskExecutionWarning(state, task.id));
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));
  const rows = candidates.map((task) => {
    const unlocks = state.tasks.filter((candidate) => taskDisposition(candidate) === 'active' && candidate.status === 'planned' && candidate.blocked_by.length === 0 && candidate.depends_on.includes(task.id) && candidate.depends_on.every((id) => id === task.id || taskById.get(id).status === 'done')).length;
    const reasons = [];
    if (task.critical) reasons.push('declared critical');
    if (unlocks) reasons.push(`unlocks ${unlocks}`);
    reasons.push(task.priority);
    if (task.milestone === state.project.current_milestone && task.milestone !== null) reasons.push('current milestone');
    return { id: task.id, title: task.title, critical: task.critical, unlocks, priority: task.priority, milestone: task.milestone, reasons };
  });
  rows.sort((a, b) => Number(b.critical) - Number(a.critical) || b.unlocks - a.unlocks || PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || Number(b.milestone !== null && b.milestone === state.project.current_milestone) - Number(a.milestone !== null && a.milestone === state.project.current_milestone) || a.id.localeCompare(b.id));
  return { schema_version: 1, tasks: rows };
}

function tailoringSummary(state) {
  const tailoring = state.project.tailoring;
  if (!tailoring) return { declared: false };
  return {
    declared: true,
    applied: KNOWLEDGE_AREAS.filter((area) => tailoring[area].applied),
    tailored_out: KNOWLEDGE_AREAS.filter((area) => !tailoring[area].applied).map((area) => ({ area, rationale: tailoring[area].rationale, decided: tailoring[area].decided })),
  };
}

function statusData(state, asOf = new Date().toISOString().slice(0, 10)) {
  const byStatus = Object.fromEntries(TASK_STATUSES.map((status) => [status, state.tasks.filter((task) => task.status === status).length]));
  const byDisposition = Object.fromEntries(TASK_DISPOSITIONS.map((disposition) => [disposition, state.tasks.filter((task) => taskDisposition(task) === disposition).length]));
  const blockers = blockerItems(state);
  const coverage = coverageData(state);
  return {
    schema_version: 3, as_of_date: asOf,
    project: { status: state.project.status, current_milestone: state.project.current_milestone, target_date: state.project.target_date, profile: state.project.profile, policy: profilePolicy(state.project.profile) },
    tailoring: tailoringSummary(state),
    tasks: { total: state.tasks.length, by_status: byStatus, by_disposition: byDisposition, actionable: nextData(state).tasks.length, blocked: blockers.length },
    success: successCounts(state),
    milestones: state.milestones.configured ? { configured: true, items: state.milestones.items.map((item) => ({ id: item.id, status: item.status, target_date: item.target_date, forecast_date: item.forecast_date, overdue: item.target_date !== null && item.target_date < asOf && item.status !== 'complete' })) } : { configured: false },
    coverage: coverage.configured ? { configured: true, total: coverage.criteria.total, covered: coverage.criteria.covered, verified: coverage.criteria.verified } : { configured: false },
    risks: state.risks.configured ? { configured: true, open: state.risks.items.filter((item) => item.status === 'open').length, high: state.risks.items.filter((item) => item.status === 'open' && (item.probability === 'high' || item.impact === 'high')).length } : { configured: false },
    decisions: state.decisions.configured ? { configured: true, proposed: state.decisions.items.filter((item) => item.status === 'proposed').length } : { configured: false },
    assumptions: state.assumptions.configured ? { configured: true, total: state.assumptions.items.length, open: state.assumptions.items.filter((item) => item.status === 'open').length, invalidated: state.assumptions.items.filter((item) => item.status === 'invalidated').length } : { configured: false },
    issues: state.issues.configured ? { configured: true, total: state.issues.items.length, open: state.issues.items.filter((item) => ['open', 'in_progress'].includes(item.status)).length, critical: state.issues.items.filter((item) => ['open', 'in_progress'].includes(item.status) && item.severity === 'critical').length, escalated: state.issues.items.filter((item) => ['open', 'in_progress'].includes(item.status) && item.escalated).length } : { configured: false },
    stakeholders: state.stakeholders.configured ? { configured: true, total: state.stakeholders.items.length, engagement_gaps: state.stakeholders.items.filter((item) => item.current_engagement !== item.target_engagement).length } : { configured: false },
    lessons: state.lessons.configured ? { configured: true, total: state.lessons.items.length } : { configured: false },
    closure: state.closure.configured ? { configured: true, total: state.closure.items.length, accepted: state.closure.items.filter((item) => item.status === 'accepted').length, pending: state.closure.items.filter((item) => item.status === 'pending').length } : { configured: false },
  };
}

function validateData(state) {
  const warnings = [...state.warnings];
  if (state.status_stale) warnings.push({ code: 'STATUS_STALE', path: 'STATUS.md', message: 'Derived STATUS cache does not match current source state' });
  return { schema_version: 1, valid: true, warnings, modules: { milestones: state.milestones.configured, risks: state.risks.configured, decisions: state.decisions.configured, sources: state.sources.configured, traceability: state.traceability.configured, changes: state.changes.configured, assumptions: state.assumptions.configured, issues: state.issues.configured, stakeholders: state.stakeholders.configured, lessons: state.lessons.configured, closure: state.closure.configured, handoffs: fs.existsSync(path.join(state.root, 'handoffs')), reports: fs.existsSync(path.join(state.root, 'reports', 'history')) }, counts: { tasks: state.tasks.length, milestones: state.milestones.items.length, risks: state.risks.items.length, decisions: state.decisions.items.length, sources: state.sources.items.length, changes: state.changes.items.length, assumptions: state.assumptions.items.length, issues: state.issues.items.length, stakeholders: state.stakeholders.items.length, lessons: state.lessons.items.length, closure: state.closure.items.length } };
}

function reportData(state) {
  const status = statusData(state); delete status.schema_version;
  const unknowns = [];
  if (!state.milestones.configured) unknowns.push({ field: 'status.milestones', reason: 'Milestones are unconfigured' });
  if (!state.traceability.configured) unknowns.push({ field: 'status.coverage', reason: 'Traceability is unconfigured' });
  if (state.project.target_date === null) unknowns.push({ field: 'status.project.target_date', reason: 'Target date is unknown' });
  // A tailored-out area is a recorded decision, never a zero and never "on track".
  if (!state.project.tailoring) unknowns.push({ field: 'tailoring', reason: 'Tailoring is undeclared on PROJECT.md schema version 1' });
  else for (const entry of status.tailoring.tailored_out) unknowns.push({ field: `tailoring.${entry.area}`, reason: `${entry.area} is tailored out: ${entry.rationale}` });
  for (const milestone of state.milestones.items.filter((item) => item.forecast_date === null)) unknowns.push({ field: `milestones.${milestone.id}.forecast_date`, reason: 'Forecast is unknown' });
  const configuredItems = (module) => module.configured ? { configured: true, items: module.items } : { configured: false };
  const ownership = state.tasks.map((task) => ({ task_id: task.id, owner: task.owner })).sort((a, b) => a.task_id.localeCompare(b.task_id));
  return { schema_version: 3, status, risks: configuredItems(state.risks), decisions: configuredItems(state.decisions), sources: configuredItems(state.sources), changes: configuredItems(state.changes), assumptions: configuredItems(state.assumptions), issues: configuredItems(state.issues), stakeholders: configuredItems(state.stakeholders), lessons: configuredItems(state.lessons), closure: configuredItems(state.closure), ownership, blockers: blockerItems(state), next: nextData(state).tasks, forecasts: state.milestones.items.filter((item) => item.forecast_date).map((item) => ({ milestone_id: item.id, date: item.forecast_date, updated: item.forecast_updated, evidence: item.forecast_evidence })).sort((a, b) => a.milestone_id.localeCompare(b.milestone_id)), unknowns: unknowns.sort((a, b) => a.field.localeCompare(b.field)) };
}

const KANBAN_LANES = [
  { id: 'planned', title: 'Planned', display_statuses: ['planned'] },
  { id: 'ready', title: 'Ready', display_statuses: ['ready'] },
  { id: 'active', title: 'Active', display_statuses: ['active'] },
  { id: 'done', title: 'Done', display_statuses: ['done'] },
  { id: 'deferred', title: 'Deferred', display_statuses: ['deferred'] },
  { id: 'cancelled', title: 'Cancelled', display_statuses: ['cancelled'] },
];

function taskEditEligibility(state, task) {
  if (taskDisposition(task) !== 'active') return { editable: false, reason: 'Reactivate deferred work before changing its specification; cancelled work is terminal.' };
  if (!['planned', 'ready'].includes(task.status)) return { editable: false, reason: 'Evidence-backed work must be changed through project update.' };
  if (task.active_contract !== null || task.last_manifest !== null) return { editable: false, reason: 'This task has active execution evidence and must be changed through project update.' };
  if (fs.existsSync(path.join(state.root, 'handoffs', task.id))) return { editable: false, reason: 'This task has attempt history and must be changed through project update.' };
  if (state.changes.items.some((change) => Object.hasOwn(change.reverification, task.id))) return { editable: false, reason: 'This task is governed by re-verification state and must be changed through project update.' };
  return { editable: true, reason: null };
}

function scheduleEditEligibility(state, task) {
  if (state.project.status === 'complete') return { editable: false, reason: 'Completed projects cannot be rescheduled in Studio.' };
  const milestone = task.milestone === null ? null : state.milestones.items.find((item) => item.id === task.milestone);
  if (milestone?.status === 'complete') return { editable: false, reason: 'Tasks in completed milestones cannot be rescheduled in Studio.' };
  if (task.status === 'done') return { editable: false, reason: 'Completed tasks cannot be rescheduled in Studio.' };
  if (taskDisposition(task) === 'cancelled') return { editable: false, reason: 'Cancelled tasks cannot be rescheduled in Studio.' };
  return { editable: true, reason: null };
}

function dispositionEditEligibility(state, task) {
  if (state.project.status === 'complete') return { editable: false, reason: 'Completed projects cannot change task disposition.' };
  const milestone = task.milestone === null ? null : state.milestones.items.find((item) => item.id === task.milestone);
  if (milestone?.status === 'complete') return { editable: false, reason: 'Tasks in completed milestones cannot change disposition.' };
  if (task.status === 'done') return { editable: false, reason: 'Completed tasks cannot change disposition.' };
  if (taskDisposition(task) === 'cancelled') return { editable: false, reason: 'Cancellation is terminal.' };
  return { editable: true, reason: null };
}

function kanbanData(state, mutationRevision = null) {
  const status = statusData(state);
  const blockers = new Map(blockerItems(state).map((item) => [item.id, item]));
  const executionWarnings = new Map(state.tasks.flatMap((task) => {
    const warning = taskExecutionWarning(state, task.id);
    return warning ? [[task.id, warning]] : [];
  }));
  const executionBlockers = state.tasks.filter((task) => !taskClosed(task) && executionWarnings.has(task.id)).map((task) => task.id);
  status.tasks.blocked = new Set([...blockers.keys(), ...executionBlockers]).size;
  const next = nextData(state).tasks;
  const nextRank = new Map(next.map((item, index) => [item.id, index + 1]));
  const tasks = state.tasks.map((task) => {
    const blocker = blockers.get(task.id) ?? { dependency_tasks: [], waiting_on: [] };
    const executionWarning = executionWarnings.get(task.id) ?? null;
    const eligibility = taskEditEligibility(state, task);
    const scheduleEligibility = scheduleEditEligibility(state, task);
    const dispositionEligibility = dispositionEditEligibility(state, task);
    const scheduleConflicts = task.status === 'done' ? [] : task.depends_on.flatMap((dependencyId) => {
      const dependency = state.tasks.find((item) => item.id === dependencyId);
      if (!dependency?.scheduled_end || !task.scheduled_start || task.scheduled_start > dependency.scheduled_end) return [];
      return [{ dependency_id: dependencyId, dependency_end: dependency.scheduled_end, task_start: task.scheduled_start }];
    });
    return {
      id: task.id,
      title: task.title,
      outcome: task.outcome,
      acceptance: task.acceptance,
      status: task.status,
      disposition: taskDisposition(task),
      disposition_changed_at: task.disposition_changed_at ?? null,
      display_status: displayStatus(task),
      priority: task.priority,
      milestone: task.milestone,
      owner: task.owner,
      executor: task.executor,
      depends_on: task.depends_on,
      blocks: task.blocks,
      blocked_by: task.blocked_by,
      dependency_blockers: blocker.dependency_tasks,
      sources: task.sources,
      success_criteria: task.success_criteria,
      constraints: task.constraints,
      critical: task.critical,
      active_contract: task.active_contract,
      last_manifest: task.last_manifest,
      execution_issue: executionWarning !== null,
      execution_issue_reason: executionWarning?.message ?? null,
      rpd_command: rpdCommand(state, task, executionWarning),
      scheduled_start: task.scheduled_start ?? null,
      scheduled_end: task.scheduled_end ?? null,
      schedule_conflicts: scheduleConflicts,
      created: task.created,
      updated: task.updated,
      task_revision: task.spec_sha256,
      next_rank: nextRank.get(task.id) ?? null,
      editable: eligibility.editable,
      edit_reason: eligibility.reason,
      schedule_editable: scheduleEligibility.editable,
      schedule_edit_reason: scheduleEligibility.reason,
      disposition_editable: dispositionEligibility.editable,
      disposition_edit_reason: dispositionEligibility.reason,
    };
  });
  const ownerOptions = [...new Set(tasks.map((task) => task.owner).filter((owner) => owner !== null))].sort();
  return {
    schema_version: 2,
    mutation_revision: mutationRevision,
    semantic_revision: state.source_sha256,
    project: {
      id: state.project.id,
      name: state.project.name,
      root: state.root,
      status: state.project.status,
      owner: state.project.owner,
      objective: state.project.objective,
      start_date: state.project.start_date,
      target_date: state.project.target_date,
      current_milestone: state.project.current_milestone,
      profile: state.project.profile,
      policy: profilePolicy(state.project.profile),
    },
    summary: {
      tasks: status.tasks,
      success: status.success,
      coverage: status.coverage,
      risks: status.risks,
      decisions: status.decisions,
      owner_gaps: tasks.filter((task) => task.owner === null).length,
    },
    warnings: [
      ...state.warnings.map(({ code, message, task_id, cause_code, technical_message, path: warningPath }) => ({
        code, message,
        ...(task_id ? { task_id } : {}),
        ...(cause_code ? { cause_code } : {}),
        ...(technical_message ? { technical_message } : {}),
        ...(warningPath ? { path: warningPath } : {}),
      })),
      ...(state.status_stale ? [{ code: 'STATUS_STALE', message: 'The saved project summary is out of date. The board is already showing the latest project data.' }] : []),
    ],
    milestones: state.milestones.items.map((item) => ({ id: item.id, title: item.title, status: item.status, target_date: item.target_date, forecast_date: item.forecast_date, forecast_updated: item.forecast_updated, critical: item.critical })),
    options: {
      owners: ownerOptions,
      priorities: PRIORITIES,
      milestones: state.milestones.items.map((item) => ({ id: item.id, title: item.title })),
      success_criteria: state.project.success_criteria_items,
      tasks: tasks.map((task) => ({ id: task.id, title: task.title })),
    },
    next,
    tasks,
    lanes: KANBAN_LANES.map((lane) => ({ ...lane, tasks: tasks.filter((task) => lane.display_statuses.includes(task.display_status)) })),
  };
}

function renderStatus(state, generatedAt = new Date().toISOString()) {
  if (!validTimestamp(generatedAt)) throw new Error('STATUS generated_at must be RFC3339 UTC');
  const data = statusData(state, generatedAt.slice(0, 10));
  return `---\nschema_version: 1\nproject_id: ${JSON.stringify(state.project.id)}\ngenerated_at: ${JSON.stringify(generatedAt)}\nsource_sha256: ${JSON.stringify(state.source_sha256)}\n---\n\n## Snapshot\n\n${data.tasks.total} tasks; ${data.tasks.actionable} actionable; ${data.tasks.blocked} blocked.\n`;
}

function regenerateStatus(folder, generatedAt = new Date().toISOString(), options = {}) {
  const state = loadProject(folder, options);
  fs.writeFileSync(path.join(state.root, 'STATUS.md'), renderStatus(state, generatedAt));
  return loadProject(state.root, options);
}

module.exports = {
  ProjectError, loadProject, loadProjectIdentity, loadProjectIndex, loadProjectsRoot, loadProjectCatalogRoot, resolveProjectInRoot, validateData, statusData, nextData,
  blockerItems, coverageData, reportData, kanbanData, taskEditEligibility, scheduleEditEligibility,
  dispositionEditEligibility, renderStatus, regenerateStatus, parseFrontmatter, parseCollection,
  parseAttempt, successCounts, profilePolicy, taskDisposition, displayStatus, taskClosed,
};
