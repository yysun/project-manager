// Shared Project Manager Studio API contract. The server owns validated
// project, lifecycle, schedule, and edit-authority facts; the client owns only
// transient view, filtering, dialog, and schedule-draft state.
export type TaskStatus = 'planned' | 'ready' | 'in_progress' | 'implemented' | 'verification' | 'verified' | 'done';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface KanbanTask {
  id: string; title: string; outcome: string; acceptance: string[]; status: TaskStatus;
  priority: Priority; milestone: string | null; owner: string | null;
  executor: { provider: string; root: string | null; scope: string | null };
  depends_on: string[]; blocks: string[]; blocked_by: string[]; dependency_blockers: string[];
  sources: string[]; success_criteria: string[]; constraints: string[]; critical: boolean;
  active_contract: string | null; last_manifest: string | null; created: string | null;
  scheduled_start: string | null; scheduled_end: string | null;
  schedule_conflicts: Array<{ dependency_id: string; dependency_end: string; task_start: string }>;
  updated: string | null; task_revision: string; next_rank: number | null;
  editable: boolean; edit_reason: string | null;
  schedule_editable: boolean; schedule_edit_reason: string | null;
}

export interface KanbanLane { id: string; title: string; statuses: TaskStatus[]; tasks: KanbanTask[] }
export interface KanbanData {
  schema_version: 1; mutation_revision: string; semantic_revision: string;
  project: { id: string; name: string; root: string; status: string; owner: string | null; objective: string; start_date: string | null; target_date: string | null; current_milestone: string | null; profile: string };
  summary: { tasks: { total: number; by_status: Record<TaskStatus, number>; actionable: number; blocked: number }; success: { total: number; covered: number; verified: number }; coverage: { configured: boolean; total?: number; covered?: number; verified?: number }; risks: { configured: boolean; open?: number; high?: number }; decisions: { configured: boolean; proposed?: number }; owner_gaps: number };
  warnings: Array<{ code: string; message: string }>;
  milestones: Array<{ id: string; title: string; status: 'planned' | 'active' | 'complete'; target_date: string | null; forecast_date: string | null; forecast_updated: string | null; critical: boolean }>;
  options: { owners: string[]; priorities: Priority[]; milestones: Array<{ id: string; title: string }>; success_criteria: Array<{ id: string; text: string }>; tasks: Array<{ id: string; title: string }> };
  next: Array<{ id: string; title: string; reasons: string[] }>;
  tasks: KanbanTask[];
  lanes: KanbanLane[];
}

export interface TaskEdit {
  title?: string; outcome?: string; acceptance?: string[]; status?: 'planned' | 'ready';
  priority?: Priority; milestone?: string | null; owner?: string | null; depends_on?: string[];
  blocked_by?: string[]; success_criteria?: string[]; constraints?: string[]; critical?: boolean;
  scheduled_start?: string | null; scheduled_end?: string | null;
}
export interface TaskEditRequest { mutationRevision: string; taskRevision: string; edit: TaskEdit }
export interface ApiError { code: string; message: string; fields?: string[]; currentRevision?: string; currentTaskRevision?: string }
