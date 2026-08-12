#!/usr/bin/env node
/**
 * Responsibility: resolve one exact project name, ID, or folder inside a validated projects root.
 * Invariants: read-only, direct-child catalog only, and ambiguity never resolves by guessing.
 */
'use strict';

const { ProjectError, resolveProjectInRoot } = require('./lib/project-state');

const args = process.argv.slice(2);
const wantsHelp = args.includes('--help');
const unknown = args.filter((arg) => arg.startsWith('--') && !['--json', '--help'].includes(arg));
const positional = args.filter((arg) => !arg.startsWith('--'));
const duplicateFlags = ['--json', '--help'].some((flag) => args.filter((arg) => arg === flag).length > 1);
const usage = `Usage: node ${process.argv[1]} <projects-root> <project-name|id|folder> [--json] [--help]`;

if (wantsHelp && args.length === 1) {
  process.stdout.write(`${usage}\n`);
} else if (unknown.length || duplicateFlags || positional.length !== 2 || wantsHelp) {
  process.stderr.write(`${usage}\n`);
  process.exitCode = 2;
} else {
  const [projectsRoot, selector] = positional;
  try {
    const data = resolveProjectInRoot(projectsRoot, selector);
    const envelope = { ok: true, command: 'resolve', project: data.project, data: { projects_root: data.projects_root, selector: data.selector } };
    process.stdout.write(args.includes('--json')
      ? `${JSON.stringify(envelope)}\n`
      : `resolve: ${data.project.id}\n${data.project.root}\n`);
  } catch (error) {
    const known = error instanceof ProjectError;
    const kind = known ? error.kind : 'grammar';
    const envelope = {
      ok: false,
      command: 'resolve',
      project: null,
      errors: [{ code: known ? error.code : 'UNEXPECTED', path: known ? error.path : projectsRoot, message: error.message }],
    };
    process.stderr.write(`${JSON.stringify(envelope)}\n`);
    process.exitCode = kind === 'semantic' ? 1 : 2;
  }
}
