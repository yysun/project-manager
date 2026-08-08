#!/usr/bin/env node
/* Emits one JSON object for browser E2E: default .projects Alpha/Beta projects
   with distinct filters and schedules plus an excluded outside sibling. */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeProject, collection } = require('./_helpers');
const { regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-selection-browser-'));
const projectsRoot = path.join(workspace, '.projects'); fs.mkdirSync(projectsRoot);

function project(name, id, owner, start, end) {
  const records = [{ id: 'TASK-PLAN', title: `${name} launch`, data: { outcome: `${name} is ready.`, acceptance: [`${name} is approved.`], status: 'planned', priority: 'P1', owner, success_criteria: ['SC-OUTCOME'], scheduled_start: start, scheduled_end: end } }];
  const root = makeProject(records.map((record) => ({ ...record, data: { ...record.data, scheduled_start: undefined, scheduled_end: undefined } })), id);
  fs.writeFileSync(path.join(root, 'PROJECT.md'), fs.readFileSync(path.join(root, 'PROJECT.md'), 'utf8').replace('name: "Studio Delivery"', `name: ${JSON.stringify(name)}`));
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, 2)); regenerateStatus(root, '2026-08-08T00:00:00Z');
  const target = path.join(projectsRoot, id.toLowerCase()); fs.renameSync(root, target); return target;
}

const alpha = project('Alpha Program', 'ALPHA', 'Ari', '2026-08-10', '2026-08-12');
const beta = project('Beta Program', 'BETA', 'Bea', '2026-09-01', '2026-09-03');
const outsideSource = makeProject(null, 'OUTSIDE'); const outside = path.join(workspace, 'outside'); fs.renameSync(outsideSource, outside);
process.stdout.write(`${JSON.stringify({ workspace, projectsRoot, alpha, beta, outside })}\n`);
if (process.argv.includes('--launch')) {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, [require.resolve('../../skills/project-manager/scripts/project-manager-studio.js'), '--no-open', '--port', '0'], { cwd: workspace, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
}
