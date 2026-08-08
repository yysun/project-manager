// Server-owned Studio project catalog: opaque selection keys bind requests to
// canonical direct-child paths and stable project IDs without accepting paths.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { KanbanData, ProjectCatalogData } from '../shared/api.js';

const { parseFrontmatter } = require('../../../skills/project-manager/scripts/lib/project-state.js');

export interface ProjectSeed { id: string; name: string; root: string }
interface CatalogEntry extends ProjectSeed { key: string }

export class ProjectCatalogError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ProjectCatalogError'; this.code = code; }
}

function stale(message: string): never { throw new ProjectCatalogError('PROJECT_SELECTION_STALE', message); }

export class ProjectCatalog {
  private readonly entries: CatalogEntry[];
  readonly initialKey: string;

  constructor(seeds: ProjectSeed[], initialRoot: string) {
    if (seeds.length === 0) throw new ProjectCatalogError('PROJECTS_ROOT_EMPTY', 'Studio project catalog cannot be empty');
    this.entries = seeds.map((seed) => ({ ...seed, key: crypto.randomBytes(24).toString('hex') }));
    const initial = this.entries.find((entry) => entry.root === initialRoot);
    if (!initial) throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Initial project is not in the Studio catalog');
    this.initialKey = initial.key;
    this.validateAll();
  }

  data(): ProjectCatalogData {
    for (const entry of this.entries) this.validateEntry(entry);
    return { schema_version: 1, initial_project_key: this.initialKey, projects: this.entries.map(({ key, id, name }) => ({ key, id, name })) };
  }

  resolve(key: unknown): CatalogEntry {
    if (typeof key !== 'string' || key === '') throw new ProjectCatalogError('PROJECT_SELECTION_REQUIRED', 'A server-issued project key is required');
    const entry = this.entries.find((candidate) => candidate.key === key);
    if (!entry) throw new ProjectCatalogError('PROJECT_SELECTION_UNKNOWN', 'Unknown Studio project key');
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
    const projectFile = path.join(entry.root, 'PROJECT.md');
    let fileStat;
    try { fileStat = fs.lstatSync(projectFile); } catch { stale(`Project identity file is missing: ${entry.name}`); }
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) stale(`Project identity file is unsafe: ${entry.name}`);
    let id: unknown;
    try { id = parseFrontmatter(fs.readFileSync(projectFile, 'utf8'), projectFile).data.id; }
    catch { stale(`Project identity cannot be read: ${entry.name}`); }
    if (id !== entry.id) stale(`Project ID changed for ${entry.name}`);
  }
}
