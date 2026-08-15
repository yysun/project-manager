/* Studio SSE client regressions: URL ownership, open/reopen reconciliation,
   project-key event validation, malformed-event isolation, and cleanup. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const eventsPath = '../../src/project-manager-studio/client/studio-events.mjs';

class FakeEventSource {
  static instances = [];
  constructor(url) { this.url = url; this.listeners = new Map(); this.closes = 0; FakeEventSource.instances.push(this); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name, listener) { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
  close() { this.closes += 1; }
  emit(name, data = '') { this.listeners.get(name)?.({ data }); }
}

test('driver owns encoded selected-project URL and reconciles on every open and matching change', async () => {
  const { startStudioEvents } = await import(eventsPath); let reconciliations = 0;
  const stop = startStudioEvents({ projectKey: 'alpha/key', onReconcile: () => { reconciliations += 1; }, EventSourceCtor: FakeEventSource });
  const source = FakeEventSource.instances.at(-1); assert.equal(source.url, '/api/events?project=alpha%2Fkey');
  source.emit('open'); source.emit('open');
  source.emit('project-change', JSON.stringify({ projectKey: 'beta' }));
  source.emit('project-change', '{bad');
  source.emit('message', JSON.stringify({ projectKey: 'alpha/key' }));
  source.emit('project-change', JSON.stringify({ projectKey: 'alpha/key' }));
  assert.equal(reconciliations, 3, 'initial open, reopen, and one matching named event reconcile');
  stop(); stop(); assert.equal(source.closes, 1); assert.equal(source.listeners.size, 0);
  source.emit('open'); assert.equal(reconciliations, 3);
});
