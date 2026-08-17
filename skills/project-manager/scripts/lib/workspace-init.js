/**
 * Responsibility: install one validated project and canonical Studio launch support, and retire launchers this skill
 * published to the workspace root before they moved into the projects root, as one workspace transaction.
 * Invariants: contained real paths only, STATUS is generated internally, every target is revalidated before exposure,
 * only bytes this skill published are removed, and failed writes restore exact prior bytes and modes or preserve an
 * explicit recovery root.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { loadProject, loadProjectIdentity, regenerateStatus } = require('./project-state');
const { createProjectWork, cleanupProjectWork } = require('./mutations');

const MAX_PAYLOAD_BYTES = 1024 * 1024;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENV_KEY = 'PROJECT_MANAGER_SKILL_PATH';
// Frozen sha256 of every launcher this skill ever published to the workspace root, before launchers
// moved into the projects root. Only these exact bytes are removable; anything else at those names
// belongs to the operator.
const RETIRED_ROOT_LAUNCHERS = Object.freeze({
  'studio.sh': Object.freeze(['2219fc49f038529dd102d1a11510bbbcc9c466bb92f3cba3a18c0da62f9bdefa']),
  'studio.cmd': Object.freeze(['31892644e39ba8244e0c6d13e58a88ec65040cfa9d0a612833b3173e68de45e6']),
});

class WorkspaceInitError extends Error {
  constructor(code, message, target = null, kind = 'semantic') {
    super(message); this.name = 'WorkspaceInitError'; this.code = code; this.path = target; this.kind = kind;
  }
}

function lstatIfExists(target) {
  try { return fs.lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function digest(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function decodeUtf8(buffer, target) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new WorkspaceInitError('INVALID_UTF8', `Managed text file is not valid UTF-8: ${target}`, target); }
}

function directoryDigest(root) {
  const rows = [];
  function walk(folder, relative = '') {
    for (const name of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, name); const child = path.join(relative, name); const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new WorkspaceInitError('SYMLINK_TARGET', `Managed project tree must not contain a symlink: ${full}`, full);
      if (stat.isDirectory()) { rows.push({ path: child, type: 'directory', mode: stat.mode & 0o777 }); walk(full, child); }
      else if (stat.isFile()) rows.push({ path: child, type: 'file', mode: stat.mode & 0o777, digest: digest(fs.readFileSync(full)) });
      else throw new WorkspaceInitError('UNSUPPORTED_TARGET', `Managed project tree has an unsupported entry: ${full}`, full);
    }
  }
  walk(root); return digest(Buffer.from(JSON.stringify(rows)));
}

function snapshot(target, allowed = ['file'], options = {}) {
  const stat = lstatIfExists(target);
  if (!stat) return { type: 'absent' };
  if (stat.isSymbolicLink()) throw new WorkspaceInitError('SYMLINK_TARGET', `Managed path must not be a symlink: ${target}`, target);
  if (stat.isFile()) {
    if (!allowed.includes('file')) throw new WorkspaceInitError('UNSUPPORTED_TARGET', `Managed path must be a directory: ${target}`, target);
    const bytes = fs.readFileSync(target);
    return { type: 'file', dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, size: stat.size, digest: digest(bytes), bytes };
  }
  if (stat.isDirectory()) {
    if (!allowed.includes('directory')) throw new WorkspaceInitError('UNSUPPORTED_TARGET', `Managed path must be a regular file: ${target}`, target);
    const entries = fs.readdirSync(target);
    return { type: 'directory', dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, empty: entries.length === 0, ...(options.deepDirectory ? { digest: directoryDigest(target) } : {}) };
  }
  throw new WorkspaceInitError('UNSUPPORTED_TARGET', `Managed path has an unsupported file type: ${target}`, target);
}

function snapshotIdentity(value) {
  if (value.type === 'absent') return { type: 'absent' };
  if (value.type === 'file') return { type: value.type, dev: value.dev, ino: value.ino, mode: value.mode, size: value.size, digest: value.digest };
  return { type: value.type, dev: value.dev, ino: value.ino, mode: value.mode, empty: value.empty, ...(value.digest ? { digest: value.digest } : {}) };
}

function assertUnchanged(target, expected, allowed, options = {}) {
  const current = snapshot(target, allowed, options);
  if (JSON.stringify(snapshotIdentity(current)) !== JSON.stringify(snapshotIdentity(expected))) {
    throw new WorkspaceInitError('TARGET_CHANGED', `Managed path changed after preflight: ${target}`, target);
  }
}

function assertDirectoryIdentity(target, expected) {
  const current = snapshot(target, ['directory']);
  const fields = (value) => ({ type: value.type, dev: value.dev, ino: value.ino, mode: value.mode });
  if (JSON.stringify(fields(current)) !== JSON.stringify(fields(expected))) {
    throw new WorkspaceInitError('TARGET_CHANGED', `Managed directory changed after preflight: ${target}`, target);
  }
}

function assertContained(parent, target) {
  const relative = path.relative(parent, target);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new WorkspaceInitError('PATH_ESCAPE', `Managed path escapes its required parent: ${target}`, target, 'path');
  }
}

function validatePayload(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new WorkspaceInitError('INVALID_PAYLOAD', 'Initialization payload must be one JSON object', null, 'grammar');
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) throw new WorkspaceInitError('PAYLOAD_TOO_LARGE', `Initialization payload exceeds ${MAX_PAYLOAD_BYTES} bytes`, null, 'grammar');
  const keys = Object.keys(payload).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['project_md', 'tasks_md'])) throw new WorkspaceInitError('INVALID_PAYLOAD_FIELDS', 'Initialization payload must contain exactly project_md and tasks_md', null, 'grammar');
  for (const key of keys) if (typeof payload[key] !== 'string' || payload[key].length === 0) throw new WorkspaceInitError('INVALID_PAYLOAD_FIELD', `${key} must be a non-empty string`, key, 'grammar');
  return payload;
}

function updateManagedLine(before, key, value, target) {
  if (!before) return `${key}=${value}\n`;
  const text = decodeUtf8(before.bytes, target);
  const lines = text.match(/[^\n]*(?:\n|$)/g).filter((line) => line !== '');
  const indexes = [];
  lines.forEach((line, index) => { if (line.replace(/\r?\n$/, '').startsWith(`${key}=`)) indexes.push(index); });
  if (indexes.length > 1) throw new WorkspaceInitError('DUPLICATE_ENV_KEY', `${target} contains duplicate ${key} entries`, target);
  const rendered = `${key}=${value}`;
  if (indexes.length === 1) {
    const ending = /\r\n$/.test(lines[indexes[0]]) ? '\r\n' : /\n$/.test(lines[indexes[0]]) ? '\n' : '';
    lines[indexes[0]] = `${rendered}${ending}`;
    return lines.join('');
  }
  return `${text}${text.length > 0 && !text.endsWith('\n') ? '\n' : ''}${rendered}\n`;
}

function ensureIgnore(before, target) {
  const rule = '/.env.local';
  if (!before) return `${rule}\n`;
  const text = decodeUtf8(before.bytes, target);
  if (text.split(/\r?\n/).includes(rule)) return text;
  return `${text}${text.length > 0 && !text.endsWith('\n') ? '\n' : ''}${rule}\n`;
}

function sameBytes(snapshotValue, bytes) { return snapshotValue.type === 'file' && snapshotValue.digest === digest(bytes); }

// A retired root launcher is removable only when it is a regular file carrying bytes this skill
// published. Anything else at that name — a symlink, a directory, or unrelated operator content — is
// reported as absent so the transaction leaves it untouched instead of refusing the whole workspace.
function retiredLauncherSnapshot(target, allowedDigests) {
  const stat = lstatIfExists(target);
  if (!stat || !stat.isFile()) return { type: 'absent' };
  const bytes = fs.readFileSync(target);
  const value = digest(bytes);
  if (!allowedDigests.includes(value)) return { type: 'absent' };
  return { type: 'file', dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, size: stat.size, digest: value, bytes };
}

function initializeWorkspaceProject(workspaceRoot, slug, rawPayload, options = {}) {
  if (!path.isAbsolute(workspaceRoot)) throw new WorkspaceInitError('WORKSPACE_NOT_ABSOLUTE', 'Workspace root must be absolute', workspaceRoot, 'path');
  if (!SAFE_SLUG.test(slug)) throw new WorkspaceInitError('INVALID_PROJECT_SLUG', 'Project slug must be lowercase kebab-case', slug, 'grammar');
  const workspaceStat = snapshot(workspaceRoot, ['directory']);
  if (workspaceStat.type !== 'directory') throw new WorkspaceInitError('WORKSPACE_MISSING', 'Workspace root must be an existing real directory', workspaceRoot, 'path');
  const workspace = fs.realpathSync(workspaceRoot);
  if (path.resolve(workspaceRoot) !== workspace) throw new WorkspaceInitError('WORKSPACE_NOT_REAL', 'Workspace root must be selected by its real path', workspaceRoot, 'path');
  const skillRootInput = options.skillRoot;
  if (!skillRootInput || !path.isAbsolute(skillRootInput)) throw new WorkspaceInitError('SKILL_PATH_INVALID', 'Active skill root must be absolute', skillRootInput, 'path');
  const skillRootStat = snapshot(skillRootInput, ['directory']);
  if (skillRootStat.type !== 'directory') throw new WorkspaceInitError('SKILL_PATH_INVALID', 'Active skill root must be an existing real directory', skillRootInput, 'path');
  const skillRoot = fs.realpathSync(skillRootInput);
  if (/\r|\n/.test(skillRoot)) throw new WorkspaceInitError('SKILL_PATH_INVALID', 'Active skill root must not contain line breaks', skillRoot, 'path');
  const payload = validatePayload(rawPayload);

  const projectsRoot = path.join(workspace, '.projects');
  const projectTarget = path.join(projectsRoot, slug);
  const envTarget = path.join(projectsRoot, '.env.local');
  const ignoreTarget = path.join(projectsRoot, '.gitignore');
  const shTarget = path.join(projectsRoot, 'studio.sh');
  const cmdTarget = path.join(projectsRoot, 'studio.cmd');
  const retiredTargets = Object.keys(RETIRED_ROOT_LAUNCHERS).map((name) => path.join(workspace, name));
  for (const target of [projectsRoot, ...retiredTargets]) assertContained(workspace, target);
  for (const target of [projectTarget, envTarget, ignoreTarget, shTarget, cmdTarget]) assertContained(projectsRoot, target);

  const projectsSnapshot = snapshot(projectsRoot, ['directory']);
  const projectSnapshot = projectsSnapshot.type === 'absent' ? { type: 'absent' } : snapshot(projectTarget, ['directory'], { deepDirectory: true });
  if (projectSnapshot.type === 'directory' && !projectSnapshot.empty) throw new WorkspaceInitError('PROJECT_NOT_EMPTY', `Initialization target must be nonexistent or empty: ${projectTarget}`, projectTarget);
  const envSnapshot = projectsSnapshot.type === 'absent' ? { type: 'absent' } : snapshot(envTarget, ['file']);
  const ignoreSnapshot = projectsSnapshot.type === 'absent' ? { type: 'absent' } : snapshot(ignoreTarget, ['file']);
  const shSnapshot = projectsSnapshot.type === 'absent' ? { type: 'absent' } : snapshot(shTarget, ['file']);
  const cmdSnapshot = projectsSnapshot.type === 'absent' ? { type: 'absent' } : snapshot(cmdTarget, ['file']);
  const shAsset = fs.readFileSync(path.join(skillRoot, 'assets', 'studio.sh'));
  const cmdAsset = fs.readFileSync(path.join(skillRoot, 'assets', 'studio.cmd'));
  if (shSnapshot.type === 'file' && !sameBytes(shSnapshot, shAsset)) throw new WorkspaceInitError('LAUNCHER_CONFLICT', `Existing launcher is not managed by Project Manager: ${shTarget}`, shTarget);
  if (cmdSnapshot.type === 'file' && !sameBytes(cmdSnapshot, cmdAsset)) throw new WorkspaceInitError('LAUNCHER_CONFLICT', `Existing launcher is not managed by Project Manager: ${cmdTarget}`, cmdTarget);
  const retired = Object.entries(RETIRED_ROOT_LAUNCHERS).map(([name, digests], index) => ({
    name: `retired-${name}`, target: retiredTargets[index], before: retiredLauncherSnapshot(retiredTargets[index], digests), allowed: ['file'], remove: true,
  }));

  const envBytes = Buffer.from(updateManagedLine(envSnapshot.type === 'file' ? envSnapshot : null, ENV_KEY, skillRoot, envTarget));
  const ignoreBytes = Buffer.from(ensureIgnore(ignoreSnapshot.type === 'file' ? ignoreSnapshot : null, ignoreTarget));
  const work = createProjectWork(workspace, 'workspace-init-');
  const candidateRoot = path.join(work, 'candidates');
  const backupRoot = path.join(work, 'backups');
  let projectCandidate; let candidateState; let entries;
  try {
    fs.mkdirSync(candidateRoot); fs.mkdirSync(backupRoot);
    projectCandidate = path.join(candidateRoot, 'project'); fs.mkdirSync(projectCandidate);
    fs.writeFileSync(path.join(projectCandidate, 'PROJECT.md'), payload.project_md);
    fs.writeFileSync(path.join(projectCandidate, 'TASKS.md'), payload.tasks_md);
    const identity = loadProjectIdentity(projectCandidate, { logicalRoot: projectTarget });
    fs.writeFileSync(path.join(projectCandidate, 'STATUS.md'), `---\nschema_version: 1\nproject_id: ${JSON.stringify(identity.project.id)}\ngenerated_at: "1970-01-01T00:00:00Z"\nsource_sha256: "0000000000000000000000000000000000000000000000000000000000000000"\n---\n`);
    regenerateStatus(projectCandidate, options.generatedAt ?? new Date().toISOString(), { logicalRoot: projectTarget });
    candidateState = loadProject(projectCandidate, { logicalRoot: projectTarget });
    if (candidateState.status_stale) throw new WorkspaceInitError('STATUS_STALE', 'Generated project status is stale', projectTarget);

    entries = [
      { name: 'env', target: envTarget, before: envSnapshot, allowed: ['file'], bytes: envBytes, mode: 0o600 },
      { name: 'ignore', target: ignoreTarget, before: ignoreSnapshot, allowed: ['file'], bytes: ignoreBytes, mode: ignoreSnapshot.mode ?? 0o644 },
      { name: 'sh', target: shTarget, before: shSnapshot, allowed: ['file'], bytes: shAsset, mode: 0o755 },
      { name: 'cmd', target: cmdTarget, before: cmdSnapshot, allowed: ['file'], bytes: cmdAsset, mode: cmdSnapshot.mode ?? 0o644 },
      { name: 'project', target: projectTarget, before: projectSnapshot, allowed: ['directory'], candidate: projectCandidate },
      ...retired,
    ];
    for (const entry of entries) {
      if (entry.bytes) {
        entry.candidate = path.join(candidateRoot, entry.name);
        fs.writeFileSync(entry.candidate, entry.bytes, { mode: entry.mode });
        fs.chmodSync(entry.candidate, entry.mode);
      }
      entry.changed = entry.remove ? entry.before.type !== 'absent'
        : entry.before.type === 'absent' || entry.before.type === 'directory'
          || !sameBytes(entry.before, entry.bytes) || (entry.mode !== undefined && entry.before.mode !== entry.mode);
      entry.backup = path.join(backupRoot, entry.name);
    }
  } catch (error) {
    try { cleanupProjectWork(work); } catch {}
    throw error;
  }

  const operations = []; let projectsCreated = false; let projectsLiveSnapshot = projectsSnapshot; let exposureIndex = 0; let committed = false;
  try {
    if (projectsSnapshot.type === 'absent') {
      assertUnchanged(projectsRoot, projectsSnapshot, ['directory']);
      fs.mkdirSync(projectsRoot, { mode: 0o755 }); projectsCreated = true; projectsLiveSnapshot = snapshot(projectsRoot, ['directory']);
    } else assertUnchanged(projectsRoot, projectsSnapshot, ['directory']);
    for (const entry of entries.filter((item) => item.changed)) {
      options.beforeExposure?.(exposureIndex, entry.target);
      if (entry.target.startsWith(`${projectsRoot}${path.sep}`)) {
        assertDirectoryIdentity(projectsRoot, projectsLiveSnapshot);
      }
      const snapshotOptions = { deepDirectory: entry.name === 'project' };
      assertUnchanged(entry.target, entry.before, entry.allowed, snapshotOptions);
      const operation = { entry, targetMoved: false, candidateMoved: false };
      operations.push(operation);
      if (entry.before.type !== 'absent') {
        fs.renameSync(entry.target, entry.backup); operation.targetMoved = true;
        options.afterTargetMove?.(exposureIndex, entry.target, entry.backup);
        assertUnchanged(entry.backup, entry.before, entry.allowed, snapshotOptions);
        assertUnchanged(entry.target, { type: 'absent' }, entry.allowed, snapshotOptions);
      }
      if (!entry.remove) {
        fs.renameSync(entry.candidate, entry.target); operation.candidateMoved = true;
        operation.installed = snapshot(entry.target, entry.allowed, snapshotOptions);
      }
      exposureIndex += 1;
      if (options.injectFailureAfterExposure === exposureIndex) throw new Error(`Injected failure after exposure ${exposureIndex}`);
    }
    const live = loadProject(projectTarget);
    if (live.status_stale) throw new WorkspaceInitError('STATUS_STALE', 'Installed project status is stale', projectTarget);
    committed = true;
    try {
      if (options.injectCleanupFailure) throw new Error('Injected cleanup failure');
      for (const operation of operations) if (operation.targetMoved && lstatIfExists(operation.entry.backup)) {
        const snapshotOptions = { deepDirectory: operation.entry.name === 'project' };
        assertUnchanged(operation.entry.backup, operation.entry.before, operation.entry.allowed, snapshotOptions);
        fs.rmSync(operation.entry.backup, { recursive: true, force: true });
      }
      cleanupProjectWork(work);
    } catch (cleanupError) {
      const recoveryPath = path.dirname(work);
      const failure = new WorkspaceInitError('COMMITTED_CLEANUP_FAILED', `Initialization committed but cleanup failed: ${cleanupError.message}; recovery preserved at ${recoveryPath}`, recoveryPath);
      failure.recoveryPath = recoveryPath; failure.committed = true; failure.project = { id: live.project.id, root: projectTarget };
      throw failure;
    }
    return {
      project: { id: live.project.id, root: projectTarget },
      data: {
        workspace_root: workspace, projects_root: projectsRoot, launchers: [shTarget, cmdTarget], env_file: envTarget,
        removed_retired_launchers: retired.filter((entry) => entry.changed).map((entry) => entry.target),
      },
    };
  } catch (error) {
    if (committed) throw error;
    try {
      for (let index = operations.length - 1; index >= 0; index -= 1) {
        const operation = operations[index]; const { entry } = operation;
        const snapshotOptions = { deepDirectory: entry.name === 'project' };
        if (operation.candidateMoved) {
          try { assertUnchanged(entry.target, operation.installed, entry.allowed, snapshotOptions); }
          catch { throw new Error(`Exposed target changed before rollback and was preserved: ${entry.target}`); }
          fs.rmSync(entry.target, { recursive: true, force: true });
        }
        if (options.injectRollbackFailure && operation.targetMoved) throw new Error('Injected rollback failure');
        if (operation.targetMoved) {
          if (!lstatIfExists(entry.backup)) throw new Error(`Rollback backup is missing for ${entry.target}`);
          if (lstatIfExists(entry.target)) throw new Error(`Rollback target is occupied by an external change and was preserved: ${entry.target}`);
          assertUnchanged(entry.backup, entry.before, entry.allowed, snapshotOptions);
          fs.renameSync(entry.backup, entry.target);
        }
        else if (entry.before.type === 'directory' && !fs.existsSync(entry.target)) fs.mkdirSync(entry.target, { mode: entry.before.mode });
      }
      if (projectsCreated && lstatIfExists(projectsRoot)) {
        assertDirectoryIdentity(projectsRoot, projectsLiveSnapshot);
        if (fs.readdirSync(projectsRoot).length !== 0) throw new Error(`Created projects root contains an external change and was preserved: ${projectsRoot}`);
        fs.rmdirSync(projectsRoot);
      }
      cleanupProjectWork(work);
    } catch (rollbackError) {
      const recoveryPath = path.dirname(work);
      const failure = new WorkspaceInitError('ROLLBACK_FAILED', `${error.message}; rollback failed: ${rollbackError.message}; recovery preserved at ${recoveryPath}`, recoveryPath);
      failure.recoveryPath = recoveryPath;
      throw failure;
    }
    throw error;
  }
}

module.exports = { MAX_PAYLOAD_BYTES, RETIRED_ROOT_LAUNCHERS, WorkspaceInitError, initializeWorkspaceProject, validatePayload };
