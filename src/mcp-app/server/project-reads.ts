// MCP App read boundary: revision-safe project projection, a compact
// model-facing summary that keeps full task collections out of model context,
// and catalog-resolved selection so no caller-supplied path reaches the disk.
// Deliberately imports read functions only; no mutation entry point appears here.
import type { KanbanData, ProjectCatalogData } from '../../project-manager-studio/shared/api.js';
import type { ProjectCatalog } from '../../project-manager-studio/server/project-catalog.js';

// loadRevisionedProject retries until the project's mutation revision is stable
// across the read. The agent writes project Markdown while this app reads it, so
// that torn-snapshot guard is the reason this path is used instead of a plain load.
const { loadRevisionedProject } = require('../../../skills/project-manager/scripts/lib/task-editor.js');

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
 * Resolve a project key from an optional caller-supplied project id. Model-facing
 * tools take a human-meaningful id; only the app handles opaque keys.
 */
export function resolveProjectKey(catalog: ProjectCatalog, projectId?: string): string {
  const data = catalog.data();
  if (projectId === undefined || projectId === '') return data.initial_project_key;
  const wanted = projectId.toLowerCase();
  const match = data.projects.find((project) => project.id.toLowerCase() === wanted || project.name.toLowerCase() === wanted);
  if (!match) throw new Error(`Unknown project: ${projectId}. Available: ${data.projects.map((project) => project.id).join(', ')}`);
  return match.key;
}

/** Compact facts for the model. Deliberately omits the task and lane collections. */
export function projectSummary(catalog: ProjectCatalog, projectKey: string): ProjectSummary {
  const data = getProject(catalog, projectKey);
  return {
    projectKey,
    id: data.project.id,
    name: data.project.name,
    status: data.project.status,
    objective: data.project.objective,
    targetDate: data.project.target_date,
    currentMilestone: data.project.current_milestone,
    tasks: { total: data.summary.tasks.total, actionable: data.summary.tasks.actionable, blocked: data.summary.tasks.blocked },
    success: { verified: data.summary.success.verified, total: data.summary.success.total },
    ownerGaps: data.summary.owner_gaps,
    next: data.next.slice(0, MAX_SUMMARY_NEXT).map((task) => ({ id: task.id, title: task.title })),
    warnings: data.warnings.length,
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
