// Local Studio HTTP boundary: token handshake, opaque-key project reads,
// deterministic checks, serialized atomic saves, and static assets. It exposes
// no shell, executor, evidence, or arbitrary-path selection API.
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { KanbanData, TaskEditRequest } from '../shared/api.js';
import { ProjectCatalog, ProjectCatalogError } from './project-catalog.js';

const { loadRevisionedProject, checkTaskEdit, saveTaskEdit, TaskEditError } = require('../../../skills/project-manager/scripts/lib/task-editor.js');
const SESSION_COOKIE = 'pm_studio_session';

function cookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries((header ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('='); return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function safeEqual(candidate: unknown, expected: string): boolean {
  if (typeof candidate !== 'string') return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function apiError(error: unknown): { status: number; body: { errors: Array<Record<string, unknown>> } } {
  const known = error instanceof TaskEditError || error instanceof ProjectCatalogError || (error && typeof error === 'object' && 'code' in error);
  const value = error as Record<string, unknown>;
  const code = known ? String(value.code) : 'UNEXPECTED';
  const status = ['MUTATION_CONFLICT', 'TASK_CONFLICT', 'PROJECT_BUSY'].includes(code) ? 409 : code === 'TASK_NOT_FOUND' ? 404 : known ? 400 : 500;
  return { status, body: { errors: [{ code, message: error instanceof Error ? error.message : 'Unexpected error', ...(known ? value : {}) }] } };
}

function editRequest(body: unknown): { projectKey: string; edit: Omit<TaskEditRequest, 'projectKey'> } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProjectCatalogError('INVALID_REQUEST', 'Task request must be an object');
  const value = body as Record<string, unknown>;
  const unknown = Object.keys(value).filter((key) => !['projectKey', 'mutationRevision', 'taskRevision', 'edit'].includes(key));
  if (unknown.length) throw new ProjectCatalogError('INVALID_REQUEST', `Task request contains unsupported fields: ${unknown.join(', ')}`);
  if (typeof value.projectKey !== 'string' || value.projectKey === '') throw new ProjectCatalogError('PROJECT_SELECTION_REQUIRED', 'Task request requires a server-issued project key');
  return { projectKey: value.projectKey, edit: { mutationRevision: value.mutationRevision, taskRevision: value.taskRevision, edit: value.edit } as Omit<TaskEditRequest, 'projectKey'> };
}

export function createServer(options: { catalog: ProjectCatalog; clientDistDir: string; sessionToken?: string }) {
  const sessionToken = options.sessionToken ?? crypto.randomBytes(32).toString('hex');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/', (req: Request, res: Response, next: NextFunction) => {
    const token = req.query.token;
    if (token === undefined) return next();
    if (!safeEqual(token, sessionToken)) return void res.status(401).send('Invalid session token.');
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/`);
    res.redirect(302, '/');
  });

  const api = express.Router();
  api.use((req: Request, res: Response, next: NextFunction) => {
    if (safeEqual(cookies(req.headers.cookie)[SESSION_COOKIE], sessionToken)) return next();
    res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'Missing or invalid Studio session.' }] });
  });

  function loadProject(key: unknown): KanbanData {
    const entry = options.catalog.resolve(key);
    return options.catalog.decorate(entry.key, loadRevisionedProject(entry.root).data);
  }

  api.get('/projects', (_req, res) => {
    try { res.json({ ok: true, data: options.catalog.data() }); }
    catch (error) { const result = apiError(error); res.status(result.status).json(result.body); }
  });

  api.get('/project', (req, res) => {
    try { res.json({ ok: true, data: loadProject(req.query.project) }); }
    catch (error) { const result = apiError(error); res.status(result.status).json(result.body); }
  });

  api.post('/tasks/:taskId/check', (req, res) => {
    try {
      const request = editRequest(req.body); const entry = options.catalog.resolve(request.projectKey);
      res.json({ ok: true, data: checkTaskEdit(entry.root, String(req.params.taskId), request.edit) });
    }
    catch (error) { const result = apiError(error); res.status(result.status).json(result.body); }
  });

  let saveTail: Promise<void> = Promise.resolve();
  function enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const run = saveTail.then(operation, operation);
    saveTail = run.then(() => undefined, () => undefined);
    return run;
  }
  api.put('/tasks/:taskId', async (req, res) => {
    try {
      const request = editRequest(req.body);
      const data = await enqueue(() => {
        const entry = options.catalog.resolve(request.projectKey);
        return options.catalog.decorate(entry.key, saveTaskEdit(entry.root, String(req.params.taskId), request.edit));
      });
      res.json({ ok: true, data });
    } catch (error) { const result = apiError(error); res.status(result.status).json(result.body); }
  });

  app.use('/api', api);
  app.use(express.static(options.clientDistDir));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const result = apiError(error); res.status(result.status).json(result.body);
  });
  return { app, sessionToken };
}
