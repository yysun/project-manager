// Packaged MCP App entry point: argument parsing, project discovery, and a stdio
// transport. Desktop hosts launch this as a child process, so there is no
// listener, no port, and no bind surface. stdout carries JSON-RPC framing only;
// every diagnostic goes to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildCatalog, PROJECTS_ROOT_ENV } from './projects.js';
import { createServer } from './server.js';

export { createServer } from './server.js';
export { buildCatalog, projectsRootRequested, resolveProjectsRoot } from './projects.js';

const USAGE = `Usage: project-manager-mcp.js [--project <folder>] [--projects-root <folder>]\n\nThe projects root may also be set with ${PROJECTS_ROOT_ENV}.`;

export interface McpAppArgs { project?: string; projectsRoot?: string }

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a folder value. ${USAGE}`);
  return value;
}

export function parseArgs(argv: string[]): McpAppArgs {
  let project: string | undefined; let projectsRoot: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project' && project === undefined) project = valueAfter(argv, index++, arg);
    else if (arg === '--projects-root' && projectsRoot === undefined) projectsRoot = valueAfter(argv, index++, arg);
    else throw new Error(`Unknown or duplicate argument: ${arg}. ${USAGE}`);
  }
  return { project, projectsRoot };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  // Built before connecting so an explicitly requested projects root that cannot
  // be used fails at startup, where a host surfaces it clearly, rather than on
  // the first tool call. With no configuration the catalog is simply empty and
  // the agent selects a folder per call.
  const { catalog, confinement } = buildCatalog(args);
  const server = createServer({ catalog, confinement });
  await server.connect(new StdioServerTransport());
  return { server };
}

if (require.main === module) {
  main().catch((error) => {
    const code = error && typeof error === 'object' && 'code' in error ? `${String(error.code)}: ` : '';
    console.error(`${code}${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
