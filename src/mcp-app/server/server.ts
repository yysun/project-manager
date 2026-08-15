// Read-only MCP App server for Project Manager: two model-facing tools that
// return compact summaries and link a ui:// view, two app-only tools carrying the
// full payload that the host withholds from the model, and the self-contained
// HTML resources for the inline status card and the fullscreen board.
import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import type { ProjectCatalog } from '../../project-manager-studio/server/project-catalog.js';
import { getProject, listProjects, projectSummary, resolveProjectKey, summaryText } from './project-reads.js';

export const STATUS_URI = 'ui://project-manager/status.html';
export const BOARD_URI = 'ui://project-manager/board.html';

/** Views are built by vite into the packaged skill; the server only reads them.
 *  Resolved relative to the bundled server at `skills/project-manager/scripts/`,
 *  which is the only form that ships. Tests pass `viewDir` explicitly. */
export const DEFAULT_VIEW_DIR = path.resolve(__dirname, '..', 'mcp-app');

export interface McpAppServerOptions {
  catalog: ProjectCatalog;
  viewDir?: string;
}

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> };
}

function failure(error: unknown): CallToolResult {
  const code = error && typeof error === 'object' && 'code' in error ? `${String((error as { code: unknown }).code)}: ` : '';
  return { content: [{ type: 'text', text: `${code}${error instanceof Error ? error.message : String(error)}` }], isError: true };
}

export function createServer(options: McpAppServerOptions): McpServer {
  const { catalog } = options;
  const viewDir = options.viewDir ?? DEFAULT_VIEW_DIR;
  const server = new McpServer({ name: 'Project Manager', version: '1.0.0' });

  // Each tool declares its view at registration, which is where the MCP Apps
  // extension defines the association; the result carries facts only.
  const summaryTool = async ({ project }: { project?: string }): Promise<CallToolResult> => {
    try {
      const summary = projectSummary(catalog, resolveProjectKey(catalog, project));
      // The compact summary is what reaches model context; the view pulls the
      // full payload itself through the app-only tool below.
      return { content: [{ type: 'text', text: summaryText(summary) }], structuredContent: summary as unknown as Record<string, unknown> };
    } catch (error) { return failure(error); }
  };

  registerAppTool(server, 'pm_project_status', {
    title: 'Project status',
    description: 'Show a compact status card for a Project Manager project: task counts, blocked work, verified success criteria, owner gaps, target date, and next tasks. Read-only.',
    inputSchema: { project: z.string().optional().describe('Project ID or name. Defaults to the first project.') },
    _meta: { ui: { resourceUri: STATUS_URI } },
  }, summaryTool);

  registerAppTool(server, 'pm_open_board', {
    title: 'Open project board',
    description: 'Open the full Project Manager board showing every lane and task for a project. Read-only.',
    inputSchema: { project: z.string().optional().describe('Project ID or name. Defaults to the first project.') },
    _meta: { ui: { resourceUri: BOARD_URI } },
  }, summaryTool);

  registerAppTool(server, 'pm_list_projects', {
    title: 'List projects',
    description: 'App-only. Every project this server was started with, as opaque keys.',
    inputSchema: {},
    _meta: { ui: { visibility: ['app'] } },
  }, async (): Promise<CallToolResult> => {
    try { return json(listProjects(catalog)); } catch (error) { return failure(error); }
  });

  registerAppTool(server, 'pm_get_project', {
    title: 'Get project payload',
    description: 'App-only. The full validated project projection for one server-issued project key.',
    inputSchema: { projectKey: z.string().describe('A server-issued opaque project key.') },
    _meta: { ui: { visibility: ['app'] } },
  }, async ({ projectKey }): Promise<CallToolResult> => {
    try { return json(getProject(catalog, projectKey)); } catch (error) { return failure(error); }
  });

  const view = (name: string, uri: string, file: string, description: string) => registerAppResource(
    server, name, uri, { mimeType: RESOURCE_MIME_TYPE, description },
    async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await fs.readFile(path.join(viewDir, file), 'utf-8') }] }),
  );

  view('Project status card', STATUS_URI, 'status.html', 'Inline Project Manager status card');
  view('Project board', BOARD_URI, 'board.html', 'Fullscreen Project Manager board');

  return server;
}
