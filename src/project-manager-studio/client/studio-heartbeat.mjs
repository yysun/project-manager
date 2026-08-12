/* Project Manager Studio browser lease renewal: immediate, interval, and
   visibility heartbeats with silent transient-failure handling and cleanup. */
export const HEARTBEAT_INTERVAL_MS = 60_000;
export const HEARTBEAT_HEADER = 'X-Project-Manager-Studio';
export const HEARTBEAT_HEADER_VALUE = 'heartbeat';

function defaultRequest() {
  return fetch('/api/heartbeat', {
    method: 'POST',
    headers: { [HEARTBEAT_HEADER]: HEARTBEAT_HEADER_VALUE },
  });
}

export function startStudioHeartbeat({
  request = defaultRequest,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  documentRef = document,
} = {}) {
  let stopped = false;
  const renew = () => {
    if (stopped) return;
    try { void Promise.resolve(request()).catch(() => {}); } catch { /* transient request failure */ }
  };
  const onVisibilityChange = () => { if (documentRef.visibilityState === 'visible') renew(); };

  renew();
  const timer = setIntervalFn(renew, HEARTBEAT_INTERVAL_MS);
  documentRef.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(timer);
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
