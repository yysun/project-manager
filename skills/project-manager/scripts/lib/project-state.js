/**
 * Responsibility: load and validate one explicitly selected Markdown project,
 * then calculate deterministic status, ranking, blockers, coverage, and reports.
 * Invariants: read-only operation, selected-root isolation, and stable v1 output.
 * Recent change: expose one evidence-aware Kanban projection for Project Manager Studio.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_EVIDENCE, canonicalJson, sha256, taskSpecHash, validateEvidenceRecord, validateEvidenceRequirements, validateTaskContract, validateManifest, renderRpdPrompt, validTimestamp, validateRpdTerminal } = require('./contracts');

const REQUIRED = ['PROJECT.md', 'TASKS.md', 'STATUS.md'];
const OPTIONAL_FILES = ['MILESTONES.md', 'RISKS.md', 'DECISIONS.md', 'SOURCES.md', 'TRACEABILITY.md', 'CHANGES.md'];
const OPTIONAL_DIRS = ['handoffs', path.join('reports', 'history')];
const TASK_STATUSES = ['planned', 'ready', 'in_progress', 'implemented', 'verification', 'verified', 'done'];
const PROVIDERS = ['human', 'rpd', 'agent', 'external'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
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

function namespacedId(value, prefix) {
  return ID.test(value) && value.startsWith(prefix);
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

function parseCollection(text, filePath) {
  const parsed = parseFrontmatter(text, filePath);
  exactKeys(parsed.data, ['schema_version'], filePath, 'collection frontmatter');
  if (parsed.data.schema_version !== 1) fail('grammar', 'SCHEMA_VERSION', filePath, 'Unsupported schema_version');
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
  const fields = ['schema_version', 'id', 'name', 'status', 'owner', 'start_date', 'target_date', 'current_milestone', 'profile', 'adapters', 'created', 'updated'];
  exactKeys(data, fields, filePath, 'PROJECT frontmatter');
  for (const field of fields) assert(Object.hasOwn(data, field), 'MISSING_FIELD', filePath, `PROJECT missing ${field}`);
  assert(data.schema_version === 1, 'SCHEMA_VERSION', filePath, 'Unsupported project schema');
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

function normalizeTask(record, project, filePath) {
  const allowed = ['outcome', 'acceptance', 'status', 'priority', 'milestone', 'owner', 'executor', 'depends_on', 'blocks', 'blocked_by', 'sources', 'success_criteria', 'constraints', 'evidence_requirements', 'external_refs', 'critical', 'active_contract', 'last_manifest', 'created', 'updated'];
  exactKeys(record.raw, allowed, filePath, `task ${record.id}`, project);
  assert(nonEmpty(record.raw.outcome), 'TASK_OUTCOME', filePath, `Task ${record.id} requires outcome`, project);
  uniqueStrings(record.raw.acceptance, filePath, `task ${record.id} acceptance`, project, { sorted: false, allowEmpty: false });
  const rawExecutor = record.raw.executor ?? { provider: 'human', root: null, scope: null };
  exactKeys(rawExecutor, ['provider', 'root', 'scope'], filePath, `task ${record.id} executor`, project);
  const executor = { provider: rawExecutor.provider, root: rawExecutor.root, scope: rawExecutor.scope ?? (rawExecutor.root === null ? null : 'absolute') };
  assert(PROVIDERS.includes(executor.provider) && project.adapters.includes(executor.provider), 'TASK_EXECUTOR', filePath, `Task ${record.id} provider is not enabled`, project);
  const historicalDone = record.raw.status === 'done';
  const nullRootAllowed = ['human', 'agent', 'external'].includes(executor.provider) && executor.root === null && executor.scope === null;
  assert(nullRootAllowed || ['absolute', 'project'].includes(executor.scope), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} executor scope is invalid`, project);
  if (executor.scope === 'absolute') assert(path.isAbsolute(executor.root), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} absolute executor root is invalid`, project);
  if (executor.scope === 'project') assert(nonEmpty(executor.root) && !path.isAbsolute(executor.root) && !executor.root.split(/[\\/]/).includes('..'), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} project executor root must be a safe relative path`, project);
  const resolvedExecutorRoot = executor.root === null ? null : executor.scope === 'project' ? path.resolve(project.root, executor.root) : executor.root;
  const physicalProjectRoot = path.dirname(filePath);
  const physicalExecutorRoot = executor.scope === 'project' ? path.resolve(physicalProjectRoot, executor.root) : resolvedExecutorRoot;
  if (executor.scope === 'project') {
    let cursor = physicalProjectRoot;
    for (const piece of executor.root.split(/[\\/]/)) {
      cursor = path.join(cursor, piece);
      assert(fs.existsSync(cursor) && !fs.lstatSync(cursor).isSymbolicLink() && fs.lstatSync(cursor).isDirectory(), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} project executor prefixes must be real directories`, project);
    }
    assert(fs.realpathSync(physicalExecutorRoot).startsWith(`${fs.realpathSync(physicalProjectRoot)}${path.sep}`), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} project executor root escapes the project`, project);
  }
  if (physicalExecutorRoot !== null && !historicalDone) assert(fs.existsSync(physicalExecutorRoot) && !fs.lstatSync(physicalExecutorRoot).isSymbolicLink() && fs.lstatSync(physicalExecutorRoot).isDirectory(), 'TASK_EXECUTOR_ROOT', filePath, `Task ${record.id} executor root must be an existing real directory`, project);
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
  assert(TASK_STATUSES.includes(task.status), 'TASK_STATUS', filePath, `Task ${task.id} has invalid status`, project);
  assert(PRIORITIES.includes(task.priority), 'TASK_PRIORITY', filePath, `Task ${task.id} has invalid priority`, project);
  assert(task.milestone === null || namespacedId(task.milestone, 'M-'), 'TASK_MILESTONE', filePath, `Task ${task.id} has invalid milestone`, project);
  assert(task.owner === null || nonEmpty(task.owner), 'TASK_OWNER', filePath, `Task ${task.id} owner is invalid`, project);
  for (const key of ['depends_on', 'blocks', 'blocked_by', 'sources', 'success_criteria', 'constraints']) uniqueStrings(task[key], filePath, `task ${task.id} ${key}`, project, { sorted: key !== 'constraints' });
  assert(typeof task.critical === 'boolean', 'TASK_CRITICAL', filePath, `Task ${task.id} critical must be boolean`, project);
  assert(task.active_contract === null || /^tc-[a-f0-9]{64}$/.test(task.active_contract), 'TASK_CONTRACT', filePath, `Task ${task.id} active contract is invalid`, project);
  assert(task.last_manifest === null || /^em-[a-f0-9]{64}$/.test(task.last_manifest), 'TASK_MANIFEST', filePath, `Task ${task.id} last manifest is invalid`, project);
  assert(task.created === null || validDate(task.created), 'INVALID_DATE', filePath, `Task ${task.id} created is invalid`, project);
  assert(task.updated === null || validDate(task.updated), 'INVALID_DATE', filePath, `Task ${task.id} updated is invalid`, project);
  assert(task.external_refs && typeof task.external_refs === 'object' && !Array.isArray(task.external_refs), 'TASK_EXTERNAL_REFS', filePath, `Task ${task.id} external_refs must be an object`, project);
  for (const [key, value] of Object.entries(task.external_refs)) assert(/^[a-z][a-z0-9_-]{1,31}$/.test(key) && nonEmpty(value), 'TASK_EXTERNAL_REFS', filePath, `Task ${task.id} external_refs is invalid`, project);
  try { validateEvidenceRequirements(task.evidence_requirements); } catch (error) { fail('semantic', 'TASK_EVIDENCE', filePath, `Task ${task.id}: ${error.message}`, project); }
  task.spec_sha256 = taskSpecHash(task);
  return task;
}

function normalizeSimple(record, kind, project, filePath) {
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
    exactKeys(raw, ['status', 'probability', 'impact', 'mitigation', 'owner', 'milestone'], filePath, `risk ${record.id}`, project);
    const item = { id: record.id, title: record.title, status: raw.status, probability: raw.probability, impact: raw.impact, mitigation: raw.mitigation, owner: raw.owner ?? null, milestone: raw.milestone ?? null };
    assert(['open', 'mitigated', 'accepted', 'closed'].includes(item.status) && ['low', 'medium', 'high'].includes(item.probability) && ['low', 'medium', 'high'].includes(item.impact) && nonEmpty(item.mitigation), 'RISK_SCHEMA', filePath, 'Invalid risk record', project);
    assert(item.owner === null || nonEmpty(item.owner), 'RISK_OWNER', filePath, 'Invalid risk owner', project);
    assert(item.milestone === null || namespacedId(item.milestone, 'M-'), 'RISK_MILESTONE', filePath, 'Invalid risk milestone', project);
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

function validateGraph(state) {
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
    const active = task.active_contract !== null;
    assert((['planned', 'ready'].includes(task.status) && !active && task.last_manifest === null) || (!['planned', 'ready'].includes(task.status) && active), 'TASK_LIFECYCLE', 'TASKS.md', `Task ${task.id} lifecycle pointers are inconsistent`, state.project);
    assert(!['implemented', 'verification', 'verified', 'done'].includes(task.status) || task.last_manifest !== null, 'TASK_LIFECYCLE', 'TASKS.md', `Task ${task.id} requires a manifest pointer`, state.project);
    if (task.status === 'ready') assert(task.blocked_by.length === 0 && task.depends_on.every((id) => byId.get(id).status === 'done'), 'TASK_READY', 'TASKS.md', `Task ${task.id} cannot be ready while blocked`, state.project);
    if (task.status === 'done') assert(task.blocked_by.length === 0 && task.depends_on.every((id) => byId.get(id).status === 'done'), 'TASK_DONE', 'TASKS.md', `Task ${task.id} cannot be done while blocked or dependency-incomplete`, state.project);
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
  for (const milestone of state.milestones.items.filter((item) => item.status === 'complete')) assert(state.tasks.filter((task) => task.milestone === milestone.id).every((task) => task.status === 'done'), 'MILESTONE_COMPLETE', 'MILESTONES.md', `Milestone ${milestone.id} has unfinished tasks`, state.project);
  for (const risk of state.risks.items) assert(risk.milestone === null || milestoneIds.has(risk.milestone), 'RISK_REFERENCE', 'RISKS.md', `Risk ${risk.id} has unknown milestone`, state.project);
  const typed = { project: new Set([state.project.id]), task: new Set(byId.keys()), milestone: milestoneIds, risk: riskIds, source: sourceIds, success: successIds };
  for (const decision of state.decisions.items) for (const reference of decision.affects) {
    const split = reference.indexOf(':'); const kind = reference.slice(0, split); const id = reference.slice(split + 1);
    assert(typed[kind]?.has(id), 'DECISION_REFERENCE', 'DECISIONS.md', `Decision ${decision.id} has unknown reference ${reference}`, state.project);
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
    if (value.status === 'pending') assert(['planned', 'ready'].includes(target.status) && target.active_contract === null && target.last_manifest === null, 'CHANGE_REVERIFY', 'CHANGES.md', `Task ${id} must regress and clear execution pointers before re-verification`, state.project);
    if (value.status === 'in_progress') assert(['in_progress', 'implemented', 'verification', 'verified'].includes(target.status) && target.active_contract === value.contract_id, 'CHANGE_REVERIFY', 'CHANGES.md', `Task ${id} re-verification must use its bound active contract`, state.project);
    if (value.status === 'complete') assert(target.status === 'done' && target.active_contract === value.contract_id && target.last_manifest === value.manifest_id, 'CHANGE_REVERIFY', 'CHANGES.md', `Task ${id} re-verification is not complete on its bound evidence`, state.project);
  }
  if (state.project.status === 'complete') {
    assert(state.tasks.every((task) => task.status === 'done'), 'PROJECT_COMPLETE', 'PROJECT.md', 'Complete project has unfinished tasks', state.project);
    assert(state.milestones.items.every((item) => item.status === 'complete'), 'PROJECT_COMPLETE', 'PROJECT.md', 'Complete project has unfinished milestones', state.project);
    for (const criterion of successIds) assert(state.tasks.some((task) => task.status === 'done' && task.success_criteria.includes(criterion)), 'PROJECT_COMPLETE', 'PROJECT.md', `Success criterion ${criterion} is not backed by done work`, state.project);
  }
}

function validateAttempts(state) {
  for (const task of state.tasks.filter((item) => item.active_contract !== null)) {
    const attemptRoot = path.join(state.root, 'handoffs', task.id, task.active_contract);
    const contractPath = path.join(attemptRoot, 'TASK-CONTRACT.md');
    const contractDoc = readSafe(state.root, path.relative(state.root, contractPath), true);
    const parsedContract = parseAttempt(contractDoc, contractPath, 'contract');
    const contract = { payload: parsedContract.payload, payload_sha256: parsedContract.envelope.payload_sha256, contract_id: parsedContract.envelope.contract_id };
    const allowHistoricalRoot = task.status === 'done';
    try { validateTaskContract(contract, { allowHistoricalRoot }); } catch (error) { fail('semantic', 'CONTRACT_INVALID', contractPath, error.message, state.project); }
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
      try { result = validateManifest(parsed.payload, contract, previous, { allowHistoricalRoot }); } catch (error) { fail('semantic', 'MANIFEST_INVALID', manifestPath, error.message, state.project); }
      assert(parsed.envelope.manifest_id === result.manifest_id && parsed.envelope.evidence_sha256 === result.evidence_sha256, 'MANIFEST_HASH', manifestPath, 'Manifest envelope hash mismatch', state.project);
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
      previous.push({ ...result, status: parsed.payload.status, blocker: parsed.payload.blocker });
    }
    const last = previous.at(-1) ?? null;
    assert((task.last_manifest === null && last === null) || (last && task.last_manifest === last.manifest_id), 'MANIFEST_POINTER', attemptRoot, `Task ${task.id} last manifest pointer is stale`, state.project);
    const expected = last === null ? 'in_progress' : last.status === 'blocked' ? 'in_progress' : last.status;
    assert(task.status === expected || (last?.status === 'verified' && ['verified', 'done'].includes(task.status)), 'MANIFEST_LIFECYCLE', attemptRoot, `Task ${task.id} status does not match latest manifest`, state.project);
    if (last?.status === 'blocked') {
      assert(task.blocked_by.includes(last.blocker), 'MANIFEST_BLOCKER', attemptRoot, `Task ${task.id} must store the blocked manifest blocker`, state.project);
    }
  }
}

function validateReverificationBindings(state) {
  for (const change of state.changes.items) for (const [taskId, value] of Object.entries(change.reverification)) {
    if (value.status === 'pending') continue;
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
}

function loadProject(folder, options = {}) {
  if (!folder) fail('path', 'MISSING_SELECTOR', '', 'Project folder is required');
  let root;
  try { root = fs.realpathSync(folder); } catch { fail('path', 'INVALID_SELECTOR', folder, 'Project folder does not exist'); }
  if (!fs.lstatSync(root).isDirectory()) fail('path', 'INVALID_SELECTOR', folder, 'Project folder must be a directory');
  checkOptionalDirectories(root);
  const texts = Object.fromEntries(REQUIRED.map((name) => [name, readSafe(root, name, true)]));
  for (const name of OPTIONAL_FILES) texts[name] = readSafe(root, name, false);
  const logicalRoot = options.logicalRoot ?? root;
  if (!path.isAbsolute(logicalRoot)) fail('path', 'INVALID_LOGICAL_ROOT', logicalRoot, 'Logical project root must be absolute');
  const project = parseProject(texts['PROJECT.md'], path.join(root, 'PROJECT.md'), logicalRoot);
  const tasks = parseCollection(texts['TASKS.md'], path.join(root, 'TASKS.md')).map((record) => normalizeTask(record, project, path.join(root, 'TASKS.md')));
  function module(name, kind) {
    const text = texts[name];
    if (text === null) return { configured: false, items: [] };
    const items = parseCollection(text, path.join(root, name)).map((record) => normalizeSimple(record, kind, project, path.join(root, name))).sort((a, b) => a.id.localeCompare(b.id));
    return { configured: true, items };
  }
  const state = {
    root, project, tasks,
    milestones: module('MILESTONES.md', 'milestones'), risks: module('RISKS.md', 'risks'),
    decisions: module('DECISIONS.md', 'decisions'), sources: module('SOURCES.md', 'sources'),
    changes: module('CHANGES.md', 'changes'),
  };
  state.traceability = loadTraceability(texts['TRACEABILITY.md'], path.join(root, 'TRACEABILITY.md'), project, tasks, state.sources.items);
  validateGraph(state);
  state.source_sha256 = sha256({ project: { ...project, root: undefined }, tasks, milestones: state.milestones.items, risks: state.risks.items, decisions: state.decisions.items, sources: state.sources.items, traceability: state.traceability, changes: state.changes.items });
  const statusParsed = parseFrontmatter(texts['STATUS.md'], path.join(root, 'STATUS.md'));
  exactKeys(statusParsed.data, ['schema_version', 'project_id', 'generated_at', 'source_sha256'], path.join(root, 'STATUS.md'), 'STATUS frontmatter', project);
  assert(statusParsed.data.schema_version === 1 && statusParsed.data.project_id === project.id && validTimestamp(statusParsed.data.generated_at) && HASH.test(statusParsed.data.source_sha256), 'STATUS_SCHEMA', path.join(root, 'STATUS.md'), 'Invalid STATUS cache envelope', project);
  state.status_stale = statusParsed.data.source_sha256 !== state.source_sha256;
  validateAttempts(state);
  validateReverificationBindings(state);
  return state;
}

function loadProjectIndex(indexPath) {
  if (fs.lstatSync(indexPath).isSymbolicLink()) fail('path', 'INDEX_SYMLINK', indexPath, 'Discovery index cannot be a symlink');
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

function unfinishedDependencies(task, state) {
  const byId = new Map(state.tasks.map((item) => [item.id, item]));
  return task.depends_on.filter((id) => byId.get(id).status !== 'done');
}

function blockerItems(state) {
  return state.tasks.filter((task) => task.blocked_by.length || unfinishedDependencies(task, state).length).map((task) => ({
    id: task.id, title: task.title, dependency_tasks: unfinishedDependencies(task, state), waiting_on: task.blocked_by,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function successCounts(state) {
  const result = { total: state.project.success_criteria_items.length, covered: 0, verified: 0 };
  for (const criterion of state.project.success_criteria_items) {
    const mapped = state.tasks.filter((task) => task.success_criteria.includes(criterion.id));
    if (mapped.length) result.covered += 1;
    if (mapped.length && mapped.every((task) => task.status === 'done' && task.last_manifest !== null)) result.verified += 1;
  }
  return result;
}

function coverageData(state) {
  if (!state.traceability.configured) return { schema_version: 1, configured: false };
  const items = state.traceability.items.map((item) => {
    const mapped = item.tasks.map((id) => state.tasks.find((task) => task.id === id));
    return { ...item, covered: mapped.length > 0, verified: mapped.length > 0 && mapped.every((task) => task.status === 'done' && task.last_manifest !== null) };
  });
  return { schema_version: 1, configured: true, criteria: { total: items.length, covered: items.filter((item) => item.covered).length, verified: items.filter((item) => item.verified).length, uncovered: items.filter((item) => !item.covered).length }, items };
}

function nextData(state) {
  if (state.project.status !== 'active') return { schema_version: 1, tasks: [] };
  const candidates = state.tasks.filter((task) => task.status === 'ready' && !task.blocked_by.length && !unfinishedDependencies(task, state).length);
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));
  const rows = candidates.map((task) => {
    const unlocks = state.tasks.filter((candidate) => candidate.status === 'planned' && candidate.blocked_by.length === 0 && candidate.depends_on.includes(task.id) && candidate.depends_on.every((id) => id === task.id || taskById.get(id).status === 'done')).length;
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

function statusData(state, asOf = new Date().toISOString().slice(0, 10)) {
  const byStatus = Object.fromEntries(TASK_STATUSES.map((status) => [status, state.tasks.filter((task) => task.status === status).length]));
  const blockers = blockerItems(state);
  const coverage = coverageData(state);
  return {
    schema_version: 1, as_of_date: asOf,
    project: { status: state.project.status, current_milestone: state.project.current_milestone, target_date: state.project.target_date },
    tasks: { total: state.tasks.length, by_status: byStatus, actionable: nextData(state).tasks.length, blocked: blockers.length },
    success: successCounts(state),
    milestones: state.milestones.configured ? { configured: true, items: state.milestones.items.map((item) => ({ id: item.id, status: item.status, target_date: item.target_date, forecast_date: item.forecast_date, overdue: item.target_date !== null && item.target_date < asOf && item.status !== 'complete' })) } : { configured: false },
    coverage: coverage.configured ? { configured: true, total: coverage.criteria.total, covered: coverage.criteria.covered, verified: coverage.criteria.verified } : { configured: false },
    risks: state.risks.configured ? { configured: true, open: state.risks.items.filter((item) => item.status === 'open').length, high: state.risks.items.filter((item) => item.status === 'open' && (item.probability === 'high' || item.impact === 'high')).length } : { configured: false },
    decisions: state.decisions.configured ? { configured: true, proposed: state.decisions.items.filter((item) => item.status === 'proposed').length } : { configured: false },
  };
}

function validateData(state) {
  return { schema_version: 1, valid: true, warnings: state.status_stale ? [{ code: 'STATUS_STALE', path: 'STATUS.md', message: 'Derived STATUS cache does not match current source state' }] : [], modules: { milestones: state.milestones.configured, risks: state.risks.configured, decisions: state.decisions.configured, sources: state.sources.configured, traceability: state.traceability.configured, changes: state.changes.configured, handoffs: fs.existsSync(path.join(state.root, 'handoffs')), reports: fs.existsSync(path.join(state.root, 'reports', 'history')) }, counts: { tasks: state.tasks.length, milestones: state.milestones.items.length, risks: state.risks.items.length, decisions: state.decisions.items.length, sources: state.sources.items.length, changes: state.changes.items.length } };
}

function reportData(state) {
  const status = statusData(state); delete status.schema_version;
  const unknowns = [];
  if (!state.milestones.configured) unknowns.push({ field: 'status.milestones', reason: 'Milestones are unconfigured' });
  if (!state.traceability.configured) unknowns.push({ field: 'status.coverage', reason: 'Traceability is unconfigured' });
  if (state.project.target_date === null) unknowns.push({ field: 'status.project.target_date', reason: 'Target date is unknown' });
  for (const milestone of state.milestones.items.filter((item) => item.forecast_date === null)) unknowns.push({ field: `milestones.${milestone.id}.forecast_date`, reason: 'Forecast is unknown' });
  const configuredItems = (module) => module.configured ? { configured: true, items: module.items } : { configured: false };
  const ownership = state.tasks.map((task) => ({ task_id: task.id, owner: task.owner })).sort((a, b) => a.task_id.localeCompare(b.task_id));
  return { schema_version: 1, status, risks: configuredItems(state.risks), decisions: configuredItems(state.decisions), sources: configuredItems(state.sources), changes: configuredItems(state.changes), ownership, blockers: blockerItems(state), next: nextData(state).tasks, forecasts: state.milestones.items.filter((item) => item.forecast_date).map((item) => ({ milestone_id: item.id, date: item.forecast_date, updated: item.forecast_updated, evidence: item.forecast_evidence })).sort((a, b) => a.milestone_id.localeCompare(b.milestone_id)), unknowns: unknowns.sort((a, b) => a.field.localeCompare(b.field)) };
}

const KANBAN_LANES = [
  { id: 'planned', title: 'Planned', statuses: ['planned'] },
  { id: 'ready', title: 'Ready', statuses: ['ready'] },
  { id: 'active', title: 'Active', statuses: ['in_progress', 'implemented', 'verification'] },
  { id: 'verified', title: 'Verified', statuses: ['verified'] },
  { id: 'done', title: 'Done', statuses: ['done'] },
];

function taskEditEligibility(state, task) {
  if (!['planned', 'ready'].includes(task.status)) return { editable: false, reason: 'Evidence-backed work must be changed through project update.' };
  if (task.active_contract !== null || task.last_manifest !== null) return { editable: false, reason: 'This task has active execution evidence and must be changed through project update.' };
  if (fs.existsSync(path.join(state.root, 'handoffs', task.id))) return { editable: false, reason: 'This task has attempt history and must be changed through project update.' };
  if (state.changes.items.some((change) => Object.hasOwn(change.reverification, task.id))) return { editable: false, reason: 'This task is governed by re-verification state and must be changed through project update.' };
  return { editable: true, reason: null };
}

function kanbanData(state, mutationRevision = null) {
  const status = statusData(state);
  const blockers = new Map(blockerItems(state).map((item) => [item.id, item]));
  const next = nextData(state).tasks;
  const nextRank = new Map(next.map((item, index) => [item.id, index + 1]));
  const tasks = state.tasks.map((task) => {
    const blocker = blockers.get(task.id) ?? { dependency_tasks: [], waiting_on: [] };
    const eligibility = taskEditEligibility(state, task);
    return {
      id: task.id,
      title: task.title,
      outcome: task.outcome,
      acceptance: task.acceptance,
      status: task.status,
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
      created: task.created,
      updated: task.updated,
      task_revision: task.spec_sha256,
      next_rank: nextRank.get(task.id) ?? null,
      editable: eligibility.editable,
      edit_reason: eligibility.reason,
    };
  });
  const ownerOptions = [...new Set(tasks.map((task) => task.owner).filter((owner) => owner !== null))].sort();
  return {
    schema_version: 1,
    mutation_revision: mutationRevision,
    semantic_revision: state.source_sha256,
    project: {
      id: state.project.id,
      name: state.project.name,
      root: state.root,
      status: state.project.status,
      owner: state.project.owner,
      objective: state.project.objective,
      target_date: state.project.target_date,
      current_milestone: state.project.current_milestone,
      profile: state.project.profile,
    },
    summary: {
      tasks: status.tasks,
      success: status.success,
      coverage: status.coverage,
      risks: status.risks,
      decisions: status.decisions,
      owner_gaps: tasks.filter((task) => task.owner === null).length,
    },
    warnings: state.status_stale ? [{ code: 'STATUS_STALE', message: 'STATUS.md is stale; the board is showing validated authoritative state.' }] : [],
    options: {
      owners: ownerOptions,
      priorities: PRIORITIES,
      milestones: state.milestones.items.map((item) => ({ id: item.id, title: item.title })),
      success_criteria: state.project.success_criteria_items,
      tasks: tasks.map((task) => ({ id: task.id, title: task.title })),
    },
    next,
    lanes: KANBAN_LANES.map((lane) => ({ ...lane, tasks: tasks.filter((task) => lane.statuses.includes(task.status)) })),
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

module.exports = { ProjectError, loadProject, loadProjectIndex, validateData, statusData, nextData, blockerItems, coverageData, reportData, kanbanData, taskEditEligibility, renderStatus, regenerateStatus, parseFrontmatter, parseCollection, successCounts };
