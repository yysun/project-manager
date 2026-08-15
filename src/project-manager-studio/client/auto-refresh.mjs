/* Edit-safe Studio auto-refresh coordination: event coalescing, automatic
   response commit generations, blocker deferral, and selection cleanup. */
export function createAutoRefreshCoordinator({ refresh }) {
  let stopped = false;
  let blocked = false;
  let pending = false;
  let generation = 0;
  let inFlight = 0;

  function run() {
    if (stopped || blocked) { pending = true; return; }
    const token = ++generation;
    inFlight += 1;
    const canCommit = () => !stopped && !blocked && token === generation;
    let result;
    try { result = refresh({ canCommit }); }
    catch { result = undefined; }
    void Promise.resolve(result).catch(() => {}).finally(() => { inFlight -= 1; });
  }

  return {
    notify() {
      if (stopped) return;
      if (blocked) { pending = true; return; }
      run();
    },
    setBlocked(next) {
      if (stopped || next === blocked) return;
      blocked = next;
      if (blocked) {
        if (inFlight > 0) { generation += 1; pending = true; }
      } else if (pending) {
        pending = false; run();
      }
    },
    stop() {
      if (stopped) return;
      stopped = true; generation += 1; pending = false;
    },
  };
}
