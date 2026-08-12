/* Studio lifecycle regressions: exact lease boundaries, sleep grace, clock
   clamping, watchdog scheduling, and idempotent graceful shutdown. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const lifecyclePath = '../../src/project-manager-studio/server/studio-lifecycle.mjs';

test('lease expires inclusively at one hour and heartbeat renews the shared lease', async () => {
  const { createHeartbeatLease, WATCHDOG_INTERVAL_MS, STUDIO_IDLE_TIMEOUT_MS } = await import(lifecyclePath);
  let current = 0; const lease = createHeartbeatLease({ now: () => current });
  for (current = WATCHDOG_INTERVAL_MS; current < STUDIO_IDLE_TIMEOUT_MS; current += WATCHDOG_INTERVAL_MS) assert.equal(lease.check().status, 'active');
  current = STUDIO_IDLE_TIMEOUT_MS - 1; assert.equal(lease.check().status, 'active');
  current = STUDIO_IDLE_TIMEOUT_MS; assert.equal(lease.check().status, 'expired');
  lease.heartbeat();
  current += STUDIO_IDLE_TIMEOUT_MS - 1; assert.equal(lease.check().status, 'wake-grace', 'a deliberately skipped watchdog receives wake grace');
  lease.heartbeat();
  current += WATCHDOG_INTERVAL_MS; assert.equal(lease.check().status, 'active');
});

test('sleep delay is strict, grace cannot extend itself, and grace end evaluates the lease', async () => {
  const { createHeartbeatLease, WATCHDOG_INTERVAL_MS, WATCHDOG_DELAY_THRESHOLD_MS, WAKE_GRACE_MS, STUDIO_IDLE_TIMEOUT_MS } = await import(lifecyclePath);
  let current = 0; let lease = createHeartbeatLease({ now: () => current });
  current = WATCHDOG_INTERVAL_MS + WATCHDOG_DELAY_THRESHOLD_MS;
  assert.equal(lease.check().status, 'active', 'exactly two minutes late is not more than two minutes late');

  current = 0; lease = createHeartbeatLease({ now: () => current });
  current = WATCHDOG_INTERVAL_MS + WATCHDOG_DELAY_THRESHOLD_MS + 1;
  const grace = lease.check(); assert.equal(grace.status, 'wake-grace'); assert.equal(grace.wakeGraceUntil, current + WAKE_GRACE_MS);
  const deadline = grace.wakeGraceUntil;
  current = deadline - 1; assert.equal(lease.check().status, 'wake-grace');
  current = deadline; const active = lease.check(); assert.equal(active.status, 'active'); assert.equal(active.wakeGraceUntil, null); assert.equal(active.nextWatchdogDueAt, deadline + WATCHDOG_INTERVAL_MS);

  current = 0; lease = createHeartbeatLease({ now: () => current });
  current = STUDIO_IDLE_TIMEOUT_MS; const expiredGrace = lease.check(); assert.equal(expiredGrace.status, 'wake-grace');
  current = expiredGrace.wakeGraceUntil; assert.equal(lease.check().status, 'expired');
});

test('heartbeat during wake grace clears grace and restores normal cadence', async () => {
  const { createHeartbeatLease, WATCHDOG_INTERVAL_MS, STUDIO_IDLE_TIMEOUT_MS } = await import(lifecyclePath);
  let current = 0; const lease = createHeartbeatLease({ now: () => current });
  current = STUDIO_IDLE_TIMEOUT_MS; assert.equal(lease.check().status, 'wake-grace');
  current += 1; const renewed = lease.heartbeat(); assert.equal(renewed.status, 'active'); assert.equal(renewed.wakeGraceUntil, null);
  current += WATCHDOG_INTERVAL_MS - 1; const active = lease.check(); assert.equal(active.status, 'active'); assert.equal(active.nextWatchdogDueAt, current + WATCHDOG_INTERVAL_MS);
  current += WATCHDOG_INTERVAL_MS; assert.equal(lease.check().status, 'active', 'rebased cadence does not regrant wake grace');
});

test('production clock clamps backward movement and a forward jump grants only one grace', async () => {
  const { createNondecreasingWallClock, createHeartbeatLease, WATCHDOG_INTERVAL_MS, STUDIO_IDLE_TIMEOUT_MS, WAKE_GRACE_MS } = await import(lifecyclePath);
  let wall = 100; const clock = createNondecreasingWallClock(() => wall);
  assert.equal(clock(), 100); wall = 50; assert.equal(clock(), 100); wall = 101; assert.equal(clock(), 101);

  const lease = createHeartbeatLease({ now: clock });
  wall = 101 + STUDIO_IDLE_TIMEOUT_MS; const grace = lease.check(); assert.equal(grace.status, 'wake-grace');
  wall = grace.wakeGraceUntil - 1; assert.equal(lease.check().status, 'wake-grace');
  lease.heartbeat(); wall += WATCHDOG_INTERVAL_MS; assert.equal(lease.check().status, 'active');
  wall += WATCHDOG_INTERVAL_MS; assert.equal(lease.check().status, 'active');
  assert.ok(WAKE_GRACE_MS > WATCHDOG_INTERVAL_MS);
});

test('watchdog expiry and a competing signal-style trigger close and exit exactly once', async () => {
  const { createShutdownController, createStudioWatchdog, WATCHDOG_INTERVAL_MS } = await import(lifecyclePath);
  let scheduled; let cleared = 0; let closes = 0; let exits = 0; let releaseClose;
  const closeGate = new Promise((resolve) => { releaseClose = resolve; });
  const shutdown = createShutdownController({ close: async () => { closes += 1; await closeGate; }, exit: (code) => { assert.equal(code, 0); exits += 1; } });
  const watchdog = createStudioWatchdog({
    lease: { check: () => ({ status: 'expired' }) },
    onExpired: shutdown,
    setIntervalFn: (callback, interval) => { assert.equal(interval, WATCHDOG_INTERVAL_MS); scheduled = callback; return { unref() {} }; },
    clearIntervalFn: () => { cleared += 1; },
  });
  scheduled(); const competing = shutdown(); releaseClose(); await competing;
  assert.equal(closes, 1); assert.equal(exits, 1); assert.equal(cleared, 1); assert.equal(watchdog.evaluate(), null);
  await shutdown(); assert.equal(closes, 1); assert.equal(exits, 1);
});
