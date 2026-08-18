/* Shared Studio tests: isolated project/catalog fixtures and built-server process
   control for explicit, rooted, and default .projects launch modes. */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');

const builtServerPath = path.resolve(__dirname, '../../skills/project-manager/scripts/project-manager-studio.js');
function frontmatter(data) { return `---\n${Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`; }
// Refuse to clear anything that is not already a generated project, so a stray
// --out path cannot turn regeneration into data loss.
function prepareTargetRoot(targetRoot) {
  const root = path.resolve(targetRoot);
  if (fs.existsSync(root)) {
    if (!fs.existsSync(path.join(root, 'PROJECT.md'))) throw new Error(`Refusing to replace ${root}: it is not a generated project folder`);
    fs.rmSync(root, { recursive: true });
  }
  fs.mkdirSync(root, { recursive: true });
  return fs.realpathSync(root);
}
function collection(records, schemaVersion = 1) { return `${frontmatter({ schema_version: schemaVersion })}${records.map((record) => `\n## ${record.id} - ${record.title}\n\n\`\`\`json\n${JSON.stringify(record.data)}\n\`\`\`\n\n${record.narrative ?? ''}\n`).join('')}`; }
// targetRoot materializes the fixture at a fixed path instead of a temp dir, so the
// same definition can regenerate the repository demo. Task Contracts bind an absolute
// project root, so a demo can only be correct for the checkout that generated it.
function makeProject(records = null, id = 'STUDIO', targetRoot = null) {
  const root = targetRoot === null ? fs.mkdtempSync(path.join(os.tmpdir(), 'pm-studio-')) : prepareTargetRoot(targetRoot);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), `${frontmatter({ schema_version: 1, id, name: 'Studio Delivery', status: 'active', owner: 'Maya', start_date: '2026-08-08', target_date: null, current_milestone: null, profile: 'minimal', adapters: ['human'], created: '2026-08-08', updated: '2026-08-08' })}\n## Objective\n\nShip a clear project outcome.\n\n## Success Criteria\n\n- [SC-OUTCOME] The outcome is accepted.\n`);
  const tasks = records ?? [
    { id: 'TASK-PLAN', title: 'Frame delivery', data: { outcome: 'Delivery is framed.', acceptance: ['Scope is approved.'], status: 'planned', priority: 'P1', owner: null, success_criteria: ['SC-OUTCOME'] }, narrative: 'Human note stays here.' },
    { id: 'TASK-VAGUE', title: 'Do stuff', data: { outcome: 'Make it better.', acceptance: ['Looks good.'], status: 'planned' } },
  ];
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(tasks));
  fs.writeFileSync(path.join(root, 'STATUS.md'), `${frontmatter({ schema_version: 1, project_id: id, generated_at: '2026-08-08T00:00:00Z', source_sha256: '0'.repeat(64) })}\n`);
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  return fs.realpathSync(root);
}
function startStudioArgs(args, options = {}) { return new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [builtServerPath, ...args], { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; const timer = setTimeout(() => reject(new Error(`Studio timeout\n${stdout}\n${stderr}`)), 6000);
  child.stdout.on('data', (chunk) => { stdout += chunk; const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+/.exec(stdout); if (match) { clearTimeout(timer); const url = new URL(match[0]); resolve({ child, origin: url.origin, token: url.searchParams.get('token') }); } });
  child.stderr.on('data', (chunk) => { stderr += chunk; }); child.once('error', reject); child.once('exit', (code) => { if (!stdout.includes('http://')) reject(new Error(`Studio exited ${code}: ${stderr}`)); });
}); }
function startStudio(project, extra = []) { return startStudioArgs(['--project', project, '--no-open', '--port', '0', ...extra]); }
async function stopStudio(handle) { if (handle.child.exitCode !== null) return; handle.child.kill('SIGTERM'); await new Promise((resolve) => { const timer = setTimeout(resolve, 3000); handle.child.once('exit', () => { clearTimeout(timer); resolve(); }); }); }
async function handshake(handle) { const response = await fetch(`${handle.origin}/?token=${handle.token}`, { redirect: 'manual' }); return { response, cookie: response.headers.get('set-cookie').split(';')[0] }; }
// SSE assertions read events, never chunks: a `reader.read()` chunk is whatever
// the socket happened to deliver, so it can carry two events or half of one, and
// the watcher legitimately interleaves project-stale/project-live around the
// project-change a test is waiting for. This reader pumps continuously into a
// buffer, frames on the blank-line boundary, and reports whole events by name.
function openEventStream(origin, cookie, projectKey) {
  const controller = new AbortController();
  return fetch(`${origin}/api/events?project=${encodeURIComponent(projectKey)}`, { headers: { Cookie: cookie }, signal: controller.signal }).then((response) => {
    if (response.status !== 200) { controller.abort(); throw new Error(`SSE stream refused with ${response.status}`); }
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    let buffered = ''; const queue = []; let ended = false; let failure = null; let wake = null;
    // Reports whether an event was queued, so a waiter is only woken by an event
    // and not by traffic that carries none -- the ": connected" preamble is a
    // comment, and a chunk can also stop mid-event.
    function frame() {
      let queued = false;
      for (;;) {
        const boundary = buffered.indexOf('\n\n');
        if (boundary < 0) return queued;
        const block = buffered.slice(0, boundary); buffered = buffered.slice(boundary + 2);
        const match = /^event: (.+)$/m.exec(block);
        if (match) { queue.push({ name: match[1], block }); queued = true; }
      }
    }
    (async () => {
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; buffered += decoder.decode(chunk.value, { stream: true }); if (frame()) wake?.(); } }
      catch (error) { failure = error; }
      ended = true; wake?.();
    })();
    function idle(ms) { return new Promise((resolve) => { const timer = setTimeout(settle, ms); timer.unref?.(); wake = settle; function settle() { clearTimeout(timer); wake = null; resolve(); } }); }
    return {
      response,
      /** Resolve with the next event named `name`, discarding events a test is
       *  not asserting on. Rejects rather than hanging when nothing arrives.
       *  Pass null to take the next event whatever it is, which is how a test
       *  asserts on the order of the events rather than on one of them. */
      async next(name, timeoutMs = 5000) {
        const expiry = Date.now() + timeoutMs;
        for (;;) {
          while (queue.length) { const event = queue.shift(); if (name === null || event.name === name) return event; }
          if (failure) throw failure;
          if (ended) throw new Error(`SSE stream ended before a ${name ?? 'further'} event`);
          const remaining = expiry - Date.now();
          if (remaining <= 0) throw new Error(`Timed out after ${timeoutMs}ms waiting for a ${name ?? 'further'} event`);
          await idle(remaining);
        }
      },
      /** Drain until the stream has been silent for `quietMs`, and report the
       *  event names seen. Adaptive rather than a fixed sleep, so a slow machine
       *  waits longer instead of asserting against a half-delivered stream. */
      async settle(quietMs = 250, capMs = quietMs * 8) {
        const seen = []; const cap = Date.now() + capMs;
        for (;;) {
          while (queue.length) seen.push(queue.shift().name);
          if (failure || ended || Date.now() >= cap) return seen;
          await idle(Math.min(quietMs, Math.max(cap - Date.now(), 0)));
          if (queue.length === 0) return seen; // the window closed with nothing new
        }
      },
      async close() { controller.abort(); try { await reader.cancel(); } catch { /* already torn down */ } },
    };
  });
}
// Poll instead of sleeping a guessed interval: server-side teardown is observed
// through its effect, so a slow machine waits longer and a fast one returns now.
async function waitUntil(predicate, message, timeoutMs = 5000) {
  const expiry = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() >= expiry) throw new Error(`Timed out after ${timeoutMs}ms waiting until ${message}`);
    await new Promise((resolve) => { const timer = setTimeout(resolve, 10); timer.unref?.(); });
  }
}
async function catalog(handle, cookie) { return (await (await fetch(`${handle.origin}/api/projects`, { headers: { Cookie: cookie } })).json()).data; }
async function getProject(handle, cookie, key) { return (await (await fetch(`${handle.origin}/api/project?project=${encodeURIComponent(key)}`, { headers: { Cookie: cookie } })).json()).data; }
module.exports = { builtServerPath, makeProject, startStudio, startStudioArgs, stopStudio, handshake, catalog, getProject, collection, openEventStream, waitUntil };
