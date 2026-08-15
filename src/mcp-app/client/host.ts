// MCP App host boundary: connect to the host, adopt its style tokens, receive
// the initial tool result, call app-only tools for the full payload, and
// negotiate display mode. This is the only module that knows about the host
// protocol, so views stay ordinary React.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import type { KanbanData, ProjectCatalogData } from '../../project-manager-studio/shared/api.js';
import type { ProjectSummary } from '../server/project-reads.js';

const APP_INFO = { name: 'Project Manager', version: '1.0.0' };
// Inline and fullscreen only. Picture-in-picture would need change polling to
// stay honest while pinned, which this read-only app deliberately does not do.
const DISPLAY_MODES = ['inline', 'fullscreen'] as const;

export type DisplayMode = (typeof DISPLAY_MODES)[number];

export interface HostState {
  app: App | null;
  isConnected: boolean;
  error: Error | null;
  summary: ProjectSummary | null;
  canFullscreen: boolean;
}

/** Connect to the host and surface the initial tool result as a project summary. */
export function useProjectHost(): HostState {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const { app, isConnected, error } = useApp({
    appInfo: APP_INFO,
    capabilities: { availableDisplayModes: [...DISPLAY_MODES] },
    // Registered before connect so the initial tool result cannot be missed.
    onAppCreated: (created) => {
      created.addEventListener('toolresult', (params) => {
        const structured = (params as { structuredContent?: unknown }).structuredContent;
        if (structured && typeof structured === 'object' && 'projectKey' in structured) setSummary(structured as ProjectSummary);
      });
    },
  });

  useHostStyles(app);

  // availableDisplayModes is a host capability fixed at initialize, so reading it
  // per render is safe. The live displayMode is deliberately not surfaced: it
  // changes via host-context-changed, which would not re-render this hook.
  const context = app && isConnected ? app.getHostContext() : undefined;
  return {
    app, isConnected, error, summary,
    canFullscreen: (context?.availableDisplayModes ?? []).includes('fullscreen'),
  };
}

/** Request a display mode, tolerating a host that grants a different one. */
export function useDisplayMode(app: App | null) {
  return useCallback(async (mode: DisplayMode): Promise<string | null> => {
    if (!app) return null;
    const available = app.getHostContext()?.availableDisplayModes ?? [];
    if (!available.includes(mode)) return null;
    try {
      const result = await app.requestDisplayMode({ mode });
      return result.mode;
    } catch { return null; }
  }, [app]);
}

type Payload<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

/** Call an app-only tool once the host connection is live. */
function useAppTool<T>(app: App | null, isConnected: boolean, name: string, args: Record<string, unknown> | null): Payload<T> {
  const [state, setState] = useState<Payload<T>>({ status: 'loading' });
  const requestKey = args === null ? null : `${name}:${JSON.stringify(args)}`;
  const latest = useRef(0);

  useEffect(() => {
    if (!app || !isConnected || requestKey === null || args === null) return;
    const request = latest.current + 1;
    latest.current = request;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const result = await app.callServerTool({ name, arguments: args });
        if (latest.current !== request) return;
        if (result.isError) throw new Error(result.content?.find((item) => item.type === 'text')?.text ?? 'The request failed.');
        setState({ status: 'ready', data: result.structuredContent as T });
      } catch (error) {
        if (latest.current !== request) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'The request failed.' });
      }
    })();
    // args is intentionally not a dependency: it is captured through requestKey,
    // so an unstable object identity cannot drive a re-request loop.
  }, [app, isConnected, requestKey]);

  return state;
}

/** Full project payload for one server-issued key. */
export function useProject(app: App | null, isConnected: boolean, projectKey: string | null): Payload<KanbanData> {
  return useAppTool<KanbanData>(app, isConnected, 'pm_get_project', projectKey ? { projectKey } : null);
}

/** Catalog of every project this server was started with. */
export function useProjects(app: App | null, isConnected: boolean): Payload<ProjectCatalogData> {
  return useAppTool<ProjectCatalogData>(app, isConnected, 'pm_list_projects', {});
}
