/* Studio project-fetch regressions: normal data/errors and delayed success or
   failure discard before React can apply an expired automatic response. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const fetchPath = '../../src/project-manager-studio/client/project-fetch.mjs';
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function response(ok, body) { return { ok, json: async () => body }; }

test('project fetch returns selected data and encoded URL while commit remains valid', async () => {
  const { fetchProjectSnapshot } = await import(fetchPath); let url;
  const result = await fetchProjectSnapshot({ projectKey: 'alpha/key', fetchFn: async (value) => { url = value; return response(true, { data: { project: { key: 'alpha/key' } } }); } });
  assert.equal(url, '/api/project?project=alpha%2Fkey'); assert.deepEqual(result, { status: 'ok', data: { project: { key: 'alpha/key' } } });
});

test('delayed automatic success is discarded when its commit expires in flight', async () => {
  const { fetchProjectSnapshot } = await import(fetchPath); const pending = deferred(); let allowed = true;
  const result = fetchProjectSnapshot({ projectKey: 'alpha', canCommit: () => allowed, fetchFn: () => pending.promise });
  allowed = false; pending.resolve(response(true, { data: { project: { key: 'alpha' } } })); assert.deepEqual(await result, { status: 'discarded' });
});

test('delayed automatic API error is discarded when its commit expires in flight', async () => {
  const { fetchProjectSnapshot } = await import(fetchPath); const pending = deferred(); let allowed = true;
  const result = fetchProjectSnapshot({ projectKey: 'alpha', canCommit: () => allowed, fetchFn: () => pending.promise });
  allowed = false; pending.resolve(response(false, { errors: [{ message: 'stale project' }] })); assert.deepEqual(await result, { status: 'discarded' });
});

test('current API and network failures return errors for the existing App error path', async () => {
  const { fetchProjectSnapshot } = await import(fetchPath);
  let result = await fetchProjectSnapshot({ projectKey: 'alpha', fetchFn: async () => response(false, { errors: [{ message: 'bad project' }] }) }); assert.equal(result.status, 'error'); assert.equal(result.error.message, 'bad project');
  result = await fetchProjectSnapshot({ projectKey: 'alpha', fetchFn: async () => { throw new Error('offline'); } }); assert.equal(result.status, 'error'); assert.equal(result.error.message, 'offline');
});
