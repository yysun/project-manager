/**
 * Responsibility: same-filesystem candidate/backup transactions for skill-led
 * project initialization and updates. Invariants: validate before exposure and
 * restore exact prior bytes after any failed replacement. Initial implementation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function isEmptyDirectory(target) {
  return fs.existsSync(target) && fs.lstatSync(target).isDirectory() && fs.readdirSync(target).length === 0;
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
      const isValidatedAncestor = afterState?.tasks?.some((task) => task.active_contract && path.join('handoffs', task.id, task.active_contract).startsWith(relative));
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

function atomicProjectMutation(target, mutateCandidate, validateCandidate, options = {}) {
  if (!path.isAbsolute(target)) throw new Error('Project mutation target must be absolute');
  const parent = path.dirname(target); const name = path.basename(target);
  if (!fs.existsSync(parent) || !fs.lstatSync(parent).isDirectory()) throw new Error('Project parent directory must exist');
  const exists = fs.existsSync(target); const initializing = !exists || isEmptyDirectory(target);
  if (options.init === true && exists && !initializing) throw new Error('Initialization target must be nonexistent or empty');
  if (options.init !== true && !exists) throw new Error('Update target must exist');
  const immutableBefore = exists && !initializing ? immutableInventory(target) : new Map();
  const beforeState = exists && !initializing ? validateCandidate(target, { logicalRoot: target }) : null;
  const work = fs.mkdtempSync(path.join(parent, `.${name}.transaction-`));
  const candidate = path.join(work, name); const backup = path.join(work, `${name}.backup`);
  let targetMoved = false; let candidateMoved = false; let committed = false;
  try {
    if (exists && !initializing) fs.cpSync(target, candidate, { recursive: true, errorOnExist: true, preserveTimestamps: true });
    else fs.mkdirSync(candidate);
    const context = { logicalRoot: target };
    mutateCandidate(candidate, context);
    const validation = validateCandidate(candidate, context);
    if (validation?.status_stale === true) throw new Error('Mutation candidate must regenerate STATUS.md before apply');
    assertImmutablePreserved(immutableBefore, candidate, beforeState, validation);
    if (exists) { fs.renameSync(target, backup); targetMoved = true; }
    fs.renameSync(candidate, target); candidateMoved = true;
    if (options.injectFailureAfterReplace) throw new Error('Injected failure after replacement');
    options.validateLive?.(target, { logicalRoot: target });
    committed = true;
    if (targetMoved) { try { fs.rmSync(backup, { recursive: true, force: true }); } catch {} }
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
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
    if (restored && fs.existsSync(work)) fs.rmSync(work, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { atomicProjectMutation, isEmptyDirectory, immutableInventory };
