# Run Orchestration and Execution Telemetry

## Summary

- **Runs are now durable.** A new optional `RUNS.md` state file records each run's ID, status,
  timestamps, per-repository integration branch / base branch / base commit / coordinator worktree,
  and per-task branch, executor root, and integration flag. Before this, none of that existed
  anywhere on disk — `grep -rn "run_id\|integration_branch" scripts/lib/` returned nothing — so a
  lost coordinator session could not resume a run, only start a new one and orphan the previous
  integration branch.
- **`startRun` / `advanceRun` / `resumeRun`** (`scripts/lib/run-execution.js`) plus a
  `project-run.js` CLI. `startRun` refuses to open a second run beside an unfinished one;
  `resumeRun` answers from `RUNS.md` alone and performs no Git or filesystem discovery.
- **Ready work is ranked by critical path.** `nextData` now computes `depth` — the longest remaining
  dependency chain a task unblocks — with a memoized traversal of the already-validated `blocks`
  reverse link, and ranks on it above immediate fan-out. A chain-heading task now outranks a task
  with more leaf dependents.
- **Execution telemetry.** Evidence manifests accept `schema_version: 2`, adding an `execution`
  object with `llm_calls`, `tool_calls`, `input_tokens`, `output_tokens`. Elapsed time is derived
  from contract and manifest timestamps, so it is recorded even when an executor reports no counts.
  A read-only `executionData` projection aggregates attempt → task → run.
- **The scheduler documentation was rewritten** from a barriered dependency-wave model to a
  work-conserving ready-queue: promote on settle, count only mutating workers against concurrency
  (read-only reviewers are budgeted separately, since RPD serializes each task's own gates), and
  dispatch a value-concentrating sink task with company rather than last and alone.

## Verification

- `npm test` (build + full suite): **240 tests, 240 passing**, up from a 228-test baseline.
- `npx tsc --noEmit`: clean.
- `npm run build:plugin`: regenerated `bin/` and `ui/`; the installed skill at
  `~/.claude/skills/project-manager` was resynced as a complete unit after the final rebuild.
- **Backward compatibility proved empirically, not asserted.** The pre-change `project-state.js` was
  extracted from commit `1f139a1` and run against an identical fixture: a project with no `RUNS.md`
  hashes to `567b6942…f0a5a1` under both the old and new modules. That literal is now pinned in the
  suite, so a future change that stales every project's cached `STATUS.md` fails a test.
- A stored `schema_version: 1` manifest still validates through the stored-attempt path, which
  re-validates every manifest on every read; version 1 rejects `execution` and version 2 requires it.
- 12 tests added, covering: hash identity, run schema and cross-record validation, the
  refuse-second-run and resume-without-discovery behaviors, byte-level rollback across five real
  failure modes plus an injected mid-write failure, long-chain-vs-many-leaves ranking, reconverging
  DAG depth, unchanged ordering when depth ties, telemetry version gating and count rejection,
  unreported-vs-zero preservation, observational isolation, and genericity on a single-task
  non-RPD project.

## Notes

- **A pre-existing flaky test exists and is not from this work.** `production SSE watcher reports
  external edits, atomic root replacement, and later new-root edits` failed once in four baseline
  runs *before any change*, and intermittently after. It passed on every re-run (three consecutive
  clean runs at both baseline and final). Worth fixing separately; treat a lone unexplained failure
  in this suite as suspect and re-run before attributing it.
- **Review independence was weaker than RPD requires.** This session could not spawn subagents, so
  AR and CR ran through RPD's documented primary-agent fallback with the same checklists and pass
  criteria — but the reviewer was the same agent that authored the artifacts. AR still found three
  blocking plan gaps and CR found one real defect (superseded attempt directories are not covered by
  `validateAttempt`, so telemetry now refuses symlinks and non-regular files itself).
- **Deliberate deviation from the plan:** telemetry was surfaced in `reportData` only, with
  `statusData` carrying a cheap in-memory run summary instead. `renderStatus` runs inside every
  atomic mutation, and `executionData` walks the handoffs tree; putting it there would have added
  filesystem cost to every write.
- **Counts are incremental per manifest**, not cumulative. This gives one summation rule that
  composes at every level. Executors must follow it or task totals will be wrong; it is stated in
  `conventions.md` and `execute-rpd.md`.
- **Not done, deliberately** (recorded as REQ non-goals): no change to the `rpd` skill, so
  reviewer-reuse enforcement and review-round disclosure remain open; no task duration/estimate
  field, so scheduling is critical-path-depth-aware but not duration-weighted — the telemetry added
  here is what will make that decision answerable with real data; and goal/wait/escalation policy
  was left out as prose-only work with no shared data model.
- The E2E spec `.docs/tests/test-run-orchestration.md` marks its last three scenarios as coordinator
  contract, verified by instruction conformance rather than runtime execution, since this repository
  has no scheduler implementation.

## Follow-on: dependency-ceiling analysis (added after VR)

Recovering the task dependency graphs from `project-manager-app/.projects` invalidated the source
review's top recommendation and produced a second increment against this story's area.

- **The source review's width-3 estimate was wrong.** It simulated M-HOST's 13 tasks as independent;
  12 of 13 carry dependencies. On the real graph with real durations the critical path is 872 min and
  width 2, 3, 4, and 13 all finish at 920 min. Its projected ~420 min was below the critical path and
  unreachable. Real opportunity is 1,142 → 920, about 19%, from work-conserving promotion rather than
  added width. `analysis/coordinator-process-review.md` was corrected in place (new §0a, plus §1, §8,
  and §9).
- **The four analyzed runs used four different skill revisions**, so they were never a controlled
  comparison. The frontend run's flat per-stage architecture (70 depth-1 agents, zero depth-2) was
  permitted by the revision in force and forbidden by `1f139a1` six hours later.
- **New `concurrencyData` projection** reports `critical_path`, `widest_level`, `serial_prefix`, and
  `concurrency_ceiling` for the remaining plan, surfaced in `statusData`. A test reproduces the real
  M-HOST milestone shape and asserts its 1.44x ceiling, so the number that invalidated the review is
  now computed by the skill rather than discovered by hand.
- **`execute-rpd.md`** now caps in-flight work at the smaller of runtime capacity and `widest_level`,
  and requires the ceiling in the final report so wall time is read against what the plan permitted.
- **`plan.md` and `review.md`** gained dependency-density guidance: declare a dependency only when the
  dependent cannot *start* without the other, prefer the specific contract-establishing edge over
  transitive restatements, and treat a long `serial_prefix` as a signal that foundation work was split
  into stages that are not independently verifiable.

This is the lever the original analysis missed. No scheduler can beat a plan's critical path, so for
M-HOST-shaped work the dominant control on wall time is decomposition, not orchestration.

