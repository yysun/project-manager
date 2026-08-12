/* Type declarations for Project Manager Studio's browser-renewed process
   lifecycle, sleep-aware watchdog, and graceful shutdown drivers. */
export const WATCHDOG_INTERVAL_MS: number;
export const STUDIO_IDLE_TIMEOUT_MS: number;
export const WATCHDOG_DELAY_THRESHOLD_MS: number;
export const WAKE_GRACE_MS: number;

export type LeaseState = {
  status: 'active' | 'wake-grace' | 'expired';
  now: number;
  lastHeartbeatAt: number;
  nextWatchdogDueAt: number;
  wakeGraceUntil: number | null;
};

export function createNondecreasingWallClock(read?: () => number): () => number;
export function createHeartbeatLease(options?: { now?: () => number }): {
  heartbeat(): LeaseState;
  check(): LeaseState;
};
export function createShutdownController(options: { close: () => void | Promise<void>; exit: (code: number) => unknown }): () => Promise<unknown>;
export function createStudioWatchdog(options: {
  lease: { check(): LeaseState };
  onExpired: () => unknown;
  setIntervalFn?: (callback: () => void, interval: number) => unknown;
  clearIntervalFn?: (timer: unknown) => void;
}): { evaluate(): LeaseState | null; stop(): void };
