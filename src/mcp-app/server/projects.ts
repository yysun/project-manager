// MCP App project discovery: builds the server-owned project catalog from an
// explicit project, an explicit projects root, or the environment, reusing the
// Studio catalog so opaque keys and per-read identity validation are shared
// rather than reimplemented. Read paths only; no mutation entry point is imported.
import fs from 'node:fs';
import path from 'node:path';
import { ProjectCatalog, ProjectCatalogError, type ProjectSeed } from '../../project-manager-studio/server/project-catalog.js';

const { loadProjectIdentity, loadProjectCatalogRoot } = require('../../../skills/project-manager/scripts/lib/project-state.js');

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

/**
 * Build the catalog for a single explicit project, or for every project under a
 * projects root. Mirrors Studio's discovery so both surfaces accept the same
 * arguments and enforce the same containment rule for an explicit selection.
 */
export function buildCatalog(selection: ProjectSelection, env: NodeJS.ProcessEnv = process.env): ProjectCatalog {
  if (selection.project && !selection.projectsRoot && !env[PROJECTS_ROOT_ENV]) {
    const identity = loadProjectIdentity(path.resolve(selection.project));
    const seed: ProjectSeed = { id: identity.project.id, name: identity.project.name, root: identity.root };
    return new ProjectCatalog([seed], seed.root);
  }

  const requestedRoot = resolveProjectsRoot(selection, env);
  let discovered: { root: string; projects: ProjectSeed[] };
  try {
    discovered = loadProjectCatalogRoot(requestedRoot) as { root: string; projects: ProjectSeed[] };
  } catch (error) {
    // The most likely install failure is a host launching the server from an
    // unrelated working directory, so name the path that was actually tried.
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
  return new ProjectCatalog(discovered.projects, initialRoot);
}
