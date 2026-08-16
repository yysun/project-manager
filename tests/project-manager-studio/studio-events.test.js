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

test('a project-stale event marks the stream not live until it recovers', async () => {
  const { startStudioEvents } = await import(eventsPath);
  const states = []; let reconciliations = 0;
  const stop = startStudioEvents({
    projectKey: 'alpha', onReconcile: () => { reconciliations += 1; },
    onStreamState: (live) => states.push(live), EventSourceCtor: FakeEventSource,
  });
  const source = FakeEventSource.instances.at(-1);

  source.emit('project-stale', JSON.stringify({ projectKey: 'alpha' }));
  assert.deepEqual(states, [false], 'a stale event for this project marks it not live');
  assert.equal(reconciliations, 0, 'degradation is not a data change');

  // Another project's stale event is not ours to act on.
  source.emit('project-stale', JSON.stringify({ projectKey: 'other' }));
  source.emit('project-stale', 'not json');
  assert.deepEqual(states, [false]);

  // A project-change must NOT assert liveness: replaceRoot notifies before the
  // reattach outcome is known, so a failed reattach emits one too. Inferring
  // liveness from it cleared the banner on a permanently dead stream.
  source.emit('project-change', JSON.stringify({ projectKey: 'alpha' }));
  assert.deepEqual(states, [false], 'a data event is not proof the stream is watching');
  assert.equal(reconciliations, 1, 'but it is still a reconcile');

  // Only the server saying so brings it back.
  source.emit('project-live', JSON.stringify({ projectKey: 'alpha' }));
  assert.deepEqual(states, [false, true]);

  // A reconnect also proves liveness.
  source.emit('project-stale', JSON.stringify({ projectKey: 'alpha' }));
  source.emit('open');
  assert.deepEqual(states, [false, true, false, true], 'a reconnect also proves liveness');
  stop();
});
