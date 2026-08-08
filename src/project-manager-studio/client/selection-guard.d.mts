/* Type declarations for the runtime-tested tab-local Studio selection guard. */
export interface SelectionRequest { generation: number; operation: number; key: string | null }
export interface SelectionGuard {
  begin(key: string): SelectionRequest;
  read(): SelectionRequest | null;
  beginMutation(): SelectionRequest | null;
  finishMutation(request: SelectionRequest): boolean;
  snapshot(): SelectionRequest;
  isCurrent(request: SelectionRequest): boolean;
  accepts(request: SelectionRequest, responseKey: string): boolean;
}
export function createSelectionGuard(): SelectionGuard;
