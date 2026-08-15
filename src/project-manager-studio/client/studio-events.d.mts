/* Type declarations for the Project Manager Studio selected-project SSE driver. */
export function startStudioEvents(options: {
  projectKey: string;
  onReconcile: () => void;
  EventSourceCtor?: new (url: string) => Pick<EventSource, 'addEventListener' | 'removeEventListener' | 'close'>;
}): () => void;
