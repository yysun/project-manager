/* Project Manager Studio SSE driver: selected-key stream ownership,
   open/reopen reconciliation, event validation, and idempotent cleanup. */
export function startStudioEvents({ projectKey, onReconcile, EventSourceCtor = EventSource }) {
  const source = new EventSourceCtor(`/api/events?project=${encodeURIComponent(projectKey)}`);
  let stopped = false;
  const reconcile = () => { if (!stopped) onReconcile(); };
  const onChange = (event) => {
    if (stopped) return;
    try {
      const data = JSON.parse(event.data);
      if (data?.projectKey === projectKey) onReconcile();
    } catch { /* malformed events cannot select or refresh a project */ }
  };
  source.addEventListener('open', reconcile);
  source.addEventListener('project-change', onChange);
  return () => {
    if (stopped) return;
    stopped = true;
    source.removeEventListener('open', reconcile);
    source.removeEventListener('project-change', onChange);
    source.close();
  };
}
