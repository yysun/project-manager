# Plan — Review Fixes and Scalability

**REQ:** `.docs/reqs/2026/08/16/req-review-fixes-scalability.md`
**E2E spec:** `.docs/tests/test-review-fixes-scalability.md`

## Goal

Every finding in `.docs/design-qa/code-review-2026-08-16.md` is fixed, corrected, or recorded as
a non-goal; the watcher's degraded state becomes observable without breaking its recovery
design; and the id→task index is built once per projection instead of per helper call.

## Current Context

- **Two loading modes, and they matter for red runs.** Tests reach bundled code through
  `bin/project-manager-mcp.mjs` (`tests/mcp-app/_helpers.js:9`) and
  `skills/project-manager/scripts/project-manager-studio.js`
  (`tests/project-manager-studio/_helpers.js:10`), but reach `skills/.../scripts/lib/*.js`
  **directly from source** (`task-editor.test.js:12`, `project-manager.test.js:25-27`). So a
  no-rebuild `npm run test:pm` only produces a red run for bundle-gated code — findings 1 and 3.
  Findings 2 and 4 live in source-loaded libs and must be red-run *before* their source edits.
- **Existing tests realpath their fixtures** (`_helpers.js:37`, `selection.test.js:16`), which
  is why finding 3 was never caught.
- **The watcher's non-fatal exhaustion is deliberate and tested.** `project-watcher.ts:161-162`
  documents the parent as the recovery anchor; `fatal()` (line 82) calls `stop()`, closing the
  parent and making `replaceRoot()` a permanent no-op. Tests `catalog-invalid replacement…`,
  `filename-less restoration…`, and `initial attachment keeps the safe parent…` assert this.
  `valid-root attachment exhaustion is fatal…` covers the one fatal path (line 121).
- **SSE writes before `flushHeaders()` are unsafe.** `server.ts:93` calls `watchProjectChanges`
  before `res.status(200)`/`flushHeaders()` (lines 99-103), and `project-watcher.ts:175`
  attaches synchronously. `server.ts:85-89` already solves this for `sendChange` with a
  `ready`/`queued` gate.
- **The parent watcher is non-recursive** (`fs.watch(parent, {})`, `project-watcher.ts:165`), so
  correcting `PROJECT.md` **in place produces no parent event**. A degraded stream recovers only
  on a directory rename or a reopened subscription.
- **`loadRevisionedProject` itself builds the projection** — `task-editor.js:112` calls
  `kanbanData(state, before)`.
- **`ProjectSummary` needs more than `statusData` provides.** `owner_gaps` is built at
  `project-state.js:1252` from the projected list; `warnings` at `:1253-1263` is `state.warnings`
  plus a synthetic `STATUS_STALE` entry; `next` rows need `nextData(state).tasks` (statusData
  keeps only the count at `:1094`); and `tasks.blocked` is a set-union at `:1171` needing
  `taskExecutionWarning` (`:747`), which is **not exported** at `:1290-1295`.
- **Two separate id→task maps exist.** `unfinishedDependencies` builds one at
  `project-state.js:1029`; `nextData` builds its own `taskById` at `:1061`, and `nextData` runs
  twice per `kanbanData` (via `statusData:1094` and `:1174`).
- **`loadStableProject` is called positionally with four args** in
  `skills/project-manager/tests/project-manager.test.js`: `(root, attempts, revision, load)`.
- **`.gitignore`'s `dist/` protects nothing.** The only `dist` outside `node_modules` is
  `skills/project-manager/studio/dist`, which is tracked and is
  `vite.project-manager.config.mts:11`'s `outDir`. Git cannot re-include under an excluded
  directory, so the line must be deleted, not negated.
- **`ProjectCatalog` is constructed from untyped JS too:** `studio-server.test.js:45,:60`,
  `project-watcher.test.js:77`, `selection.test.js:137,:138`. TypeScript enforces nothing there.
- **`src/mcp-app/cli.ts:42`** calls `createServer({ catalog, confinement })`.

## Decisions

- **The watcher signals degradation instead of dying.** An additive `onDegraded` callback fires
  from the three non-fatal exhaustion paths; exhaustion stays non-fatal and the parent watcher
  stays open. Rejected: `fatal()` on exhaustion — it closes the recovery anchor and breaks three
  tests.
- **The degraded SSE emit reuses the existing `ready`/`queued` gate** rather than writing
  directly, because the synchronous initial attach can fire before `flushHeaders()`.
- **The client clears the degraded flag on `project-change` or `open`.** `replaceRoot()` calls
  `notify()` unconditionally (`project-watcher.ts:147`), so a successful reattach always
  produces a `project-change`.
- **Request-time containment moves into `ProjectCatalog.register`, enforced on the realpath**,
  with `confinement` a **required** option. Because five construction sites are untyped JS, the
  runtime contract is explicit: a construction supplying no confinement decision makes
  `register()` throw `PROJECT_SELECTION_UNCONFINED`. `undefined` is never silently treated as
  either confined or unconfined.
- **Studio's `cli.ts:59` passes `discovered.root`, not `null`.** That value is in scope on the
  line, and recording "unconfined" there would encode the wrong decision for the exact future
  case — Studio gaining request-time selection — that motivates the required option.
  `cli.ts:44` and `projects.ts:52`/`:62` pass `null`, which is correct for a single explicit
  project and an empty catalog.
- **`resolveProjectKey`'s catch does not append ". It also matches no configured project" to a
  containment rejection.** The selector was a valid project, just outside the root; the suffix
  would mislead. Containment rejections propagate unmodified.
- **A new exported `summaryData(state)` in `project-state.js` supplies the compact summary.**
  It returns exactly the `ProjectSummary` source fields, keeping the `tasks.blocked` set-union
  in the one file that already owns it and avoiding a new export of the private
  `taskExecutionWarning`. Rejected: copying the union into `task-editor.js` or
  `project-reads.ts`, which is the producer/verifier drift shape finding 13 exists to remove.
- **Client behavior is verified through pure `.mjs` modules, never by rendering `.tsx`.** The
  suite is `node --test` over plain JS with no jsdom, happy-dom, or JSX transform, and every
  existing client test dynamically imports a `.mjs` (`timeline-model.test.js`,
  `studio-events.test.js`, `auto-refresh`, `selection-guard`, `panel-preferences`,
  `project-fetch`). So: **marker derivation** moves into `timeline-model.mjs` as an exported
  pure function and `Markers` takes a ready `markers` array **as a prop**, making per-row
  derivation structurally impossible and tsc-enforced rather than assertion-enforced;
  **drag-click suppression** moves into a `createDragSuppression()` factory in
  `timeline-model.mjs`, mirroring how `selection-guard.mjs` and `auto-refresh.mjs` already
  extract component state, so it is unit-testable. `<Markers>` stays per row — each track needs
  its own overlay — so this removes allocations, not span count.
- **Containment rejection gets its own code, `PROJECT_OUTSIDE_ROOT`.** `rejected()` currently
  emits `PROJECT_SELECTION_UNKNOWN` for "does not exist", "is not a real directory", and "is not
  a Project Manager project" alike, so `resolveProjectKey`'s catch has nothing to branch on.
  `resolveProjectKey` re-throws `PROJECT_OUTSIDE_ROOT` and `PROJECT_SELECTION_UNCONFINED`
  unmodified and wraps only the remaining cases. Safe against the existing contract: the
  containment test asserts on message text, never on the code.
- **`kanbanData` and `summaryData` share one `blockedTaskIds(state)` helper** rather than each
  computing the set-union at `project-state.js:1169-1171`, so the new function does not
  reintroduce the producer/producer duplication finding 13 exists to remove.
- **The REQ claim is "one place for request-time selection", not "one place overall."** Merging
  the two `buildCatalog` copies is a non-goal.
- **Rejected: feature flags, environment variables, fallback modes** for any change here.

## Phased Tasks

### Phase 1 - Discovery, baselines, and source-loaded red runs

- [ ] Record the pre-change count of id→task Map constructions per `kanbanData` call on a
      200-task fixture, itemized by construction site, so the "after" number is comparable.
- [ ] Record the pre-change `ProjectSummary` output for a fixture that produces at least one
      task execution warning (see the unavailable-executor-root shape in
      `tests/project-manager-studio/studio-server.test.js`), so the equivalence test can compare
      `tasks.blocked` non-vacuously.
- [ ] Write the finding-4 test (immutable-history prefix guard) in
      `tests/project-manager-studio/task-editor.test.js`, which already source-requires
      `mutations.js` at line 12, and the finding-2 test (`PROJECT_BUSY` on transient error) in
      `skills/project-manager/tests/project-manager.test.js`; run both against unmodified source
      and record that they fail red **before** any Phase 2/3 edit.
- [ ] Confirm `agent-execution.js` and `human-completion.js` already `require('./task-editor')`.
- [ ] Enumerate every `ProjectCatalog` construction site in **both** TS and JS — `projects.ts:52`,
      `:62`, `:80`, `server/cli.ts:44`, `:59`, plus `studio-server.test.js:45`, `:60`,
      `project-watcher.test.js:77`, `selection.test.js:137`, `:138` — and every `createServer`
      call site including `src/mcp-app/cli.ts:42`.
- [ ] Record that finding 8, the `handoffs/` copy exclusion, the projects-root-unselectable
      change, and Studio's 500-vs-400 classification are non-goals.

### Phase 2 - Foundation changes

- [ ] Add a required `confinement: string | null` to `ProjectCatalogOptions` in
      `src/project-manager-studio/server/project-catalog.ts`; make `register()` throw
      `ProjectCatalogError('PROJECT_SELECTION_UNCONFINED', …)` when no confinement decision was
      supplied, and otherwise enforce `path.dirname(real) !== confinement` after `realpathSync`,
      throwing `ProjectCatalogError('PROJECT_OUTSIDE_ROOT', …)` with a message naming both the
      configured root and the rejected path, so the existing message contract still passes.
- [ ] Update all ten construction sites from Phase 1 to state confinement explicitly, passing
      `discovered.root` at `server/cli.ts:59` and `null` at `cli.ts:44`, `projects.ts:52`, `:62`.
- [ ] Remove the confinement check and parameter from `resolveProjectKey`
      (`project-reads.ts:57,72-75`); pass `{ confinement: discovered.root }` at `projects.ts:80`;
      make the catch at `project-reads.ts:78-86` re-throw `PROJECT_OUTSIDE_ROOT` and
      `PROJECT_SELECTION_UNCONFINED` unmodified, wrapping only the remaining cases, so neither
      gains the "also matches no configured project. Available: …" suffix.
- [ ] Remove the `confinement` option from `createServer` (`src/mcp-app/server.ts:26,43`) and
      update `src/mcp-app/cli.ts:42` and `tests/mcp-app/_helpers.js:33`; keep
      `ProjectSources.confinement`, which `tests/mcp-app/cli.test.js` asserts.
- [ ] Extract the revision-stable retry core in `task-editor.js` with injectable `revision` and
      `load`, passing `before` into `load`, carrying the `['ENOENT','ENOTDIR','ESTALE']` catch
      and an `onBusy` callback; export it and rewrite `loadRevisionedProject` on top of it.
- [ ] Add an exported `blockedTaskIds(state, { byId, blockers, executionWarnings } = {})` to
      `project-state.js` holding the set-union currently inline at `:1169-1171`. It must accept
      the caller's already-built maps rather than recomputing them, defaulting to building each,
      and pass `byId` down to `blockerItems`. `kanbanData` passes what it already built at
      `:1167-1168` and takes its `blocked` count from the result, so `taskExecutionWarning` is
      not re-run over every task a second time.
- [ ] Add an exported `summaryData(state, byId = <built once>)` to `project-state.js` returning
      the `ProjectSummary` source fields: `tasks` (with `blocked` from `blockedTaskIds`),
      `success`, `owner_gaps` (`state.tasks.filter(t => t.owner === null).length`), `next`
      (`nextData(state, byId).tasks`), and `warnings`
      (`state.warnings.length + (state.status_stale ? 1 : 0)`). It must thread its single `byId`
      into `statusData`, `blockedTaskIds`, and `nextData` so the compact summary path — the hot
      path finding 10 exists to make cheap — is O(n) rather than quadratic.
- [ ] Add a projection-free revision-stable load for the summary path that runs `loadProject` +
      `summaryData` without `kanbanData`, keeping the before/after `mutationRevision` comparison.
- [ ] Extract `sourceBindings(state, task)` into `contracts.js` and export it.
- [ ] Extract the marker derivation from `Timeline.tsx` into an exported pure function in
      `src/project-manager-studio/client/timeline-model.mjs`, with a matching `.d.mts` entry.
- [ ] Extract drag-click suppression into an exported `createDragSuppression()` factory in
      `timeline-model.mjs` — `{ begin(), finish(moved), consume() }`, where `begin()` clears any
      flag a previous drag left set and `consume()` returns whether it suppressed **and** clears
      the flag, matching what `Timeline.tsx:163` does inline today — with a matching `.d.mts`
      entry.
- [ ] Delete the `dist/` line from `.gitignore`.
- [ ] Rewrite all four `.gitattributes` rules to address the real repository-root artifact paths
      with no `plugins/project-manager/` prefix.

### Phase 3 - Feature implementation

- [ ] Add `onDegraded?: (error: Error) => void` to `ProjectWatcherOptions` and invoke it from
      the three non-fatal exhaustion paths (`project-watcher.ts:110,129,134`), keeping them
      non-fatal and the parent watcher open; collapse the four duplicated retry blocks into one
      `scheduleRetryOrDegrade(token, attempt, error)`. Synthesize an explicit error for the
      identity-mismatch path at `:132-136`, which has none, and keep `closeWatcher(next)` before
      degrading at `:128` and `:133`. Leave line 121 fatal.
- [ ] Emit a distinct SSE event from `server.ts`'s `/api/events` handler when `onDegraded`
      fires, routed through the existing `ready`/`queued` deferral so nothing is written before
      `res.flushHeaders()`.
- [ ] Surface the degraded event in `src/project-manager-studio/client/studio-events.mjs` via a
      new `onStreamState` option — named distinctly from the watcher's error-shaped `onDegraded`
      because this one reports liveness, not an error — clearing the degraded state on
      `project-change` and on `open`. Validate `data?.projectKey === projectKey` before acting,
      matching the existing convention at `studio-events.mjs:8-13`. Add the option to
      `studio-events.d.mts` so the `App.tsx` call site typechecks.
- [ ] Hold the degraded flag in `App.tsx` state at the `startStudioEvents` call site
      (`App.tsx:71`) and render it through the existing `warning-banner` / `role="status"` row
      near `App.tsx:181`, so the stale-stream condition is actually visible.
- [ ] Rewrite `loadStableAgentProject` (`agent-execution.js:41`) and `loadStableProject`
      (`human-completion.js:29`) as wrappers over the shared core, preserving the
      `(root, attempts, revision, load)` positional signature and each module's `onBusy` error.
- [ ] Replace the three `sourceBindings` copies (`project-state.js:686` inline `liveBindings`,
      `agent-execution.js:51`, `human-completion.js:39`) with the shared import.
- [ ] Fix the ancestor guard at `mutations.js:153` to compare segments
      (`full === relative || full.startsWith(\`${relative}${path.sep}\`)`).
- [ ] Replace the raw `suppressClick` ref in `Timeline.tsx` with the `createDragSuppression()`
      factory held in the existing ref, calling `begin()` before `begin(event, …)`'s
      early-return guards, `finish(moved)` on pointer end, and `consume()` in the bar's
      `onClick`.
- [ ] Hoist one id→task Map into `kanbanData`/`statusData` and thread it through
      `unfinishedDependencies` (`:1029`), `blockerItems`, `nextData`, `blockedTaskIds`, and
      `summaryData` — **including `nextData`'s own `taskById` at `project-state.js:1061`**,
      which must be collapsed into the threaded map rather than left in place. Make the
      parameter optional, defaulting to building the map, since these are exported and called
      externally (`project-blocked.js:6`, `reportData`, `renderStatus`). Verify no remaining
      caller on the `kanbanData` or `summaryData` path rebuilds an id→task index.
- [ ] Replace the `expectedBlocks` full scan at `project-state.js:580` with one precomputed
      reverse-dependency Map built before the validation loop.
- [ ] Change `Markers` to accept a `markers: Marker[]` prop instead of `data`, derive the array
      once per render in `Timeline` via the `timeline-model.mjs` function, and move the
      `Intl.DateTimeFormat` construction at `Timeline.tsx:119` to module scope.
- [ ] Add a non-validating entries accessor to `ProjectCatalog` for the id/name and
      `initial_project_key` lookups in `resolveProjectKey`, leaving `data()` validating for
      `pm_list_projects` and `resolve()` validating the entry actually used.
- [ ] Change `projectSummary` (`project-reads.ts:91`) to use the projection-free load, and
      perform the `data.project.id`/`root` identity check that `catalog.decorate` used to supply.
- [ ] Simplify `contracts.js:169` to `['success_criteria', 'dependencies'].includes(key)`.
- [ ] Confirm no feature flag, environment variable, or fallback path was introduced, and that
      `src/mcp-app/**` still imports no mutation entry point.

### Phase 4 - Tests and verification wiring

- [ ] Add a watcher test asserting `onDegraded` fires after the retry budget is exhausted **and**
      the parent watcher is still open (`closes === 0`).
- [ ] Add a server test driving a real `/api/events` subscription (see the existing `fetch` +
      body-reader pattern in `studio-server.test.js`) asserting the degraded event arrives on the
      wire and the response has not ended.
- [ ] Add a selection test selecting a project through a non-realpathed projects-root path
      asserting success, plus an outside-root rejection naming both root and path, plus a
      construction-without-confinement case asserting `PROJECT_SELECTION_UNCONFINED`.
- [ ] Add `timeline-model.test.js` cases for the extracted marker-derivation function and for
      `createDragSuppression()`, asserting in particular that `begin()` clears a flag left set
      by a previous drag that ended without a click.
- [ ] Add a `studio-events.test.js` case driving the existing `FakeEventSource` to assert the
      degraded event sets the flag and that a subsequent `project-change` or `open` clears it.
- [ ] Add an equivalence test asserting the new compact summary matches the Phase 1 baseline
      field for field, on the execution-warning fixture.
- [ ] Confirm the four existing watcher tests and the positional
      `loadStableProject(root, attempts, revision, load)` call in `project-manager.test.js` all
      still pass unmodified.
- [ ] Re-measure id→task Map constructions per `kanbanData` call at 200 tasks; expect at most
      one, against the Phase 1 itemized baseline.
- [ ] Red-run the bundle-gated tests without rebuilding, narrowed to avoid mixing fresh source
      with stale bundles: `node --test tests/project-manager-studio/project-watcher.test.js
      tests/mcp-app/selection.test.js`; record that the finding-1 and finding-3 tests fail.
- [ ] Run `git check-attr linguist-generated` over the root artifacts and the tracked
      `skills/project-manager/studio/dist/` files, resolving asset names at check time from
      `git ls-files` rather than pinning a content hash; record no `unspecified`.
- [ ] Run `git check-ignore -v skills/project-manager/studio/dist/assets/index-PROBE.js`; record
      no match.
- [ ] Run `npx tsc --noEmit` and record a clean result.
- [ ] Run `npm test` and record the pass count, which must exceed the pre-change 205.

### Phase 5 - Documentation and status

- [ ] Update the top comment block of every edited source file.
- [ ] Run `npm run build:plugin` so root `bin/` and `ui/` match the changed source, and confirm
      `npm run version:check` reports one version.
- [ ] Add a finding-by-finding disposition table covering all 15 review findings — fixed with
      change site, corrected as overstated, or non-goal with reason.
- [ ] Record final evidence showing each REQ acceptance criterion is satisfied.

## Validation

| Check | Command | Expected evidence |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | no output, exit 0 |
| Red run (source-loaded) | `npm run test:pm`, Phase 1, before edits | finding-2 and finding-4 tests fail |
| Red run (bundled) | `node --test tests/project-manager-studio/project-watcher.test.js tests/mcp-app/selection.test.js`, no rebuild | finding-1 and finding-3 tests fail |
| Full suite | `npm test` | build succeeds, >205 tests pass, 0 fail |
| Attributes | `git check-attr linguist-generated` over root artifacts + `git ls-files skills/project-manager/studio/dist` | every path `true`, none `unspecified` |
| Ignore rule | `git check-ignore -v skills/.../dist/assets/index-PROBE.js` | no match, exit 1 |
| Index rebuild | instrumented count, 200-task fixture | ≤1 id→task index per `kanbanData`, vs Phase 1 baseline |
| Timeline | `npx tsc --noEmit` + `timeline-model.test.js` | `Markers` takes a `markers` prop (per-row derivation impossible); derivation and `createDragSuppression` unit-tested |
| Degraded client | `studio-events.test.js` with `FakeEventSource` | degraded event sets the flag; `project-change` or `open` clears it |
| Summary parity | equivalence test vs Phase 1 baseline | all fields equal, `tasks.blocked` included |
| Version sync | `npm run version:check` | one consistent release version |

## Rollback / Risk

- **Required-confinement is enforced by TypeScript only in `src/**`.** Five construction sites
  are untyped JS test files, so the runtime `PROJECT_SELECTION_UNCONFINED` throw — not the type
  system — is what prevents a silent default. All ten sites are enumerated in Phase 1.
- **The degraded SSE event is additive for free.** `EventSource` ignores unregistered event
  types by construction, and the client is served by the same process from
  `skills/project-manager/studio/dist`, so there is no independently-versioned client and no
  version negotiation to build.
- **The degraded state can persist longer than expected.** The parent watcher is non-recursive,
  so correcting `PROJECT.md` in place produces no parent event; recovery requires a directory
  rename or a reopened subscription. This is pre-existing behavior, surfaced rather than
  introduced, and is recorded in the E2E spec.
- **`projectSummary` field derivation** risks changing reported numbers, especially
  `tasks.blocked` and the `STATUS_STALE` warning count. Mitigated by the Phase 1 baseline plus an
  equivalence test on a fixture that produces an execution warning.
- **The quadratic is reduced, not eliminated.** `nextData`'s inner `state.tasks.filter(...)` per
  candidate (`:1063`) and `kanbanData`'s `state.tasks.find(...)` per dependency (`:1177`) remain
  O(n²) and are out of scope.
- **Rollback:** changes are confined to source files, two repository config files, and
  regenerated artifacts. `git revert` of the story commit restores prior behavior; no data
  migration or persisted-format change is involved.

## Finding disposition

All 15 source-review findings, with change site or reason.

| # | Disposition | Where |
| --- | --- | --- |
| 1 | **Corrected, then fixed** | The review's claim (silent returns are a bug; call `fatal()`) was overstated — the returns are deliberate and tested, and `fatal()` closes the parent recovery anchor. The real defect was that degradation was never signalled. Fixed as `onDegraded`/`onLive` in `project-watcher.ts`, `project-stale`/`project-live` in `server.ts`, `onStreamState` in `studio-events.mjs`, banner in `App.tsx`. |
| 2 | Fixed | `loadStableSnapshot` in `task-editor.js`; both CLI loaders are wrappers. `guardFirstRead` keeps Studio's `PROJECT_BUSY` while CLI roots still fail as invalid input. |
| 3 | Fixed | Containment judged on the resolved real path inside `ProjectCatalog.register`, on the parent before the leaf is touched. |
| 4 | Fixed | `mutations.js` ancestor guard compares path segments. |
| 5 | Fixed | `createDragSuppression()` in `timeline-model.mjs`, cleared on each new drag. |
| 6 | Fixed | `.gitattributes` rewritten to real root paths. |
| 7 | Fixed | `dist/` line deleted from `.gitignore`. |
| 8 | **Non-goal** | Metadata `mutationRevision` weakens the torn-read guarantee; a product decision about integrity. Acceptable at ≤200 tasks. |
| 9 | Fixed | `ProjectCatalog.listing()` for selection matching; `data()` still validates for the app-facing tool, `resolve()` for the entry read. |
| 10 | Fixed | `summaryData`/`blockedTaskIds` in `project-state.js`, `loadRevisionedSummary` in `task-editor.js`, `projectSummary` in `project-reads.ts` with an inline identity check. |
| 11 | Fixed | One `taskIndex` per projection, threaded through six helpers; plus the `expectedBlocks` reverse-dependency map. 402 → 1 index constructions at 200 tasks. |
| 12 | Fixed | `timelineMarkers()` extracted; `Markers` takes a prop; formatter at module scope. |
| 13 | Fixed | `sourceBindings` lives once in `contracts.js`. |
| 14 | Fixed (scoped) | Request-time containment centralized in `ProjectCatalog` with a required decision. Merging the two `buildCatalog` copies and Studio's 500-vs-400 classification remain non-goals. |
| 15 | Fixed | `contracts.js` `sorted` clause simplified. |

Also non-goal: excluding `handoffs/` from the atomic-mutation candidate copy (changes the safety property of `atomicProjectMutation`).
