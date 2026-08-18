# Requirement — Run Orchestration and Execution Telemetry

**Source:** `../pm-analysis/analysis/coordinator-process-review.md` (four sibling RPD runs), plus
direct inspection of `skills/project-manager/scripts/lib/` and
`skills/project-manager/references/execute-rpd.md`.

## Problem

Multi-task RPD runs lose wall time and lose work for reasons that live in this skill's
orchestration layer, not in its mechanics. Coordinator turnaround between tasks is already fast.
Five structural gaps account for the observed loss, and each is generic to any project with more
than one dependency-ordered task.

**1. A run has no durable identity.** `grep -rn "run_id\|integration_branch"
skills/project-manager/scripts/lib/` returns nothing. The run ID, each repository's integration
branch and base commit, the coordinator worktree path, and which tasks have been integrated exist
only in the coordinator's conversation. Only `executor_root` is bound per task
(`references/execute-rpd.md:95`). Because `references/execute-rpd.md:61` requires a fresh run ID
per run and forbids reusing a prior run's branches, a session that dies mid-run cannot be resumed:
a new session mints a new run ID and orphans the previous integration branch. One analyzed run lost
its close-out this way with 12 of 13 tasks already integrated and verified — the work survived, the
bookkeeping did not.

**2. The wave barrier leaks capacity.** `references/execute-rpd.md:98-119` forms a wave, then waits
for all of it. Nothing promotes a dependency-ready task into a slot freed early, so every unbalanced
wave idles workers. In one analyzed run a wave's first task finished 165 minutes before its second
while eleven ready tasks waited. This is a prose-level constraint, not a code limitation:
`nextData` (`scripts/lib/project-state.js:1100`) already returns the complete ranked ready set.

**3. The concurrency budget counts read-only reviewers as mutating capacity.**
`references/execute-rpd.md:105` budgets two slots per concurrent task and caps a wave at
`floor((capacity - 1) / 2)`. But RPD keeps AR, CR, and VR serial within a task, so a reviewer runs
while its own implementation agent is idle, and a read-only reviewer cannot conflict with any
worktree. The budget therefore halves achievable width for a conflict that cannot occur.

**4. Ranking has no critical-path notion.** `nextData` ranks by `unlocks`
(`scripts/lib/project-state.js:1104`), which counts *immediate* successors only. A task with one
successor that heads a long chain sorts below a task with three leaf successors, so the longest
dependency chain is routinely started late — in one analyzed run the longest task started ninth of
thirteen. Task records also carry no size or duration field at all, so no cost dimension is
available to the ranking.

**5. Execution is unmeasured.** No record exists of how long an attempt took or what it consumed.
The coordinator cannot distinguish a healthy long-running attempt from a stalled or looping one, no
run can be compared against another, and a completed project carries no cost history.

## Requirement

The skill gains durable run identity, work-conserving scheduling, critical-path-aware ranking, and
per-attempt execution measurement. All of it must be generic: it applies to any project with agent
executors, including single-task projects and projects mixing RPD with other executor providers, and
must not assume any particular task naming, repository layout, or project shape.

- **Durable run record.** A run's identity and integration state persist in project state as
  Markdown, alongside the existing state files, and are written before the first task is dispatched
  and updated as the run progresses. A later session can discover an interrupted run and resume it
  under its original identity instead of minting a new one.
- **Work-conserving scheduling.** The documented scheduler promotes a dependency-ready task as soon
  as a slot frees, rather than waiting for a whole wave to finish.
- **Correct concurrency budget.** Only mutating workers count against the concurrency limit.
  Read-only reviewers are budgeted separately.
- **Critical-path ranking.** Ready work is ranked by the longest remaining dependency chain it
  unblocks, not only by immediate successors, with an explicit rule preventing a value-concentrating
  sink task from being scheduled last and alone.
- **Execution telemetry.** Every agent attempt records elapsed time, LLM call count, tool call
  count, input tokens, and output tokens; these aggregate to the task, the run, and the reports.
- **No retroactive invalidation.** Every project file, Task Contract, and evidence manifest already
  on disk stays valid and loadable, and every existing project without a run record keeps working
  unchanged.

## Acceptance Criteria

### Run record

- [x] Project state supports an optional run record file that is discovered, parsed, and validated
      by the same loader that handles the existing optional state files, and a project without one
      loads and validates exactly as before.
- [x] A run record captures, per run: a run identifier, its status, when it started and last
      advanced, and — for each repository the run touches — the integration branch, the base branch
      and the base commit the run started from, and the coordinator worktree path.
- [x] A run record captures, per task in the run: the task identifier, its task branch, its executor
      root, and whether it has been integrated.
- [x] Given a project whose run record shows a run still in progress, a resume operation reports
      that run's identity, its per-repository integration state, and the exact set of tasks already
      integrated, without inspecting the filesystem for branches or worktrees.
- [x] Starting a new run while a run record shows an unfinished run is refused with a distinct
      error identifying the unfinished run, rather than silently minting a second run ID against the
      same project.
- [x] Recording run progress uses the same atomic project mutation and rollback guarantees as the
      existing state mutations: an injected failure mid-write leaves the run record and every other
      state file exactly as they were.
- [x] A run record is validated for internal consistency — every task it lists exists in the
      project, no task appears twice, and a task cannot be marked integrated while its own task
      status contradicts that — and an inconsistent record fails validation with its own error code.

### Scheduling and ranking

- [x] `references/execute-rpd.md` documents a work-conserving ready-queue: when a task settles, its
      integration and evidence capture run and the next dependency-ready task is promoted
      immediately, with no barrier requiring an entire group to finish first.
- [x] The documented concurrency budget counts only mutating workers against the limit and budgets
      read-only reviewers separately, with the reasoning stated: RPD serializes a task's own review
      gates, and a read-only reviewer cannot conflict with a worktree.
- [x] Ready work is ranked by the longest downstream dependency chain each task unblocks. Given a
      project where task A has one successor heading a chain of several tasks and task B has more
      immediate successors that are all leaves, A ranks above B. Computing this adds no more than a
      single traversal of the dependency graph per ranking call.
- [x] The critical-path computation is correct on a dependency graph that is a DAG but not a tree —
      where two chains reconverge on one task, that task's depth is counted once, not once per path.
- [x] Ranking output remains deterministic: two calls against identical state produce identical
      order, and every existing tie-break that ranking already applies still applies after the new
      dimension.
- [x] `references/execute-rpd.md` states an explicit rule that a task which concentrates the run's
      acceptance value and has no dependents — the shape that pure critical-path ranking would
      schedule last and alone — is dispatched while other work is still in flight.
- [x] Existing ranking behavior is preserved where the new dimension does not apply: on a project
      whose ready tasks all have identical downstream depth, the resulting order is unchanged from
      before this story.

### Execution telemetry

- [x] An agent attempt records elapsed wall-clock time, LLM call count, tool call count, input
      token count, and output token count.
- [x] Elapsed time is derived from timestamps the skill already controls, so it is recorded even
      when an executor reports no counts at all.
- [x] Call and token counts are supplied by the executor through the evidence manifest. A manifest
      that omits them is accepted and its counts are recorded as unreported — distinguishable from
      a genuine zero.
- [x] Reported counts are validated as non-negative integers; a negative, fractional, or
      non-numeric count is rejected at ingestion with a distinct error rather than stored.
- [x] Telemetry is additive to the manifest schema and version-gated, so that every evidence
      manifest already on disk still passes `validateManifest` when re-read through the stored
      attempt path — which re-validates every stored manifest on every read.
- [x] Telemetry aggregates without double counting: a task's totals sum its attempts, a run's
      totals sum its tasks, and an attempt superseded by a retry is attributed to the task exactly
      once under a stated rule.
- [x] Status and report output expose the recorded execution totals for a run and for each task,
      and a project with no telemetry recorded renders without error or fabricated zeros.
- [x] Telemetry is observational only: no scheduling, readiness, gating, or completion decision
      changes as a function of a recorded count.

### Cross-cutting

- [x] No behavior depends on any project-specific task name, identifier pattern, repository layout,
      or executor prompt text introduced by this story.
- [x] A single-task project and a project whose tasks use a non-RPD executor provider both continue
      to work, with the run record and telemetry applying to whatever agent attempts exist.
- [x] Every existing project state file, Task Contract, and evidence manifest on disk remains valid
      and loadable, verified by a test that loads pre-change fixtures unmodified.
- [x] Generated plugin artifacts are rebuilt so the packaged skill matches source, per `AGENTS.md`.
- [x] `npx tsc --noEmit` is clean and the full unit suite passes with a test count greater than the
      pre-change count.

## Constraints

- **Folder-native Markdown state.** New state is human-readable Markdown in the project folder,
  parsed by the existing loader conventions. No database, no JSON sidecar, no external service.
- **No retroactive invalidation.** `readAttempt` re-validates every stored manifest on every read
  (`scripts/lib/agent-execution.js:106`), so manifest schema changes must be version-gated rather
  than added to the existing exact-key set.
- **Atomicity is preserved.** Run-record writes use `atomicProjectMutation` with its existing
  rollback guarantee. No new write path bypasses it.
- **The MCP App stays read-only.** No mutation entry point becomes reachable from `src/mcp-app/**`.
- **Truthful measurement.** An unreported count is recorded as unreported, never as zero, and never
  estimated or inferred.
- **No cross-skill dependency.** This story does not require any change to the `rpd` skill. It
  consumes what an executor reports and derives the rest from timestamps the coordinator owns.
- **Generated artifacts stay in sync** — changes under `skills/project-manager/` require
  `npm run build:plugin` per `AGENTS.md`.

## Non-Goals

- **Changing the `rpd` skill.** Reviewer-reuse enforcement and review-round disclosure are real and
  diagnosed, but they belong to a separate story against a separate repository. This story must not
  encode a round budget, and must not fail when an executor reports no review-round data.
- **A task duration or estimate field.** Critical-path *depth* is structural and free from data
  already in `depends_on`. Duration-weighted scheduling needs a new per-task estimate, which is a
  separate product decision about what humans must supply at planning time. Telemetry recorded here
  is what makes that decision answerable later with real data.
- **Automatic recovery or redispatch.** The run record makes an interrupted run *discoverable and
  resumable*; deciding to redispatch a lost task stays a coordinator judgment with the existing
  blocked-retry path.
- **Changing goal, wait, or escalation policy.** Pausing the goal after first dispatch, declaring
  human-gated waits, and requesting escalations in preflight are prose-only process fixes with no
  shared data model; they are worth doing and are deliberately not bundled into this schema story.
- **Cost estimation or pricing.** Token counts are recorded as counts. No model pricing, currency,
  or spend projection.
- **Changing how concurrency is actually achieved.** This story fixes the documented budget and
  promotion rule. It does not add a runtime scheduler process or change how subagents are spawned.
- Adding feature flags, environment variables, or compatibility modes for any change here.
