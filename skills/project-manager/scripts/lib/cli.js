/**
 * Responsibility: shared read-only CLI parsing, envelopes, output, and exits.
 * Invariants: explicit selector, stable JSON, semantic exit 1, path/grammar exit 2.
 * Initial project-manager implementation.
 */
'use strict';

const { ProjectError, loadProject } = require('./project-state');

function usage(script) {
  return `Usage: node ${script} <project-folder> [--json] [--help]`;
}

function run(command, calculate) {
  const args = process.argv.slice(2);
  const wantsHelp = args.includes('--help');
  const unknown = args.filter((arg) => arg.startsWith('--') && !['--json', '--help'].includes(arg));
  const folders = args.filter((arg) => !arg.startsWith('--'));
  const duplicateFlags = ['--json', '--help'].some((flag) => args.filter((arg) => arg === flag).length > 1);
  if (wantsHelp && args.length === 1) {
    process.stdout.write(`${usage(process.argv[1])}\n`);
    return;
  }
  if (unknown.length || duplicateFlags || folders.length !== 1 || wantsHelp) {
    process.stderr.write(`${usage(process.argv[1])}\n`);
    process.exitCode = 2;
    return;
  }
  const json = args.includes('--json');
  try {
    const state = loadProject(folders[0]);
    const envelope = { ok: true, command, project: { id: state.project.id, root: state.root }, data: calculate(state) };
    process.stdout.write(json ? `${JSON.stringify(envelope)}\n` : `${command}: ${state.project.id}\n${JSON.stringify(envelope.data, null, 2)}\n`);
  } catch (error) {
    const known = error instanceof ProjectError;
    const kind = known ? error.kind : 'grammar';
    const project = known && error.project?.id ? { id: error.project.id, root: error.project.root } : null;
    const envelope = { ok: false, command, project, errors: [{ code: known ? error.code : 'UNEXPECTED', path: known ? error.path : folders[0], message: error.message }] };
    process.stderr.write(`${JSON.stringify(envelope)}\n`);
    process.exitCode = kind === 'semantic' ? 1 : 2;
  }
}

module.exports = { run };
