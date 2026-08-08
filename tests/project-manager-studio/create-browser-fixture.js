#!/usr/bin/env node
/* Creates a disposable, fully validated Kanban browser fixture with all seven
   lifecycle states. Prints selected and sibling paths as JSON. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { makeProject, collection } = require('./_helpers');
const { loadProject, regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');
const { buildTaskContract, formatTaskContract, formatEvidenceManifest } = require('../../skills/project-manager/scripts/lib/contracts');

const records = [
  { id: 'TASK-PLAN', title: 'Shape launch brief', data: { outcome: 'Launch brief is decision-ready.', acceptance: ['Stakeholders approve the brief.'], status: 'planned', priority: 'P1', owner: null, critical: true, success_criteria: ['SC-OUTCOME'], blocks: ['TASK-DEPENDENT'] }, narrative: 'Keep the launch promise sharp.' },
  { id: 'TASK-DEPENDENT', title: 'Prepare launch assets', data: { outcome: 'Launch assets are ready.', acceptance: ['Every channel has an approved asset.'], status: 'planned', priority: 'P2', owner: 'Nora', depends_on: ['TASK-PLAN'] } },
  { id: 'TASK-BLOCKED', title: 'Confirm legal language', data: { outcome: 'Legal language is approved.', acceptance: ['Counsel approves final copy.'], status: 'planned', priority: 'P0', owner: 'Sam', blocked_by: ['Waiting for counsel review'] } },
  { id: 'TASK-READY', title: 'Book launch review', data: { outcome: 'Launch review is scheduled.', acceptance: ['Every decision owner accepts the invite.'], status: 'ready', priority: 'P1', owner: 'Maya' } },
  { id: 'TASK-INPROGRESS', title: 'Build launch page', data: { outcome: 'Launch page is implemented.', acceptance: ['Page is available for review.'], status: 'planned', priority: 'P0', owner: 'Ari' } },
  { id: 'TASK-IMPLEMENTED', title: 'Instrument analytics', data: { outcome: 'Launch analytics are implemented.', acceptance: ['Events appear in the test stream.'], status: 'planned', priority: 'P1', owner: 'Kai' } },
  { id: 'TASK-VERIFICATION', title: 'Verify accessibility', data: { outcome: 'Accessibility checks are complete.', acceptance: ['Critical paths pass the review.'], status: 'planned', priority: 'P1', owner: 'Ivy' } },
  { id: 'TASK-VERIFIED', title: 'Approve release notes', data: { outcome: 'Release notes are verified.', acceptance: ['Product and support approve the notes.'], status: 'planned', priority: 'P2', owner: 'Jo' } },
  { id: 'TASK-DONE', title: 'Lock launch date', data: { outcome: 'Launch date is confirmed.', acceptance: ['All owners accept the date.'], status: 'planned', priority: 'P2', owner: 'Maya' } },
  { id: 'TASK-VAGUE', title: 'Do launch stuff', data: { outcome: 'Make launch better.', acceptance: ['Looks good.'], status: 'planned', priority: 'P3', owner: null } },
];
const root = makeProject(records, 'KANBAN-DEMO');
const initial = loadProject(root);
const desired = { 'TASK-INPROGRESS': 'in_progress', 'TASK-IMPLEMENTED': 'implemented', 'TASK-VERIFICATION': 'verification', 'TASK-VERIFIED': 'verified', 'TASK-DONE': 'done' };
for (const [id, status] of Object.entries(desired)) {
  const task = initial.tasks.find((item) => item.id === id);
  const contract = buildTaskContract(initial.project, task, [], `2026-08-08T00:00:${String(Object.keys(desired).indexOf(id)).padStart(2, '0')}Z`);
  const attempt = path.join(root, 'handoffs', id, contract.contract_id); fs.mkdirSync(attempt, { recursive: true });
  fs.writeFileSync(path.join(attempt, 'TASK-CONTRACT.md'), formatTaskContract(contract, { story: null, executor_prompt: null, executor_prompt_sha256: null }));
  const raw = records.find((item) => item.id === id).data; raw.status = status; raw.active_contract = contract.contract_id;
  if (status !== 'in_progress') {
    const approval = { kind: 'approval', ref: `${id.toLowerCase()}-approval`, result: 'approved', sha256: null };
    const manifestStatus = status === 'done' ? 'verified' : status;
    const payload = { schema_version: 1, sequence: 1, contract_id: contract.contract_id, project: { id: initial.project.id }, task: { id, spec_sha256: task.spec_sha256 }, status: manifestStatus, blocker: null, evidence: [approval], acceptance_evidence: { [task.acceptance[0]]: [approval] }, sources: [], observed_at: '2026-08-08T00:01:00Z', notes: [] };
    const formatted = formatEvidenceManifest(payload, contract); fs.writeFileSync(path.join(attempt, 'EVIDENCE-001.md'), formatted.document); raw.last_manifest = formatted.manifest_id;
  }
}
fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records)); regenerateStatus(root, '2026-08-08T00:02:00Z'); loadProject(root);
const sibling = makeProject(null, 'SIBLING');
process.stdout.write(`${JSON.stringify({ project: root, sibling })}\n`);
