/* Browser heartbeat driver regressions: immediate and timed renewal,
   visibility recovery, silent failures, request shape, and cleanup. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const heartbeatPath = '../../src/project-manager-studio/client/studio-heartbeat.mjs';

function fakeDocument() {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    dispatch: (name) => listeners.get(name)?.(),
    listeners,
  };
}

test('driver renews immediately, every minute, and on visibility restoration, then cleans up', async () => {
  const { startStudioHeartbeat, HEARTBEAT_INTERVAL_MS } = await import(heartbeatPath);
  const documentRef = fakeDocument(); let intervalCallback; let interval; let cleared = 0; let requests = 0;
  const stop = startStudioHeartbeat({
    request: () => { requests += 1; }, documentRef,
    setIntervalFn: (callback, delay) => { intervalCallback = callback; interval = delay; return 'timer'; },
    clearIntervalFn: (timer) => { assert.equal(timer, 'timer'); cleared += 1; },
  });
  assert.equal(requests, 1); assert.equal(interval, HEARTBEAT_INTERVAL_MS);
  intervalCallback(); assert.equal(requests, 2);
  documentRef.visibilityState = 'hidden'; documentRef.dispatch('visibilitychange'); assert.equal(requests, 2);
  documentRef.visibilityState = 'visible'; documentRef.dispatch('visibilitychange'); assert.equal(requests, 3);
  stop(); stop(); assert.equal(cleared, 1); assert.equal(documentRef.listeners.size, 0);
  intervalCallback(); assert.equal(requests, 3);
});

test('driver silently contains synchronous and asynchronous request failures', async () => {
  const { startStudioHeartbeat } = await import(heartbeatPath);
  const documentRef = fakeDocument(); let intervalCallback; let calls = 0;
  const stop = startStudioHeartbeat({
    request: () => { calls += 1; if (calls === 1) throw new Error('offline'); return Promise.reject(new Error('still offline')); },
    documentRef,
    setIntervalFn: (callback) => { intervalCallback = callback; return 1; }, clearIntervalFn: () => {},
  });
  intervalCallback(); await new Promise((resolve) => setImmediate(resolve)); assert.equal(calls, 2); stop();
});

test('default request is a header-bearing same-origin POST', async () => {
  const { startStudioHeartbeat, HEARTBEAT_HEADER, HEARTBEAT_HEADER_VALUE } = await import(heartbeatPath);
  const documentRef = fakeDocument(); const originalFetch = global.fetch; let request;
  global.fetch = (...args) => { request = args; return Promise.resolve({ ok: true }); };
  try {
    const stop = startStudioHeartbeat({ documentRef, setIntervalFn: () => 1, clearIntervalFn: () => {} });
    assert.equal(request[0], '/api/heartbeat'); assert.equal(request[1].method, 'POST'); assert.equal(request[1].headers[HEARTBEAT_HEADER], HEARTBEAT_HEADER_VALUE); stop();
  } finally { global.fetch = originalFetch; }
});
