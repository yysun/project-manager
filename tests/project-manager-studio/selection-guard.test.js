/* Tab-local Studio selection guard: stale refresh/save responses cannot replace
   a newer selection, including switch-away-and-back to the same project key. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

test('selection guard accepts only the current request generation and project key', async () => {
  const { createSelectionGuard } = await import('../../src/project-manager-studio/client/selection-guard.mjs');
  const guard = createSelectionGuard();
  const alpha = guard.begin('alpha');
  assert.equal(guard.accepts(alpha, 'alpha'), true);
  const beta = guard.begin('beta');
  assert.equal(guard.accepts(alpha, 'alpha'), false, 'late Alpha refresh/save must be ignored');
  assert.equal(guard.accepts(beta, 'alpha'), false, 'wrong response key must be ignored');
  assert.equal(guard.accepts(beta, 'beta'), true);
});

test('selection guard rejects old same-key work after switching away and back', async () => {
  const { createSelectionGuard } = await import('../../src/project-manager-studio/client/selection-guard.mjs');
  const guard = createSelectionGuard();
  const firstAlpha = guard.begin('alpha'); guard.begin('beta'); const secondAlpha = guard.begin('alpha');
  assert.equal(guard.accepts(firstAlpha, 'alpha'), false);
  assert.equal(guard.accepts(secondAlpha, 'alpha'), true);
});

test('selection guard orders same-project reads and blocks reads during mutation', async () => {
  const { createSelectionGuard } = await import('../../src/project-manager-studio/client/selection-guard.mjs');
  const guard = createSelectionGuard(); guard.begin('alpha');
  const olderRead = guard.read(); const newerRead = guard.read();
  assert.equal(guard.accepts(olderRead, 'alpha'), false);
  assert.equal(guard.accepts(newerRead, 'alpha'), true);
  const mutation = guard.beginMutation();
  assert.equal(guard.read(), null, 'refreshes are blocked while a mutation is pending');
  assert.equal(guard.accepts(newerRead, 'alpha'), false);
  assert.equal(guard.accepts(mutation, 'alpha'), true);
  assert.equal(guard.finishMutation(mutation), true);
  assert.ok(guard.read(), 'reads resume after mutation completion');
});

test('an old mutation cannot clear state after the operator switches projects', async () => {
  const { createSelectionGuard } = await import('../../src/project-manager-studio/client/selection-guard.mjs');
  const guard = createSelectionGuard(); guard.begin('alpha'); const alphaMutation = guard.beginMutation(); const beta = guard.begin('beta');
  assert.equal(guard.finishMutation(alphaMutation), false);
  assert.equal(guard.accepts(alphaMutation, 'alpha'), false);
  assert.equal(guard.accepts(beta, 'beta'), true);
});
