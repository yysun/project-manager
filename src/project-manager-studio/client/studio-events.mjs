/* Project Manager Studio SSE driver: selected-key stream ownership,
   open/reopen reconciliation, event validation, and idempotent cleanup.
   Liveness is stated by the server, never inferred from a data event:
   replaceRoot notifies before the reattach outcome is known, so a change can
   arrive from a failed reattach. Only project-live, project-stale, or a
   reconnect changes it. */
export function startStudioEvents({ projectKey, onReconcile, onStreamState = () => {}, EventSourceCtor = EventSource }) {
  const source = new EventSourceCtor(`/api/events?project=${encodeURIComponent(projectKey)}`);
  let stopped = false;
  // A reconnect creates a fresh watcher, which re-degrades on its own if the
  // binding is still broken, so treating open as live is safe.
  const reconcile = () => { if (stopped) return; onStreamState(true); onReconcile(); };
  const onLive = (event) => {
    if (stopped) return;
    try {
      const data = JSON.parse(event.data);
      if (data?.projectKey === projectKey) onStreamState(true);
    } catch { /* malformed events cannot change liveness */ }
  };
  const onStale = (event) => {
    if (stopped) return;
    try {
      const data = JSON.parse(event.data);
      if (data?.projectKey === projectKey) onStreamState(false);
    } catch { /* malformed events cannot change liveness */ }
  };
  const onChange = (event) => {
    if (stopped) return;
    try {
      const data = JSON.parse(event.data);
      // Deliberately does not assert liveness: replaceRoot notifies before the
      // reattach outcome is known, so a change can arrive from a failed one.
      if (data?.projectKey === projectKey) onReconcile();
    } catch { /* malformed events cannot select or refresh a project */ }
  };
  source.addEventListener('open', reconcile);
  source.addEventListener('project-change', onChange);
  source.addEventListener('project-stale', onStale);
  source.addEventListener('project-live', onLive);
  return () => {
    if (stopped) return;
    stopped = true;
    source.removeEventListener('open', reconcile);
    source.removeEventListener('project-change', onChange);
    source.removeEventListener('project-stale', onStale);
    source.removeEventListener('project-live', onLive);
    source.close();
  };
}
