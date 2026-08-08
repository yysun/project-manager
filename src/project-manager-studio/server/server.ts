// Local Studio HTTP boundary: token handshake, coherent project reads,
// deterministic task checks, serialized atomic saves, and static assets.
// It intentionally exposes no shell, executor, evidence, or arbitrary-path API.
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { TaskEditRequest } from '../shared/api.js';

const { loadRevisionedProject, checkTaskEdit, saveTaskEdit, TaskEditError } = require('../../../skills/project-manager/scripts/lib/task-editor.js');
const SESSION_COOKIE = 'pm_studio_session';

function cookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries((header ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('='); return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function apiError(error: unknown): { status: number; body: { errors: Array<Record<string, unknown>> } } {
  const known = error instanceof TaskEditError || (error && typeof error === 'object' && 'code' in error);
  const value = error as Record<string, unknown>;
  const code = known ? String(value.code) : 'UNEXPECTED';
  const status = ['MUTATION_CONFLICT', 'TASK_CONFLICT', 'PROJECT_BUSY'].includes(code) ? 409 : code === 'TASK_NOT_FOUND' ? 404 : known ? 400 : 500;
  return { status, body: { errors: [{ code, message: error instanceof Error ? error.message : 'Unexpected error', ...(known ? value : {}) }] } };
}

export function createServer(options: { projectRoot: string; clientDistDir: string; sessionToken?: string }) {
  const sessionToken = options.sessionToken ?? crypto.randomBytes(32).toString('hex');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/', (req: Request, res: Response, next: NextFunction) => {
    const token = req.query.token;
    if (token === undefined) return next();
    if (token !== sessionToken) return void res.status(401).send('Invalid session token.');
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/`);
    res.redirect(302, '/');
  });

  const api = express.Router();
  api.use((req: Request, res: Response, next: NextFunction) => {
    if (cookies(req.headers.cookie)[SESSION_COOKIE] === sessionToken) return next();
    res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'Missing or invalid Studio session.' }] });
  });

  api.get('/project', (_req, res) => {
    try { res.json({ ok: true, data: loadRevisionedProject(options.projectRoot).data }); }
    catch (error) { const result = apiError(error); res.status(result.status).json(result.body); }
  });

  api.post('/tasks/:taskId/check', (req, res) => {
    try { res.json({ ok: true, data: checkTaskEdit(options.projectRoot, String(req.params.taskId), req.body as TaskEditRequest) }); }
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
      const data = await enqueue(() => saveTaskEdit(options.projectRoot, String(req.params.taskId), req.body as TaskEditRequest));
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
