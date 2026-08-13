#!/usr/bin/env node
/**
 * Responsibility: ingest exactly one agent Evidence Manifest payload from
 * standard input. Invariants: strict CLI/stdin grammar, stable envelopes,
 * semantic exit class separation, and no payload normalization or helper files.
 */
'use strict';

const fs = require('node:fs');
const { ProjectError } = require('./lib/project-state');
const { MutationConflictError } = require('./lib/mutations');
const { AgentExecutionError, ingestAgentManifest } = require('./lib/agent-execution');

const COMMAND = 'ingest-agent-manifest';
const USAGE = 'Usage: node project-ingest-agent-manifest.js <project-folder> <task-id> [--json] [--help]';

class CliArgumentError extends Error {
  constructor(code, message, path = null) { super(message); this.code = code; this.path = path; }
}

function parse(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.includes('--help')) throw new CliArgumentError('INVALID_ARGUMENT', '--help must be the sole argument');
  const positional = []; let json = false;
  for (const value of args) {
    if (value === '--json') {
      if (json) throw new CliArgumentError('INVALID_ARGUMENT', 'Duplicate --json');
      json = true;
    } else if (value.startsWith('--')) throw new CliArgumentError('INVALID_ARGUMENT', `Unknown flag: ${value}`);
    else positional.push(value);
  }
  if (positional.length !== 2) throw new CliArgumentError('INVALID_ARGUMENT', 'Expected exactly <project-folder> and <task-id>');
  return { root: positional[0], taskId: positional[1], json };
}

function readPayload() {
  const text = fs.readFileSync(0, 'utf8');
  if (text.trim() === '') throw new CliArgumentError('INVALID_STDIN', 'Standard input must contain exactly one JSON object', 'stdin');
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new CliArgumentError('INVALID_STDIN', 'Standard input must contain exactly one JSON object followed only by whitespace', 'stdin'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CliArgumentError('INVALID_STDIN', 'Standard input JSON must be an object', 'stdin');
  return payload;
}

function errorEnvelope(error) {
  const project = error.project ? { id: error.project.id, root: error.project.root } : null;
  return {
    ok: false, command: COMMAND, project,
    errors: [{ code: error.code ?? 'UNEXPECTED', path: error.path ?? null, message: error.message, usage: USAGE }],
  };
}

function semantic(error) {
  return error instanceof AgentExecutionError || error instanceof MutationConflictError || (error instanceof ProjectError && error.kind === 'semantic');
}

try {
  const args = parse(process.argv.slice(2));
  if (args.help) process.stdout.write(`${USAGE}\n`);
  else {
    const payload = readPayload();
    const result = ingestAgentManifest(args.root, args.taskId, payload);
    const envelope = { ok: true, command: COMMAND, project: result.project, data: result.data };
    process.stdout.write(args.json
      ? `${JSON.stringify(envelope)}\n`
      : `ingest-agent-manifest: ${result.data.task_id} -> ${result.data.status} (${result.data.manifest_id})\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify(errorEnvelope(error))}\n`);
  process.exitCode = semantic(error) ? 1 : 2;
}
