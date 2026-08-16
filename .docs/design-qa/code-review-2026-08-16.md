# Code Review — Project Manager

**Date:** 2026-08-16
**Commit:** `28c221b` (feat: add release command)
**Branch:** `main`, in sync with `origin/main`, working tree clean
**Effort:** max (10 finder angles → verification → gap sweep)
**Amended:** 2026-08-16 — finding 1 was overstated; see the correction in that section.
Remediation: `.docs/done/2026/08/16/review-fixes-scalability.md`

---

## Scope

There was no diff to review — `main` matches `origin/main` and the tree is clean — so the
review target `this code base` was taken literally and the hand-written source was reviewed
as a whole (~5k lines):

- `src/**` — MCP App server and tools, Studio client/server/mcp-app
- `scripts/*.mjs` — build, versioning, release
- `skills/project-manager/scripts/**/*.js` — skill runtime libraries and CLI entry points
- `skills/project-manager/assets/studio.sh`, `studio.cmd`
- packaging files: `plugin.json`, `mcp.json`, `package.json`, `.gitattributes`, `.gitignore`

**Excluded as generated build output:** `bin/project-manager-mcp.mjs`,
`skills/project-manager/scripts/project-manager-studio.js`,
`skills/project-manager/studio/dist/**`, `ui/*.html`.

### How this review ran

Five of the ten finder angles (line-by-line, invariants/guards, cross-file tracing,
language pitfalls, wrapper/state) terminated early on a monthly spend limit. Those angles,
the verification pass, and the gap sweep were run inline instead of being re-spawned. The
five that completed were reuse, simplification, efficiency, altitude, and conventions.

### Supporting signals

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run test:pm` | 205 / 205 pass |
| Version consistency | `1.8.0` in `plugin.json`, `src/version.ts`, `SKILL.md`, and the committed bundles |
| Generated artifacts vs source | rebuilt into an isolated copy and byte-compared — in sync |

Tests were run via `test:pm` rather than `npm test` so the build step would not regenerate
committed artifacts. The working tree was left clean.

More than 15 findings survived verification; the report is capped at 15 with correctness
ranked above cleanup. Trimmed items are listed at the end.

---

## Findings

Ranked most severe first.

### 1. Watcher retry exhaustion leaves the SSE stream silently dead

**`src/project-manager-studio/server/project-watcher.ts:110`** · correctness · **PARTLY REFUTED —
severity overstated, recommended fix is wrong**

> **Correction (2026-08-16).** The analysis below overstates this and its implied fix is harmful.
> The silent returns are **deliberate and tested**: `project-watcher.test.js` asserts, in
> `catalog-invalid replacement remains unwatched until a later valid restoration event` and
> `filename-less restoration recovers a parent-only stream after retry exhaustion`, that a stream
> must survive exhaustion so the still-armed parent watcher can reattach later.
> `valid-root attachment exhaustion is fatal and closes every watcher once` covers the one path
> that *is* meant to be fatal.
>
> **Do not make exhaustion call `fatal()`.** `fatal()` calls `stop()`, which closes the parent
> watcher and makes `replaceRoot()` a permanent no-op — deleting the recovery design and
> breaking three tests. The claim below that the parent path "re-enters the identical dead loop"
> is wrong: the anchor stays armed and does reattach once the binding is valid again.
>
> The genuine defect is narrower — the degradation is never **signalled**, so a browser holding a
> live `EventSource` cannot tell "no changes" from "not watching". Fixed by an additive
> `onDegraded` → `project-stale` signal, with recovery stated by the server as `project-live`
> rather than inferred from a data event (a *failed* reattach also emits `project-change`, so
> inferring from it clears the warning on a dead stream — the same defect, restored).

When `resolvedIdentity()` keeps failing past `retryLimit`, `attachRoot` returns without
calling `fatal()`, leaving the SSE stream open with no watcher attached, so the client never
learns that changes stopped flowing.

`resolveRoot` is `() => options.catalog.resolve(entry.key).root` (`server.ts:95`), and
`catalog.resolve` throws `PROJECT_SELECTION_STALE` via `validateEntry` when the project's id
changes. Edit the `id:` field in a watched project's `PROJECT.md`: every `resolvedIdentity()`
now throws, the 10 retries exhaust in ~500 ms, and line 110's `if (attempt < retryLimit)` is
false so the function just returns — no `fatal()`, `rootWatcher` stays `null`.

Compare line 121, where a `watchFn` failure past the same limit *does* call `fatal`. The
`/api/events` response is never ended, so the browser's `EventSource` stays connected and
fires neither `error` nor `open`, and `parentBindingChanged()` (line 152) calls the same
throwing `resolvedIdentity()` — so the parent-watcher recovery path re-enters the identical
dead loop rather than healing it. The Studio board silently stops auto-refreshing until the
user clicks Refresh by hand.

### 2. Duplicated project loader drops the transient-error retry

**`skills/project-manager/scripts/lib/agent-execution.js:41`** · correctness · CONFIRMED

`loadStableAgentProject` — and the identical `loadStableProject` at
`human-completion.js:29` — re-implement `loadRevisionedProject` but omit its
transient-filesystem-error catch, so a concurrent project mutation crashes the CLI instead of
returning `PROJECT_BUSY`.

`task-editor.js:115-118` wraps the load in `try/catch` and retries on
`['ENOENT','ENOTDIR','ESTALE']`; both copies (`agent-execution.js:42-47`,
`human-completion.js:30-35`) call `revision(root)` and `load(root)` bare.
`atomicProjectMutation` (`mutations.js:219-220`) renames the project root away and back
during every save, so a `project-start-agent.js` or `project-complete-human.js` invocation
overlapping a Studio save hits `mutationRevision` → `assertProjectDirectoryRoot` →
`throw Object.assign(new Error(...), { code: 'ENOENT' })` (`mutations.js:41`), which
propagates uncaught. The script exits with a raw ENOENT stack instead of the documented
`PROJECT_BUSY` semantic envelope the skill parses to decide whether to retry.

### 3. Confinement check compares a lexical path against a realpath

**`src/mcp-app/tools/project-reads.ts:73`** · correctness · CONFIRMED

The confinement check compares `path.resolve(selector)` against a confinement value produced
by `fs.realpathSync`, so any symlinked path component makes a legitimate in-root project fail
as "outside the configured projects root".

`confinement` is `discovered.root` (`projects.ts:80`), which comes from
`loadProjectCatalogRoot` → `resolveProjectRoot`, and that function returns
`fs.realpathSync(folder)` (`project-state.js:836`). But line 72 computes
`const root = path.resolve(selector)` — purely lexical, no realpath.

On macOS `/tmp` is a symlink to `/private/tmp`, so with a projects root at `/tmp/projects`
the confinement is `/private/tmp/projects` while an agent passing `/tmp/projects/alpha`
yields `path.dirname(root) === '/tmp/projects'`. Both clauses fail and line 74 throws
`Project folder is outside the configured projects root /private/tmp/projects:
/tmp/projects/alpha` for a project that *is* a direct child. The same applies to `/var` and
to any user with a symlinked home.

This also diverges from `buildCatalog` (`projects.ts:73-77`), which lstats, rejects symlinks,
and compares `path.dirname(real)` on the realpath — and it uniquely admits
`root === confinement` (the projects root itself), which neither of the other two enforcement
sites allows.

### 4. Prefix match without a separator boundary admits a sibling task directory

**`skills/project-manager/scripts/lib/mutations.js:153`** · correctness · CONFIRMED

`isValidatedAncestor` uses `startsWith` on a path with no trailing-separator boundary, so an
unauthorized `handoffs/<taskId>` directory is admitted whenever any task whose id merely
*starts with* that string has an active contract.

Line 153 evaluates `path.join('handoffs', task.id, task.active_contract).startsWith(relative)`.
With `relative = 'handoffs/TASK-1'` (a bare directory addition, so `pieces.length < 3`) and a
task `TASK-10` holding an active contract, the candidate path `handoffs/TASK-10/tc-<64hex>`
starts with `handoffs/TASK-1`, so `isValidatedAncestor` is true and the `continue` at line 154
skips the `Immutable handoff directory is not tied to validated active state` guard. A
mutation can therefore introduce a `handoffs/TASK-1` directory that no validated active state
backs.

That the boundary matters is settled twelve lines later: line 165 writes the same test
correctly as ``item.startsWith(`${relative}${path.sep}`)``.

### 5. Shared `suppressClick` ref swallows the next bar click

**`src/project-manager-studio/client/components/Timeline.tsx:60`** · correctness · PLAUSIBLE

`suppressClick` is one ref shared by every schedule bar and is only cleared inside a bar's
`onClick`, so a drag that ends without a following click leaves it armed and eats the next
click on an unrelated task.

`finish()` sets `suppressClick.current = drag.current.moved`, and the only reset is in the
`onClick` handler at line 163 (`if (suppressClick.current) { suppressClick.current = false;
return; }`). Because `begin()` calls `setPointerCapture` (line 42), a pointerup delivered
after the pointer has left the button's box does not always produce a click on that element.
Drag a bar by one or more days and release with the cursor off the bar: no click fires,
`suppressClick.current` stays `true`, and the next single click on any *other* task's bar is
consumed to clear the flag instead of opening that task's dialog.

Confirming this needs a browser run — the flag is per-Timeline, not per-bar, so the swallowed
click can land on a different row than the drag.

### 6. Every `.gitattributes` rule targets a nonexistent, forbidden path

**`.gitattributes:1`** · conventions · CONFIRMED

All four rules are prefixed with `plugins/project-manager/`, a directory AGENTS.md forbids
and that does not exist, so no generated artifact is actually marked `linguist-generated` or
whitespace-exempt.

AGENTS.md line 6: *"Do not recreate `dist/plugin/`, `plugins/project-manager/`, or a
repository-local Codex marketplace"*. Line 5: *"The repository root is the single Agent
Plugins 1.0 package and source of truth."* The rules address
`plugins/project-manager/bin/...`, `plugins/project-manager/ui/*.html`, and two more under
that same forbidden prefix, while the real artifacts live at the repository root.

Verified with tooling:

```
git check-attr linguist-generated -- bin/project-manager-mcp.mjs ui/board.html skills/project-manager/scripts/project-manager-studio.js
bin/project-manager-mcp.mjs: linguist-generated: unspecified
ui/board.html: linguist-generated: unspecified
skills/project-manager/scripts/project-manager-studio.js: linguist-generated: unspecified
```

`tests/mcp-app/plugin-package.test.js:85` actively asserts the `plugins/` directory never
exists. Consequence: the 34,402-line `bin/project-manager-mcp.mjs`, both ~500 KB `ui/*.html`
bundles, and the 27,257-line studio bundle render expanded in every PR diff and skew language
stats, and the intended `-whitespace` suppression never applies. The file was added in commit
`6b82918` with the wrong prefix and has never had any effect.

### 7. Bare `dist/` ignores the tracked Studio client assets

**`.gitignore:4`** · conventions · CONFIRMED

The bare `dist/` pattern matches the tracked, generated Studio client bundle at
`skills/project-manager/studio/dist/`, so a rebuild that changes Vite's content hashes
produces replacement assets git silently refuses to add.

AGENTS.md lines 12-15 require syncing *"the complete affected installable unit"* and
*"Sync after rebuilding so the installed copy includes current generated artifacts."* Three
files under that path are tracked (`assets/index-CLbzB9np.js`, `assets/index-C8acsLOT.css`,
`index.html`) and `src/project-manager-studio/server/cli.ts:17` serves the directory as
`CLIENT_DIST_DIR`.

Verified:

```
git check-ignore -v skills/project-manager/studio/dist/assets/index-NEWHASH99.js
.gitignore:4:dist/	skills/project-manager/studio/dist/assets/index-NEWHASH99.js
```

Edit any client source and run `npm run build`: Vite emits new content-hashed filenames, git
reports the old tracked assets deleted (ignore rules do not apply to tracked files) but hides
the replacements, so a `git add -A` commit strips the assets while the committed `index.html`
still hard-references the old hashes. A skill-only installation then serves a blank page.

### 8. `mutationRevision` hashes every file twice per load

**`skills/project-manager/scripts/lib/task-editor.js:110`** · efficiency · CONFIRMED

`loadRevisionedProject` calls `mutationRevision` before and after `loadProject`, and
`mutationRevision` reads and SHA-256s the bytes of every file in the project tree, so every
file is fully read three times per load.

`mutations.js:60` hashes file contents
(`crypto.createHash('sha256').update(fs.readFileSync(full))`) for every entry during its
walk, and lines 110 and 113 invoke it around the `loadProject` at line 111.

Measured against the repo's own `demo/pm-mcp-demo` fixture (13 files, 13,253 bytes): a single
`loadRevisionedProject` performs **36 `readFileSync`, 98 `lstatSync`, 25 `readdirSync`, and
reads 37,103 bytes** — every path at exactly 3×, including all
`handoffs/*/tc-*/EVIDENCE-*.md`. A project whose `handoffs/` tree holds a few thousand
evidence files pays thousands of extra reads and megabytes of hashing on every
`/api/project` GET, every SSE-triggered refresh, and every MCP tool call.

A metadata revision (dev/ino/size/mtimeNs per entry) gives the same torn-read guard at one
stat per file.

### 9. `data()` re-validates every catalog entry on every tool call

**`src/project-manager-studio/server/project-catalog.ts:70`** · efficiency · CONFIRMED

`data()` runs `validateEntry` — lstat + realpath + a full `loadProjectIdentity` read of
`PROJECT.md` — for every catalog entry, and `resolveProjectKey` calls it on every model-facing
tool call, while `register` grows the entry list without eviction.

`resolveProjectKey` opens with `const data = catalog.data()` (`project-reads.ts:58`), then
`getProject` calls `catalog.resolve` (line 45) which validates the target entry a second
time, and `loadRevisionedProject` reads `PROJECT.md` three more times. That is **5 reads of
the target's `PROJECT.md` per single `pm_project_status`**, plus a full lstat/realpath/parse
for every *other* configured project — 20 extra `PROJECT.md` reads and ~80 extra stat calls
on a 20-project root, on every call.

This compounds with line 65 (`this.entries.push(entry)`): `resolveProjectKey` calls
`catalog.register(root)` for every folder-path selector, and entries are never evicted, so
each ad-hoc folder the agent passes permanently adds one more identity read to every
subsequent call for the life of the stdio server.

### 10. The compact summary builds the full board projection and discards it

**`src/mcp-app/tools/project-reads.ts:91`** · efficiency · CONFIRMED

`projectSummary` calls `getProject`, which builds the entire kanban projection — six lanes,
per-task edit/schedule/disposition eligibility, `rpd_command`, schedule conflicts — and then
keeps only 12 scalars and 3 task titles.

Line 91's `const data = getProject(catalog, projectKey)` runs `loadRevisionedProject` (2
full-tree byte hashes + 1 full Markdown parse) plus `kanbanData` (itself quadratic — see
finding 11). Everything but `data.summary`, `data.project`, `data.next[0..2]` and
`data.warnings.length` is thrown away at lines 92-105. The summary path never reads
`mutation_revision`, so it does not need the revision guard at all — `loadProject` +
`statusData` supplies every field it returns.

On the `pm_open_board` path the cost doubles: the model-facing tool runs this whole load,
then the view immediately calls `pm_get_project` (`server.ts:87`) and loads the same project
again from scratch.

### 11. `unfinishedDependencies` rebuilds a task Map on every call

**`skills/project-manager/scripts/lib/project-state.js:1029`** · efficiency · CONFIRMED

The function builds a fresh `Map` of every task on each invocation, and is called once or
twice per task by `blockerItems` and `nextData`, making the projection quadratic in task
count.

Line 1029 is `const byId = new Map(state.tasks.map((item) => [item.id, item]))`, rebuilt per
call. `blockerItems` (line 1034) calls it twice per task — once inside the `.filter`, again
inside the `.map` — and `nextData` (line 1060) once per task; both run twice per `kanbanData`.

Instrumented Map construction inside one `kanbanData` call:

| Tasks | Maps built | Entries copied | Time |
| --- | --- | --- | --- |
| 10 | 31 | 283 | — |
| 50 | 139 | 6,820 | — |
| 200 | 549 | 109,285 (~2.7n²) | 5.4 ms |

This runs on every project load — once per GET, twice per save, four times per `check`
request. Hoisting one `byId` Map into `kanbanData` and threading it through removes the whole
quadratic. `project-state.js:580` has the same shape (`state.tasks.filter(...)` inside
`for (const task of state.tasks)`).

### 12. Timeline markers are rebuilt per row on every render

**`src/project-manager-studio/client/components/Timeline.tsx:105`** · efficiency · CONFIRMED

`<Markers data={data} range={range} />` sits inside the `ordered.map` row loop, so the
identical project/milestone marker array is re-derived once per task row on every render,
including at pointer frequency during a drag.

`Markers` (line 129) depends only on `data` and `range`, yet line 105 instantiates it per
row, so its `flatMap` over milestones plus `.filter(Boolean)` runs N times per render.
`move()` (line 49) calls `updateDraft` on every `pointermove`, re-rendering the whole Timeline
at pointer frequency. With 100 rows and 8 milestones that is 100 array rebuilds × 18 markers
per frame — roughly 6,000-12,000 array allocations and 108,000+ marker objects per second at
60-120 events/sec, plus React reconciling 1,800 marker spans per frame, for data that cannot
change during the drag.

`TimelineScale` compounds it at line 119, constructing a fresh `new Intl.DateTimeFormat(...)`
on each of those renders. Hoist the marker list into a `useMemo` in `Timeline` and pass the
finished array down.

### 13. `sourceBindings` triplicated across two producers and the verifier

**`skills/project-manager/scripts/lib/project-state.js:686`** · reuse · CONFIRMED

The projection is copied byte-for-byte into three files — `agent-execution.js:51` and
`human-completion.js:39` produce it, `project-state.js:686` re-derives it as `liveBindings`
to hash-compare against what those two wrote.

All three build
`{ id, version: source.version, record_sha256: source.record_sha256, content_sha256: source.sha256 }`,
and `project-state.js:690` asserts
`canonicalJson(liveBindings) === canonicalJson(contract.payload.task.sources)`.

These are producer/producer/verifier of one canonical JSON shape, so the copies are
load-bearing: add a field or reorder a key in the two writers and every previously stored
contract fails `CONTRACT_SOURCE_BINDING`; add it only to the verifier and every newly issued
contract fails the moment it is written. No test compares the three, so a one-sided edit
surfaces as stale-run warnings on real projects rather than at authoring time.

The same two files carry two more duplicates with the same drift shape:
`loadStableAgentProject`/`loadStableProject` (finding 2), and a third
`unfinishedDependencies` spelling.

### 14. `buildCatalog` duplicated verbatim in the Studio CLI

**`src/mcp-app/projects.ts:47`** · altitude · CONFIRMED

`buildCatalog` is a near-literal copy of `src/project-manager-studio/server/cli.ts:40-60`, so
project discovery and the containment rule are maintained in two places rather than owned by
`ProjectCatalog`, which every path already passes through.

Lines 47-81 and `cli.ts:40-60` share the same single-project short circuit, the same
`loadProjectCatalogRoot` call, and the same lstat/symlink/realpath/direct-child block; the
header comment at lines 43-45 concedes it *"Mirrors Studio's discovery."*

`ProjectCatalog.register` (`project-catalog.ts:53`) is the one choke point every ad-hoc path
crosses, yet it has no notion of confinement — that is carried alongside as a `string | null`
pair and re-checked by hand at each call site with `confinement = null` as the default. A new
model-facing tool that calls `resolveProjectKey(catalog, project)` and forgets the third
argument silently accepts arbitrary filesystem paths, and it is legal TypeScript.

Because the Studio copy throws bare `Error` rather than `ProjectCatalogError`, the same
rejection that yields a coded 400 on the MCP surface reaches `apiError` (`server.ts:30`) with
no `code` and is classified `UNEXPECTED` / 500.

### 15. Dead `sorted` clause invites retroactive contract invalidation

**`skills/project-manager/scripts/lib/contracts.js:169`** · simplification · CONFIRMED

The `sorted` option lists `'sources'` in an allowlist and then cancels it with
`&& key !== 'sources'`, so the clause is exactly
`['success_criteria','dependencies'].includes(key)` — and tidying it the obvious way silently
enables a new check against every stored contract.

The expression reads
`{ sorted: ['success_criteria', 'dependencies', 'sources'].includes(key) && key !== 'sources' }`,
which can never be true for `'sources'`. The line currently implies sources are order-checked
here when they are not — their ordering is enforced separately at line 211 against
`sourceIds`. A reader removing the apparently redundant `&& key !== 'sources'` (rather than
the list entry) turns on an ordering check inside `validateTaskContract`, which runs against
every already-stored contract in every project, retroactively invalidating them.

Zero lines are saved by fixing it, but the trap disappears.

---

## Summary by category

| Category | Count | Findings |
| --- | --- | --- |
| correctness | 5 | 1, 2, 3, 4, 5 |
| efficiency | 5 | 8, 9, 10, 11, 12 |
| conventions | 2 | 6, 7 |
| reuse | 1 | 13 |
| altitude | 1 | 14 |
| simplification | 1 | 15 |

Verdicts as first written: 14 CONFIRMED, 1 PLAUSIBLE (finding 5, which needs a browser run).
After remediation: 13 fixed, 1 (finding 1) partly refuted and fixed in a narrower form, 1
(finding 5) fixed. Findings 8 and the `handoffs/` copy exclusion were accepted as non-goals.

**Suggested first fix (as first written):** finding 1 — superseded. It is real but narrower than
described, and its recommended fix is harmful; see the correction in that section. The highest-
value item was finding 11: the projection rebuilt its id→task index 402 times per `kanbanData`
call at 200 tasks, now once.

---

## Trimmed by the 15-finding cap

Real but lower-severity, listed for completeness:

- A third `unfinishedDependencies` spelling (`agent-execution.js:129`,
  `human-completion.js:60`) with divergent null handling. Not currently reachable as a crash —
  `validateGraph:579` rejects dangling `depends_on` before these run — but the definition of
  "blocked" differs across the ranking and execution paths.
- `valueAfter` and the shared `parseArgs` branches copied between `src/mcp-app/cli.ts:18` and
  `src/project-manager-studio/server/cli.ts:20`; the `'code' in error` prefix incantation
  repeated at four boundaries.
- `lstatIfExists` defined identically in `mutations.js:34` and `workspace-init.js:25`.
- `project-resolve.js:10-41` re-implementing the whole `lib/cli.js` `run()` envelope; error
  envelopes and exit-code classifiers duplicated across the mutating CLI scripts, already
  diverged on whether input-validation failures exit 1 or 2.
- Version sync by three regexes in `scripts/versioning.mjs`, including `plugin.json` being
  read with `JSON.parse` but written with an anchored regex — two disagreeing parsers for one
  field. Reformatting `plugin.json` breaks the writer while the reader keeps working.
- Dead exports: `EVIDENCE_KINDS`, `taskSpecPayload`, `contractExecutor`,
  `evidenceFingerprint`, `isEmptyDirectory`, `validatePayload`, `displayStatus`,
  `selection-guard.snapshot()`, `host.ts` `useProjects`.
- `KANBAN_LANES.display_statuses` (`project-state.js:1129`) is derivable from `lane.id`, is
  shipped in the public `KanbanData` wire type, and no client reads it.
- `checkTaskEdit` (`task-editor.js:177`) does a full recursive `fs.cpSync` of the project for
  every dry-run check; measured 190 reads / 627 lstats / 197 KB per `PUT` on a 13 KB fixture,
  all synchronous on the Express event loop.
- `scheduleEditEligibility` and `dispositionEditEligibility` are the same four guards with
  different message strings; `attachRoot` schedules the identical retry at four sites.
- `npm test` does not run `npm run typecheck`, so type errors do not gate the suite.
- Latent: an empty catalog (`initial_project_key === ''`) leaves `App.tsx:82-83` in a
  permanent loading state, since `loadProject` returns at line 41 before resetting `loading`.
  Unreachable today because Studio never constructs an empty catalog.

## Checked and clean

- No mutation entry point is reachable from `src/mcp-app/**` — the read-only claim holds.
- `loadProjectCatalogRoot` fails closed on an empty root (`project-state.js:993`), so the
  `discovered.projects[0]` dereferences in both `buildCatalog` copies are safe.
- Dangling `depends_on`, traceability, and reverification task references are all validated
  before the dereferences that would otherwise throw (`validateGraph:579`, `:536`, `:642`).
- `next_rank` is 1-based (`project-state.js:1175`), so the `task.next_rank && ...` render
  guards are not falsy-zero bugs.
- Studio session handling: `timingSafeEqual` with a length check, `HttpOnly` + `SameSite=Strict`,
  loopback-only bind, non-string query params rejected.
- No forbidden directories exist on disk or in git; `npm test` globs cover all 19 test files.
