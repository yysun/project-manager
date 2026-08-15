// MCP App project discovery: builds the server-owned project catalog from an
// explicit project, an explicit projects root, or the environment, reusing the
// Studio catalog so opaque keys and per-read identity validation are shared
// rather than reimplemented. Read paths only; no mutation entry point is imported.
//
// Configuration is optional. An explicitly requested root that cannot be used is
// fatal, because the caller asked for something specific; an absent implicit
// default is not, because nobody did — the agent then selects a folder per call,
// the way it already does for every CLI script.
import fs from 'node:fs';
import path from 'node:path';
import { ProjectCatalog, ProjectCatalogError, type ProjectSeed } from '../project-manager-studio/server/project-catalog.js';

const { loadProjectIdentity, loadProjectCatalogRoot } = require('../../skills/project-manager/scripts/lib/project-state.js');

export const PROJECTS_ROOT_ENV = 'PROJECT_MANAGER_PROJECTS_ROOT';
export const DEFAULT_PROJECTS_ROOT = '.projects';

export interface ProjectSelection {
  project?: string;
  projectsRoot?: string;
}

/** Resolve the projects root a caller asked for, falling back to the environment then the default. */
export function resolveProjectsRoot(selection: ProjectSelection, env: NodeJS.ProcessEnv = process.env): string {
  const requested = selection.projectsRoot ?? env[PROJECTS_ROOT_ENV] ?? DEFAULT_PROJECTS_ROOT;
  return path.resolve(requested);
}

/** True when the caller named a projects root, rather than falling back to the default. */
export function projectsRootRequested(selection: ProjectSelection, env: NodeJS.ProcessEnv = process.env): boolean {
  return selection.projectsRoot !== undefined || env[PROJECTS_ROOT_ENV] !== undefined;
}

export interface ProjectSources {
  catalog: ProjectCatalog;
  /** Set only when a projects root was configured; then it confines selection. */
  confinement: string | null;
}

/**
 * Build the catalog for a single explicit project, for every project under a
 * projects root, or for nothing at all when neither was configured. Mirrors
 * Studio's discovery so both surfaces accept the same arguments and enforce the
 * same containment rule for an explicit selection.
 */
export function buildCatalog(selection: ProjectSelection, env: NodeJS.ProcessEnv = process.env): ProjectSources {
  const requested = projectsRootRequested(selection, env);
  if (selection.project && !requested) {
    const identity = loadProjectIdentity(path.resolve(selection.project));
    const seed: ProjectSeed = { id: identity.project.id, name: identity.project.name, root: identity.root };
    return { catalog: new ProjectCatalog([seed], seed.root), confinement: null };
  }

  const requestedRoot = resolveProjectsRoot(selection, env);
  let discovered: { root: string; projects: ProjectSeed[] };
  try {
    discovered = loadProjectCatalogRoot(requestedRoot) as { root: string; projects: ProjectSeed[] };
  } catch (error) {
    // Only fatal when the caller named this root. An absent implicit default
    // means the agent will pass a folder per call, which is not a failure.
    if (!requested) return { catalog: new ProjectCatalog([], '', { allowEmpty: true }), confinement: null };
    throw new ProjectCatalogError(
      'PROJECTS_ROOT_UNAVAILABLE',
      `No Project Manager projects were found at ${requestedRoot}. Pass --projects-root, or set ${PROJECTS_ROOT_ENV}. (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  let initialRoot = discovered.projects[0].root;
  if (selection.project) {
    const requestedProject = path.resolve(selection.project);
    let stat;
    try { stat = fs.lstatSync(requestedProject); } catch { throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Explicit project must be an existing direct child of the projects root'); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Explicit project must be a real direct child of the projects root');
    const real = fs.realpathSync(requestedProject);
    const selected = discovered.projects.find((candidate) => candidate.root === real);
    if (!selected || path.dirname(real) !== discovered.root) throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Explicit project must be a direct child of the projects root');
    initialRoot = selected.root;
  }
  return { catalog: new ProjectCatalog(discovered.projects, initialRoot), confinement: discovered.root };
}
