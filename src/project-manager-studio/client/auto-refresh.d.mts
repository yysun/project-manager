/* Type declarations for edit-safe Project Manager Studio auto refresh. */
export interface AutoRefreshCommit { canCommit: () => boolean }
export interface AutoRefreshCoordinator {
  notify(): void;
  setBlocked(blocked: boolean): void;
  stop(): void;
}
export function createAutoRefreshCoordinator(options: {
  refresh: (commit: AutoRefreshCommit) => unknown;
}): AutoRefreshCoordinator;
