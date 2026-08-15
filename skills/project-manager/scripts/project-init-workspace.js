#!/usr/bin/env node
/**
 * Responsibility: strict process boundary for one workspace-root project initialization.
 * Invariants: exact arguments, bounded single-object stdin, active skill inferred from this script, and stable envelopes.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { ProjectError } = require('./lib/project-state');
const { MAX_PAYLOAD_BYTES, WorkspaceInitError, initializeWorkspaceProject } = require('./lib/workspace-init');

const COMMAND = 'init-workspace';
const USAGE = 'Usage: node project-init-workspace.js <absolute-workspace-root> <project-slug> [--json] [--help]';

class CliArgumentError extends Error {
  constructor(message, code = 'INVALID_ARGUMENT') { super(message); this.code = code; this.kind = 'grammar'; }
}

function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.includes('--help')) throw new CliArgumentError('--help must be the sole argument');
  const jsonCount = args.filter((arg) => arg === '--json').length;
  if (jsonCount > 1) throw new CliArgumentError('Duplicate --json');
  const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--json');
  if (unknown.length) throw new CliArgumentError(`Unknown flag: ${unknown[0]}`);
  const positional = args.filter((arg) => arg !== '--json');
  if (positional.length !== 2) throw new CliArgumentError('Expected exactly <absolute-workspace-root> and <project-slug>');
  return { workspaceRoot: positional[0], slug: positional[1], json: jsonCount === 1 };
}

function readBoundedStdin() {
  const chunks = []; let size = 0; const buffer = Buffer.alloc(65536);
  for (;;) {
    const count = fs.readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) break;
    size += count;
    if (size > MAX_PAYLOAD_BYTES) throw new CliArgumentError(`Initialization payload exceeds ${MAX_PAYLOAD_BYTES} bytes`, 'PAYLOAD_TOO_LARGE');
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  if (size === 0) throw new CliArgumentError('Initialization payload is empty', 'EMPTY_PAYLOAD');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new CliArgumentError('Initialization payload must be valid UTF-8', 'INVALID_UTF8'); }
  try { return JSON.parse(text); }
  catch { throw new CliArgumentError('Initialization payload must be one complete JSON object', 'INVALID_JSON'); }
}

function envelopeError(error, workspaceRoot = null) {
  const project = error.project ? { id: error.project.id, root: error.project.root } : null;
  const recoveryPath = error.recoveryPath ?? null;
  return {
    ok: false, command: COMMAND, project,
    ...(recoveryPath ? { data: { committed: error.committed === true, recovery_path: recoveryPath } } : {}),
    errors: [{ code: error.code ?? 'UNEXPECTED', path: error.path ?? workspaceRoot, message: error.message, usage: USAGE }],
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) process.stdout.write(`${USAGE}\n`);
  else {
    const payload = readBoundedStdin();
    const skillRoot = path.resolve(__dirname, '..');
    const result = initializeWorkspaceProject(args.workspaceRoot, args.slug, payload, { skillRoot });
    const envelope = { ok: true, command: COMMAND, project: result.project, data: result.data };
    process.stdout.write(args.json ? `${JSON.stringify(envelope)}\n` : `init-workspace: ${result.project.id}\n${result.project.root}\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify(envelopeError(error, process.argv[2] ?? null))}\n`);
  const semantic = (error instanceof WorkspaceInitError || error instanceof ProjectError) && error.kind === 'semantic';
  process.exitCode = semantic ? 1 : 2;
}
