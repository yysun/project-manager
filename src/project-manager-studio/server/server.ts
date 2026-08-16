// Local Studio HTTP boundary: token handshake, opaque-key project reads,
// deterministic checks, serialized atomic saves, authenticated SSE refresh,
// lease renewal, and static assets. It exposes no shell, executor, evidence,
// or arbitrary-path selection API. A degraded watcher is surfaced as a
// project-stale event and its recovery as project-live, both deferred through
// the same gate as project-change so nothing is written before the response
// headers are flushed.
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { KanbanData, TaskEditRequest } from '../shared/api.js';
import { ProjectCatalog, ProjectCatalogError } from './project-catalog.js';
import { watchProjectChanges, type ProjectWatcherOptions } from './project-watcher.js';

const { loadRevisionedProject, checkTaskEdit, saveTaskEdit, TaskEditError } = require('../../../skills/project-manager/scripts/lib/task-editor.js');
const SESSION_COOKIE = 'pm_studio_session';
const HEARTBEAT_HEADER = 'x-project-manager-studio';
const STUDIO_PROJECT_OPTIONS = { taskErrorsAsWarnings: true };

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

type WatchProject = (options: ProjectWatcherOptions) => () => void;

export function createServer(options: { catalog: ProjectCatalog; clientDistDir: string; onHeartbeat: () => void; sessionToken?: string; watchProject?: WatchProject }) {
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
    return options.catalog.decorate(entry.key, loadRevisionedProject(entry.root, 3, STUDIO_PROJECT_OPTIONS).data);
  }

  api.get('/projects', (_req, res) => {
    try { res.json({ ok: true, data: options.catalog.data() }); }
    catch (error) { const result = apiError(error); res.status(result.status).json(result.body); }
  });

  api.get('/project', (req, res) => {
    try { res.json({ ok: true, data: loadProject(req.query.project) }); }
    catch (error) { const result = apiError(error); res.status(result.status).json(result.body); }
  });

  api.get('/events', (req, res) => {
    let stop = () => {};
    let ready = false; let queued = false; let queuedStale = false; let queuedLive = false; let closed = false;
    const sendChange = () => {
      if (!ready) { queued = true; return; }
      res.write(`event: project-change\ndata: ${JSON.stringify({ projectKey: req.query.project })}\n\n`);
    };
    // Deferred like sendChange: the watcher attaches synchronously, before
    // flushHeaders, so an early write would send a bare 200 with no event-stream
    // headers and then fail with ERR_HTTP_HEADERS_SENT.
    const sendStale = () => {
      if (!ready) { queuedStale = true; return; }
      res.write(`event: project-stale\ndata: ${JSON.stringify({ projectKey: req.query.project })}\n\n`);
    };
    const sendLive = () => {
      if (!ready) { queuedLive = true; return; }
      res.write(`event: project-live\ndata: ${JSON.stringify({ projectKey: req.query.project })}\n\n`);
    };
    const close = () => { if (!closed) { closed = true; stop(); } };
    try {
      const entry = options.catalog.issued(req.query.project);
      stop = (options.watchProject ?? watchProjectChanges)({
        root: entry.root,
        resolveRoot: () => options.catalog.resolve(entry.key).root,
        onChange: sendChange,
        onDegraded: sendStale,
        onLive: sendLive,
        onFatal: () => { if (!res.writableEnded) res.end(); },
      });
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders(); ready = true;
      res.write(': connected\n\n');
      if (queued) sendChange();
      if (queuedStale) sendStale();
      if (queuedLive) sendLive();
      req.once('close', close); res.once('close', close);
    } catch (error) {
      close(); const result = apiError(error); res.status(result.status).json(result.body);
    }
  });

  api.post('/heartbeat', (req, res) => {
    if (req.get(HEARTBEAT_HEADER) !== 'heartbeat') return void res.status(403).json({ errors: [{ code: 'HEARTBEAT_FORBIDDEN', message: 'Missing or invalid Studio heartbeat header.' }] });
    options.onHeartbeat();
    res.status(204).end();
  });

  api.post('/tasks/:taskId/check', (req, res) => {
    try {
      const request = editRequest(req.body); const entry = options.catalog.resolve(request.projectKey);
      res.json({ ok: true, data: checkTaskEdit(entry.root, String(req.params.taskId), request.edit, { projectOptions: STUDIO_PROJECT_OPTIONS }) });
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
        return options.catalog.decorate(entry.key, saveTaskEdit(entry.root, String(req.params.taskId), request.edit, { projectOptions: STUDIO_PROJECT_OPTIONS }));
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
