// Server-owned Studio project catalog: opaque keys expose issued bindings for
// SSE recovery while validated resolution guards every project read or write.
// Also serves request-time selection for callers that have no launch-time
// catalog, via an opt-in empty construction and `register`; Studio's own call
// sites use neither and keep their launch-time, non-empty behavior.
// Containment for request-time selection is owned here rather than re-derived by
// each caller, judged on the resolved real path, and every construction must
// state its decision: `register` refuses outright when none was supplied.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { KanbanData, ProjectCatalogData } from '../shared/api.js';

const { loadProjectIdentity } = require('../../../skills/project-manager/scripts/lib/project-state.js');

export interface ProjectSeed { id: string; name: string; root: string }
export interface CatalogEntry extends ProjectSeed { key: string }
/** allowEmpty admits a catalog with no configured projects, for callers that
 *  select projects at request time. Studio passes nothing and keeps rejecting one.
 *
 *  confinement is the containment decision for request-time selection, and every
 *  construction that will call `register` must state it: a projects root confines
 *  selection to its direct children, `null` is explicitly unconfined. Omitting it
 *  is not a silent default — `register` refuses outright — because a fail-open
 *  default is exactly how this boundary was previously bypassable. */
export interface ProjectCatalogOptions { allowEmpty?: boolean; confinement?: string | null }

function rejected(root: string, problem: string): never {
  throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', `Project folder ${problem}: ${root}`);
}

export class ProjectCatalogError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ProjectCatalogError'; this.code = code; }
}

function stale(message: string): never { throw new ProjectCatalogError('PROJECT_SELECTION_STALE', message); }

export class ProjectCatalog {
  private readonly entries: CatalogEntry[];
  private readonly confinement: string | null;
  private readonly confinementDecided: boolean;
  readonly initialKey: string;

  constructor(seeds: ProjectSeed[], initialRoot: string, options: ProjectCatalogOptions = {}) {
    // `null` is the explicit spelling of "unconfined". An absent or `undefined`
    // option is not a decision, so it cannot fail open through an optional
    // variable that happened to be undefined at the call site.
    this.confinementDecided = options.confinement !== undefined;
    this.confinement = options.confinement ?? null;
    if (seeds.length === 0 && !options.allowEmpty) throw new ProjectCatalogError('PROJECTS_ROOT_EMPTY', 'Studio project catalog cannot be empty');
    this.entries = seeds.map((seed) => ({ ...seed, key: crypto.randomBytes(24).toString('hex') }));
    if (seeds.length === 0) {
      // No configured project to start from; callers select one per request.
      this.initialKey = '';
    } else {
      const initial = this.entries.find((entry) => entry.root === initialRoot);
      if (!initial) throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Initial project is not in the Studio catalog');
      this.initialKey = initial.key;
    }
    this.validateAll();
  }

  /**
   * Register a project folder chosen at request time and return its keyed entry,
   * reusing the existing entry when that real root is already known so a key held
   * by a rendered view stays valid. Validation runs before anything is stored, and
   * its errors name the rejected path — an ad-hoc folder has no catalog name yet.
   */
  register(root: unknown): CatalogEntry {
    if (!this.confinementDecided) {
      throw new ProjectCatalogError('PROJECT_SELECTION_UNCONFINED', 'This catalog was built without a containment decision, so request-time project selection is refused.');
    }
    if (typeof root !== 'string' || root === '') throw new ProjectCatalogError('PROJECT_SELECTION_REQUIRED', 'A project folder is required');
    // Containment is decided on the parent before the leaf is touched. Checking
    // it after lstat/realpath would answer "does not exist" vs "is not a
    // directory" vs "outside the root" for any absolute path on the host,
    // turning a read-only tool into a filesystem probe oracle.
    if (this.confinement !== null) {
      const outside = () => new ProjectCatalogError('PROJECT_OUTSIDE_ROOT', `Project folder is outside the configured projects root ${this.confinement}: ${root}`);
      let parentReal;
      try { parentReal = fs.realpathSync(path.dirname(root)); } catch { throw outside(); }
      if (parentReal !== this.confinement) throw outside();
    }
    let stat;
    try { stat = fs.lstatSync(root); } catch { rejected(root, 'does not exist'); }
    if (stat!.isSymbolicLink() || !stat!.isDirectory()) rejected(root, 'is not a real directory');
    let real;
    try { real = fs.realpathSync(root); } catch { rejected(root, 'cannot be resolved'); }
    // Containment is judged on the resolved real path, never the lexical one:
    // comparing an unresolved path against a realpathed root rejects legitimate
    // children whenever any ancestor is a symlink (/tmp on macOS, a linked home).
    if (this.confinement !== null && path.dirname(real!) !== this.confinement) {
      throw new ProjectCatalogError('PROJECT_OUTSIDE_ROOT', `Project folder is outside the configured projects root ${this.confinement}: ${root}`);
    }
    const existing = this.entries.find((entry) => entry.root === real);
    if (existing) return existing;
    let identity;
    try { identity = loadProjectIdentity(real); } catch { rejected(root, 'is not a Project Manager project'); }
    const entry: CatalogEntry = { key: crypto.randomBytes(24).toString('hex'), id: identity!.project.id, name: identity!.project.name, root: real! };
    this.entries.push(entry);
    return entry;
  }

  data(): ProjectCatalogData {
    for (const entry of this.entries) this.validateEntry(entry);
    return this.listing();
  }

  /** Names and keys only, with no per-entry disk validation. Selection matches a
   *  caller's ID or name against this; the entry that is actually read is still
   *  validated by `resolve`. `data()` keeps validating because the app-facing
   *  catalog listing is what a view trusts to still be live. */
  listing(): ProjectCatalogData {
    return { schema_version: 1, initial_project_key: this.initialKey, projects: this.entries.map(({ key, id, name }) => ({ key, id, name })) };
  }

  issued(key: unknown): CatalogEntry {
    if (typeof key !== 'string' || key === '') throw new ProjectCatalogError('PROJECT_SELECTION_REQUIRED', 'A server-issued project key is required');
    const entry = this.entries.find((candidate) => candidate.key === key);
    if (!entry) throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Unknown Studio project key');
    return entry;
  }

  resolve(key: unknown): CatalogEntry {
    const entry = this.issued(key);
    this.validateEntry(entry);
    return entry;
  }

  decorate(key: string, data: KanbanData): KanbanData {
    const entry = this.entries.find((candidate) => candidate.key === key);
    if (!entry) throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Unknown Studio project key');
    if (data.project.id !== entry.id || data.project.root !== entry.root) stale(`Project identity changed for ${entry.name}`);
    return { ...data, project: { ...data.project, key } };
  }

  private validateAll() {
    const ids = new Set<string>();
    for (const entry of this.entries) {
      const normalized = entry.id.toLowerCase();
      if (ids.has(normalized)) throw new ProjectCatalogError('PROJECT_ID_DUPLICATE', `Project ID is duplicated in Studio catalog: ${entry.id}`);
      ids.add(normalized);
    }
  }

  private validateEntry(entry: CatalogEntry) {
    let stat;
    try { stat = fs.lstatSync(entry.root); } catch { stale(`Project path is no longer available: ${entry.name}`); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) stale(`Project path is no longer a real directory: ${entry.name}`);
    let real;
    try { real = fs.realpathSync(entry.root); } catch { stale(`Project path cannot be resolved: ${entry.name}`); }
    if (real !== entry.root) stale(`Project path changed: ${entry.name}`);
    let identity;
    try { identity = loadProjectIdentity(entry.root); }
    catch { stale(`Project identity cannot be read: ${entry.name}`); }
    if (identity.project.id !== entry.id) stale(`Project ID changed for ${entry.name}`);
  }
}
