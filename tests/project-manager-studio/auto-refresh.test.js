/* Studio auto-refresh coordinator regressions: blocker deferral, coalescing,
   in-flight commit invalidation, blocker-only no-op, and stopped ownership. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const coordinatorPath = '../../src/project-manager-studio/client/auto-refresh.mjs';

test('notifications refresh immediately and newer reads invalidate older commits', async () => {
  const { createAutoRefreshCoordinator } = await import(coordinatorPath); const commits = [];
  const coordinator = createAutoRefreshCoordinator({ refresh: (commit) => { commits.push(commit); } });
  coordinator.notify(); assert.equal(commits.length, 1); assert.equal(commits[0].canCommit(), true);
  coordinator.notify(); assert.equal(commits.length, 2); assert.equal(commits[0].canCommit(), false); assert.equal(commits[1].canCommit(), true);
  coordinator.stop(); assert.equal(commits[1].canCommit(), false);
});

test('events coalesce while blocked and flush once when editing clears', async () => {
  const { createAutoRefreshCoordinator } = await import(coordinatorPath); let refreshes = 0;
  const coordinator = createAutoRefreshCoordinator({ refresh: () => { refreshes += 1; } });
  coordinator.setBlocked(true); coordinator.notify(); coordinator.notify(); assert.equal(refreshes, 0);
  coordinator.setBlocked(false); assert.equal(refreshes, 1);
  coordinator.setBlocked(false); assert.equal(refreshes, 1); coordinator.stop();
});

test('editor activation invalidates an in-flight commit and schedules one fresh read', async () => {
  const { createAutoRefreshCoordinator } = await import(coordinatorPath); const commits = []; const releases = [];
  const coordinator = createAutoRefreshCoordinator({ refresh: (commit) => { commits.push(commit); return new Promise((resolve) => releases.push(resolve)); } });
  coordinator.notify(); assert.equal(commits[0].canCommit(), true);
  coordinator.setBlocked(true); assert.equal(commits[0].canCommit(), false);
  coordinator.setBlocked(false); assert.equal(commits.length, 2); assert.equal(commits[1].canCommit(), true);
  releases.forEach((release) => release()); await new Promise((resolve) => setImmediate(resolve)); coordinator.stop();
});

test('blocker-only activity causes no project refresh and stopped coordinator stays inert', async () => {
  const { createAutoRefreshCoordinator } = await import(coordinatorPath); let refreshes = 0;
  const coordinator = createAutoRefreshCoordinator({ refresh: () => { refreshes += 1; } });
  coordinator.setBlocked(true); coordinator.setBlocked(false); assert.equal(refreshes, 0);
  coordinator.stop(); coordinator.notify(); coordinator.setBlocked(true); coordinator.setBlocked(false); assert.equal(refreshes, 0);
});
