/* Studio project transport boundary: parse one selected-project response and
   discard delayed success or error results whose automatic commit expired. */
export async function fetchProjectSnapshot({ projectKey, canCommit = () => true, fetchFn = fetch }) {
  try {
    const response = await fetchFn(`/api/project?project=${encodeURIComponent(projectKey)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.errors?.[0]?.message ?? 'Could not load project.');
    if (!canCommit()) return { status: 'discarded' };
    return { status: 'ok', data: body.data };
  } catch (value) {
    if (!canCommit()) return { status: 'discarded' };
    return { status: 'error', error: value instanceof Error ? value : new Error('Could not load project.') };
  }
}
