# Plan — Run Orchestration and Execution Telemetry

## Goal

Project state gains a durable run record, ready work is ranked by critical-path depth, every agent
attempt carries execution measurements, and the documented scheduler becomes work-conserving — with
every existing project, Task Contract, and evidence manifest still valid on disk.

## Current Context

**State model.** `scripts/lib/project-state.js` is the loader. `REQUIRED = ['PROJECT.md',
'TASKS.md', 'STATUS.md']` and `OPTIONAL_FILES` (line 24) list the state files; `loadProject`
(line 887) reads each optional file through the local `module(name, kind, schemaVersions)` helper
(line 898), which returns `{ configured: false, items: [] }` when the file is absent. Records are
parsed by `parseCollection` (line 180) and shaped by `normalizeSimple` (line 412), a `kind`
dispatch. Record `raw` values may be nested: `milestones.forecast_evidence` is an array of objects
and `changes.reverification` is a task-id-keyed object of objects, so a nested run record needs no
new parsing capability.

**Two precedents that constrain this story directly.**

- `loadProject:915-917` — *"Unconfigured modules contribute `undefined`, which canonical JSON omits,
  so installing this capability cannot stale any existing STATUS.md cache."* New optional modules
  must enter `source_sha256` through `whenConfigured`, or every existing project's cached
  `STATUS.md` goes stale on upgrade.
- `normalizeSimple:435-436` — *"v1 keeps its exact historical normalized shape so adding
  response-strategy support cannot change any existing project's source hash."* The `risks` v1/v2
  split is the pattern for additive schema growth.

**Manifest validation.** `readAttempt` (`scripts/lib/agent-execution.js:95`) re-runs
`validateManifest` against **every stored manifest on every read** (line 106). `validateManifest`
(`scripts/lib/contracts.js:299`) uses `exactKeys` on the payload, so any new required field
retroactively invalidates stored evidence. `evidenceFingerprint` (line 273) computes the replay
fingerprint from `evidence`, `acceptance_evidence`, and `sources` only.

**Ranking.** `nextData` (`scripts/lib/project-state.js:1100`) filters ready, unblocked,
dependency-satisfied tasks, computes `unlocks` as a count of *immediate* successors (line 1104), and
sorts by `critical → unlocks → priority → current milestone → id` (line 1112). The reverse
dependency edge already exists as `task.blocks` and is validated as the exact reverse of
`depends_on` (line 602), so the reverse graph is materialized and trustworthy.

**Mutation.** `atomicProjectMutation` (`scripts/lib/mutations.js:191`) is the only sanctioned write
path; `startAgentTask` and `ingestAgentManifest` (`scripts/lib/agent-execution.js:187`, `:256`) show
the candidate-copy-then-validate idiom with rollback.

**Scheduler prose.** `references/execute-rpd.md:98-119` ("Dependency-wave scheduler"), with the slot
budget at line 105 and the naming/run-ID rule at line 61.

**Packaging.** `AGENTS.md` requires `npm run build:plugin` after any `skills/project-manager/`
change, plus a full-suite run. Tests: `skills/project-manager/tests/project-manager.test.js`
(1809 lines), run via `npm run test:pm`.

**Phase 1 findings (resolved).**

- `immutableInventory` (`scripts/lib/mutations.js:108`) walks only `handoffs` and `reports/history`,
  so `RUNS.md` is an ordinary mutable state file and no immutability guard applies to it.
- `validateData` (`scripts/lib/project-state.js:1152`) returns an exact `modules` map that
  `project-manager.test.js:130` asserts with `deepEqual`. Adding a `runs` module **requires updating
  that assertion** — an expected, intentional test change, not a regression.
- `nextData` order-sensitive consumers: `reportData` (`:1168` embeds full rows, `:1231` embeds
  id/title) and `kanbanData` (`:1245`, which builds a `nextRank` map from position). `statusData`
  uses only the count and is order-independent. Order-asserting tests: `project-manager.test.js:133`,
  `:218`, `:486`.
- The `:486` ORDERING fixture is safe under D8: its ready set is TASK-A (dependent TASK-D, depth 1)
  and TASK-C (no dependents, depth 0), so depth ranks them in the same order `unlocks` already does
  and the asserted `['TASK-A', 'TASK-C']` is unchanged.
- `scripts/project-manager-studio.js` contains a **generated copy** of `nextData`, `statusData`, and
  `reportData` (lines 1638-1900) built by `scripts/build-project-manager-studio.mjs`. Source changes
  do not reach Studio until `npm run build:plugin` runs, confirming the `AGENTS.md` rule.
- **Baseline: 228 tests, 228 passing.** One flaky failure appeared in the first of four runs and did
  not reproduce in three subsequent clean runs; its identity was not captured. The suite includes
  timing-sensitive watcher, SSE, and heartbeat tests. Treat a single unexplained failure in a later
  run as suspect and re-run before attributing it to this story.

## Decisions

**D1 — The run record is a new optional state file `RUNS.md`, kind `runs`, IDs `RUN-<slug>`.**
It joins `OPTIONAL_FILES` and is loaded through the existing `module()` helper. Rejected: storing
run state inside `PROJECT.md` (mixes immutable identity with per-run churn and forces every project
to carry run fields), and a JSON sidecar (breaks the folder-native Markdown constraint).

*Considered and accepted:* this puts Git branch and worktree names into project state, and the
skill's core promise is that generic Markdown project state works with Git as an optional
integration. The coupling is acceptable because `RUNS.md` is optional — a project with no agent
execution never has one — and because `TASKS.md` already binds `executor_root`. The requirement to
resume without filesystem discovery cannot be met without persisting this, so the alternative is
not a cleaner model but an unmeetable criterion.

**D2 — `RUNS.md` enters `source_sha256` through `whenConfigured`.** Mandatory per the
`loadProject:915` precedent: any project without `RUNS.md` must hash exactly as it does today, so no
existing `STATUS.md` cache is staled by upgrading.

**D3 — Run record shape.** Per record: `status`, `started`, `updated`, `repositories` (array of
`{ name, integration_branch, base_branch, base_commit, coordinator_worktree }`), and `tasks` (a
task-id-keyed object of `{ branch, executor_root, integrated }`), modelled on
`changes.reverification`. A task-keyed object rather than an array gives uniqueness for free and
matches an existing validated precedent.

**D4 — Execution telemetry rides the evidence manifest at `schema_version: 2`.** `validateManifest`
accepts 1 and 2; version 1 keeps its exact current key set and normalized shape, version 2 adds a
required `execution` object. The writer always emits 2. This is the only shape that satisfies "no
retroactive invalidation" given that `readAttempt` re-validates stored manifests on every read.
Rejected: an optional key in version 1 (weakens `exactKeys`, and makes "omitted" and "unsupported"
indistinguishable), and a separate telemetry file per attempt (a second write path outside the
atomic mutation, and it can desynchronize from the manifest it describes).

**D5 — `execution` is `{ llm_calls, tool_calls, input_tokens, output_tokens }`, each a non-negative
integer or `null`.** `null` means the executor did not report it and is preserved as unreported;
it never renders or aggregates as zero. Elapsed time is **not** stored in `execution`: it is derived
from the contract's `created_at` and the manifest's `observed_at`, both of which the skill already
owns, so elapsed is always available even when an executor reports nothing.

**D6 — `execution` does not participate in `evidenceFingerprint`.** Replay detection must stay a
function of evidence content; two submissions of identical evidence are a replay regardless of
differing token counts.

**D7 — Critical-path depth is a memoized traversal of `task.blocks`.** Depth of a task is
`1 + max(depth of its dependents)`, `0` for a sink. Memoization makes it one traversal of the graph
per ranking call and makes reconverging chains count once. Rejected: recomputing per candidate
(quadratic) and persisting depth in `TASKS.md` (derived data that can go stale).

**D8 — Depth is inserted as a sort key between `critical` and `unlocks`.** Order becomes
`critical → depth → unlocks → priority → milestone → id`. `critical` stays first because it is an
explicit human override. Placing depth immediately before `unlocks` means that when all depths tie,
the resulting order is byte-identical to today's. `unlocks` is retained in the row shape and
`reasons`, so no consumer breaks.

**D9 — Telemetry aggregation counts every attempt exactly once, and retries are additive.** A task's
totals sum all of its attempts including superseded retries, because that cost was really incurred;
a run's totals sum its tasks. Any component with at least one unreported value reports the sum of
what was reported plus an explicit unreported count, never a silent zero.

**D10 — Telemetry is observational and structurally isolated from decisions.** No readiness,
ranking, gating, or completion code path reads an `execution` value. This is enforced by keeping
aggregation in a separate read-only projection that `nextData`, `validateGraph`, and the lifecycle
assertions never call, and verified by a test that mutates recorded counts and asserts every
decision output is byte-identical. Rejected: relying on review to keep the boundary, which is how
observational data historically leaks into control flow.

**D11 — Scheduler changes are documentation-only.** `references/execute-rpd.md` governs coordinator
behavior; there is no runtime scheduler process to change. Non-goal per the REQ: adding one.

**Explicitly rejected across the story:** feature flags, environment variables, fallback modes, and
compatibility layers. Version gating in `validateManifest` is a schema version, not a fallback mode.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `renderStatus` (`scripts/lib/project-state.js:1353`) and `reportData` (line 1155) to
      confirm which consumers read module data, and record whether telemetry can be surfaced without
      changing `source_sha256` for a project that has no `RUNS.md`.
- [x] Inspect `scripts/lib/task-editor.js` and `scripts/lib/mutations.js` `immutableInventory`
      (line 108) to confirm `RUNS.md` is a mutable state file, not immutable history, and record
      which guard applies to it.
- [x] Identify every caller of `nextData` across `scripts/`, `src/`, and `tests/` and record which
      assert on row shape or ordering, so D8's compatibility claim is checked against real callers.
- [x] Record the exact pre-change unit test count from `npm run test:pm` as the baseline the final
      criterion compares against.

### Phase 2 - Run record state model

- [x] Add `RUNS.md` to `OPTIONAL_FILES` in `scripts/lib/project-state.js` and wire a
      `runs: module('RUNS.md', 'runs')` entry into the `loadProject` state object.
- [x] Add `state.runs` to `source_sha256` via `whenConfigured` so a project without `RUNS.md` hashes
      byte-identically to before, honoring the `loadProject:915` precedent.
- [x] Implement the `runs` branch of `normalizeSimple` per D3, validating the `RUN-` ID namespace,
      the status enum, RFC3339 `started`/`updated` timestamps, and the repository and task
      sub-records with their own error codes.
- [x] Extend `validateGraph` so every task id named by a run record exists in `TASKS.md`, no run
      lists a task twice, and a run may not mark a task `integrated` while that task's own status
      contradicts integration — each with a distinct assertion code.
- [x] Add a `RUNS.md` section to `references/conventions.md` documenting the record grammar and
      field semantics alongside the other optional state files.

### Phase 3 - Run lifecycle operations

- [x] Implement `startRun`, `advanceRun`, and `resumeRun` in a new
      `scripts/lib/run-execution.js`, each performing its write inside `atomicProjectMutation` and
      regenerating `STATUS.md`, following the `startAgentTask` idiom.
- [x] Make `startRun` refuse to open a second run while an unfinished run exists, with a distinct
      error code naming the unfinished run id.
- [x] Make `resumeRun` report the unfinished run's identity, per-repository integration state, and
      the exact set of already-integrated tasks purely from `RUNS.md`, performing no filesystem
      discovery of branches or worktrees.
- [x] Add `scripts/project-run.js` exposing start, advance, and resume through the existing
      `scripts/lib/cli.js` `run()` envelope so the coordinator has a CLI entry point.

### Phase 4 - Critical-path ranking

- [x] Implement a memoized `downstreamDepth` helper in `scripts/lib/project-state.js` traversing
      `task.blocks`, returning `0` for a sink and counting a reconverging task once.
- [x] Add `depth` to each `nextData` row and insert it into the sort per D8, keeping `unlocks` in
      both the row shape and the `reasons` array.
- [x] Confirm the depth computation runs once per `nextData` call rather than once per candidate,
      and that it terminates on the validated-acyclic graph without a separate cycle guard.
- [x] Update `references/tasks.md` to document `depth` as a ranking dimension and its relationship
      to `unlocks`.

### Phase 5 - Execution telemetry

- [x] Extend `validateManifest` in `scripts/lib/contracts.js` to accept `schema_version` 1 and 2,
      with 1 keeping its exact current key set and 2 requiring `execution`, and add a version-aware
      key list rather than widening the existing `exactKeys` call.
- [x] Validate `execution` per D5: exactly the four count keys, each a non-negative integer or
      `null`, rejecting negative, fractional, and non-numeric values with a distinct error.
- [x] Confirm `evidenceFingerprint` is unchanged so `execution` cannot affect replay detection
      per D6, and add the reasoning as a comment at the fingerprint definition.
- [x] Update `formatEvidenceManifest` and the ingestion path in
      `scripts/lib/agent-execution.js` to emit and persist `schema_version: 2` payloads.
- [x] Implement attempt-level elapsed derivation from the contract `created_at` and the manifest
      `observed_at`, and expose it alongside the reported counts.
- [x] Implement task-level and run-level aggregation per D9, propagating an explicit unreported
      count instead of coercing `null` to `0`.
- [x] Place telemetry aggregation in a read-only projection that no readiness, ranking, gating, or
      completion path calls, per D10, and confirm by inspection that `nextData`, `validateGraph`,
      and the lifecycle assertions reference no `execution` field.
- [x] Update `references/execute-rpd.md` and `references/conventions.md` to state exactly what an
      executor must report in `execution` and that omitting a count is permitted and recorded as
      unreported.

### Phase 6 - Surfacing telemetry

- [x] Extend `statusData` and `reportData` in `scripts/lib/project-state.js` with per-task and
      per-run execution totals, rendering nothing rather than zeros when no telemetry exists.
- [x] Extend `renderStatus` so regenerated `STATUS.md` reports run and telemetry state, and confirm
      a project with no `RUNS.md` and no version-2 manifests renders exactly as before.
- [x] Update `references/report.md` to document the telemetry fields available to each report
      audience.

### Phase 7 - Scheduler documentation

- [x] Replace the wave barrier in `references/execute-rpd.md` with a work-conserving ready-queue:
      on settle, integrate and capture evidence, then promote the next dependency-ready task
      immediately, with no group barrier.
- [x] Rewrite the concurrency budget at `references/execute-rpd.md:105` to count only mutating
      workers against the limit and budget read-only reviewers separately, stating the reason: RPD
      serializes a task's own AR/CR/VR gates and a read-only reviewer cannot conflict with a
      worktree.
- [x] Add the sink-task rule: a task that concentrates the run's acceptance value and has no
      dependents is dispatched while other work is still in flight, never last and alone.
- [x] Replace the fresh-run-ID rule at `references/execute-rpd.md:61` with run-record-aware wording:
      mint a new run ID only when no unfinished run exists, otherwise resume the recorded run.
- [x] Document the run record in the Delivery and Final report sections as the source of terminal
      Git state, replacing reconstruction from the coordinator's session memory.

### Phase 8 - Tests and verification

- [x] Add loader tests: a project with no `RUNS.md` loads and hashes identically to a recorded
      pre-change baseline; a project with a valid `RUNS.md` loads its records.
- [x] Add validation tests for each new error code — unknown task, duplicate task, contradictory
      integrated flag, bad run status, bad timestamp.
- [x] Add lifecycle tests: `startRun` refuses a second unfinished run; `resumeRun` reports recorded
      integration state without filesystem discovery; an injected mid-write failure leaves all state
      byte-unchanged.
- [x] Add ranking tests: the long-chain-versus-many-leaves case from the REQ ranks the chain first;
      a reconverging DAG counts the shared task once; identical-depth input produces byte-identical
      order to the pre-change baseline; two calls on identical state agree.
- [x] Add manifest tests: a stored `schema_version: 1` manifest fixture still validates through
      `readAttempt`; a version-2 manifest round-trips; negative, fractional, and non-numeric counts
      are each rejected; an omitted count is preserved as unreported and never renders as zero.
- [x] Add aggregation tests: task totals sum attempts including a superseded retry exactly once;
      partial reporting yields reported totals plus an explicit unreported count.
- [x] Add a genericity test: a single-task project and a project with a non-RPD executor provider
      both load, rank, and report without error.
- [x] Add an observational-isolation test per D10: mutating every recorded `execution` count leaves
      `nextData` ordering, task readiness, and validation outcomes byte-identical.
- [x] Grep the diff for hardcoded task identifiers, repository names, and executor prompt text
      drawn from any specific project, and record that the changed code contains none.
- [x] Create `.docs/tests/test-run-orchestration.md` with Given/When/Then scenarios for the CLI
      surface — starting a run, refusing a duplicate run, resuming an interrupted run, and ingesting
      a manifest carrying execution counts — since this story changes a consumer contract.
- [x] Run `npm run test:pm` and record the passing count against the Phase 1 baseline.
- [x] Run `npx tsc --noEmit` and record a clean result.

### Phase 9 - Packaging and completion

- [x] Run `npm run build:plugin` and confirm the generated root `bin/` and `ui/` directories reflect
      the source changes, per `AGENTS.md`.
- [x] Sync the complete installed skill unit to `~/.claude/skills/project-manager` after the
      rebuild, never only the edited files.
- [x] Run the complete suite via `npm test` and record the exact command and result.

## Validation

| Check | Command | Expected evidence |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | no output, exit 0 |
| Unit suite | `npm run test:pm` | all pass; count strictly greater than the Phase 1 baseline |
| Full build + suite | `npm test` | build succeeds, suite passes |
| Plugin sync | `npm run build:plugin` | regenerated `bin/` and `ui/` present in `git status` |
| Backward compatibility | loader test over pre-change fixtures | fixtures load unmodified; `source_sha256` unchanged for projects without `RUNS.md` |
| Stored-manifest compatibility | `readAttempt` over a v1 manifest fixture | validates without error |

E2E scenarios live in `.docs/tests/test-run-orchestration.md` and are executed with `ET`.

## Rollback / Risk

- **Highest risk: staling every existing `STATUS.md`.** If `state.runs` enters `source_sha256`
  unconditionally, every project's cached status becomes stale on upgrade. Mitigated by D2 and
  directly tested by the identical-hash test in Phase 8. This is the single change most worth
  reviewing.
- **Second risk: invalidating stored evidence.** A required `execution` key added to
  `schema_version: 1` would make every stored manifest fail on read, because `readAttempt`
  re-validates all of them. Mitigated by D4 and tested against a v1 fixture.
- **Ordering regressions.** D8 changes ranking output for any project with unequal depths — that is
  the intent, but a consumer asserting today's order will fail. Phase 1 enumerates callers before
  the change lands.
- **Scope.** This story spans a new state file, a schema version, a ranking change, and
  documentation. The phases are independently landable in order: Phases 2-3 (run record), Phase 4
  (ranking), Phase 5-6 (telemetry), Phase 7 (docs) each leave the repository green. If the story
  must be cut, Phase 7 is prose-only and Phase 4 is self-contained.
- **Rollback.** Every change is additive: removing `RUNS.md` from `OPTIONAL_FILES`, reverting the
  sort key, and pinning the manifest writer back to `schema_version: 1` each restore prior behavior
  without touching data written in the interim, since v2 manifests remain readable by a v2-aware
  validator and no project is required to have a `RUNS.md`.
