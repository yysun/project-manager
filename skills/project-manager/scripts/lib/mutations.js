/**
 * Responsibility: same-filesystem candidate/backup transactions for skill-led
 * project initialization and updates. Invariants: validate before exposure and
 * restore exact prior bytes after any failed replacement. Recent changes: exact
 * tree revisions, verbatim candidate copies, isolated sibling work areas, and
 * before/after disposition guards prevent stale swaps and terminal-state bypass.
 * Immutable handoff ancestors are matched by path segment, so a task id that is
 * a string prefix of another (TASK-1 vs TASK-10) cannot admit an untied directory.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalJson } = require('./contracts');
const { PROJECT_WORK_PREFIX, PROJECT_WORK_MARKER, PROJECT_WORK_MARKER_TEXT } = require('./work-area');

class MutationConflictError extends Error {
  constructor(message, currentRevision = null) {
    super(message);
    this.name = 'MutationConflictError';
    this.code = 'MUTATION_CONFLICT';
    this.currentRevision = currentRevision;
  }
}

class UnsupportedProjectEntryError extends Error {
  constructor(relative, kind) {
    super(`Unsupported project entry type at ${relative}: ${kind}`);
    this.name = 'UnsupportedProjectEntryError';
    this.code = 'UNSUPPORTED_PROJECT_ENTRY';
    this.path = relative;
  }
}

function lstatIfExists(target) {
  try { return fs.lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function assertProjectDirectoryRoot(root) {
  const stat = lstatIfExists(root);
  if (!stat) throw Object.assign(new Error(`Project root does not exist: ${root}`), { code: 'ENOENT' });
  if (!stat.isDirectory()) {
    const kind = stat.isSymbolicLink() ? 'symlink-root' : stat.isFile() ? 'file-root' : 'special-root';
    throw new UnsupportedProjectEntryError('.', kind);
  }
}

function mutationRevision(root) {
  assertProjectDirectoryRoot(root);
  const records = [];
  function walk(folder) {
    for (const name of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      const stat = fs.lstatSync(full);
      if (stat.isDirectory()) {
        records.push({ path: relative, type: 'directory' });
        walk(full);
      } else if (stat.isFile()) {
        records.push({ path: relative, type: 'file', digest: crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') });
      } else if (stat.isSymbolicLink()) {
        records.push({ path: relative, type: 'symlink', target: fs.readlinkSync(full) });
      } else {
        const kind = stat.isFIFO() ? 'fifo' : stat.isSocket() ? 'socket' : stat.isCharacterDevice() ? 'character-device' : stat.isBlockDevice() ? 'block-device' : 'unknown';
        throw new UnsupportedProjectEntryError(relative, kind);
      }
    }
  }
  walk(root);
  records.sort((a, b) => a.path.localeCompare(b.path));
  return crypto.createHash('sha256').update(canonicalJson(records)).digest('hex');
}

function isEmptyDirectory(target) {
  return fs.existsSync(target) && fs.lstatSync(target).isDirectory() && fs.readdirSync(target).length === 0;
}

function createProjectWork(parent, prefix, excludedTarget = null) {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const area = path.join(parent, `${PROJECT_WORK_PREFIX}${crypto.randomBytes(12).toString('hex')}`);
    try { fs.mkdirSync(area, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST') continue; throw error; }
    try {
      if (excludedTarget && fs.existsSync(excludedTarget) && fs.realpathSync(excludedTarget) === fs.realpathSync(area)) {
        fs.rmdirSync(area);
        continue;
      }
      fs.writeFileSync(path.join(area, PROJECT_WORK_MARKER), PROJECT_WORK_MARKER_TEXT, { flag: 'wx', mode: 0o600 });
      return fs.mkdtempSync(path.join(area, prefix));
    } catch (error) {
      fs.rmSync(area, { recursive: true, force: true });
      throw error;
    }
  }
  throw Object.assign(new Error(`Could not allocate an isolated project work area under ${parent}`), { code: 'WORK_AREA_EXHAUSTED' });
}

function cleanupProjectWork(work) {
  const area = path.dirname(work);
  if (fs.existsSync(work)) fs.rmSync(work, { recursive: true, force: true });
  const marker = path.join(area, PROJECT_WORK_MARKER);
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
  try { fs.rmdirSync(area); } catch (error) { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; }
}

function immutableInventory(root) {
  const inventory = new Map();
  for (const relativeRoot of ['handoffs', path.join('reports', 'history')]) {
    const start = path.join(root, relativeRoot);
    if (!fs.existsSync(start)) continue;
    function walk(folder) {
      inventory.set(path.relative(root, folder), 'directory');
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, entry.name); const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) throw new Error('Immutable history cannot contain symlinks');
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile()) inventory.set(path.relative(root, full), crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'));
        else throw new Error('Immutable history must contain only files and directories');
      }
    }
    walk(start);
  }
  return inventory;
}

function manifestSources(candidate, relative) {
  const text = fs.readFileSync(path.join(candidate, relative), 'utf8');
  const match = /## Payload\n+```json\n([^\n]+)\n```/.exec(text);
  if (!match) throw new Error(`New manifest lacks canonical payload: ${relative}`);
  const payload = JSON.parse(match[1]);
  if (!Array.isArray(payload.sources)) throw new Error(`New manifest sources are invalid: ${relative}`);
  return payload.sources.map((source) => path.normalize(source.path));
}

function assertImmutablePreserved(before, candidate, beforeState, afterState) {
  const after = immutableInventory(candidate);
  for (const [relative, digest] of before) if (after.get(relative) !== digest) throw new Error(`Immutable project history changed or disappeared: ${relative}`);
  const additions = [...after.keys()].filter((relative) => !before.has(relative));
  const allowed = new Set();
  for (const relative of additions.filter((value) => /^handoffs[/\\][^/\\]+[/\\]tc-[a-f0-9]{64}[/\\]EVIDENCE-\d{3}\.md$/.test(value))) {
    allowed.add(relative);
    for (const source of manifestSources(candidate, relative)) allowed.add(source);
  }
  for (const relative of after.keys()) {
    if (before.has(relative)) continue;
    if (relative.startsWith(`reports${path.sep}history${path.sep}`)) {
      if (after.get(relative) === 'directory' || relative.endsWith('.md')) continue;
      throw new Error(`Saved report additions must be Markdown: ${relative}`);
    }
    const pieces = relative.split(path.sep);
    if (pieces[0] !== 'handoffs') continue;
    if (pieces.length < 3) {
      // Segment-wise, not a bare string prefix: handoffs/TASK-1 must not be
      // admitted because TASK-10 holds the validated attempt.
      const isValidatedAncestor = afterState?.tasks?.some((task) => {
        if (!task.active_contract) return false;
        const full = path.join('handoffs', task.id, task.active_contract);
        return full.startsWith(`${relative}${path.sep}`);
      });
      if (isValidatedAncestor) continue;
      throw new Error(`Immutable handoff directory is not tied to validated active state: ${relative}`);
    }
    const contractRoot = pieces.slice(0, 3).join(path.sep);
    const taskId = pieces[1]; const contractId = pieces[2];
    const beforeTask = beforeState?.tasks?.find((task) => task.id === taskId);
    const afterTask = afterState?.tasks?.find((task) => task.id === taskId);
    const existingLiveAttempt = before.has(contractRoot) && beforeTask?.active_contract === contractId && beforeTask.status !== 'done' && afterTask?.active_contract === contractId;
    const newValidatedAttempt = !before.has(contractRoot) && afterTask?.active_contract === contractId;
    if (!existingLiveAttempt && !newValidatedAttempt) throw new Error(`Cannot add to an inactive or terminal immutable attempt: ${relative}`);
    if (after.get(relative) === 'directory') {
      if ([...allowed].some((item) => item === relative || item.startsWith(`${relative}${path.sep}`)) || (newValidatedAttempt && relative === contractRoot)) continue;
    } else if (allowed.has(relative) || (newValidatedAttempt && relative === path.join(contractRoot, 'TASK-CONTRACT.md'))) continue;
    throw new Error(`Immutable attempt addition is not derived from validated active state: ${relative}`);
  }
}

function assertDispositionTransitions(beforeState, afterState) {
  if (!Array.isArray(beforeState?.tasks) || !Array.isArray(afterState?.tasks)) return;
  const afterById = new Map(afterState.tasks.map((task) => [task.id, task]));
  for (const beforeTask of beforeState.tasks) {
    if ((beforeTask.disposition ?? 'active') !== 'cancelled') continue;
    const afterTask = afterById.get(beforeTask.id);
    if (!afterTask || (afterTask.disposition ?? 'active') !== 'cancelled') {
      throw new Error(`Cancellation is terminal for task ${beforeTask.id}`);
    }
  }
}

function atomicProjectMutation(target, mutateCandidate, validateCandidate, options = {}) {
  if (!path.isAbsolute(target)) throw new Error('Project mutation target must be absolute');
  const parent = path.dirname(target); const name = path.basename(target);
  if (!fs.existsSync(parent) || !fs.lstatSync(parent).isDirectory()) throw new Error('Project parent directory must exist');
  const targetStat = lstatIfExists(target); const exists = targetStat !== null;
  if (exists && !targetStat.isDirectory()) throw new UnsupportedProjectEntryError('.', targetStat.isSymbolicLink() ? 'symlink-root' : 'non-directory-root');
  const initializing = !exists || isEmptyDirectory(target);
  if (options.init === true && exists && !initializing) throw new Error('Initialization target must be nonexistent or empty');
  if (options.init !== true && !exists) throw new Error('Update target must exist');
  const immutableBefore = exists && !initializing ? immutableInventory(target) : new Map();
  const expectedRevision = options.expectedMutationRevision ?? null;
  if (exists && expectedRevision !== null) {
    const currentRevision = mutationRevision(target);
    if (currentRevision !== expectedRevision) throw new MutationConflictError('Project changed before mutation started', currentRevision);
  }
  const beforeState = exists && !initializing ? validateCandidate(target, { logicalRoot: target }) : null;
  const work = createProjectWork(parent, `${name}.transaction-`, target);
  const candidate = path.join(work, name); const backup = path.join(work, `${name}.backup`);
  let targetMoved = false; let candidateMoved = false; let committed = false;
  try {
    if (exists && !initializing) {
      fs.cpSync(target, candidate, { recursive: true, errorOnExist: true, preserveTimestamps: true, dereference: false, verbatimSymlinks: true });
      assertProjectDirectoryRoot(candidate);
      if (expectedRevision !== null && mutationRevision(candidate) !== expectedRevision) throw new MutationConflictError('Candidate copy does not match the selected project revision', mutationRevision(target));
    }
    else fs.mkdirSync(candidate);
    const context = { logicalRoot: target };
    mutateCandidate(candidate, context);
    const validation = validateCandidate(candidate, context);
    if (validation?.status_stale === true) throw new Error('Mutation candidate must regenerate STATUS.md before apply');
    assertDispositionTransitions(beforeState, validation);
    assertImmutablePreserved(immutableBefore, candidate, beforeState, validation);
    if (exists && expectedRevision !== null) {
      const currentRevision = mutationRevision(target);
      if (currentRevision !== expectedRevision) throw new MutationConflictError('Project changed while the mutation was being prepared', currentRevision);
    }
    if (exists) { fs.renameSync(target, backup); targetMoved = true; }
    fs.renameSync(candidate, target); candidateMoved = true;
    if (options.injectFailureAfterReplace) throw new Error('Injected failure after replacement');
    options.validateLive?.(target, { logicalRoot: target });
    committed = true;
    if (targetMoved) { try { fs.rmSync(backup, { recursive: true, force: true }); } catch {} }
    try { cleanupProjectWork(work); } catch {}
    return target;
  } catch (error) {
    if (committed) return target;
    let restored = false;
    try {
      if (candidateMoved && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      if (options.injectRollbackFailure && targetMoved) throw new Error('Injected rollback failure');
      if (targetMoved && fs.existsSync(backup)) fs.renameSync(backup, target);
      else if (options.init === true && exists && !fs.existsSync(target)) fs.mkdirSync(target);
      restored = true;
    } catch (restoreError) {
      const recoveryPath = fs.existsSync(backup) ? backup : work;
      const failure = new Error(`${error.message}; rollback failed: ${restoreError.message}; recovery preserved at ${recoveryPath}`);
      failure.recoveryPath = recoveryPath;
      throw failure;
    }
    if (restored && fs.existsSync(work)) cleanupProjectWork(work);
    throw error;
  }
}

module.exports = { atomicProjectMutation, assertDispositionTransitions, createProjectWork, cleanupProjectWork, isEmptyDirectory, immutableInventory, mutationRevision, MutationConflictError, UnsupportedProjectEntryError };
