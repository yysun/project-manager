/* Shared MCP App tests: builds a fixture project catalog and connects a real MCP
   client to the packaged server over an in-memory transport, so tool visibility
   and resource contents are observed through the protocol rather than internals. */
'use strict';
const path = require('node:path');
const { makeProject } = require('../project-manager-studio/_helpers');

const builtServerPath = path.resolve(__dirname, '../../skills/project-manager/scripts/project-manager-mcp.js');
const viewDir = path.resolve(__dirname, '../../skills/project-manager/mcp-app');

/**
 * Connect an MCP client to the packaged server.
 *
 * By default a fresh fixture project is configured at launch. Pass
 * `{ configured: false }` for the unconfigured case, where the agent is expected
 * to select a project folder per call, or `{ projectsRoot }` to confine selection.
 */
async function connect({ projectRoot = null, projectsRoot = null, configured = true } = {}) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { buildCatalog, createServer } = require(builtServerPath);

  const root = projectRoot ?? makeProject();
  const selection = projectsRoot ? { projectsRoot } : configured ? { project: root } : {};
  // An empty environment keeps an ambient PROJECT_MANAGER_PROJECTS_ROOT from
  // turning the unconfigured case into a configured one.
  const { catalog, confinement } = buildCatalog(selection, {});
  const server = createServer({ catalog, confinement, viewDir });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: 'mcp-app-test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    catalog,
    confinement,
    root,
    close: async () => { await client.close().catch(() => {}); await server.close().catch(() => {}); },
  };
}

/** First text block of a tool result. */
function text(result) {
  return (result.content ?? []).filter((item) => item.type === 'text').map((item) => item.text).join('\n');
}

module.exports = { builtServerPath, viewDir, connect, text, makeProject };
