/* Project Manager Studio process lifecycle: a browser-renewed idle lease,
   sleep-aware watchdog, monotonic wall clock, and one-shot graceful shutdown. */
export const WATCHDOG_INTERVAL_MS = 60_000;
export const STUDIO_IDLE_TIMEOUT_MS = 60 * 60_000;
export const WATCHDOG_DELAY_THRESHOLD_MS = 2 * 60_000;
export const WAKE_GRACE_MS = 2 * 60_000;

export function createNondecreasingWallClock(read = Date.now) {
  let latest = read();
  return () => {
    latest = Math.max(latest, read());
    return latest;
  };
}

export function createHeartbeatLease({ now = createNondecreasingWallClock() } = {}) {
  const startedAt = now();
  let lastHeartbeatAt = startedAt;
  let nextWatchdogDueAt = startedAt + WATCHDOG_INTERVAL_MS;
  let wakeGraceUntil = null;

  function state(status, current) {
    return { status, now: current, lastHeartbeatAt, nextWatchdogDueAt, wakeGraceUntil };
  }

  return {
    heartbeat() {
      lastHeartbeatAt = now();
      wakeGraceUntil = null;
      return state('active', lastHeartbeatAt);
    },
    check() {
      const current = now();
      const scheduledDueAt = nextWatchdogDueAt;
      nextWatchdogDueAt = current + WATCHDOG_INTERVAL_MS;

      if (wakeGraceUntil !== null) {
        if (current < wakeGraceUntil) return state('wake-grace', current);
        wakeGraceUntil = null;
        return state(current - lastHeartbeatAt >= STUDIO_IDLE_TIMEOUT_MS ? 'expired' : 'active', current);
      }

      if (current - scheduledDueAt > WATCHDOG_DELAY_THRESHOLD_MS) {
        wakeGraceUntil = current + WAKE_GRACE_MS;
        return state('wake-grace', current);
      }

      return state(current - lastHeartbeatAt >= STUDIO_IDLE_TIMEOUT_MS ? 'expired' : 'active', current);
    },
  };
}

export function createShutdownController({ close, exit }) {
  let shutdown = null;
  return () => shutdown ?? (shutdown = Promise.resolve().then(close).then(() => exit(0)));
}

export function createStudioWatchdog({
  lease,
  onExpired,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let stopped = false;
  let timer;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(timer);
  };
  const evaluate = () => {
    if (stopped) return null;
    const result = lease.check();
    if (result.status === 'expired') {
      stop();
      void onExpired();
    }
    return result;
  };
  timer = setIntervalFn(evaluate, WATCHDOG_INTERVAL_MS);
  timer?.unref?.();
  return { evaluate, stop };
}
