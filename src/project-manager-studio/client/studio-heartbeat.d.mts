/* Type declarations for the Project Manager Studio browser heartbeat driver. */
export const HEARTBEAT_INTERVAL_MS: number;
export const HEARTBEAT_HEADER: string;
export const HEARTBEAT_HEADER_VALUE: string;

export function startStudioHeartbeat(options?: {
  request?: () => unknown;
  setIntervalFn?: (callback: () => void, interval: number) => unknown;
  clearIntervalFn?: (timer: unknown) => void;
  documentRef?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}): () => void;
