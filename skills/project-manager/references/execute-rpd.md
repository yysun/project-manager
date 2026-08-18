# Execute RPD Tasks

Use this process for `project execute-rpd <folder|project-name>` and equivalent English or Chinese
requests to finish the selected project's RPD software work. Examples include `Execute all RPD work
for the Website Launch project` and `执行“网站上线”项目中的所有 RPD 工作`.

**This request authorizes:** local Project Manager state updates, Git branches and worktrees, RPD
execution, tests, reviews, local integration, and scoped commits.

**It does not authorize:** pushes, pull requests, destructive cleanup, executor reassignment, or
task-scope changes.

**Merging into a base branch and removing a coordinator worktree need explicit delivery intent.**
Take that intent from the request when it states one, as in `execute the RPD work and merge when
done` or `run the RPD work and leave it on the branch`. Otherwise ask at the closing Delivery step.
Assumption is never sufficient.

## Resolving a project name

When the user supplies a project name instead of a folder, resolve it only from the calling context's
selected workspace `.projects` root:

```bash
node <absolute-skill-dir>/scripts/project-resolve.js <projects-root> <project-name> --json
```

1. Accept one exact case-insensitive project name, ID, or direct-child folder name.
2. Use the absolute root the resolver returns.
3. Stop for clarification when no project matches, more than one matches, or the calling context
   exposes multiple plausible projects roots.

Search only that one root. Searching upward, recursively, or across sibling directories is out of
bounds.

## Scope and preflight

1. Resolve the project selector to one absolute folder, then validate it. `PROJECT.md` and `TASKS.md`
   are the truth.
2. Select active unfinished tasks whose executor provider is `rpd`.
3. Report software work assigned to another provider, leaving its executor and specification exactly
   as written.
4. Identify ready work with `project-next.js` and the validated lifecycle. Readiness comes from that
   alone — priority, schedule, a commit, and confident executor prose are not evidence of readiness
   or completion.
5. Require every selected task to resolve to an existing Git repository.
6. Leave a dirty user checkout untouched. Orchestrate in new worktrees instead.
7. Create one integration branch and coordinator worktree per repository represented in the selected
   tasks, named and placed as Naming and layout requires. Base each task worktree on its repository's
   current integration branch.
8. For a never-started task: create its worktree, atomically bind its RPD executor root to that
   absolute path, then issue the immutable Task Contract, in that order.
9. For an already-started task: keep its existing root. Preserve the attempt, or use the documented
   blocked-retry path.
10. Request every permission the run will need now, in one message — see Waiting and escalation.
11. When the runtime exposes a goal, round budget, or similar turn-limited driver, pause it after the
    first dispatch. Those budgets advance on wall-clock cadence while the coordinator waits, so a
    run driven by settle notices exhausts one long before its workers finish. Resume or complete it
    at close-out.

Stop with a concrete blocker when any of these is true:

- The runtime lacks subagents, nested subagent spawning, or Git worktrees.
- The runtime lacks enough repository context for safe integration.
- An implementation subagent cannot spawn its own reviewer. RPD requires an independent
  clean-context reviewer for CR and VR, so this is a blocker, not a degraded mode.
- A task's specification requires changes in more than one repository. Report it and ask for it to be
  split; splitting it unilaterally is out of bounds.

Degrading this route into shared-checkout execution is never the answer to any of them.

### Why every task gets a worktree

Isolation is not a concurrency device. A single-task sequential run still uses a task branch and a
task worktree: the user's checkout is theirs and usually dirty, and a blocked attempt must survive
intact for inspection and retry, which a shared checkout cannot offer. A per-task branch also keeps a
blocked or abandoned attempt off the integration branch, so Delivery never offers half-finished work
for merge. Concurrency decides only how many worktrees exist at once.

### Naming and layout

Before minting anything, read the project's run record with `project-run.js <folder> resume --json`.
When it reports an active run, adopt that run's ID, integration branches, and task bindings and
continue it. Never mint a second ID beside an unfinished run: the previous run's integration branch
holds real merged work, and starting fresh orphans it while the record still claims it is active.
`project-run.js <folder> start` refuses this case rather than leaving the choice to judgment.

Only when no active run is recorded, generate one fresh lowercase 8-hex run ID and record it with
`project-run.js <folder> start` before dispatching any task. Never reuse a *completed* run's branches
or worktrees. A prior run may have deliberately left them behind under Delivery, and reuse would
silently rewrite delivered work.

- Integration branch: `pm/<project-id>-<run-id>`.
- Task branch: `pm/<project-id>-<run-id>-<task-id>`.
- Worktree root: `<workspace-root>/.worktrees/<run-id>`, beside `.projects`.
- Coordinator worktree: `<worktree-root>/<repo-name>-integration`, one per repository.
- Task worktree: `<worktree-root>/<task-id>`.

A task worktree carries no repository segment. Task IDs are project-owned and unique within the
selected project, and a task spanning repositories is out of scope above, so the task ID alone
identifies it. Only the coordinator is per repository and needs the repository name.

Keeping one run's worktrees together under the workspace root makes them inspectable, makes a run
removable as a unit, and keeps a multi-repository run from scattering across several Git directories.
That matters because Delivery must retain and report the worktrees of blocked and retried tasks.

The worktree root must lie outside every target repository's working tree. When the workspace root is
itself inside a working tree, or an explicit project folder resolved with no workspace root, place
that repository's worktrees at `<git-common-dir>/pm-worktrees/<run-id>` instead, from
`git rev-parse --git-common-dir`. Never place a worktree inside a repository working tree. It would
add untracked paths to the checkout this route promises to preserve, nest a checkout inside recursive
builds, searches, and editor indexes, and could by itself make the base checkout dirty and block
delivery. If neither location is writable, stop with a concrete blocker.

Record per repository before the first dispatch: the base branch, its exact commit, whether its checkout
is clean, and which branch that checkout has checked out. Delivery compares against this baseline.

Determine whether the selected project folder lives inside any target repository's working tree. When
it does, exclude paths under that project folder from every base-checkout cleanliness test. This run
writes project state by design and must not treat its own bookkeeping as user changes. Never commit
project state to an integration or task branch; report those pending changes in the final report.

Rediscover a retained worktree from the executor root bound to its task in project state, never by
scanning the filesystem. That binding is why an already-started task keeps its root across runs.

## Ready-queue scheduler

Repeat until every eligible RPD task is done or no further task can run.

1. Revalidate project state. Get the ready set from `project-next.js`.
2. Set the in-flight limit to the smaller of two numbers: the runtime capacity that still seats the
   coordinator and one reviewer, and `concurrency.widest_level` from `project-status.js`.
3. Count only mutating implementation subagents against that limit. Budget read-only reviewers
   separately.
4. Stop with a concrete blocker when capacity cannot seat the coordinator, one implementation
   subagent, and one reviewer.
5. Dispatch in the order `project-next.js` returns. Serialize two ready tasks only when repository
   evidence shows they touch conflicting high-risk surfaces.
6. Give each task its own worktree and one implementation subagent. Pass only the absolute Task
   Contract path and the contract's exact executor prompt. Let RPD own its complete workflow.
7. Dispatch a task that concentrates the run's acceptance value and has no dependents — a vertical
   slice, an end-to-end story, a final integration task — while other work is still in flight, and
   require checkpoint commits from it.
8. When any task settles: ingest its manifest, integrate it, capture its evidence, record it with
   `project-run.js <folder> advance`, then dispatch the next ready task. Other in-flight tasks
   continue meanwhile.
9. When a task blocks: ingest a blocked manifest, preserve its worktree and evidence, and continue
   with unrelated ready tasks only. Do not fabricate a retry or relax acceptance.
10. Keep one mutating agent per worktree. A reviewer may run while other worktrees mutate, but the
    worktree and snapshot under review must stay stable.
11. Keep each task's AR, CR, and VR gates serial, and give each an independent reviewer. An
    implementation agent may not review its own work. RPD's primary-agent review fallback does not
    apply here: block the task rather than accept a self-review.
12. Report `concurrency_ceiling` beside the achieved wall time in the final report.

### Why this shape

**Promote continuously, never in barriered waves.** A wave makes every task wait for the slowest
member of its group, so an unbalanced group idles workers for as long as its longest task runs while
dependency-ready work sits untouched.

**Order follows the critical path.** `project-next.js` ranks by declared criticality, then by the
longest remaining dependency chain each task unblocks, then by immediate fan-out, priority, and
milestone. Starting the longest chain first is what keeps the critical path off the end of the run.

**Width is capped by the plan, not by ambition.** `widest_level` is the most tasks this dependency
graph can ever have ready at once. Running wider adds conflict surface for provably zero gain: on a
plan with a 9-level critical path over 13 tasks, width 2 and width 13 finish at the same time.
`concurrency_ceiling` is the best speedup any scheduler could reach, which is why the final report
carries it — a wall time that looks disappointing is often a plan-time limit, not a scheduling
failure.

**Reviewers are free.** RPD serializes each task's own AR, CR, and VR gates, so a task's
implementation subagent is idle while its reviewer runs, and a read-only reviewer cannot conflict
with any worktree. Counting reviewers against mutating capacity halves achievable width for a
conflict that cannot occur.

**Sinks rank last by construction.** Any dependency-based ordering puts a task with no dependents at
the end. That is usually the task whose loss costs the most, so it needs the most redundancy, not
the least.

## Waiting and escalation

A coordinator waits on two very different things, and conflating them is what turns a run's idle time
into dead time. **A worker will finish on its own. A human will not, unless asked.**

### Ask for everything you will need before the first dispatch

During preflight, identify and request in one message every permission the run will need: sandbox or
network escalation, credentials for an external system, approval to advance a branch whose `.git`
lives outside the session workspace. Request them even when the need is only likely.

An escalation requested during preflight costs nothing while workers run. The same escalation
requested mid-run blocks integration until a human happens to look.

### Declare a human-gated wait; do not poll it

When the run cannot proceed without a human — an approval, an external artifact, a decision — emit
**one** prominent message and then stop working that line:

1. State exactly what you are blocked on.
2. State what is already complete, so the wait is not mistaken for a stall.
3. State precisely what resumes when the answer arrives.
4. Continue any unrelated ready work. Report when that is exhausted too.

Do not re-poll a human gate on a timer. A person who has not answered has not seen it, and polling
neither notifies them nor advances the run.

### Never sleep-poll a worker

Use the runtime's blocking wait — a job-output wait or equivalent — to sleep until a worker actually
settles. Fixed-duration sleeps are always wrong: too short and they burn turns, too long and they add
latency to every handoff.

### Close out immediately when the last task settles

Run Delivery as soon as the final task is integrated. A completed run that sits waiting for a
close-out instruction is indistinguishable from a stalled one, and the person who could end it does
not know it is their turn.

### Why this matters

Measured across four analyzed runs, roughly eight hours of wall time was spent this way:

- **149 minutes** waiting on an external package publish, ended only when the operator typed
  "stop wait, continue".
- **165 minutes** of idle tail after the last worker finished, waiting for a merge instruction.
- **162 minutes** blocked on a sandbox escalation first requested 43 minutes into the run — an
  escalation that would have cost zero blocked minutes if requested during preflight.
- One run used 22 fixed sleeps totalling 107 minutes. The run with the lowest handoff overhead used
  **zero** sleeps and blocking waits instead.

None of this is worker time, review time, or integration time. It is time when nothing was running
and nobody knew it was their turn.

## Integration and evidence

The coordinator worktree is the only checkout of the integration branch. Its only permitted
mutations are the merge commits produced by integrating task branches and the artifacts produced by
running checks. Hand-editing source there is out of bounds.

Integrate settled task branches **one at a time**, in project dependency order, ascending task ID
among tasks that are otherwise equal:

1. In the **task** worktree, merge the latest repository integration branch into the task branch.
   Resolve any conflict there.
2. Rerun the affected RPD verification, CR, and VR stages, then create the required scoped commit.
   Conflict resolution — or any other material change after a review pass — invalidates that pass.
3. Merge the refreshed task branch into the integration branch, preserving user changes.
4. Run the task's relevant checks plus the integration and regression checks the combined diff
   justifies.
5. On integration failure: keep the task out of verified and done, and return the fix to its task
   worktree through the RPD completion loop.
6. On success: snapshot the exact matching RPD REQ, AP, optional E2E spec, DD, and terminal AR, CR,
   and VR evidence into the immutable project attempt.
7. Create and ingest gap-free Evidence Manifests with concrete acceptance mappings, each carrying
   `schema_version: 2` and an `execution` object (see Execution telemetry below).
8. Advance the task to done only when the verified manifest, dependencies, and blocker rules permit
   it.
9. Revalidate project state and recalculate the ready set. A newly ready dependent task branches from
   the **updated** integration branch, never from the original base.
10. Remove a task worktree once it is clean, its commits are reachable from the integration branch,
    its evidence is captured, and no retry is active. Prune the stale administrative entry after
    removing the directory. Forced removal is out of bounds.

**Conflict scope.** A conflict between a task branch and the integration branch is yours to resolve:
both sides came from this run, both have Task Contracts and acceptance criteria, and the review gates
above re-run over the resolution. A conflict between the integration branch and the user's base
branch is not; handle it under Delivery.

**Cross-repository dependencies.** A dependency edge may cross repositories. The dependent still
branches from its own repository's integration branch and waits only on its dependency reaching done,
never on another repository's branch.

**Lifetime.** Task worktrees are per task and short-lived. Only the integration branch and
coordinator worktree persist across the run, retained until Delivery resolves them so the user can
inspect the result.

### Execution telemetry

Each Evidence Manifest reports, for the work that manifest covers:

- `llm_calls`, `tool_calls`, `input_tokens`, `output_tokens`.

Rules:

1. Counts are **incremental per manifest**, not cumulative, so one summation rule composes from
   attempt to task to run.
2. An executor that cannot report a count sets it to `null`. That is permitted, and it is recorded as
   unreported.
3. Report `null` rather than estimating. An estimated count is indistinguishable from a measured one
   and corrupts every total above it.
4. Elapsed time derives from the contract and manifest timestamps, so it is recorded even when every
   count is `null`.

## Delivery

Close out every repository explicitly once its last task settles. Ending a run with an unannotated
integration branch and coordinator worktree leaves the user to reconstruct it.

1. Read the terminal state per repository from the run record:
   `project-run.js <folder> resume --json`. It reports the integration branch, coordinator worktree
   path, base branch, which tasks are integrated, and which are blocked or skipped. Use the record
   rather than session memory — that is what lets a session which did not dispatch the work close it
   out.
2. Add what the record does not hold: whether the base branch moved during the run, and whether the
   base checkout is clean.
3. Test the merge without mutating anything, for example `git merge-tree`. Record whether the
   integration branch merges cleanly into the base branch, naming any conflicting paths.
4. When the request stated delivery intent, follow it. Otherwise ask **once**, in a single question
   that lists every repository with its integration branch, coordinator worktree path, and
   clean-or-conflicting merge result.
5. Describe a partial integration as partial **in the question itself**, naming the tasks it omits,
   so the answer is informed.
6. Accept a per-repository answer. One repository's clean merge must not carry another's conflicting
   one.
7. Merge only in the user's base checkout, and only when it is clean, already on the base branch, and
   the merge is conflict-free. Stated intent authorizes the merge; it does not waive these
   conditions.
8. When the base checkout is dirty or sits on another branch: report it, leave the integration branch
   in place, and let the user land it. The preflight preserved that dirty checkout — undoing it at
   the last step defeats the purpose.
9. Immediately before merging, re-run the non-mutating merge test and recheck the base commit and
   checkout against the preflight baseline. Delivery intent was given against a specific base commit
   and merge result; if either moved while the question was outstanding, stop and report rather than
   merge on a stale answer.
10. On a conflict against the base branch: report the conflicting paths, abort rather than commit a
    partial merge, leave the base branch untouched, and hand back the integration branch for the user
    to resolve or to authorize a strategy. Auto-resolving is out of bounds — that side is work this
    run never saw, holds no Task Contract, and has no acceptance criteria to re-verify against.
11. Remove a coordinator worktree only after its merge is confirmed and its commits are reachable
    from the base branch. Prune the stale administrative entry afterwards. Forced removal is out of
    bounds.
12. Retain the worktrees of blocked or retried tasks whatever the delivery decision, and report each
    path with the exact command that removes it.
13. Move the run record to its terminal status with `project-run.js <folder> advance`. A run left
    `active` after delivery is indistinguishable from an interrupted one and blocks the next run from
    starting.
14. Record the delivery decision as an explicit outcome. `Left on <integration-branch> at user's
    request` and `left on <integration-branch>: base checkout dirty` are results; silence is not. An
    unmerged branch must never be ambiguous between deliberate and forgotten.

## Final report

Report:

- tasks completed, blocked, skipped, or assigned to non-RPD executors;
- the run ID and its recorded status, and material serialization decisions;
- the plan's concurrency ceiling and critical path alongside the achieved wall time, so the result is
  read against what the dependency graph permitted rather than against serial execution;
- measured execution totals per task and for the run — elapsed time, LLM calls, tool calls, and input
  and output tokens — reporting unreported counts as unreported rather than as zero;
- the delivery decision and terminal Git state for each repository: run ID, integration branch, whether
  it was merged into its base branch or deliberately left, whether the integration is partial and what
  it omits, and every retained worktree path with the exact command that removes it;
- any uncommitted project-state changes left in a repository working tree;
- exact verification commands and results;
- Project Manager evidence state and any remaining blockers.

Do not push, open a pull request, or claim the whole project complete unless its success criteria and
validated project state support that conclusion.
