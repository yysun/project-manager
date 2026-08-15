# Plan - MCP App Project Selection

## Goal

Let the agent pass a project folder to the MCP App's model-facing tools, resolved at call time with
the same validation configured projects get, so the server starts with no arguments and no path is
hardcoded into host configuration. Keep the opaque key as the only handle the view ever sees, and
keep a configured projects root working as opt-in confinement.

## Current Context

- `src/mcp-app/server/projects.ts` builds the catalog at launch and throws `PROJECTS_ROOT_UNAVAILABLE`
  when nothing is found, so the server cannot start unconfigured.
- `src/mcp-app/server/project-reads.ts` exposes `resolveProjectKey(catalog, projectId)`, which matches
  only an ID or name already in the catalog.
- `src/mcp-app/server/cli.ts` calls `buildCatalog` before connecting, making an absent projects root a
  startup failure.
- `src/project-manager-studio/server/project-catalog.ts` owns key minting and `validateEntry`
  (lstat, symlink rejection, realpath canonicality, `loadProjectIdentity` match). Entries are fixed at
  construction and an empty seed list throws `PROJECTS_ROOT_EMPTY`.
- `ProjectCatalogData.initial_project_key` is typed `string`, and Studio's client reads it, so making
  it nullable would ripple out of the additive-change boundary.
- `skills/project-manager/scripts/lib/cli.js` requires exactly one positional `<project-folder>`, and
  `SKILL.md:51` tells the agent to resolve it with `realpath`. That is the model being adopted here.
- Existing E2E spec `.docs/tests/test-mcp-app.md` Scenario 3 asserts that a launch with no projects
  root fails; that assertion becomes wrong and must be corrected.

Known unknowns to confirm in Phase 1: whether any Studio call site depends on `ProjectCatalog`
throwing for an empty seed list, and whether Studio reads `initialKey` directly or only through
`data()`.

## Decisions

- **Extend `ProjectCatalog`, do not fork it.** Add an opt-in `allowEmpty` construction option and a
  `register(root)` method that reuses the existing validation and key minting. Studio's call sites
  pass no options and never call `register`, so its behavior is unchanged. Rejected: an MCP-app-owned
  registry duplicating the symlink, realpath, and identity checks — that is drift risk in the exact
  code where drift is dangerous.
- **An empty catalog reports an empty-string initial key** rather than `null`, keeping
  `ProjectCatalogData.initial_project_key` typed `string` so no Studio type or client changes. The MCP
  app treats the empty string as "no configured project".
- **Confinement lives in the MCP app, not in `ProjectCatalog`.** The catalog validates and mints; the
  MCP app decides whether an ad-hoc path is inside a configured projects root. Studio's class does not
  learn a concept it has no use for.
- **Resolution order is ID or name first, then path.** IDs are short tokens and are the intended
  primary selector when a root is configured; anything unmatched is treated as a folder. Deterministic
  and documented in the tool description rather than guessed from string shape.
- **Explicit misconfiguration still fails; implicit absence does not.** An unusable `--projects-root`
  or `PROJECT_MANAGER_PROJECTS_ROOT` remains a startup error, because the user asked for something
  specific. A missing `.projects` default becomes an empty catalog, because nobody asked for it.
- **Explicitly rejected**: filesystem scanning, working-directory walk-up, a user-level workspace
  registry, MCP `roots` (deprecated in revision 2026-07-28 and never an access boundary), and a
  separate permission flag for arbitrary paths.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Grep Studio's server, client, and tests for `initialKey`, `PROJECTS_ROOT_EMPTY`, and
      `initial_project_key` to confirm no call site depends on empty-seed construction throwing.
- [x] Confirm `ProjectCatalogData.initial_project_key` is consumed only as an opaque string, so an
      empty-string value cannot break Studio's selection path.
- [x] Record any finding that contradicts the Decisions above and adjust later phases before coding.

**Phase 1 findings (Decisions confirmed, one detail added):**

- `initialKey` is read only in `project-watcher.test.js:77` and `studio-server.test.js:71`, both on
  non-empty catalogs. Nothing depends on empty-seed construction throwing.
- `initial_project_key` is consumed purely as an opaque string in `App.tsx:82` and the Studio tests,
  so an empty-string value for an empty catalog cannot break selection or types.
- **New detail:** `PROJECTS_ROOT_EMPTY` is raised by *two* places — `loadProjectsRoot` in
  `project-state.js` and the `ProjectCatalog` constructor. Studio's `--projects-root <empty>` failure
  asserted in `studio-server.test.js:359` comes from `loadProjectCatalogRoot`, before the catalog is
  ever constructed. So `buildCatalog` must distinguish an *explicitly requested* root, where any load
  failure stays fatal, from the implicit `.projects` default, where absence or emptiness must yield an
  empty catalog. Phase 3 already carries this; recorded here because the two error sources make it
  easy to catch the wrong one.

### Phase 2 - Shared catalog extension

- [x] Add an optional `{ allowEmpty?: boolean }` third constructor argument to `ProjectCatalog` that
      permits a zero-entry catalog, leaving the existing throw in place when it is not passed.
- [x] Make `initialKey` an empty string for an allow-empty catalog with no entries, keeping the
      declared type `string`.
- [x] Add `ProjectCatalog.register(root)` that canonicalizes the root, runs the existing entry
      validation, returns the existing entry when that root is already registered, and otherwise mints
      and stores a new keyed entry. Validation must run *before* an entry is stored, and its errors
      must name the rejected path rather than an entry name, because an ad-hoc path has no name yet —
      unlike `validateEntry`, whose `stale()` messages identify a configured project by name.
- [x] Confirm `decorate` and `resolve` work unchanged for a registered entry.

### Phase 3 - MCP App selection

- [x] Change `buildCatalog` in `src/mcp-app/server/projects.ts` to return an allow-empty catalog when
      no projects root was explicitly requested and the default is absent, while still throwing for an
      explicitly requested root that cannot be used.
- [x] Export the configured projects root, if any, from `buildCatalog` so the MCP app can enforce
      confinement without re-deriving it.
- [x] Replace `resolveProjectKey` in `project-reads.ts` with resolution that tries ID or name first,
      then treats the value as a folder path, registering it through `ProjectCatalog.register`.
- [x] Refuse a folder path outside the configured projects root when one is configured, with an error
      naming the rejected path and the configured root.
- [x] Report a clear error when no project argument is supplied and the catalog is empty, telling the
      caller to pass a project folder.

### Phase 4 - Tool contract and entry point

- [x] Update the `project` input description on `pm_project_status` and `pm_open_board` to state that
      a project folder path or an ID/name is accepted, so the agent supplies one without out-of-band
      instruction.
- [x] Update the tool descriptions so the model knows the folder is the normal way to select a
      project, matching how the skill drives the CLI.
- [x] Confirm `src/mcp-app/server/cli.ts` starts and connects with no arguments once `buildCatalog`
      tolerates an absent default.

### Phase 5 - Tests

- [x] Add `tests/mcp-app/selection.test.js` covering: no-argument launch serving tools; selection by
      folder path; selection by ID; the same root yielding a stable key across calls.
- [x] Extend `tests/mcp-app/selection.test.js` with rejection cases: missing path, symlinked path,
      real directory that is not a project, and a path outside a configured projects root.
- [x] Assert in `tests/mcp-app/selection.test.js` that app-only tools still refuse a filesystem path
      and accept only issued keys.
- [x] Add a Studio regression assertion in `tests/mcp-app/selection.test.js` that constructing
      `ProjectCatalog` without the allow-empty option still throws for an empty seed list.
- [x] Update `tests/mcp-app/cli.test.js` so the unusable-root case covers an explicitly requested root
      only, and add a case proving an absent default no longer fails startup.

### Phase 6 - Specs, docs, and status

- [x] Create `.docs/tests/test-mcp-app-project-selection.md` with Given/When/Then scenarios for
      agent-supplied paths, ID selection, rejection, confinement, key stability, and the view boundary.
- [x] Correct `.docs/tests/test-mcp-app.md` Scenario 3, whose assertion that an absent projects root
      fails at launch is no longer true.
- [x] Update the README MCP App section so the Claude Desktop example needs no projects path and the
      arguments are described as optional confinement.
- [x] Add a `CHANGELOG.md` entry under Unreleased describing agent-supplied project selection.
- [x] Run `npm run typecheck` and record the result, confirming Studio's types are untouched.
- [x] Run `npm run build` and record that the MCP server bundle, both views, and the Agent Plugins
      package are emitted.
- [x] Run `npm test` and record the result, confirming the pre-existing Studio and skill tests still
      pass alongside the new ones.
- [x] Execute `.docs/tests/test-mcp-app-project-selection.md` and record the outcome per scenario.
- [x] Synchronize the complete installable `skills/project-manager/` directory to
      `~/.agents/skills/project-manager/` per repository instructions.
- [x] Record final evidence that each REQ acceptance criterion is satisfied.

## Validation

- `npm run typecheck` — passes, including Studio, whose types must be untouched.
- `npm test` — the full suite passes; the 185 tests that passed before this story still pass, with
  Studio's `studio-server` and catalog tests unchanged.
- `npm run build` — emits the MCP server bundle, both views, and the Agent Plugins package.
- `node skills/project-manager/scripts/project-manager-mcp.js` with no arguments completes an MCP
  initialize exchange over stdio instead of exiting non-zero.
- An in-process MCP client calls `pm_project_status` with a fixture folder path and receives that
  project's summary, then calls `pm_get_project` with the returned key and receives the full payload.
- `.docs/tests/test-mcp-app-project-selection.md` scenarios executed against the built server.

## Rollback / Risk

- **Widened reach in hosts without other filesystem access.** In Codex the agent already invokes the
  CLI with arbitrary folders, so this grants nothing new. In Claude Desktop, where the user may have
  connected no filesystem tool, the server becomes able to read any Project Manager project on disk.
  It remains narrow — only directories that parse as a project are read, never arbitrary files — and a
  configured projects root confines it. This is a deliberate, documented consequence of matching the
  CLI's model, not an oversight.
- **Shared class change.** `ProjectCatalog` is Studio's. The change is additive and opt-in, and
  Phase 1 verifies no Studio call site depends on the behavior being relaxed; Studio's own tests are
  the regression net.
- **Selection ambiguity.** An ID that is also a directory name resolves as the ID. Deterministic and
  documented; the alternative orderings have equally arbitrary edge cases.
- **Rollback.** Reverting the commit restores launch-time configuration. No state, schema, or
  packaging format changes, so there is nothing to migrate back.

**Verification evidence (all 12 acceptance criteria complete):**

| REQ criterion | Evidence |
| --- | --- |
| Starts unconfigured | Launched the packaged bundle with no arguments in a directory with no `.projects`: initialize completed, `tools/list` returned, stderr empty, exit 0. Also `cli.test.js` "an absent implicit default yields an empty catalog" |
| Folder path selection | `selection.test.js` "a project folder path selects a project on an unconfigured server" |
| ID and name selection | `selection.test.js` "a configured project is still selectable by ID and by name" (ID, lowercase ID, and name) |
| Unusable path refused, naming it | `selection.test.js` "an unusable folder is refused with the rejected path named" — missing, symlinked, and non-project cases |
| Confinement | `selection.test.js` "a configured projects root confines selection to projects inside it" — outside refused naming both paths, inside succeeds |
| View is key-only | `selection.test.js` "app-only tools take issued keys only, never a filesystem path" |
| Key stability | `selection.test.js` "selecting the same folder twice yields the same key", including a non-canonical spelling |
| Tool descriptions guide the agent | `server.ts` `PROJECT_ARGUMENT` and both tool descriptions; observed in the no-argument `tools/list` output |
| Arguments still work, docs carry no hardcoded path | `cli.test.js` argument and environment cases; README Claude Desktop block now has no projects path |
| Studio unchanged, change additive | `selection.test.js` "Studio still rejects an empty catalog unless a caller opts in" against Studio's own bundle; all pre-existing Studio tests pass |
| Test coverage | 11 tests in `selection.test.js` plus updated `cli.test.js` and `server.test.js` |
| Typecheck, suite, build | `npm run typecheck` exit 0; `npm test` 197/197; `npm run build` emits both bundles, both views, and the plugin package |

Note: one intermittent failure of the Studio SSE watcher test appeared in a single full-suite run and
did not reproduce in four subsequent full-suite runs, three isolated runs, or three runs against the
pre-change baseline. Treated as a pre-existing timing flake surfaced by added parallel load, not a
regression from this story.
