# Plan - Project Manager MCP App

## Goal

Deliver a read-only MCP App for Project Manager: a stdio MCP server under `src/mcp-app/`
that serves validated project facts as tools plus two `ui://` HTML views, a self-contained frontend
that renders an inline status card and a fullscreen board, and an Agent Plugins 1.0 package that
carries both the skill and the server configuration.

## Current Context

- `skills/project-manager/scripts/lib/project-state.js` is the transport-neutral fact source. It
  exports `loadProject`, `loadProjectIdentity`, `loadProjectCatalogRoot`, `kanbanData`, `statusData`,
  `nextData`, `coverageData`, and more. The CLI scripts are one-line `run(...)` wrappers over it.
- `skills/project-manager/scripts/lib/task-editor.js` exports `loadRevisionedProject(root, attempts,
  options)` returning `{ state, data, mutation_revision }`, where `data` is `kanbanData`. It also
  exports the write path (`checkTaskEdit`, `saveTaskEdit`) which this story must not reach.
- `src/project-manager-studio/server/project-catalog.ts` owns opaque project keys, per-read identity
  and realpath validation, and `decorate`. This is the security boundary for project selection.
- `src/project-manager-studio/shared/api.ts` defines `KanbanData` and friends as pure types.
- `src/project-manager-studio/server/cli.ts` shows the argument shape (`--project`,
  `--projects-root`) and the `buildCatalog` discovery logic to mirror. Its `--port` and browser
  lease are Studio-only and are not carried over.
- `scripts/build-project-manager-studio.mjs` bundles the Studio server with esbuild to a single CJS
  file with a `#!/usr/bin/env node` banner. `vite.project-manager.config.mts` builds the client into
  `skills/project-manager/studio/dist`.
- `tsconfig.json` `include` is currently scoped to `src/project-manager-studio/**` and must be
  widened.
- `package.json` has no MCP dependencies installed. `@modelcontextprotocol/sdk` and
  `@modelcontextprotocol/ext-apps` must be added, along with `vite-plugin-singlefile`.
- MCP Apps facts that constrain the build: resource mime type is `text/html;profile=mcp-app`; tool
  linkage is `_meta.ui.resourceUri`; app-only tools use `_meta.ui.visibility: ["app"]`; the default
  CSP is `default-src 'none'` with `connect-src 'none'`, so bundles must inline everything; hosts
  supply theme tokens and `availableDisplayModes` through `hostContext` on `ui/initialize`.

Known unknowns to confirm during Phase 1: the exact `registerAppTool` / `registerAppResource`
signatures and the `App` client surface in the installed `ext-apps` version, and whether
`viteSingleFile` needs one invocation per entry.

## Decisions

- **Read-only enforced at the call site, not by bundle content.** `loadRevisionedProject` lives in
  `task-editor.js` next to `saveTaskEdit`/`checkTaskEdit`, and `mutationRevision` lives in
  `mutations.js` next to `atomicProjectMutation`, so any revision-safe read necessarily bundles
  write code. Keep the revision-safe read — the agent writes while the app reads, so torn-snapshot
  protection is the point — and enforce read-only by asserting that no module under `src/mcp-app/`
  references `saveTaskEdit`, `checkTaskEdit`, `regenerateStatus`, or `atomicProjectMutation`, plus
  that no registered tool mutates. Rejected: dropping the retry loop to keep the bundle pure, which
  would trade a real protection for a cosmetic one.
- **Reuse `ProjectCatalog` by direct import** from `src/project-manager-studio/server/`. It is a
  server-side security boundary, not presentation; duplicating path validation would risk drift in
  the exact place drift is dangerous. Rejected: copying a read-only catalog into `src/mcp-app/`
  (drift risk), and relocating it to a new shared directory (churns Studio imports for no benefit
  this story). If a `core/` extraction happens later, this becomes a one-line path change.
- **No shared UI.** `src/mcp-app/client/` imports nothing from `src/project-manager-studio/client/`.
  The chat surface has different constraints (no address bar, inline height caps, host theme
  tokens), so shared components would be net negative. Types from `shared/api.ts` are imported;
  they are pure types with no runtime cost.
- **stdio is the only transport.** Corrected mid-implementation from an earlier dual-transport
  decision. Desktop hosts launch the server as a child process, so a network listener adds a port,
  a bind surface, and an Express dependency for no target that can use it: ChatGPT is the only host
  that needs Streamable HTTP, and it cannot read local project folders anyway. Rejected: keeping
  `--http` "in case", which is exactly the speculative fallback this plan rules out elsewhere.
- **Views load HTML from disk at runtime**, mirroring how Studio ships `studio/dist`, rather than
  inlining HTML into the server bundle. Keeps build order simple and dev iteration fast; the plugin
  package copies the skill directory wholesale regardless.
- **React for the frontend**, reusing the existing vite + `@vitejs/plugin-react` toolchain. Separate
  look and feel is a design decision, not a framework decision; a second toolchain would add cost
  without adding separation.
- **Two Vite invocations, one per entry**, so each view is independently single-file and the status
  card does not ship the board. Driven through Vite's JS API from one build script rather than the
  ext-apps quickstart's `INPUT` environment variable, which would need a cross-platform shell helper
  dependency to work on Windows.
- **Explicitly rejected**: feature flags or environment-gated fallbacks for hosts without MCP Apps
  support (they get the tool's text result), a compatibility layer over Studio's REST envelope, live
  refresh of any kind, and any write tool.
- **Plugin manifest conformance is checked structurally offline.** Fetching the published schema at
  test time would make the suite network-dependent; the test asserts required fields and documented
  constraints instead.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Install `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `zod`, and
      `vite-plugin-singlefile`, then record the resolved versions in `package.json`.
      Resolved: sdk 1.30.0, ext-apps 1.7.5.
- [x] Inspect the installed `@modelcontextprotocol/ext-apps/server` type declarations to confirm the
      exact `registerAppTool`, `registerAppResource`, and `RESOURCE_MIME_TYPE` signatures before
      writing server code.
- [x] Inspect the installed `@modelcontextprotocol/ext-apps` client declarations to confirm the
      `App` surface actually available for `connect`, tool results, `callServerTool`, host context,
      and display-mode requests.
- [x] Confirm `src/project-manager-studio/server/project-catalog.ts` can be imported from
      `src/mcp-app/` under the existing `tsconfig` module resolution and esbuild bundling.
- [x] Determine whether the Streamable HTTP path needs an Express host and CORS, or can mount on
      Node's `http` server directly, and add only the dependencies that path actually requires.
- [x] Record in this plan any signature that differs from the assumptions in Current Context, and
      adjust later phases before implementing against them.

**Phase 1 findings (three assumptions were wrong):**

- `registerAppResource(server, name, uri, config, readCallback)` takes the resource **name** as the
  second argument and the URI as the third. The published quickstart passes the URI twice, which
  works only because any string is a legal name.
- `App.ontoolresult` is **deprecated** in favor of `addEventListener("toolresult", handler)`.
- ext-apps ships a **React integration** (`@modelcontextprotocol/ext-apps/react`) with `useApp`,
  `useHostStyles`, `useAutoResize`, and `useDocumentTheme`. `useHostStyles` applies the host's style
  variables and theme to the document, so Phase 4 must use it rather than hand-rolling theme
  injection. App capabilities including `availableDisplayModes` are declared through
  `useApp({ capabilities })`.
- Confirmed as assumed: `RESOURCE_MIME_TYPE` is `text/html;profile=mcp-app`; app-only tools satisfy
  `McpUiAppToolConfig` with `_meta: { ui: { visibility: ["app"] } }` and no `resourceUri`.
- ext-apps sets `z.config({ jitless: true })` by default so Zod parsing works under a CSP without
  `unsafe-eval`; no CSP relaxation is needed.
- HTTP transport was investigated (`createMcpExpressApp` from
  `@modelcontextprotocol/sdk/server/express.js`) and then **removed by mid-implementation
  correction**. The server is stdio-only, so no Express host, no `cors`, and no port handling ship.

### Phase 2 - Server foundation

- [x] Widen `tsconfig.json` `include` to cover `src/mcp-app/**/*.ts` and `*.tsx` so the new tree is
      typechecked.
- [x] Create `src/mcp-app/server/projects.ts` exposing catalog construction from `--project` /
      `--projects-root` / `PROJECT_MANAGER_PROJECTS_ROOT`, mirroring `buildCatalog` in
      `src/project-manager-studio/server/cli.ts` and reusing `ProjectCatalog`.
- [x] Create `src/mcp-app/server/project-reads.ts` wrapping `loadRevisionedProject` (for its
      revision-safe retry against concurrent agent writes) and the `project-state` read functions
      behind `listProjects`, `getProject`, and `projectSummary`, each resolving its project through a
      server-issued opaque key and importing no mutation entry point.
- [x] Define the compact model-facing summary shape in `project-reads.ts` so tool text stays small
      and the full `KanbanData` never enters model context by default.

### Phase 3 - MCP server and UI resources

- [x] Create `src/mcp-app/server/server.ts` constructing the `McpServer` and registering
      `pm_project_status` and `pm_open_board` as model-facing tools with `_meta.ui.resourceUri`
      pointing at their respective `ui://` resources.
- [x] Register `pm_list_projects` and `pm_get_project` in `server.ts` with
      `_meta.ui.visibility: ["app"]` so the model never sees them and only the app can call them.
- [x] Register `ui://project-manager/status.html` and `ui://project-manager/board.html` as app
      resources served from the built HTML with the MCP Apps content type and no declared external
      origins.
- [x] Create `src/mcp-app/server/cli.ts` as the entry point: parse `--project` and
      `--projects-root`, reject unknown or duplicate arguments with the usage string on stderr, and
      connect `StdioServerTransport`, keeping stdout free for JSON-RPC framing.

### Phase 4 - Inline status card

- [x] Create `scripts/build-mcp-app-views.mjs` driving Vite's JS API with `vite-plugin-singlefile`
      once per entry into `skills/project-manager/mcp-app/`, plus the package script that runs it,
      so views are buildable and inspectable as they are written. Use the JS API rather than an
      env-var-selected config file so entry selection stays cross-platform with no shell helper.
- [x] Create `src/mcp-app/client/theme.css` mapping the host theme tokens documented for MCP Apps to
      local custom properties with explicit light and dark fallbacks.
- [x] Create `src/mcp-app/client/host.ts` wrapping the `App` client: connect, expose the initial tool
      result, expose `hostContext` including `availableDisplayModes`, expose `callServerTool`, and
      apply the host's supplied style variables to the document root.
- [x] Create `src/mcp-app/client/status/main.tsx` and `status.html` rendering at most five project
      metrics and at most two actions, auto-fitting content height with no nested scroll.
- [x] Declare `availableDisplayModes` of inline and fullscreen during initialize, and render the
      board control only when the host reports fullscreen support, requesting it via the display-mode
      request and handling a differing granted mode.

### Phase 5 - Fullscreen board

- [x] Create `src/mcp-app/client/board/main.tsx` and `board.html` rendering lanes and tasks from the
      app-only full payload, without floating panels, dialogs, or popovers.
- [x] Implement task detail as inline disclosure within the board layout so no floating panel is
      introduced, and keep the layout usable from narrow widths upward.
- [x] Fetch the full payload through `pm_get_project` on mount, showing a skeleton state while it
      resolves and a readable error state when it fails.

### Phase 6 - Build wiring and packaging

- [x] Create `scripts/build-mcp-app-server.mjs` bundling `src/mcp-app/server/cli.ts` with esbuild to
      `skills/project-manager/scripts/project-manager-mcp.js` with the Node shebang banner.
- [x] Create `scripts/build-agent-plugin.mjs` assembling `dist/agent-plugin/` with `plugin.json`,
      `mcp.json`, and a copy of the installable `skills/project-manager/` directory, excluding
      repository sources.
- [x] Author `plugin.json` with the Agent Plugins 1.0 `$schema` and `name`, and `mcp.json` declaring
      a `stdio` server whose `command` is the plugin-relative bundle path and whose `cwd` uses the
      plugin-root variable.
- [x] Wire the new builds into the existing `build` script and add `dist/` to `.gitignore` so the
      generated package is not committed.

### Phase 7 - Tests and verification

- [x] Add `tests/mcp-app/server.test.js` asserting tool registration, that app-only tools carry
      `visibility: ["app"]`, and that model-facing tools carry a `ui.resourceUri`.
- [x] Add `tests/mcp-app/resources.test.js` asserting both `ui://` resources resolve, use the MCP
      Apps content type, and contain no external origin references.
- [x] Add `tests/mcp-app/read-only.test.js` asserting no module under `src/mcp-app/` references
      `saveTaskEdit`, `checkTaskEdit`, `regenerateStatus`, or `atomicProjectMutation`, and that every
      registered tool is a read.
- [x] Add to `tests/mcp-app/read-only.test.js` an assertion that no module under
      `src/mcp-app/client/` imports from `src/project-manager-studio/client/`.
- [x] Add `tests/mcp-app/cli.test.js` asserting argument parsing, projects-root resolution from
      argument and environment, rejection of unknown, duplicate, and value-less arguments, and that
      no network listener is opened.
- [x] Add `tests/mcp-app/plugin-package.test.js` asserting the generated package layout and that
      `plugin.json` and `mcp.json` declare the standard's required fields and constraints.
- [x] Extend the `test:pm` script to include `tests/mcp-app/*.test.js` and run the full suite.
- [x] Run `npm run typecheck` and record the result.
- [x] Run `npm run build` and record that both bundles and both views are produced.
- [x] Run `npm test` and record the result.

### Phase 8 - Documentation and status

- [x] Add an MCP App section to `README.md` covering what it shows, the read-only boundary, and the
      supported hosts.
- [x] Document installation: the Agent Plugins package for supporting clients, and the manual
      `claude_desktop_config.json` entry for Claude Desktop, including how to set the projects root.
- [x] Add a `CHANGELOG.md` entry describing the MCP App.
- [x] Synchronize the complete installable `skills/project-manager/` directory to
      `~/.agents/skills/project-manager/` per repository instructions.
- [x] Record final evidence that each REQ acceptance criterion is satisfied.

**Verification evidence (all 13 acceptance criteria complete):**

| REQ criterion | Evidence |
| --- | --- |
| stdio CLI, clean stdout, clear argument errors | `cli.test.js` parses every stdout line as JSON-RPC and asserts usage on stderr with empty stdout for a bad launch |
| Compact model-facing tools, app-only payload tools | `server.test.js` tool listing, `visibility: ["app"]`, and a model-facing text result under 600 characters |
| Two `ui://` resources, MCP Apps mime, self-contained | `resources.test.js` (5 tests); build emits one 490 kB single-file document per view with no external `src`/`href` |
| Reads via the shared library through opaque keys | `project-reads.ts` calls `loadRevisionedProject` / `project-state`; `server.test.js` rejects empty, unknown, and path-shaped keys |
| No mutation | `read-only.test.js`: source scan for four mutation entry points, plus `TASKS.md` byte-identical after calling every registered tool |
| Inline display modes, no nested scroll, gated fullscreen | `host.ts` capabilities; stub-host run showed the board control present when fullscreen is offered and absent when it is not, and `ui/request-display-mode` granted |
| Fullscreen board, no floating panels, narrow widths | `board/main.tsx` uses native `<details>`; stub-host run at 420 px showed lanes stacked and detail disclosed in place |
| Host tokens with fallback, light and dark | Stub-host run with host tokens (light) and with no host tokens at all (dark fallback) both legible |
| No Studio client import; Studio unchanged | `read-only.test.js` import assertion; 155 pre-existing tests pass unchanged |
| Agent Plugins 1.0 package | `plugin-package.test.js` (6 tests) over generated `dist/agent-plugin/` |
| Configurable projects location | `cli.test.js` argument, environment, and default resolution, plus an error naming the attempted path; README section |
| Automated coverage | 30 tests across 5 files in `tests/mcp-app/` |
| Typecheck, suite, build, docs | `npm run typecheck` exit 0; `npm test` 185/185; `npm run build` emits both bundles, both views, and the plugin package; README and CHANGELOG updated |

## Validation

- `npm run typecheck` - passes with `src/mcp-app/**` included in the program.
- `npm test` - runs build plus `skills/project-manager/tests/project-manager.test.js`,
  `tests/project-manager-studio/*.test.js`, and the new `tests/mcp-app/*.test.js`; all pass, with
  Studio tests unchanged in behavior.
- `npm run build` - produces `skills/project-manager/scripts/project-manager-mcp.js`,
  `skills/project-manager/mcp-app/status.html`, `skills/project-manager/mcp-app/board.html`, and the
  existing Studio artifacts.
- An in-process MCP client connected to the server over an in-memory transport lists exactly the
  model-facing tools and omits the app-only tools, and `node
  skills/project-manager/scripts/project-manager-mcp.js --projects-root <demo>` completes an
  initialize exchange over stdio without opening a socket.
- A `resources/read` of each `ui://` URI returns HTML with mime type `text/html;profile=mcp-app` and
  no external origin references.
- `.docs/tests/test-mcp-app.md` scenarios executed against the built server and views.

## Rollback / Risk

- **Host rendering risk.** With stdio as the only transport, the targets are Claude Desktop and
  Codex. Claude Desktop is the only one confirmed to render MCP Apps UI; Codex Desktop reportedly
  does not (openai/codex#21019). ChatGPT is excluded by the stdio-only decision, which is not a
  regression: it cannot read local project folders in the hosted form it requires. The text-summary
  result is the designed degradation, and tool behavior is verified independently of any host, so
  the server is useful wherever views are not rendered.
- **Third-party API drift.** `ext-apps` is young. Phase 1 confirms signatures against the installed
  declarations before implementation rather than against documentation.
- **Cross-directory import.** `src/mcp-app/` depending on Studio's `project-catalog.ts` couples the
  two trees. Contained to one import and recorded above; a later `core/` extraction relocates it.
- **Projects-root discovery.** A host launching the server with an unrelated working directory is
  the most likely install failure and the hardest for users to diagnose. Mitigated by an explicit
  argument, an environment variable, and a clear startup error naming the resolved path.
- **Rollback.** All work is additive: a new `src/mcp-app/` tree, new build scripts, new tests, new
  package outputs, plus a widened `tsconfig` include and new dependencies. Reverting the commit
  removes the MCP App and leaves Studio, the skill, and the CLI untouched.
