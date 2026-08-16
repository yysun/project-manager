/* Studio project watcher regressions: path scope, burst debounce, replacement
   reattachment, catalog-invalid roots, parent identity, errors, and cleanup. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { builtServerPath, makeProject } = require('./_helpers');

class FakeWatcher extends EventEmitter {
  constructor(target, options, listener) { super(); this.target = target; this.options = options; this.listener = listener; this.closes = 0; }
  close() { this.closes += 1; }
  change(filename, event = 'change') { this.listener(event, filename); }
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function fakeWatch() {
  const watchers = [];
  return { watchers, watchFn(target, options, listener) { const watcher = new FakeWatcher(target, options, listener); watchers.push(watcher); return watcher; } };
}

test('relevant path filter includes project state and handoffs but excludes unrelated churn', () => {
  const { isRelevantProjectPath } = require(builtServerPath);
  for (const value of [null, 'PROJECT.md', 'TASKS.md', path.join('handoffs', 'TASK-X', 'EVIDENCE-001.md')]) assert.equal(isRelevantProjectPath(value), true, String(value));
  for (const value of ['README.md', 'package.json', path.join('reports', 'history', 'STATUS.md'), path.join('src', 'TASKS.md'), '../TASKS.md']) assert.equal(isRelevantProjectPath(value), false, value);
});

test('relevant root events use one trailing debounce and cleanup cancels pending work', async () => {
  const { watchProjectChanges, PROJECT_CHANGE_DEBOUNCE_MS } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch(); let changes = 0;
  const stop = watchProjectChanges({ root, resolveRoot: () => root, onChange: () => { changes += 1; }, watchFn: fake.watchFn });
  const rootWatcher = fake.watchers.find((item) => item.options.recursive);
  rootWatcher.change('TASKS.md'); await delay(PROJECT_CHANGE_DEBOUNCE_MS / 2); rootWatcher.change('STATUS.md'); rootWatcher.change('README.md');
  await delay(PROJECT_CHANGE_DEBOUNCE_MS + 30); assert.equal(changes, 1);
  rootWatcher.change('PROJECT.md'); stop(); stop(); await delay(PROJECT_CHANGE_DEBOUNCE_MS + 30); assert.equal(changes, 1);
  assert.equal(fake.watchers.every((item) => item.closes === 1), true);
});

test('atomic root replacement emits once, reattaches, and observes the new root', async () => {
  const { watchProjectChanges, PROJECT_CHANGE_DEBOUNCE_MS } = require(builtServerPath); const root = makeProject(); const replacement = makeProject(); const fake = fakeWatch(); let changes = 0;
  const stop = watchProjectChanges({ root, resolveRoot: () => root, onChange: () => { changes += 1; }, watchFn: fake.watchFn, retryLimit: 1 });
  const parentWatcher = fake.watchers.find((item) => !item.options.recursive); const oldRootWatcher = fake.watchers.find((item) => item.options.recursive);
  fs.renameSync(root, `${root}-old`); fs.renameSync(replacement, root); parentWatcher.change(path.basename(root), 'rename');
  assert.equal(oldRootWatcher.closes, 1); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 2);
  await delay(PROJECT_CHANGE_DEBOUNCE_MS + 30); assert.equal(changes, 1);
  fake.watchers.filter((item) => item.options.recursive).at(-1).change('TASKS.md'); await delay(PROJECT_CHANGE_DEBOUNCE_MS + 30); assert.equal(changes, 2); stop();
});

test('filename-less sibling parent event is ignored when selected root identity is unchanged', async () => {
  const { watchProjectChanges, PROJECT_CHANGE_DEBOUNCE_MS } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch(); let changes = 0;
  const stop = watchProjectChanges({ root, resolveRoot: () => root, onChange: () => { changes += 1; }, watchFn: fake.watchFn });
  fake.watchers.find((item) => !item.options.recursive).change(null, 'rename');
  await delay(PROJECT_CHANGE_DEBOUNCE_MS + 30); assert.equal(changes, 0); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 1); stop();
});

test('catalog-invalid replacement remains unwatched until a later valid restoration event', async () => {
  const { watchProjectChanges } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch(); let valid = true;
  const resolveRoot = () => { if (!valid) throw new Error('PROJECT_SELECTION_STALE'); return root; };
  const stop = watchProjectChanges({ root, resolveRoot, onChange: () => {}, watchFn: fake.watchFn, retryLimit: 0 });
  const parentWatcher = fake.watchers.find((item) => !item.options.recursive); valid = false; parentWatcher.change(path.basename(root), 'rename');
  assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 1, 'no watcher attaches to invalid replacement');
  valid = true; parentWatcher.change(path.basename(root), 'rename');
  assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 2, 'later valid binding reattaches'); stop();
});

test('filename-less restoration recovers a parent-only stream after retry exhaustion', async () => {
  const { watchProjectChanges, PROJECT_CHANGE_DEBOUNCE_MS } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch(); let valid = false; let changes = 0;
  const resolveRoot = () => { if (!valid) throw new Error('PROJECT_SELECTION_STALE'); return root; };
  const stop = watchProjectChanges({ root, resolveRoot, onChange: () => { changes += 1; }, watchFn: fake.watchFn, retryLimit: 0 });
  const parentWatcher = fake.watchers.find((item) => !item.options.recursive); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 0);
  parentWatcher.change(null, 'rename'); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 0, 'invalid filename-less events remain ignored');
  valid = true; parentWatcher.change(null, 'rename'); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 1, 'valid restoration attaches recursively');
  await delay(PROJECT_CHANGE_DEBOUNCE_MS + 30); assert.equal(changes, 1); stop();
});

test('catalog validation blocks a symlink replacement and reattaches only after real-root restoration', { skip: process.platform === 'win32' }, () => {
  const { watchProjectChanges, ProjectCatalog } = require(builtServerPath); const root = fs.realpathSync(makeProject()); const outside = makeProject(null, 'OUTSIDE'); const fake = fakeWatch();
  const catalog = new ProjectCatalog([{ id: 'STUDIO', name: 'Studio Delivery', root }], root); const key = catalog.initialKey;
  const stop = watchProjectChanges({ root, resolveRoot: () => catalog.resolve(key).root, onChange: () => {}, watchFn: fake.watchFn, retryLimit: 0 });
  const parentWatcher = fake.watchers.find((item) => !item.options.recursive); const backup = `${root}-backup`;
  fs.renameSync(root, backup); fs.symlinkSync(outside, root, 'dir'); parentWatcher.change(path.basename(root), 'rename');
  assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 1, 'symlink never receives a watcher');
  fs.unlinkSync(root); fs.renameSync(backup, root); parentWatcher.change(path.basename(root), 'rename');
  assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 2, 'restored catalog identity is watched'); stop();
});

test('replacement retries survive an absence window and stale generations cannot attach twice', async () => {
  const { watchProjectChanges, PROJECT_WATCH_RETRY_MS } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch();
  const stop = watchProjectChanges({ root, resolveRoot: () => { if (!fs.existsSync(root)) throw new Error('missing'); return root; }, onChange: () => {}, watchFn: fake.watchFn, retryLimit: 3 });
  const parentWatcher = fake.watchers.find((item) => !item.options.recursive); const backup = `${root}-rollback`;
  fs.renameSync(root, backup); parentWatcher.change(path.basename(root), 'rename'); parentWatcher.change(path.basename(root), 'rename');
  await delay(PROJECT_WATCH_RETRY_MS / 2); fs.renameSync(backup, root);
  await delay(PROJECT_WATCH_RETRY_MS * 2); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 2, 'only current retry generation reattaches'); stop();
});

test('disconnect during replacement retry cancels reattachment and closes resources', async () => {
  const { watchProjectChanges, PROJECT_WATCH_RETRY_MS } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch();
  const stop = watchProjectChanges({ root, resolveRoot: () => { if (!fs.existsSync(root)) throw new Error('missing'); return root; }, onChange: () => {}, watchFn: fake.watchFn, retryLimit: 3 });
  const parentWatcher = fake.watchers.find((item) => !item.options.recursive); const backup = `${root}-disconnect`;
  fs.renameSync(root, backup); parentWatcher.change(path.basename(root), 'rename'); stop(); fs.renameSync(backup, root);
  await delay(PROJECT_WATCH_RETRY_MS * 2); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 1); assert.equal(fake.watchers.every((item) => item.closes === 1), true);
});

test('root watcher error revalidates and replaces the watcher when attachment remains healthy', () => {
  const { watchProjectChanges } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch();
  const stop = watchProjectChanges({ root, resolveRoot: () => root, onChange: () => {}, watchFn: fake.watchFn, retryLimit: 0 });
  const first = fake.watchers.find((item) => item.options.recursive); first.emit('error', new Error('transient root watch error'));
  assert.equal(first.closes, 1); assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 2); stop();
});

test('initial attachment keeps the safe parent when root identity changes during recursive watch setup', { skip: process.platform === 'win32' }, () => {
  const { watchProjectChanges } = require(builtServerPath); const root = fs.realpathSync(makeProject()); const outside = makeProject(null, 'OUTSIDE'); const fake = fakeWatch(); const backup = `${root}-attach-race`; let replaced = false;
  const watchFn = (target, options, listener) => {
    const watcher = fake.watchFn(target, options, listener);
    if (options.recursive && !replaced) { replaced = true; fs.renameSync(root, backup); fs.symlinkSync(outside, root, 'dir'); }
    return watcher;
  };
  const stop = watchProjectChanges({ root, resolveRoot: () => root, onChange: () => {}, watchFn, retryLimit: 0 });
  assert.equal(fake.watchers.length, 2); assert.equal(fake.watchers.find((item) => item.options.recursive).closes, 1); assert.equal(fake.watchers.find((item) => !item.options.recursive).closes, 0);
  fs.unlinkSync(root); fs.renameSync(backup, root); fake.watchers.find((item) => !item.options.recursive).change(path.basename(root), 'rename');
  assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 2, 'restoration event attaches the validated root'); stop();
});

test('unsafe parent fails before watcher creation', { skip: process.platform === 'win32' }, () => {
  const { watchProjectChanges } = require(builtServerPath); const workspace = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-parent-unsafe-')); const parent = path.join(workspace, 'projects'); fs.mkdirSync(parent); const root = makeProject(null, 'STUDIO', path.join(parent, 'selected')); const outside = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-parent-outside-')); const backup = `${parent}-backup`; const fake = fakeWatch();
  fs.renameSync(parent, backup); fs.symlinkSync(outside, parent, 'dir');
  assert.throws(() => watchProjectChanges({ root, resolveRoot: () => root, onChange: () => {}, watchFn: fake.watchFn }), /parent is not a real directory/); assert.equal(fake.watchers.length, 0);
  fs.unlinkSync(parent); fs.renameSync(backup, parent);
});

test('parent identity swap during watcher creation closes the provisional watcher and fails setup', () => {
  const { watchProjectChanges } = require(builtServerPath); const workspace = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-parent-race-')); const parent = path.join(workspace, 'projects'); fs.mkdirSync(parent); const root = makeProject(null, 'STUDIO', path.join(parent, 'selected')); const replacement = path.join(workspace, 'replacement'); fs.mkdirSync(replacement); const backup = `${parent}-backup`; const fake = fakeWatch();
  const watchFn = (target, options, listener) => { const watcher = fake.watchFn(target, options, listener); if (!options.recursive) { fs.renameSync(parent, backup); fs.renameSync(replacement, parent); } return watcher; };
  assert.throws(() => watchProjectChanges({ root, resolveRoot: () => root, onChange: () => {}, watchFn }), /parent changed/); assert.equal(fake.watchers.length, 1); assert.equal(fake.watchers[0].closes, 1);
  fs.renameSync(parent, replacement); fs.renameSync(backup, parent);
});

test('valid-root attachment exhaustion is fatal and closes every watcher once', () => {
  const { watchProjectChanges } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch(); let recursiveCalls = 0; let fatals = 0;
  const watchFn = (target, options, listener) => { if (options.recursive && recursiveCalls++ > 0) throw new Error('watch unavailable'); return fake.watchFn(target, options, listener); };
  const stop = watchProjectChanges({ root, resolveRoot: () => root, onChange: () => {}, onFatal: () => { fatals += 1; }, watchFn, retryLimit: 0 });
  fake.watchers.find((item) => item.options.recursive).emit('error', new Error('root watch failed'));
  assert.equal(fatals, 1); assert.equal(fake.watchers.every((item) => item.closes === 1), true); stop(); assert.equal(fatals, 1);
});

test('retry exhaustion reports degradation and keeps the parent recovery anchor open', async () => {
  const { watchProjectChanges } = require(builtServerPath); const root = makeProject(); const fake = fakeWatch();
  const degraded = []; const live = []; let valid = false;
  const resolveRoot = () => { if (!valid) throw new Error('PROJECT_SELECTION_STALE'); return root; };
  const stop = watchProjectChanges({
    root, resolveRoot, onChange: () => {}, watchFn: fake.watchFn, retryLimit: 0,
    onDegraded: (error) => degraded.push(error.message), onLive: () => live.push(true),
  });
  assert.equal(degraded.length, 1, 'exhausting the retry budget reports the stream is not live');
  const parentWatcher = fake.watchers.find((item) => !item.options.recursive);
  assert.equal(parentWatcher.closes, 0, 'the parent anchor must stay open so a later binding can reattach');
  assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 0);

  // The anchor still works: a valid binding reattaches and clears the state.
  valid = true; parentWatcher.change(path.basename(root), 'rename');
  assert.equal(fake.watchers.filter((item) => item.options.recursive).length, 1, 'later valid binding still reattaches');
  assert.equal(degraded.length, 1, 'recovery does not re-report degradation');
  // Without this the banner would stick on forever, and every other assertion
  // here would still pass -- the mirror of the silent-death bug.
  assert.deepEqual(live, [true], 'a real reattach states liveness explicitly');
  stop();
});
