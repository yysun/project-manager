# Studio Project Selection Plan

## Goal

Make one Project Manager Studio process a safe operating surface for all valid direct-child projects under a configured root, with `.projects` as the default root and explicit single-project launch preserved.

## Current Context

- `src/project-manager-studio/server/cli.ts` currently requires `--project`, validates it before listen, and passes one immutable `projectRoot` to the server.
- `src/project-manager-studio/server/server.ts` closes every read and mutation over that one root and intentionally exposes no arbitrary-path API.
- `src/project-manager-studio/client/App.tsx` loads only `/api/project`; its filters, open dialog, and Timeline draft state assume one project for the process lifetime.
- `src/project-manager-studio/shared/api.ts` has no project-list or selection contract.
- `skills/project-manager/scripts/lib/project-state.js` validates one project and separately supports explicit `PROJECTS.md` indexes, but it has no safe direct-child projects-root discovery operation.
- Existing Studio server tests exercise session security, mutation isolation, packaged launch, root replacement, and browser-launch failure. The build writes the packaged server bundle and client assets under `skills/project-manager/`.

## Decisions

- Add a projects-root discovery function that accepts one real directory, inspects direct children only, rejects symlink entries, validates each candidate as a project, sorts deterministically, and rejects duplicate project IDs. Invalid child directories fail discovery with `PROJECT_CATALOG_INVALID` because silently omitting broken projects would make the selector untrustworthy. Missing, non-directory/symlinked, empty, and duplicate-identity catalogs use distinct `PROJECTS_ROOT_MISSING`, `PROJECTS_ROOT_INVALID`, `PROJECTS_ROOT_EMPTY`, and `PROJECT_ID_DUPLICATE` errors.
- Build an immutable server catalog at startup. Give each entry a random server-issued opaque key bound to one canonical direct-child path and initial project ID. Startup rejects duplicate IDs across the catalog. Before each project read or mutation, revalidate only the selected entry's real non-symlink canonical path and project ID; an unrelated stale sibling invalidates its own key and catalog refresh, but cannot falsify the result of a healthy project's committed save. Removal, rename, symlink conversion, or ID drift makes the affected key invalid with `PROJECT_SELECTION_STALE` until Studio restarts. A legitimate atomic save or external same-ID real-directory replacement at the same authorized child path remains the same catalog slot; inode identity is deliberately not part of project identity.
- Keep project selection in browser-tab state, not mutable process-global state. `GET /api/projects` returns the immutable options and initial key; `GET /api/project?project=<opaque-key>` loads that exact catalog entry. Every task check/save body carries the same server-issued `projectKey`, and the server rejects missing, unknown, path-stale, symlinked, or ID-drifted keys before loading or mutating state. Two tabs can therefore select and edit different allowed projects independently.
- Add a client request generation and selected-key guard. The selector remains available while reads or mutations are pending. Switching increments the generation, clears project-scoped UI state and pending indicators, and ignores any late refresh or mutation response or completion whose generation or returned project key no longer matches. Key the Timeline subtree by project key so schedule drafts cannot survive a switch.
- CLI modes are explicit: `--project <folder>` creates a one-project allowlist; `--projects-root <folder>` discovers selectable direct children; no selector defaults to `path.resolve('.projects')`. Combining both requires the explicit project to be a validated direct child of the explicit root and uses it as the initial selection.
- Preserve existing endpoint paths while making the selection identity explicit: add `/api/projects`, require the opaque key on `/api/project`, and extend task request bodies with `projectKey`. No endpoint accepts a filesystem path.
- Clear client filters, dialogs, errors, and other project-scoped transient state when a switch starts. Preserve only the Kanban/Timeline view choice because it is Studio navigation, not project data.
- Allocate a unique same-filesystem `.project-manager-work-<24-hex>` root per mutation or dry-run check. Each root carries an exact marker and cannot alias the selected project; cleanup touches only that operation's root. Projects-root discovery ignores marker-valid roots and the narrow pre-marker interruption shape, while a valid project with a colliding-looking basename still wins through `PROJECT.md`. Unsafe markers, symlinks, and case aliases fail closed, so interrupted recovery artifacts cannot poison the next Studio catalog.
- Reject fallback to `projects`, recursive search, `PROJECTS.md` authority, browser folder pickers, environment variables, and persisted last-selection state.

## Phased Tasks

### Phase 1 - Discovery and contract foundation

- [x] Add direct-child projects-root discovery to `skills/project-manager/scripts/lib/project-state.js` with real-directory, symlink, invalid-child, duplicate-ID, and deterministic-order checks.
- [x] Extend `src/project-manager-studio/shared/api.ts` with project option, catalog response, key-bound project projection, and task request types that contain opaque keys rather than client-provided paths.
- [x] Update `src/project-manager-studio/server/cli.ts` argument parsing for `--projects-root`, the `.projects` default, explicit-single-project mode, combined-mode direct-child containment, missing/duplicate selector values, and clear usage errors.

### Phase 2 - Server selection boundary

- [x] Add `src/project-manager-studio/server/project-catalog.ts` as the server-owned catalog boundary for random opaque keys, canonical direct-child paths, startup duplicate-ID validation, and selected-entry path/ID revalidation while preserving the session-token middleware and static asset boundary.
- [x] Implement authenticated `GET /api/projects` and key-bound `GET /api/project` routes without process-global selected-project state.
- [x] Bind task checks to the request's required `projectKey`; resolve and revalidate task saves inside the serialized save callback immediately before `saveTaskEdit`, rejecting unknown, path-stale, symlinked, or ID-drifted entries without accepting filesystem paths.
- [x] Preserve explicit `PROJECTS_ROOT_MISSING`, `PROJECTS_ROOT_INVALID`, `PROJECTS_ROOT_EMPTY`, `PROJECT_CATALOG_INVALID`, `PROJECT_ID_DUPLICATE`, and stale-selection errors without changing the selected state of any browser tab.
- [x] Move mutation/check scratch directories into unique marker-bound `.project-manager-work-<24-hex>` roots, prevent target aliasing, and make direct-child discovery recognize only the reserved recovery shape so interrupted work cannot become a malformed project candidate.

### Phase 3 - Studio selector UX

- [x] Update `src/project-manager-studio/client/App.tsx` to load the catalog, render an accessible project selector in the header, and switch by loading the chosen opaque key.
- [x] Reset project-scoped filters, task dialogs, errors, and Timeline component state when a switch starts, retain the current Kanban/Timeline view, and ignore late read/save responses using request-generation and returned-key guards.
- [x] Update `src/project-manager-studio/client/styles.css` so the selector fits desktop and responsive headers without weakening existing focus treatment.

### Phase 4 - Tests and packaged artifacts

- [x] Extend `skills/project-manager/tests/project-manager.test.js` with direct-child discovery coverage for ordering, invalid roots/children, symlinks, and duplicate identities.
- [x] Extend `tests/project-manager-studio/_helpers.js` and `tests/project-manager-studio/studio-server.test.js` with default `.projects`, explicit-single-project, multi-project per-request selection, stale/unknown key, auth, mutation-target, same-ID replacement, and containment assertions.
- [x] Add combined CLI-mode tests for a valid initial direct child and for outside, nested, symlinked, missing-value, and duplicate-argument rejection.
- [x] Add `src/project-manager-studio/client/selection-guard.mjs` plus `selection-guard.d.mts` as the pure request-generation/selected-key seam, integrate it in `App.tsx` for loads and mutation callbacks, and cover switch/reset plus delayed old-project refresh/save rejection in `tests/project-manager-studio/selection-guard.test.js` with `node:test` and no DOM dependency.
- [x] Run `npm run typecheck`, `npm run build`, and `npm run test:pm`; retain the generated packaged server bundle and client assets only when all commands pass.
- [x] Create `tests/project-manager-studio/create-selection-browser-fixture.js` to print one JSON object containing absolute `workspace`, `projectsRoot`, `alpha`, `beta`, and `outside` paths for a disposable fixture; launch the built runtime with the exact command in Validation, execute Scenarios 1-3 in the in-app browser, and combine those observations with `selection-guard.test.js` for delayed-response assertions and built-server mutation-isolation evidence.

### Phase 5 - Documentation and status

- [x] Update `skills/project-manager/SKILL.md`, `skills/project-manager/references/init.md`, and `skills/project-manager/references/conventions.md` to name `.projects` as the default container, document default/explicit-project/explicit-root/combined Studio launches, and state the Studio-only exception to ordinary explicit-folder commands.
- [x] Confirm no `projects` fallback, recursive discovery, arbitrary-path selection, environment variable, feature flag, or `PROJECTS.md` dependency was introduced.
- [x] Mark every plan task complete only after its change or recorded verification evidence exists.

## Validation

- `npm run typecheck` must exit 0 with the shared API, server, and React client changes.
- `npm run build` must exit 0 and regenerate both `skills/project-manager/scripts/project-manager-studio.js` and `skills/project-manager/studio/dist`.
- `npm run test:pm` must exit 0, including project-root discovery and built-server switching/isolation tests.
- From any supported shell, `node tests/project-manager-studio/create-selection-browser-fixture.js --launch` must create and launch the default `.projects` fixture without POSIX-only environment assignment or subshell syntax. In-app browser execution must show both options, set a filter, open a dialog, create a Timeline draft in Alpha, switch to Beta while delayed old-project work is pending, prove those states and completion indicators cannot leak into Beta, prove the outside sibling is absent, and use two tabs to retain independent selections.
- `node --test tests/project-manager-studio/selection-guard.test.js` must prove delayed old-generation refresh and save responses are rejected, including switch-away-and-back to the same project key.
- Built-server tests must separately cover missing/unknown/stale keys, per-request mutation isolation, same-key consecutive atomic saves, removal/rename/symlink and ID-drift invalidation, same-ID replacement acceptance, `PROJECTS_ROOT_MISSING`, `PROJECTS_ROOT_INVALID`, `PROJECTS_ROOT_EMPTY`, `PROJECT_CATALOG_INVALID`, `PROJECT_ID_DUPLICATE`, combined CLI containment, selector syntax, and explicit single-project compatibility.

## E2E Evidence Map

- Scenarios 1-3: execute in the in-app browser against the JSON fixture; use built-server per-request mutation tests for the task-write assertions and `selection-guard.test.js` for deterministic delayed-response assertions.
- Scenario 4: execute the named built-server key-rejection test for unknown, traversal-shaped, and absolute-path-shaped values.
- Scenarios 5-7: execute separate named built-server tests for removed, renamed, and symlink-replaced catalog entries; the same suite must prove two consecutive Studio atomic saves retain the key and an external same-ID real-directory replacement remains in the authorized slot.
- Scenarios 8-12: execute named built-server launch tests for explicit single-project isolation, valid combined launch, and outside/nested/symlinked combined selection rejection.
- Scenarios 13-16: execute separate named launch tests for missing, file, symlinked, and empty projects roots.
- Scenarios 17-20: execute named catalog tests for malformed children, symlinked children, duplicate startup IDs, and post-startup ID drift with exact `PROJECT_SELECTION_STALE` evidence.
- Scenarios 21-25: execute separate named/parameterized CLI parsing cases for missing and repeated `--project`, missing and repeated `--projects-root`, and unknown arguments.
- ET must report a scenario-to-test/observation matrix for every scenario rather than treating a passing aggregate command as sufficient evidence.

## Rollback / Risk

- The main risk is turning project selection into an arbitrary filesystem read/write API. Restrict selections to opaque keys from a server-owned, direct-child, real-directory catalog and regression-test containment.
- Switching while reads or mutations are in flight can render the wrong project. Per-request project keys prevent cross-project server targeting; client generation/key guards prevent late old-project responses from replacing current state.
- Catalog identity is intentionally path-and-project-ID based rather than inode based because Project Manager saves atomically replace the selected root directory. A same-ID real directory at the same authorized direct-child path is accepted; symlinks, path movement, and ID drift are not.
- Studio is a loopback same-user tool, not a hardened boundary against a malicious same-user process performing precisely timed filesystem swaps between validation and use. Request-time canonical/symlink checks plus mutation revisions protect ordinary stale and accidental replacement cases.
- Strict invalid-child and duplicate-ID failures may force operators to repair a malformed `.projects` entry before Studio opens. This is intentional: a selector that silently hides broken or ambiguous project state is unsafe.
- Windows, macOS, and Linux are supported. Portable catalog, CLI, recovery, and containment cases run on every platform; symlink-specific cases run where the host permits symlink creation, with ordinary file/directory/case-alias failures covering the same fail-closed branches elsewhere.
- Rollback is a source-and-generated-artifact revert; project data has no schema or migration change.
