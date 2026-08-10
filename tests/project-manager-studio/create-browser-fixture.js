#!/usr/bin/env node
/* Creates disposable validated Studio fixtures with Timeline schedules,
   milestones, dependency conflicts, all lifecycle states, and completion. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { makeProject, collection } = require('./_helpers');
const { loadProject, regenerateStatus } = require('../../skills/project-manager/scripts/lib/project-state');
const { buildTaskContract, formatTaskContract, formatEvidenceManifest } = require('../../skills/project-manager/scripts/lib/contracts');

const records = [
  { id: 'TASK-PLAN', title: 'Shape launch brief', data: { outcome: 'Launch brief is decision-ready.', acceptance: ['Stakeholders approve the brief.'], status: 'planned', priority: 'P1', owner: null, critical: true, success_criteria: ['SC-OUTCOME'], blocks: ['TASK-DEPENDENT'], milestone: 'M-LAUNCH', scheduled_start: '2026-08-10', scheduled_end: '2026-08-12' }, narrative: 'Keep the launch promise sharp.' },
  { id: 'TASK-DEPENDENT', title: 'Prepare launch assets', data: { outcome: 'Launch assets are ready.', acceptance: ['Every channel has an approved asset.'], status: 'planned', priority: 'P2', owner: 'Nora', depends_on: ['TASK-PLAN'], milestone: 'M-LAUNCH', scheduled_start: '2026-08-12', scheduled_end: '2026-08-15' } },
  { id: 'TASK-BLOCKED', title: 'Confirm legal language', data: { outcome: 'Legal language is approved.', acceptance: ['Counsel approves final copy.'], status: 'planned', priority: 'P0', owner: 'Sam', blocked_by: ['Waiting for counsel review'], milestone: 'M-LAUNCH', scheduled_start: '2026-08-13', scheduled_end: '2026-08-14' } },
  { id: 'TASK-READY', title: 'Book launch review', data: { outcome: 'Launch review is scheduled.', acceptance: ['Every decision owner accepts the invite.'], status: 'ready', priority: 'P1', owner: 'Maya', milestone: 'M-LAUNCH', scheduled_start: '2026-08-16', scheduled_end: '2026-08-16' } },
  { id: 'TASK-INPROGRESS', title: 'Build launch page', data: { outcome: 'Launch page is implemented.', acceptance: ['Page is available for review.'], status: 'planned', priority: 'P0', owner: 'Ari', milestone: 'M-LAUNCH', scheduled_start: '2026-08-17', scheduled_end: '2026-08-22' } },
  { id: 'TASK-IMPLEMENTED', title: 'Instrument analytics', data: { outcome: 'Launch analytics are implemented.', acceptance: ['Events appear in the test stream.'], status: 'planned', priority: 'P1', owner: 'Kai', milestone: 'M-LATER', scheduled_start: '2026-08-23', scheduled_end: '2026-08-25' } },
  { id: 'TASK-VERIFICATION', title: 'Verify accessibility', data: { outcome: 'Accessibility checks are complete.', acceptance: ['Critical paths pass the review.'], status: 'planned', priority: 'P1', owner: 'Ivy', milestone: 'M-LATER', scheduled_start: '2026-08-26', scheduled_end: '2026-08-27' } },
  { id: 'TASK-VERIFIED', title: 'Approve release notes', data: { outcome: 'Release notes are verified.', acceptance: ['Product and support approve the notes.'], status: 'planned', priority: 'P2', owner: 'Jo', milestone: 'M-LATER', scheduled_start: '2026-08-28', scheduled_end: '2026-08-29' } },
  { id: 'TASK-DONE', title: 'Lock launch date', data: { outcome: 'Launch date is confirmed.', acceptance: ['All owners accept the date.'], status: 'planned', priority: 'P2', owner: 'Maya', milestone: 'M-CLOSED', scheduled_start: '2026-08-30', scheduled_end: '2026-08-30' } },
  { id: 'TASK-VAGUE', title: 'Do launch stuff', data: { outcome: 'Make launch better.', acceptance: ['Looks good.'], status: 'planned', priority: 'P3', owner: null } },
];
const seedRecords = structuredClone(records);
for (const record of seedRecords) { delete record.data.scheduled_start; delete record.data.scheduled_end; delete record.data.milestone; }
const root = makeProject(seedRecords, 'KANBAN-DEMO');
fs.writeFileSync(path.join(root, 'PROJECT.md'), fs.readFileSync(path.join(root, 'PROJECT.md'), 'utf8').replace('target_date: null', 'target_date: "2026-09-15"').replace('current_milestone: null', 'current_milestone: "M-LAUNCH"'));
const milestoneRecords = [
  { id: 'M-LAUNCH', title: 'Launch', data: { status: 'active', target_date: '2026-08-31', forecast_date: '2026-09-02', forecast_updated: '2026-08-08', forecast_evidence: [{ kind: 'note', ref: 'launch-forecast', result: 'Launch review confirmed', sha256: null }], critical: true } },
  { id: 'M-LATER', title: 'Follow-up', data: { status: 'planned', target_date: '2026-09-10', forecast_date: null, forecast_updated: null, forecast_evidence: [], critical: false } },
  { id: 'M-CLOSED', title: 'Date lock', data: { status: 'planned', target_date: '2026-08-30', forecast_date: null, forecast_updated: null, forecast_evidence: [], critical: false } },
];
fs.writeFileSync(path.join(root, 'MILESTONES.md'), collection(milestoneRecords));
fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, 2)); regenerateStatus(root, '2026-08-08T00:00:00Z');
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
milestoneRecords.find((item) => item.id === 'M-CLOSED').data.status = 'complete'; fs.writeFileSync(path.join(root, 'MILESTONES.md'), collection(milestoneRecords));
fs.writeFileSync(path.join(root, 'TASKS.md'), collection(records, 2)); regenerateStatus(root, '2026-08-08T00:02:00Z'); loadProject(root);
if (process.argv.includes('--project-only')) {
  process.stdout.write(`${JSON.stringify({ project: root })}\n`);
  process.exit(0);
}
const sibling = makeProject(null, 'SIBLING');
const completedRecords = [{ id: 'TASK-COMPLETE', title: 'Complete work', data: { outcome: 'Work is complete.', acceptance: ['Work is accepted.'], status: 'planned', success_criteria: ['SC-OUTCOME'], milestone: 'M-COMPLETE' } }];
const completedSeed = structuredClone(completedRecords); delete completedSeed[0].data.milestone;
const completed = makeProject(completedSeed, 'COMPLETE-DEMO');
fs.writeFileSync(path.join(completed, 'MILESTONES.md'), collection([{ id: 'M-COMPLETE', title: 'Complete', data: { status: 'planned', target_date: '2026-08-08', forecast_date: null, forecast_updated: null, forecast_evidence: [], critical: false } }]));
fs.writeFileSync(path.join(completed, 'TASKS.md'), collection(completedRecords)); regenerateStatus(completed, '2026-08-08T00:02:30Z');
let completedState = loadProject(completed); const completeTask = completedState.tasks[0]; const completeContract = buildTaskContract(completedState.project, completeTask, [], '2026-08-08T00:03:00Z');
const completeAttempt = path.join(completed, 'handoffs', completeTask.id, completeContract.contract_id); fs.mkdirSync(completeAttempt, { recursive: true }); fs.writeFileSync(path.join(completeAttempt, 'TASK-CONTRACT.md'), formatTaskContract(completeContract, { story: null, executor_prompt: null, executor_prompt_sha256: null }));
const approval = { kind: 'approval', ref: 'complete-approval', result: 'approved', sha256: null };
const completePayload = { schema_version: 1, sequence: 1, contract_id: completeContract.contract_id, project: { id: completedState.project.id }, task: { id: completeTask.id, spec_sha256: completeTask.spec_sha256 }, status: 'verified', blocker: null, evidence: [approval], acceptance_evidence: { [completeTask.acceptance[0]]: [approval] }, sources: [], observed_at: '2026-08-08T00:04:00Z', notes: [] };
const completeManifest = formatEvidenceManifest(completePayload, completeContract); fs.writeFileSync(path.join(completeAttempt, 'EVIDENCE-001.md'), completeManifest.document);
completedRecords[0].data.status = 'done'; completedRecords[0].data.active_contract = completeContract.contract_id; completedRecords[0].data.last_manifest = completeManifest.manifest_id;
fs.writeFileSync(path.join(completed, 'TASKS.md'), collection(completedRecords)); fs.writeFileSync(path.join(completed, 'MILESTONES.md'), collection([{ id: 'M-COMPLETE', title: 'Complete', data: { status: 'complete', target_date: '2026-08-08', forecast_date: null, forecast_updated: null, forecast_evidence: [], critical: false } }]));
fs.writeFileSync(path.join(completed, 'PROJECT.md'), fs.readFileSync(path.join(completed, 'PROJECT.md'), 'utf8').replace('status: "active"', 'status: "complete"'));
regenerateStatus(completed, '2026-08-08T00:05:00Z'); loadProject(completed);
process.stdout.write(`${JSON.stringify({ project: root, sibling, completed })}\n`);
