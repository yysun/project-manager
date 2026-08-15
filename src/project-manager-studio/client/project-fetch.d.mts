/* Type declarations for commit-gated Project Manager Studio project reads. */
export type ProjectFetchResult<T> = { status: 'ok'; data: T } | { status: 'error'; error: Error } | { status: 'discarded' };
export function fetchProjectSnapshot<T>(options: {
  projectKey: string;
  canCommit?: () => boolean;
  fetchFn?: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
}): Promise<ProjectFetchResult<T>>;
