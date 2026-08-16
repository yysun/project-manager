// Project-scoped Studio file watching: relevant-path filtering, trailing
// coalescing, catalog-revalidated root replacement, retry, and safe cleanup.
// Retry exhaustion is reported through onDegraded rather than ending the watch:
// closing here would close the parent anchor and make recovery impossible.
import fs from 'node:fs';
import path from 'node:path';

export const PROJECT_CHANGE_DEBOUNCE_MS = 100;
export const PROJECT_WATCH_RETRY_MS = 50;
export const PROJECT_WATCH_RETRY_LIMIT = 10;

const STATE_FILES = new Set([
  'PROJECT.md', 'TASKS.md', 'STATUS.md', 'MILESTONES.md', 'RISKS.md',
  'DECISIONS.md', 'SOURCES.md', 'TRACEABILITY.md', 'CHANGES.md',
  'ASSUMPTIONS.md', 'ISSUES.md', 'STAKEHOLDERS.md', 'LESSONS.md', 'CLOSURE.md',
]);

interface WatcherLike {
  close(): void;
  on(event: 'error', listener: (error: Error) => void): this;
}
type WatchFn = (target: string, options: { recursive?: boolean }, listener: (event: string, filename: string | Buffer | null) => void) => WatcherLike;
type Timer = ReturnType<typeof setTimeout>;
interface Identity { dev: bigint; ino: bigint }

export interface ProjectWatcherOptions {
  root: string;
  resolveRoot: () => string;
  onChange: () => void;
  onFatal?: (error: Error) => void;
  /** The root binding could not be re-established within the retry budget. Not
   *  fatal: the parent watcher stays open as the recovery anchor, so a later
   *  valid binding still reattaches. Reported so the client can stop trusting
   *  the stream rather than silently observing no changes. */
  onDegraded?: (error: Error) => void;
  /** The root binding was re-established after a degrade. Liveness is stated by
   *  the watcher, never inferred from a data event: `replaceRoot` notifies
   *  before the reattach outcome is known, so a failed reattach also emits a
   *  change and inferring from it would clear the warning on a dead stream. */
  onLive?: () => void;
  watchFn?: WatchFn;
  lstatFn?: typeof fs.lstatSync;
  realpathFn?: typeof fs.realpathSync;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  retryLimit?: number;
}

function filenameText(filename: string | Buffer | null): string | null {
  return filename === null ? null : filename.toString();
}

export function isRelevantProjectPath(filename: string | Buffer | null): boolean {
  const text = filenameText(filename);
  if (text === null) return true;
  const normalized = path.normalize(text);
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) return false;
  const pieces = normalized.split(path.sep);
  return (pieces.length === 1 && STATE_FILES.has(pieces[0])) || pieces[0] === 'handoffs';
}

function identity(stat: fs.Stats): Identity { return { dev: BigInt(stat.dev), ino: BigInt(stat.ino) }; }
function sameIdentity(left: Identity | null, right: Identity): boolean { return left !== null && left.dev === right.dev && left.ino === right.ino; }

export function watchProjectChanges(options: ProjectWatcherOptions): () => void {
  const watchFn: WatchFn = options.watchFn ?? ((target, watchOptions, listener) => fs.watch(target, watchOptions, listener));
  const lstatFn = options.lstatFn ?? fs.lstatSync;
  const realpathFn = options.realpathFn ?? fs.realpathSync;
  const setTimer = options.setTimeoutFn ?? setTimeout;
  const clearTimer = options.clearTimeoutFn ?? clearTimeout;
  const retryLimit = options.retryLimit ?? PROJECT_WATCH_RETRY_LIMIT;
  const expectedRoot = path.resolve(options.root);
  const parent = path.dirname(expectedRoot);
  const basename = path.basename(expectedRoot);
  let parentWatcher: WatcherLike | null = null;
  let rootWatcher: WatcherLike | null = null;
  let attachedIdentity: Identity | null = null;
  let retryTimer: Timer | null = null;
  let changeTimer: Timer | null = null;
  let generation = 0;
  let stopped = false;
  let degraded = false;

  const closeWatcher = (watcher: WatcherLike | null) => { try { watcher?.close(); } catch { /* already closed */ } };
  const cancelRetry = () => { if (retryTimer !== null) { clearTimer(retryTimer); retryTimer = null; } };
  const cancelChange = () => { if (changeTimer !== null) { clearTimer(changeTimer); changeTimer = null; } };

  function stop() {
    if (stopped) return;
    stopped = true; generation += 1; cancelRetry(); cancelChange();
    closeWatcher(rootWatcher); closeWatcher(parentWatcher);
    rootWatcher = null; parentWatcher = null; attachedIdentity = null;
  }

  function fatal(error: Error) { if (!stopped) { stop(); options.onFatal?.(error); } }

  /** One retry policy for every recoverable attachment failure. Exhaustion is
   *  deliberately not fatal -- closing here would close the parent anchor and
   *  make recovery impossible -- so it degrades instead, once per outage. */
  function scheduleRetryOrDegrade(token: number, attempt: number, cause: Error) {
    if (attempt < retryLimit) {
      retryTimer = setTimer(() => { retryTimer = null; attachRoot(token, attempt + 1); }, PROJECT_WATCH_RETRY_MS);
      return;
    }
    if (!degraded && !stopped) { degraded = true; options.onDegraded?.(cause); }
  }

  function notify() {
    if (stopped) return;
    cancelChange();
    changeTimer = setTimer(() => { changeTimer = null; if (!stopped) options.onChange(); }, PROJECT_CHANGE_DEBOUNCE_MS);
  }

  function resolvedIdentity(): { root: string; identity: Identity } {
    const root = path.resolve(options.resolveRoot());
    if (root !== expectedRoot) throw new Error('Resolved project root changed');
    const stat = lstatFn(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Resolved project root is not a real directory');
    return { root, identity: identity(stat) };
  }

  function resolvedParentIdentity(): Identity {
    const stat = lstatFn(parent);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Project parent is not a real directory');
    if (realpathFn(parent) !== parent) throw new Error('Project parent path changed');
    return identity(stat);
  }

  function attachRoot(token: number, attempt: number) {
    if (stopped || token !== generation) return;
    let resolved: { root: string; identity: Identity };
    try { resolved = resolvedIdentity(); }
    catch (error) {
      scheduleRetryOrDegrade(token, attempt, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    let next: WatcherLike;
    try {
      next = watchFn(resolved.root, { recursive: true }, (_event, filename) => {
        if (token === generation && next === rootWatcher && isRelevantProjectPath(filename)) notify();
      });
    } catch (error) {
      if (attempt < retryLimit) {
        retryTimer = setTimer(() => { retryTimer = null; attachRoot(token, attempt + 1); }, PROJECT_WATCH_RETRY_MS);
      } else fatal(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    next.on('error', (error) => { if (token === generation && next === rootWatcher) replaceRoot(error); });
    let confirmed: { root: string; identity: Identity };
    try { confirmed = resolvedIdentity(); }
    catch (error) {
      closeWatcher(next);
      scheduleRetryOrDegrade(token, attempt, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (!sameIdentity(resolved.identity, confirmed.identity)) {
      closeWatcher(next);
      scheduleRetryOrDegrade(token, attempt, new Error('Project root identity changed during watcher attachment'));
      return;
    }
    if (stopped || token !== generation) { closeWatcher(next); return; }
    const previous = rootWatcher;
    rootWatcher = next; attachedIdentity = resolved.identity;
    if (degraded) { degraded = false; options.onLive?.(); }
    closeWatcher(previous);
  }

  function replaceRoot(_cause?: Error) {
    if (stopped) return;
    generation += 1; const token = generation; cancelRetry();
    closeWatcher(rootWatcher); rootWatcher = null; attachedIdentity = null;
    notify(); attachRoot(token, 0);
  }

  function parentBindingChanged(): boolean {
    if (attachedIdentity === null) {
      try { resolvedIdentity(); return true; }
      catch { return false; }
    }
    try {
      const resolved = resolvedIdentity();
      return !sameIdentity(attachedIdentity, resolved.identity);
    } catch { return true; }
  }

  // A validated parent remains the recovery anchor while a temporarily stale
  // child root is retried inside the already-established SSE stream.
  const initialParent = resolvedParentIdentity();
  try {
    parentWatcher = watchFn(parent, {}, (_event, filename) => {
      const text = filenameText(filename);
      if (text === basename || (text === null && parentBindingChanged())) replaceRoot();
    });
    parentWatcher.on('error', (error) => fatal(error));
    const confirmedParent = resolvedParentIdentity();
    if (!sameIdentity(initialParent, confirmedParent)) throw new Error('Project parent changed during watcher attachment');
  } catch (error) {
    stop(); throw error;
  }
  attachRoot(generation, 0);
  return stop;
}
