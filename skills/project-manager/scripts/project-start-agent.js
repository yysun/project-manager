#!/usr/bin/env node
/**
 * Responsibility: expose exact machine-readable issuance and retry of one agent
 * Task Contract. Invariants: strict arguments, stable envelopes, semantic exit
 * class separation, and no executor or project-local helper generation.
 */
'use strict';

const { ProjectError } = require('./lib/project-state');
const { MutationConflictError } = require('./lib/mutations');
const { AgentExecutionError, startAgentTask } = require('./lib/agent-execution');

const COMMAND = 'start-agent';
const USAGE = 'Usage: node project-start-agent.js <project-folder> <task-id> [--created-at <RFC3339-UTC>] [--retry-blocker <exact-blocker>|--retry-blocker=<exact-blocker>] [--json] [--help]';

class CliArgumentError extends Error {
  constructor(message) { super(message); this.code = 'INVALID_ARGUMENT'; }
}

function parse(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.includes('--help')) throw new CliArgumentError('--help must be the sole argument');
  const positional = []; const flags = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.startsWith('--retry-blocker=')) {
      if (flags.has('--retry-blocker')) throw new CliArgumentError('Duplicate --retry-blocker');
      const blocker = value.slice('--retry-blocker='.length);
      if (blocker === '') throw new CliArgumentError('Missing value for --retry-blocker');
      flags.set('--retry-blocker', blocker); continue;
    }
    if (value === '--json') {
      if (flags.has(value)) throw new CliArgumentError('Duplicate --json');
      flags.set(value, true); continue;
    }
    if (value === '--created-at' || value === '--retry-blocker') {
      if (flags.has(value)) throw new CliArgumentError(`Duplicate ${value}`);
      const next = args[index + 1];
      if (next === undefined || next === '' || next.startsWith('--')) throw new CliArgumentError(`Missing value for ${value}`);
      flags.set(value, next); index += 1; continue;
    }
    if (value.startsWith('--')) throw new CliArgumentError(`Unknown flag: ${value}`);
    positional.push(value);
  }
  if (positional.length !== 2) throw new CliArgumentError('Expected exactly <project-folder> and <task-id>');
  return {
    root: positional[0], taskId: positional[1], json: flags.has('--json'),
    input: {
      ...(flags.has('--created-at') ? { created_at: flags.get('--created-at') } : {}),
      ...(flags.has('--retry-blocker') ? { retry_blocker: flags.get('--retry-blocker') } : {}),
    },
  };
}

function errorEnvelope(error) {
  const project = error.project ? { id: error.project.id, root: error.project.root } : null;
  return {
    ok: false, command: COMMAND, project,
    errors: [{ code: error.code ?? 'UNEXPECTED', path: error.path ?? null, message: error.message, usage: USAGE }],
  };
}

function semantic(error) {
  const inputGrammar = error instanceof AgentExecutionError && ['INVALID_INPUT', 'INVALID_TIMESTAMP'].includes(error.code);
  return (!inputGrammar && error instanceof AgentExecutionError) || error instanceof MutationConflictError || (error instanceof ProjectError && error.kind === 'semantic');
}

try {
  const args = parse(process.argv.slice(2));
  if (args.help) process.stdout.write(`${USAGE}\n`);
  else {
    const result = startAgentTask(args.root, args.taskId, args.input);
    const envelope = { ok: true, command: COMMAND, project: result.project, data: result.data };
    process.stdout.write(args.json
      ? `${JSON.stringify(envelope)}\n`
      : `start-agent: ${result.data.task_id} -> ${result.data.status}\n${result.data.contract_path}\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify(errorEnvelope(error))}\n`);
  process.exitCode = semantic(error) ? 1 : 2;
}
