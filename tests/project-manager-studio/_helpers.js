/* Shared Studio tests: isolated valid project fixtures and real built-server
   process control. Fixtures never mutate repository state. */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');

const builtServerPath = path.resolve(__dirname, '../../skills/project-manager/scripts/project-manager-studio.js');
function frontmatter(data) { return `---\n${Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`; }
function collection(records) { return `${frontmatter({ schema_version: 1 })}${records.map((record) => `\n## ${record.id} - ${record.title}\n\n\`\`\`json\n${JSON.stringify(record.data)}\n\`\`\`\n\n${record.narrative ?? ''}\n`).join('')}`; }
function makeProject(records = null, id = 'STUDIO') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-studio-'));
  fs.writeFileSync(path.join(root, 'PROJECT.md'), `${frontmatter({ schema_version: 1, id, name: 'Studio Delivery', status: 'active', owner: 'Maya', start_date: '2026-08-08', target_date: null, current_milestone: null, profile: 'minimal', adapters: ['human'], created: '2026-08-08', updated: '2026-08-08' })}\n## Objective\n\nShip a clear project outcome.\n\n## Success Criteria\n\n- [SC-OUTCOME] The outcome is accepted.\n`);
  const tasks = records ?? [
    { id: 'TASK-PLAN', title: 'Frame delivery', data: { outcome: 'Delivery is framed.', acceptance: ['Scope is approved.'], status: 'planned', priority: 'P1', owner: null, success_criteria: ['SC-OUTCOME'] }, narrative: 'Human note stays here.' },
    { id: 'TASK-VAGUE', title: 'Do stuff', data: { outcome: 'Make it better.', acceptance: ['Looks good.'], status: 'planned' } },
  ];
  fs.writeFileSync(path.join(root, 'TASKS.md'), collection(tasks));
  fs.writeFileSync(path.join(root, 'STATUS.md'), `${frontmatter({ schema_version: 1, project_id: id, generated_at: '2026-08-08T00:00:00Z', source_sha256: '0'.repeat(64) })}\n`);
  regenerateStatus(root, '2026-08-08T00:00:00Z');
  return root;
}
function startStudio(project, extra = []) { return new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [builtServerPath, '--project', project, '--no-open', '--port', '0', ...extra], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; const timer = setTimeout(() => reject(new Error(`Studio timeout\n${stdout}\n${stderr}`)), 6000);
  child.stdout.on('data', (chunk) => { stdout += chunk; const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]+/.exec(stdout); if (match) { clearTimeout(timer); const url = new URL(match[0]); resolve({ child, origin: url.origin, token: url.searchParams.get('token') }); } });
  child.stderr.on('data', (chunk) => { stderr += chunk; }); child.once('error', reject); child.once('exit', (code) => { if (!stdout.includes('http://')) reject(new Error(`Studio exited ${code}: ${stderr}`)); });
}); }
async function stopStudio(handle) { if (handle.child.exitCode !== null) return; handle.child.kill('SIGTERM'); await new Promise((resolve) => { const timer = setTimeout(resolve, 3000); handle.child.once('exit', () => { clearTimeout(timer); resolve(); }); }); }
async function handshake(handle) { const response = await fetch(`${handle.origin}/?token=${handle.token}`, { redirect: 'manual' }); return { response, cookie: response.headers.get('set-cookie').split(';')[0] }; }
module.exports = { builtServerPath, makeProject, startStudio, stopStudio, handshake, collection };
