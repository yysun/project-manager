/* Tab-local Studio selection guard. Selection generations, operation sequences,
   and mutation barriers reject late same-project reads and cross-project data. */
export function createSelectionGuard() {
  let generation = 0;
  let operation = 0;
  let key = null;
  let mutation = null;
  return {
    begin(nextKey) { generation += 1; operation += 1; key = nextKey; mutation = null; return { generation, operation, key }; },
    read() { if (key === null || mutation !== null) return null; operation += 1; return { generation, operation, key }; },
    beginMutation() { if (key === null || mutation !== null) return null; operation += 1; mutation = operation; return { generation, operation, key }; },
    finishMutation(request) { const current = request.generation === generation && request.operation === mutation; if (current) mutation = null; return current; },
    snapshot() { return { generation, operation, key }; },
    isCurrent(request) { return request.generation === generation && request.operation === operation && request.key === key; },
    accepts(request, responseKey) { return request.generation === generation && request.operation === operation && request.key === key && responseKey === key; },
  };
}
