#!/usr/bin/env node
/**
 * Responsibility: expose exact machine-readable run start, advance, and resume.
 * Invariants: strict arguments, stable envelopes, semantic exit class
 * separation, and resume that never performs filesystem discovery.
 */
'use strict';

const { ProjectError } = require('./lib/project-state');
const { MutationConflictError } = require('./lib/mutations');
const { RunExecutionError, startRun, advanceRun, resumeRun } = require('./lib/run-execution');

const COMMAND = 'run';
const USAGE = 'Usage: node project-run.js <project-folder> <start|advance|resume> [--payload <json>] [--observed-at <RFC3339-UTC>] [--json] [--help]';

class CliArgumentError extends Error {
  constructor(message) { super(message); this.code = 'INVALID_ARGUMENT'; }
}

function parse(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.includes('--help')) throw new CliArgumentError('--help must be the sole argument');
  const positional = []; const flags = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--json') {
      if (flags.has(value)) throw new CliArgumentError('Duplicate --json');
      flags.set(value, true); continue;
    }
    if (value === '--payload' || value === '--observed-at') {
      if (flags.has(value)) throw new CliArgumentError(`Duplicate ${value}`);
      const next = args[index + 1];
      if (next === undefined || next === '') throw new CliArgumentError(`Missing value for ${value}`);
      flags.set(value, next); index += 1; continue;
    }
    if (value.startsWith('--')) throw new CliArgumentError(`Unknown flag: ${value}`);
    positional.push(value);
  }
  if (positional.length !== 2) throw new CliArgumentError('Expected exactly <project-folder> and <start|advance|resume>');
  if (!['start', 'advance', 'resume'].includes(positional[1])) throw new CliArgumentError(`Unknown action: ${positional[1]}`);
  let payload = {};
  if (flags.has('--payload')) {
    try { payload = JSON.parse(flags.get('--payload')); } catch { throw new CliArgumentError('--payload must be one JSON object'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CliArgumentError('--payload must be one JSON object');
  }
  if (positional[1] === 'resume' && (flags.has('--payload') || flags.has('--observed-at'))) {
    throw new CliArgumentError('resume is read-only and accepts no --payload or --observed-at');
  }
  return { root: positional[0], action: positional[1], payload, observedAt: flags.get('--observed-at'), json: flags.has('--json') };
}

function errorEnvelope(error) {
  const project = error.project ? { id: error.project.id, root: error.project.root } : null;
  return {
    ok: false, command: COMMAND, project,
    errors: [{ code: error.code ?? 'UNEXPECTED', path: error.path ?? null, message: error.message, usage: USAGE }],
  };
}

function semantic(error) {
  const inputGrammar = error instanceof RunExecutionError && error.code === 'INVALID_INPUT';
  return (!inputGrammar && error instanceof RunExecutionError) || error instanceof MutationConflictError || (error instanceof ProjectError && error.kind === 'semantic');
}

try {
  const args = parse(process.argv.slice(2));
  if (args.help) process.stdout.write(`${USAGE}\n`);
  else {
    const observedAt = args.observedAt ?? new Date().toISOString();
    const result = args.action === 'start' ? startRun(args.root, args.payload, observedAt)
      : args.action === 'advance' ? advanceRun(args.root, args.payload, observedAt)
        : resumeRun(args.root);
    const envelope = { ok: true, command: `${COMMAND}-${args.action}`, project: result.project, data: result.data };
    process.stdout.write(args.json
      ? `${JSON.stringify(envelope)}\n`
      : `${COMMAND}-${args.action}: ${result.project.id}\n${JSON.stringify(result.data, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify(errorEnvelope(error))}\n`);
  process.exitCode = semantic(error) ? 1 : 2;
}
