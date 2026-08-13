/**
 * Responsibility: canonical Task Contract and Evidence Manifest primitives.
 * Invariants: v1 exact schemas, stable hashes, immutable-attempt identities, and
 * replay-resistant evidence validation. Initial project-manager implementation.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EVIDENCE_KINDS = new Set(['file', 'command', 'review', 'artifact', 'approval', 'note', 'commit']);
const MANIFEST_STATUSES = new Set(['implemented', 'verification', 'verified', 'blocked']);
const STAGE_ORDER = { implemented: 0, verification: 1, verified: 2 };

const DEFAULT_EVIDENCE = Object.freeze({
  human: [{ stage: 'verified', any_of: ['approval'], minimum: 1 }],
  rpd: [
    { stage: 'implemented', any_of: ['artifact', 'file'], minimum: 1 },
    { stage: 'verification', any_of: ['command'], minimum: 1 },
    { stage: 'verified', any_of: ['review'], minimum: 1 },
  ],
  agent: [
    { stage: 'implemented', any_of: ['artifact'], minimum: 1 },
    { stage: 'verified', any_of: ['review'], minimum: 1 },
  ],
  external: [{ stage: 'verified', any_of: ['approval', 'artifact'], minimum: 1 }],
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array ? value : typeof value === 'string' ? value : canonicalJson(value);
  return crypto.createHash('sha256').update(input).digest('hex');
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) throw new Error(`${label} fields must be exactly: ${expected.join(', ')}`);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}

function uniqueArray(values, label, { sorted = false } = {}) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  if (new Set(values.map(canonicalJson)).size !== values.length) throw new Error(`${label} must not contain duplicates`);
  if (sorted && canonicalJson(values) !== canonicalJson([...values].sort())) throw new Error(`${label} must be lexically ordered`);
}

function validateEvidenceRecord(record, label = 'evidence') {
  exactKeys(record, ['kind', 'ref', 'result', 'sha256'], label);
  if (!EVIDENCE_KINDS.has(record.kind)) throw new Error(`${label}.kind is unsupported`);
  nonEmptyString(record.ref, `${label}.ref`);
  nonEmptyString(record.result, `${label}.result`);
  if (record.sha256 !== null && !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error(`${label}.sha256 must be null or lowercase SHA-256`);
  if ((record.kind === 'file' || record.kind === 'artifact') && record.sha256 === null) throw new Error(`${label}.sha256 is required for file/artifact evidence`);
  return record;
}

function validateEvidenceRequirements(groups, label = 'evidence_requirements') {
  if (!Array.isArray(groups) || groups.length === 0) throw new Error(`${label} must be a non-empty array`);
  const seen = new Set();
  for (const [index, group] of groups.entries()) {
    exactKeys(group, ['stage', 'any_of', 'minimum'], `${label}[${index}]`);
    if (!(group.stage in STAGE_ORDER)) throw new Error(`${label}[${index}].stage is unsupported`);
    if (!Array.isArray(group.any_of) || group.any_of.length === 0) throw new Error(`${label}[${index}].any_of must be non-empty`);
    if (!Number.isInteger(group.minimum) || group.minimum < 1) throw new Error(`${label}[${index}].minimum must be positive`);
    const sorted = [...group.any_of].sort();
    if (new Set(sorted).size !== sorted.length || sorted.some((kind) => !EVIDENCE_KINDS.has(kind)) || canonicalJson(sorted) !== canonicalJson(group.any_of)) {
      throw new Error(`${label}[${index}].any_of must contain unique, sorted evidence kinds`);
    }
    const key = `${group.stage}:${sorted.join(',')}`;
    if (seen.has(key)) throw new Error(`${label} contains a duplicate group`);
    seen.add(key);
  }
  const ordered = [...groups].sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || canonicalJson(a.any_of).localeCompare(canonicalJson(b.any_of)));
  if (canonicalJson(ordered) !== canonicalJson(groups)) throw new Error(`${label} groups must be in stable stage/any_of order`);
  return groups;
}

function taskSpecPayload(task) {
  return {
    id: task.id,
    title: task.title,
    outcome: task.outcome,
    constraints: task.constraints,
    acceptance: task.acceptance,
    success_criteria: task.success_criteria,
    milestone: task.milestone,
    executor: task.executor,
    depends_on: task.depends_on,
    sources: task.sources,
    evidence_requirements: task.evidence_requirements,
    critical: task.critical,
  };
}

function taskSpecHash(task) {
  return sha256(taskSpecPayload(task));
}

function contractExecutor(executor, projectRoot) {
  const scope = executor.scope ?? (executor.root === null ? null : 'absolute');
  const declared = executor.root;
  const resolved = declared === null ? null : scope === 'project' ? path.resolve(projectRoot, declared) : declared;
  return { provider: executor.provider, scope, declared_root: declared, root: resolved };
}

function buildTaskContract(project, task, sourceBindings, createdAt) {
  const payload = {
    schema_version: 1,
    project: { id: project.id, root: project.root },
    task: {
      id: task.id,
      spec_sha256: taskSpecHash(task),
      title: task.title,
      outcome: task.outcome,
      constraints: task.constraints,
      acceptance: task.acceptance,
      success_criteria: task.success_criteria,
      milestone: task.milestone,
      critical: task.critical,
      sources: sourceBindings,
      dependencies: task.depends_on,
      evidence_requirements: task.evidence_requirements,
      executor: contractExecutor(task.executor, project.root),
    },
    created_at: createdAt,
  };
  if (!validTimestamp(createdAt)) throw new Error('created_at must be RFC3339 UTC');
  const digest = sha256(payload);
  const contract = { payload, payload_sha256: digest, contract_id: `tc-${digest}` };
  return validateTaskContract(contract);
}

function validateTaskContract(contract, options = {}) {
  exactKeys(contract, ['payload', 'payload_sha256', 'contract_id'], 'Task Contract');
  exactKeys(contract.payload, ['schema_version', 'project', 'task', 'created_at'], 'Task Contract payload');
  if (contract.payload.schema_version !== 1) throw new Error('Unsupported Task Contract schema version');
  exactKeys(contract.payload.project, ['id', 'root'], 'Task Contract project');
  nonEmptyString(contract.payload.project.id, 'Task Contract project.id');
  nonEmptyString(contract.payload.project.root, 'Task Contract project.root');
  exactKeys(contract.payload.task, ['id', 'spec_sha256', 'title', 'outcome', 'constraints', 'acceptance', 'success_criteria', 'milestone', 'critical', 'sources', 'dependencies', 'evidence_requirements', 'executor'], 'Task Contract task');
  for (const key of ['id', 'title', 'outcome']) nonEmptyString(contract.payload.task[key], `Task Contract task.${key}`);
  if (!/^[A-Z](?:[A-Z0-9-]{0,62}[A-Z0-9])$/.test(contract.payload.project.id) || !/^[A-Z](?:[A-Z0-9-]{0,62}[A-Z0-9])$/.test(contract.payload.task.id)) throw new Error('Task Contract project/task ID is invalid');
  if (!path.isAbsolute(contract.payload.project.root)) throw new Error('Task Contract project.root must be absolute');
  if (!options.allowHistoricalRoot && (!fs.existsSync(contract.payload.project.root) || !fs.lstatSync(contract.payload.project.root).isDirectory() || fs.lstatSync(contract.payload.project.root).isSymbolicLink() || fs.realpathSync(contract.payload.project.root) !== contract.payload.project.root)) throw new Error('Task Contract project.root must be an existing canonical real directory');
  if (!/^[a-f0-9]{64}$/.test(contract.payload.task.spec_sha256)) throw new Error('Task Contract spec hash is invalid');
  for (const key of ['constraints', 'acceptance', 'success_criteria', 'sources', 'dependencies']) uniqueArray(contract.payload.task[key], `Task Contract task.${key}`, { sorted: ['success_criteria', 'dependencies', 'sources'].includes(key) && key !== 'sources' });
  if (contract.payload.task.acceptance.length === 0 || contract.payload.task.acceptance.some((item) => typeof item !== 'string' || item.trim() === '')) throw new Error('Task Contract acceptance must contain non-empty strings');
  if (contract.payload.task.constraints.some((item) => typeof item !== 'string' || item.trim() === '')) throw new Error('Task Contract constraints must contain non-empty strings');
  const safeId = (value) => typeof value === 'string' && /^[A-Z](?:[A-Z0-9-]{0,62}[A-Z0-9])$/.test(value);
  if (contract.payload.task.success_criteria.some((value) => !safeId(value) || !value.startsWith('SC-'))) throw new Error('Task Contract success criterion ID is invalid');
  if (contract.payload.task.dependencies.some((value) => !safeId(value))) throw new Error('Task Contract dependency ID is invalid');
  if (contract.payload.task.milestone !== null && (!/^[A-Z](?:[A-Z0-9-]{0,62}[A-Z0-9])$/.test(contract.payload.task.milestone) || !contract.payload.task.milestone.startsWith('M-'))) throw new Error('Task Contract milestone is invalid');
  if (typeof contract.payload.task.critical !== 'boolean') throw new Error('Task Contract critical must be boolean');
  validateEvidenceRequirements(contract.payload.task.evidence_requirements, 'Task Contract evidence_requirements');
  exactKeys(contract.payload.task.executor, ['provider', 'scope', 'declared_root', 'root'], 'Task Contract executor');
  const provider = contract.payload.task.executor.provider;
  if (!Object.hasOwn(DEFAULT_EVIDENCE, provider)) throw new Error('Task Contract executor provider is invalid');
  const executorRoot = contract.payload.task.executor.root; const scope = contract.payload.task.executor.scope; const declaredRoot = contract.payload.task.executor.declared_root;
  if (provider === 'human' && (executorRoot !== null || scope !== null || declaredRoot !== null)) throw new Error('Human executor root must be null');
  if (!(['agent', 'external'].includes(provider) && executorRoot === null && scope === null && declaredRoot === null) && provider !== 'human' && !['absolute', 'project'].includes(scope)) throw new Error('Executor scope must be absolute, project, or null for agent/external');
  if (scope === 'absolute' && (declaredRoot !== executorRoot || !path.isAbsolute(executorRoot))) throw new Error('Absolute executor root binding is invalid');
  if (scope === 'project') {
    if (typeof declaredRoot !== 'string' || declaredRoot === '' || path.isAbsolute(declaredRoot) || declaredRoot.split(/[\\/]/).includes('..')) throw new Error('Project executor root must be a safe relative path');
    if (executorRoot !== path.resolve(contract.payload.project.root, declaredRoot)) throw new Error('Project executor root binding is invalid');
    if (!options.allowHistoricalRoot && !options.allowUnavailableExecutorRoot) {
      let cursor = contract.payload.project.root;
      for (const piece of declaredRoot.split(/[\\/]/)) {
        cursor = path.join(cursor, piece);
        if (!fs.existsSync(cursor) || fs.lstatSync(cursor).isSymbolicLink() || !fs.lstatSync(cursor).isDirectory()) throw new Error('Project executor root prefixes must be existing real directories');
      }
      if (!fs.realpathSync(executorRoot).startsWith(`${contract.payload.project.root}${path.sep}`)) throw new Error('Project executor root escapes the project');
    }
  }
  if (provider === 'rpd' && (typeof executorRoot !== 'string' || !path.isAbsolute(executorRoot))) throw new Error('RPD executor root must be absolute');
  if (['agent', 'external'].includes(provider) && executorRoot !== null && !path.isAbsolute(executorRoot)) throw new Error('Agent/external executor root must be null or absolute');
  if (executorRoot !== null && !options.allowHistoricalRoot && !options.allowUnavailableExecutorRoot) {
    if (!fs.existsSync(executorRoot) || fs.lstatSync(executorRoot).isSymbolicLink() || !fs.lstatSync(executorRoot).isDirectory()) throw new Error('Executor root must be an existing real directory');
  }
  contract.payload.task.sources.forEach((source, index) => {
    exactKeys(source, ['id', 'version', 'record_sha256', 'content_sha256'], `Task Contract source[${index}]`);
    nonEmptyString(source.id, `Task Contract source[${index}].id`);
    if (!safeId(source.id) || !source.id.startsWith('SRC-')) throw new Error('Task Contract source ID is invalid');
    if (source.version !== null) nonEmptyString(source.version, `Task Contract source[${index}].version`);
    if (!/^[a-f0-9]{64}$/.test(source.record_sha256)) throw new Error('Task Contract source record hash is invalid');
    if (source.content_sha256 !== null && !/^[a-f0-9]{64}$/.test(source.content_sha256)) throw new Error('Task Contract source content hash is invalid');
  });
  const sourceIds = contract.payload.task.sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length || canonicalJson(sourceIds) !== canonicalJson([...sourceIds].sort())) throw new Error('Task Contract sources must be unique and ordered by ID');
  if (!validTimestamp(contract.payload.created_at)) throw new Error('Task Contract created_at must be RFC3339 UTC');
  const recomputedSpec = taskSpecHash({
    id: contract.payload.task.id, title: contract.payload.task.title, outcome: contract.payload.task.outcome,
    constraints: contract.payload.task.constraints, acceptance: contract.payload.task.acceptance,
    success_criteria: contract.payload.task.success_criteria, milestone: contract.payload.task.milestone,
    executor: { provider, scope, root: declaredRoot }, depends_on: contract.payload.task.dependencies,
    sources: sourceIds, evidence_requirements: contract.payload.task.evidence_requirements,
    critical: contract.payload.task.critical,
  });
  if (contract.payload.task.spec_sha256 !== recomputedSpec) throw new Error('Task Contract task specification hash mismatch');
  const digest = sha256(contract.payload);
  if (contract.payload_sha256 !== digest || contract.contract_id !== `tc-${digest}`) throw new Error('Task Contract hash mismatch');
  return contract;
}

function formatTaskContract(contract, derived = { story: null, executor_prompt: null, executor_prompt_sha256: null }) {
  validateTaskContract(contract);
  exactKeys(derived, ['story', 'executor_prompt', 'executor_prompt_sha256'], 'Task Contract derived fields');
  const provider = contract.payload.task.executor.provider;
  if (provider !== 'rpd' && Object.values(derived).some((value) => value !== null)) throw new Error('Non-RPD derived contract fields must be null');
  if (provider === 'rpd') {
    nonEmptyString(derived.story, 'RPD story'); nonEmptyString(derived.executor_prompt, 'RPD executor prompt');
    if (derived.executor_prompt_sha256 !== sha256(derived.executor_prompt)) throw new Error('RPD executor prompt hash mismatch');
  }
  const lines = {
    schema_version: 1,
    contract_id: contract.contract_id,
    payload_sha256: contract.payload_sha256,
    story: derived.story,
    executor_prompt: derived.executor_prompt,
    executor_prompt_sha256: derived.executor_prompt_sha256,
  };
  return `---\n${Object.entries(lines).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n## Payload\n\n\`\`\`json\n${canonicalJson(contract.payload)}\n\`\`\`\n`;
}

function deriveStory(projectId, taskId, contractId, occupied = new Set()) {
  const digest = contractId.replace(/^tc-/, '');
  for (const length of [12, 16, 32, 64]) {
    const story = `pm-${projectId.toLowerCase()}-${taskId.toLowerCase()}-${digest.slice(0, length)}`;
    if (!occupied.has(story)) return story;
  }
  throw new Error('No unique RPD story suffix remains');
}

function renderRpdPrompt(input) {
  const keys = ['project_id', 'task_id', 'contract_id', 'story', 'executor_root', 'contract_absolute_path', 'contract_relative_path', 'acceptance', 'constraints', 'evidence_requirements'];
  exactKeys(input, keys, 'RPD prompt input');
  return [
    `Use $rpd to execute story ${input.story}.`,
    `Project: ${input.project_id}; task: ${input.task_id}; contract: ${input.contract_id}.`,
    `Run RPD in ${input.executor_root}.`,
    `Read the immutable Task Contract at ${input.contract_absolute_path} (project metadata path: ${input.contract_relative_path}).`,
    `Acceptance: ${canonicalJson(input.acceptance)}`,
    `Constraints: ${canonicalJson(input.constraints)}`,
    `Evidence requirements: ${canonicalJson(input.evidence_requirements)}`,
    'Return exact-story RPD artifacts and terminal verification evidence; do not edit project state directly.',
  ].join('\n');
}

function evidenceFingerprint(payload) {
  const sortRecords = (records) => [...records].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const acceptance = Object.fromEntries(Object.keys(payload.acceptance_evidence).sort().map((key) => [key, sortRecords(payload.acceptance_evidence[key])]));
  return sha256({ evidence: sortRecords(payload.evidence), acceptance_evidence: acceptance, sources: sortRecords(payload.sources) });
}

function validateRpdTerminal(terminal) {
  nonEmptyString(terminal, 'RPD terminal evidence');
  const lines = terminal.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  const arLines = lines.filter((line) => /^(?:AR (?:passed|fixed|blocked):)/.test(line));
  const crLines = lines.filter((line) => /^(?:CR (?:passed|fixed):)/.test(line));
  const vrLines = lines.filter((line) => /^(?:VR (?:passed|incomplete):)/.test(line));
  const auxiliary = {
    ar: lines.filter((line) => /^AR result:/.test(line)),
    cr: lines.filter((line) => /^CR result:/.test(line)),
    vr: lines.filter((line) => /^VR result:/.test(line)),
  };
  const ar = arLines.length === 1 && (arLines[0] === 'AR passed: no blocking architecture flaws' || /^AR fixed: .+; rerun result passed$/.test(arLines[0]));
  const cr = crLines.length === 1 && (crLines[0] === 'CR passed: no major findings' || /^CR fixed: .+; rerun result passed$/.test(crLines[0]));
  const vr = vrLines.length === 1 && vrLines[0] === 'VR passed: all acceptance criteria complete';
  const auxiliaryValid = Object.entries(auxiliary).every(([stage, values]) => values.length <= 1 && values.every((line) => line === `${stage.toUpperCase()} result: pass`));
  if (!ar || !cr || !vr || !auxiliaryValid) throw new Error('RPD terminal must contain exactly one non-conflicting successful AR, CR, and VR result line');
  return true;
}

function validateManifest(payload, contract, previous = [], options = {}) {
  validateTaskContract(contract, options);
  exactKeys(payload, ['schema_version', 'sequence', 'contract_id', 'project', 'task', 'status', 'blocker', 'evidence', 'acceptance_evidence', 'sources', 'observed_at', 'notes'], 'manifest payload');
  if (payload.schema_version !== 1) throw new Error('Unsupported manifest schema version');
  if (!Number.isInteger(payload.sequence) || payload.sequence < 1) throw new Error('Manifest sequence must be positive');
  if (payload.contract_id !== contract.contract_id) throw new Error('Manifest contract mismatch');
  exactKeys(payload.project, ['id'], 'manifest project');
  exactKeys(payload.task, ['id', 'spec_sha256'], 'manifest task');
  if (payload.project.id !== contract.payload.project.id || payload.task.id !== contract.payload.task.id || payload.task.spec_sha256 !== contract.payload.task.spec_sha256) throw new Error('Manifest project/task binding mismatch');
  if (!MANIFEST_STATUSES.has(payload.status)) throw new Error('Unsupported manifest status');
  if (payload.status === 'blocked') nonEmptyString(payload.blocker, 'manifest blocker');
  else if (payload.blocker !== null) throw new Error('Non-blocked manifest blocker must be null');
  if (!Array.isArray(payload.evidence)) throw new Error('Manifest evidence must be an array');
  payload.evidence.forEach((record, index) => validateEvidenceRecord(record, `evidence[${index}]`));
  uniqueArray(payload.evidence, 'Manifest evidence');
  if (!payload.acceptance_evidence || typeof payload.acceptance_evidence !== 'object' || Array.isArray(payload.acceptance_evidence)) throw new Error('acceptance_evidence must be an object');
  const acceptance = contract.payload.task.acceptance;
  if (Object.keys(payload.acceptance_evidence).sort().join('\0') !== [...acceptance].sort().join('\0')) throw new Error('Acceptance evidence keys must exactly match contract acceptance');
  const main = new Set(payload.evidence.map(canonicalJson));
  for (const [criterion, records] of Object.entries(payload.acceptance_evidence)) {
    if (!Array.isArray(records)) throw new Error(`Acceptance evidence for ${criterion} must be an array`);
    uniqueArray(records, `Acceptance evidence for ${criterion}`);
    records.forEach((record, index) => {
      validateEvidenceRecord(record, `acceptance_evidence[${criterion}][${index}]`);
      if (!main.has(canonicalJson(record))) throw new Error('Acceptance evidence must reuse a main evidence record');
    });
  }
  if (!Array.isArray(payload.sources) || !Array.isArray(payload.notes)) throw new Error('Manifest sources and notes must be arrays');
  payload.sources.forEach((source, index) => {
    exactKeys(source, ['path', 'sha256', 'role'], `manifest sources[${index}]`);
    nonEmptyString(source.path, `manifest sources[${index}].path`);
    if (source.path.startsWith('/') || source.path.split('/').includes('..')) throw new Error('Manifest source paths must be project-relative');
    if (!/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error('Manifest source hash is invalid');
    nonEmptyString(source.role, `manifest sources[${index}].role`);
  });
  uniqueArray(payload.sources, 'Manifest sources');
  payload.notes.forEach((note, index) => nonEmptyString(note, `notes[${index}]`));
  if (!validTimestamp(payload.observed_at)) throw new Error('observed_at must be RFC3339 UTC');

  const expectedSequence = previous.length + 1;
  if (payload.sequence !== expectedSequence) throw new Error(`Manifest sequence must be ${expectedSequence}`);
  const last = previous.at(-1)?.status;
  const allowed = last === undefined ? ['implemented', 'verification', 'verified', 'blocked']
    : last === 'implemented' ? ['verification', 'verified', 'blocked']
      : last === 'verification' ? ['verified', 'blocked'] : [];
  if (!allowed.includes(payload.status)) throw new Error('Illegal manifest progression');
  const fingerprint = evidenceFingerprint(payload);
  if (previous.some((item) => item.evidence_sha256 === fingerprint)) throw new Error('Evidence replay detected');

  if (payload.status !== 'blocked') {
    const level = STAGE_ORDER[payload.status];
    const available = payload.evidence.map((record, index) => ({ record, index, used: false }));
    for (const group of contract.payload.task.evidence_requirements) {
      if (STAGE_ORDER[group.stage] > level) continue;
      let count = 0;
      for (const item of available) {
        if (!item.used && group.any_of.includes(item.record.kind)) {
          item.used = true;
          count += 1;
          if (count === group.minimum) break;
        }
      }
      if (count < group.minimum) throw new Error(`Insufficient ${group.stage} provider evidence`);
    }
    if (payload.status === 'verified') {
      for (const criterion of acceptance) {
        if (payload.acceptance_evidence[criterion].length === 0) throw new Error(`Acceptance criterion lacks evidence: ${criterion}`);
      }
      if (contract.payload.task.sources.some((source) => source.version === null && source.content_sha256 === null)) throw new Error('Verified manifest has an unverifiable current source');
    }
  }
  return {
    manifest_id: `em-${sha256(payload)}`,
    payload_sha256: sha256(payload),
    evidence_sha256: fingerprint,
    status: payload.status,
  };
}

function findExactArtifact(root, category, filename, required = true) {
  const realRoot = fs.realpathSync(root);
  if (fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(realRoot).isDirectory()) throw new Error('RPD executor root must be a real directory');
  let cursor = realRoot;
  for (const piece of ['.docs', category]) {
    cursor = path.join(cursor, piece);
    if (!fs.existsSync(cursor)) {
      if (required) throw new Error(`Missing RPD evidence directory ${piece}`);
      return null;
    }
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !fs.realpathSync(cursor).startsWith(`${realRoot}${path.sep}`)) throw new Error('RPD evidence directories must be real executor-root descendants');
  }
  const categoryRoot = cursor;
  const matches = [];
  function walk(folder) {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error('RPD evidence cannot traverse symlinks');
      if (stat.isDirectory()) walk(full);
      else {
        if (!stat.isFile() || !fs.realpathSync(full).startsWith(`${realRoot}${path.sep}`)) throw new Error('RPD evidence entries must be contained regular files');
        if (entry.name === filename) matches.push(full);
      }
    }
  }
  walk(categoryRoot);
  if ((required && matches.length !== 1) || (!required && matches.length > 1)) throw new Error(`Expected ${required ? 'exactly one' : 'at most one'} ${category}/${filename}`);
  return matches[0] ?? null;
}

function snapshotRpdEvidence({ executor_root, project_root, attempt_root, story, terminal }) {
  if (!path.isAbsolute(executor_root) || !path.isAbsolute(project_root) || !path.isAbsolute(attempt_root)) throw new Error('RPD evidence roots must be absolute');
  const realProject = fs.realpathSync(project_root);
  if (fs.lstatSync(project_root).isSymbolicLink() || realProject !== project_root) throw new Error('Project root must be canonical for RPD snapshot');
  const attemptRelative = path.relative(realProject, attempt_root);
  if (attemptRelative === '' || attemptRelative.startsWith('..') || path.isAbsolute(attemptRelative)) throw new Error('RPD attempt root must be inside the project');
  let projectCursor = realProject;
  for (const piece of attemptRelative.split(path.sep)) {
    projectCursor = path.join(projectCursor, piece);
    if (!fs.existsSync(projectCursor)) break;
    const stat = fs.lstatSync(projectCursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('RPD snapshot path prefixes must be real project directories');
  }
  nonEmptyString(story, 'RPD story'); validateRpdTerminal(terminal);
  const artifacts = [
    ['reqs', `req-${story}.md`, 'rpd-req', true],
    ['plans', `plan-${story}.md`, 'rpd-plan', true],
    ['tests', `test-${story}.md`, 'rpd-test', false],
    ['done', `${story}.md`, 'rpd-done', true],
  ];
  if (fs.existsSync(attempt_root)) throw new Error('RPD evidence snapshot already exists');
  fs.mkdirSync(attempt_root, { recursive: true });
  if (!fs.realpathSync(path.dirname(attempt_root)).startsWith(`${realProject}${path.sep}`) || fs.lstatSync(attempt_root).isSymbolicLink()) throw new Error('RPD snapshot destination escaped the project');
  const sources = [];
  try {
    for (const [category, filename, role, required] of artifacts) {
      const source = findExactArtifact(executor_root, category, filename, required);
      if (!source) continue;
      const relative = path.join(category, filename); const target = path.join(attempt_root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      sources.push({ path: path.relative(project_root, target).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(target)), role });
    }
    const terminalPath = path.join(attempt_root, 'RPD-TERMINAL.md'); fs.writeFileSync(terminalPath, terminal, { flag: 'wx' });
    sources.push({ path: path.relative(project_root, terminalPath).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(terminalPath)), role: 'rpd-terminal' });
    return sources.sort((a, b) => a.role.localeCompare(b.role));
  } catch (error) {
    fs.rmSync(attempt_root, { recursive: true, force: true }); throw error;
  }
}

function formatEvidenceManifest(payload, contract, previous = []) {
  const validated = validateManifest(payload, contract, previous);
  const envelope = { schema_version: 1, manifest_id: validated.manifest_id, payload_sha256: validated.payload_sha256, evidence_sha256: validated.evidence_sha256 };
  return { ...validated, document: `---\n${Object.entries(envelope).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n## Payload\n\n\`\`\`json\n${canonicalJson(payload)}\n\`\`\`\n` };
}

module.exports = {
  DEFAULT_EVIDENCE,
  EVIDENCE_KINDS,
  canonicalJson,
  sha256,
  validateEvidenceRecord,
  validateEvidenceRequirements,
  taskSpecPayload,
  taskSpecHash,
  contractExecutor,
  buildTaskContract,
  validateTaskContract,
  formatTaskContract,
  deriveStory,
  renderRpdPrompt,
  evidenceFingerprint,
  validateManifest,
  formatEvidenceManifest,
  snapshotRpdEvidence,
  validTimestamp,
  validateRpdTerminal,
};
