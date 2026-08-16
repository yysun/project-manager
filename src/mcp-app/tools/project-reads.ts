// MCP App read boundary: revision-safe project projection, a compact
// model-facing summary that keeps full task collections out of model context,
// and catalog-resolved selection so no caller-supplied path reaches the disk.
// Deliberately imports read functions only; no mutation entry point appears here.
// Selection no longer carries its own containment check: the catalog enforces it,
// so this boundary cannot judge a path the catalog would judge differently.
import path from 'node:path';
import type { KanbanData, ProjectCatalogData } from '../../project-manager-studio/shared/api.js';
import { ProjectCatalogError, type ProjectCatalog } from '../../project-manager-studio/server/project-catalog.js';

/** Selection failures the caller can correct, carrying a code like the catalog's. */
export class ProjectSelectionError extends Error {
  code = 'PROJECT_SELECTION_UNKNOWN';
  constructor(message: string) { super(message); this.name = 'ProjectSelectionError'; }
}

// loadRevisionedProject retries until the project's mutation revision is stable
// across the read. The agent writes project Markdown while this app reads it, so
// that torn-snapshot guard is the reason this path is used instead of a plain load.
const { loadRevisionedProject, loadRevisionedSummary } = require('../../../skills/project-manager/scripts/lib/task-editor.js');

const PROJECT_OPTIONS = { taskErrorsAsWarnings: true };
const MAX_SUMMARY_NEXT = 3;

export interface ProjectSummary {
  projectKey: string;
  id: string;
  name: string;
  status: string;
  objective: string;
  targetDate: string | null;
  currentMilestone: string | null;
  tasks: { total: number; actionable: number; blocked: number };
  success: { verified: number; total: number };
  ownerGaps: number;
  next: Array<{ id: string; title: string }>;
  warnings: number;
}

/** Every project the server was started with, as opaque keys the app can pass back. */
export function listProjects(catalog: ProjectCatalog): ProjectCatalogData {
  return catalog.data();
}

/** Full validated projection for one catalog-issued project key. */
export function getProject(catalog: ProjectCatalog, projectKey: unknown): KanbanData {
  const entry = catalog.resolve(projectKey);
  return catalog.decorate(entry.key, loadRevisionedProject(entry.root, 3, PROJECT_OPTIONS).data);
}

/**
 * Resolve a project key from an optional caller-supplied selector. Model-facing
 * tools accept a configured ID or name, or a project folder path — the same way
 * the skill drives every CLI script. Only the view handles opaque keys.
 *
 * ID or name is tried first: IDs are short tokens and are the intended selector
 * when a projects root is configured. Anything unmatched is treated as a folder.
 */
export function resolveProjectKey(catalog: ProjectCatalog, selector?: string): string {
  const data = catalog.listing();
  if (selector === undefined || selector === '') {
    if (data.initial_project_key === '') {
      throw new ProjectSelectionError('No project is configured. Pass the project folder to select one.');
    }
    return data.initial_project_key;
  }

  const wanted = selector.toLowerCase();
  const matches = data.projects.filter((project) => project.id.toLowerCase() === wanted || project.name.toLowerCase() === wanted);
  // "Ambiguity is not selection" — refuse rather than silently picking the first.
  if (matches.length > 1) throw new ProjectSelectionError(`Project selector matches more than one project: ${selector}`);
  if (matches.length === 1) return matches[0].key;

  try {
    // Containment is enforced inside register, on the resolved real path, so it
    // cannot be forgotten by a call site or judged on an unresolved path.
    return catalog.register(path.resolve(selector)).key;
  } catch (error) {
    // A containment refusal names a real project the caller may not reach, and a
    // catalog with no containment decision is a configuration fault. Neither is a
    // mistyped ID, so both propagate with their own code instead of being
    // rewrapped with the "Available:" hint.
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code === 'PROJECT_OUTSIDE_ROOT' || code === 'PROJECT_SELECTION_UNCONFINED') throw error;
    // A selector that matched no configured project and is not a folder is most
    // often a mistyped ID, so name both possibilities rather than only the path.
    const available = data.projects.map((project) => project.id);
    const detail = error instanceof Error ? error.message : String(error);
    throw new ProjectSelectionError(available.length
      ? `${detail}. It also matches no configured project. Available: ${available.join(', ')}`
      : detail);
  }
}

/** Compact facts for the model. Deliberately omits the task and lane collections. */
export function projectSummary(catalog: ProjectCatalog, projectKey: string): ProjectSummary {
  const entry = catalog.resolve(projectKey);
  // Deliberately not getProject: the summary needs a dozen scalars, and building
  // the lane and per-task board projection only to discard it is the cost this
  // path exists to avoid. The revision guard is unchanged.
  const { state, summary } = loadRevisionedSummary(entry.root, 3, PROJECT_OPTIONS);
  // catalog.decorate performed this identity check on the board projection;
  // without one, the read boundary asserts it directly.
  if (state.project.id !== entry.id || state.root !== entry.root) {
    throw new ProjectCatalogError('PROJECT_SELECTION_STALE', `Project identity changed for ${entry.name}`);
  }
  return {
    projectKey,
    id: state.project.id,
    name: state.project.name,
    status: state.project.status,
    objective: state.project.objective,
    targetDate: state.project.target_date,
    currentMilestone: state.project.current_milestone,
    tasks: summary.tasks,
    success: summary.success,
    ownerGaps: summary.owner_gaps,
    next: summary.next.slice(0, MAX_SUMMARY_NEXT),
    warnings: summary.warnings,
  };
}

/** Render a summary as the short text a host without MCP Apps support will display. */
export function summaryText(summary: ProjectSummary): string {
  const lines = [
    `${summary.name} (${summary.id}) — ${summary.status}`,
    `${summary.tasks.total} tasks · ${summary.tasks.actionable} actionable · ${summary.tasks.blocked} blocked`,
    `Success criteria verified: ${summary.success.verified}/${summary.success.total}`,
    `Target ${summary.targetDate ?? 'unknown'} · milestone ${summary.currentMilestone ?? 'none active'}`,
  ];
  if (summary.ownerGaps > 0) lines.push(`${summary.ownerGaps} task(s) need an owner`);
  if (summary.next.length) lines.push(`Next: ${summary.next.map((task) => `${task.id} ${task.title}`).join('; ')}`);
  if (summary.warnings > 0) lines.push(`${summary.warnings} project warning(s)`);
  return lines.join('\n');
}
