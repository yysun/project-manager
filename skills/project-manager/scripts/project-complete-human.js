#!/usr/bin/env node
/**
 * Responsibility: internal project-update adapter for one lightweight human
 * completion. Invariants: explicit project/task/evidence and atomic library mutation.
 */
'use strict';

const { completeHumanTask } = require('./lib/human-completion');

function usage() {
  return 'Usage: node project-complete-human.js <project-folder> <task-id> --ref <approval-ref> --result <approval-result> [--observed-at <RFC3339-UTC>] [--json]';
}

function parse(args) {
  const flags = new Map(); const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--json') {
      if (flags.has(value)) throw new Error('Duplicate --json');
      flags.set(value, true); continue;
    }
    if (['--ref', '--result', '--observed-at'].includes(value)) {
      if (flags.has(value) || index + 1 >= args.length) throw new Error(`Missing or duplicate ${value}`);
      flags.set(value, args[index + 1]); index += 1; continue;
    }
    if (value.startsWith('--')) throw new Error(`Unknown flag: ${value}`);
    positional.push(value);
  }
  if (positional.length !== 2 || !flags.has('--ref') || !flags.has('--result')) throw new Error('Invalid arguments');
  return { root: positional[0], taskId: positional[1], ref: flags.get('--ref'), result: flags.get('--result'), observedAt: flags.get('--observed-at'), json: flags.has('--json') };
}

try {
  const args = parse(process.argv.slice(2));
  const data = completeHumanTask(args.root, args.taskId, { ref: args.ref, result: args.result, ...(args.observedAt ? { observed_at: args.observedAt } : {}) });
  const output = { ok: true, command: 'complete-human', data };
  process.stdout.write(args.json ? `${JSON.stringify(output)}\n` : `complete-human: ${data.task_id} -> done\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, command: 'complete-human', errors: [{ code: error.code ?? 'INVALID_ARGUMENT', message: error.message, usage: usage() }] })}\n`);
  process.exitCode = 1;
}
