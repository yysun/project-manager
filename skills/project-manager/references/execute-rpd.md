# Execute RPD Tasks

Use this process for `project execute-rpd <folder|project-name>` and equivalent English or Chinese
requests to finish the selected project's RPD software work. Examples include `Execute all RPD work
for the Website Launch project` and `执行“网站上线”项目中的所有 RPD 工作`. The request authorizes local Project Manager state updates,
Git branches and worktrees, RPD execution, tests, reviews, local integration, and scoped commits. It
does not authorize pushes, pull requests, destructive cleanup, executor reassignment, or task-scope
changes.

Merging an integration branch into its base branch and removing a coordinator worktree need explicit
delivery intent. Accept that intent from the request when it is stated, as in `execute the RPD work
and merge when done` or `run the RPD work and leave it on the branch`. Otherwise obtain it at the
closing Delivery step. Never merge into a base branch or remove a coordinator worktree on assumption.

When the user supplies a project name instead of a folder, resolve it only from the calling context's
selected workspace `.projects` root. Run:

```bash
node <absolute-skill-dir>/scripts/project-resolve.js <projects-root> <project-name> --json
```

The resolver accepts one exact case-insensitive project name, ID, or direct-child folder name. Use
the returned absolute root. If no project matches, more than one project matches, or the calling
context exposes multiple plausible projects roots, stop for clarification. Never search upward,
recursively, or across arbitrary sibling directories.

## Scope and preflight

1. Resolve the project selector to one absolute folder, then validate it. Treat `PROJECT.md` and
   `TASKS.md` as truth.
2. Select active unfinished tasks whose executor provider is `rpd`. Report software work assigned to
   another provider; never silently reassign it or rewrite its specification.
3. Use `project-next.js` and the validated lifecycle to identify ready work. Never treat priority,
   schedule, a commit, or confident executor prose as readiness or completion.
4. Require every selected task to resolve to an existing Git repository. Preserve dirty user
   checkouts by doing orchestration in new worktrees instead of changing or cleaning them.
5. Create one integration branch and coordinator worktree per repository represented in the selected
   tasks, named and placed as Naming and layout below requires. Base each task worktree on its
   repository's current integration branch.
6. Before issuing a never-started task's contract, create its dedicated worktree and atomically bind
   its RPD executor root to that existing absolute path. Then issue the immutable Task Contract. Do
   not move an already-started task to a different root; preserve its attempt or use the documented
   blocked-retry path.

Isolation is not a concurrency device. A single-task sequential run still uses a task branch and a
task worktree: the user's checkout is theirs and usually dirty, and a blocked attempt must survive
intact for inspection and retry, which a shared checkout cannot offer. A per-task branch also keeps a
blocked or abandoned attempt off the integration branch, so Delivery never offers half-finished work
for merge. Concurrency decides only how many worktrees exist at once.

If the runtime lacks subagents, nested subagent spawning, Git worktrees, or enough repository context
for safe integration, stop with a concrete blocker. Do not silently degrade this route into
shared-checkout execution. RPD requires an independent clean-context reviewer for CR and VR, so an
implementation subagent that cannot spawn its own reviewer is a blocker here, never a degraded mode.

A task whose specification requires changes in more than one repository is out of scope for this
route. Report it and ask for it to be split; never split it unilaterally.

### Naming and layout

Generate one fresh lowercase 8-hex run ID per run. Never reuse a prior run's branches or worktrees. A
prior run may have deliberately left them behind under Delivery, and reuse would silently rewrite
delivered work.

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

Record per repository before the first wave: the base branch, its exact commit, whether its checkout
is clean, and which branch that checkout has checked out. Delivery compares against this baseline.

Determine whether the selected project folder lives inside any target repository's working tree. When
it does, exclude paths under that project folder from every base-checkout cleanliness test. This run
writes project state by design and must not treat its own bookkeeping as user changes. Never commit
project state to an integration or task branch; report those pending changes in the final report.

Rediscover a retained worktree from the executor root bound to its task in project state, never by
scanning the filesystem. That binding is why an already-started task keeps its root across runs.

## Dependency-wave scheduler

Repeat until all eligible RPD tasks are done or no further task can run:

1. Revalidate project state and calculate the current ready set.
2. Form a wave from dependency-independent ready tasks. Serialize tasks when repository evidence
   shows likely conflicting high-risk surfaces even if the dependency graph permits concurrency.
3. Bound the wave by runtime capacity. Budget two slots per concurrent task: the implementation
   subagent holds its slot while its serial AR, CR, and VR gates run, and each gate needs its own
   independent reviewer. Reserve one further slot for the coordinator, making the wave at most
   `floor((capacity - 1) / 2)` tasks. Never fill every available slot with mutating workers. When
   capacity cannot seat the coordinator, one implementation subagent, and one reviewer, stop with a
   concrete blocker instead of running a wave that must review itself.
4. Assign one implementation subagent to each task worktree. Give it only the readable absolute Task
   Contract path and the contract's exact deterministic executor prompt. Let RPD own its complete
   workflow.
5. Never let two agents mutate one worktree. Reviews may overlap mutations in other isolated
   worktrees, but the worktree and snapshot under review must remain stable.
6. Keep each task's AR, CR, and VR gates serial and independent as required by RPD. An implementation
   agent may not review its own work. RPD's primary-agent review fallback does not apply on this
   route; when a reviewer cannot be started, block the task rather than accept a self-review.
7. When a task blocks, ingest a blocked manifest for that attempt, preserve its worktree and evidence,
   and continue only with unrelated ready tasks. Do not fabricate a retry or relax acceptance.

## Integration and evidence

The coordinator worktree is the only checkout of the integration branch. It exists so cross-task
merges and combined-diff checks have a stable home that is neither a task worktree nor the user's
checkout. Its only permitted mutations are the merge commits produced by integrating task branches and
the artifacts produced by running checks. Never hand-edit source there.

Integrate completed task branches one at a time, in ascending task ID within a wave and in project
dependency order across waves:

1. In the task worktree, merge the latest repository integration branch into the task branch before
   integrating the task. Resolve conflicts there, not by hand-editing the coordinator worktree.
   Resolving a conflict between a task branch and the integration branch is in scope: both sides were
   produced by this run, both have Task Contracts and acceptance criteria, and the review gates
   below re-run over the resolution. Conflicts between the integration branch and the user's base
   branch are out of scope; handle them under Delivery.
2. Any conflict resolution or other material change after a review pass invalidates that pass. Rerun
   the affected RPD verification, CR, and VR stages, then create the required scoped commit.
3. Merge the refreshed task branch into the integration branch without discarding user changes.
4. Run the task's relevant checks plus integration and regression checks justified by the combined
   diff. If integration fails, keep the task out of verified/done state and return the fix to its task
   worktree through the RPD completion loop.
5. After integration passes, snapshot the exact matching RPD REQ, AP, optional E2E spec, DD, and
   terminal AR/CR/VR evidence into the immutable project attempt.
6. Create and ingest gap-free Evidence Manifests with concrete acceptance mappings. Advance the task
   to done only when the verified manifest, dependencies, and blocker rules permit it.
7. Revalidate project state and calculate the next wave. A newly ready dependent task must branch
   from the updated integration branch, never from the original base. A dependency edge may cross
   repositories; the dependent still branches from its own repository's integration branch and waits
   only on its dependency reaching done, never on another repository's branch.

Remove a task worktree as soon as it is clean, its commits are reachable from the integration branch,
its evidence is captured, and no retry is active. Never force removal, and prune the stale
administrative entry after removing the directory. Task worktrees are per task and short-lived. Only
the integration branch and coordinator worktree persist across waves, retained through the last wave
so the user can inspect the result and then resolved under Delivery.

## Delivery

Close out every repository explicitly after its last wave. A run must never end leaving an
unannotated integration branch and coordinator worktree for the user to reconstruct.

1. Establish the terminal state per repository before asking anything: integration branch, coordinator
   worktree path, base branch and whether it moved during the run, whether the base checkout is clean,
   which tasks are integrated, and which are blocked, skipped, or assigned to non-RPD executors.
2. Test the merge without mutating anything, for example with `git merge-tree`, and record whether the
   integration branch merges into the base branch cleanly or with conflicts, naming the conflicting
   paths.
3. When the request stated delivery intent, follow it without asking. Otherwise ask once, in a single
   question that enumerates every repository with its own integration branch, coordinator worktree
   path, and clean-or-conflicting merge result, and — when any selected task did not integrate — that
   merging lands partial work and which tasks it omits. A partial integration must be described as
   partial in the question itself so the answer is informed. One repository's clean merge must never
   carry another's conflicting one, so accept a per-repository answer. Stated intent authorizes the
   merge; it does not waive the conditions below.
4. Merge in the user's base checkout, which is the only checkout of the base branch, and only when it
   is clean, already has the base branch checked out, and the merge is conflict-free. The preflight
   preserved a dirty user checkout; do not undo that at the last step. When the base checkout is dirty
   or sits on another branch, report it, leave the integration branch in place, and let the user land
   it.
5. Re-run the non-mutating merge test immediately before merging, and recheck the base commit and
   checkout against the preflight baseline. Delivery intent was given against a specific base commit
   and a specific merge result; when either moved while the question was outstanding, stop and report
   rather than merge on a stale answer.
6. Never auto-resolve a conflict against the base branch. That side is work this run never saw, holds
   no Task Contract, and has no acceptance criteria to re-verify against. Report the conflicting paths,
   leave the base branch untouched — abort rather than commit a partial merge — and hand back the
   integration branch for the user to resolve or to authorize a specific strategy.
7. Remove a coordinator worktree only after its merge is confirmed and its commits are reachable from
   the base branch. Never force removal, and prune the stale administrative entry afterwards. Retain
   the worktrees of blocked or retried tasks regardless of the delivery decision, and report each path
   with the exact command that removes it.
8. Record the delivery decision as an explicit outcome. `Left on <integration-branch> at user's
   request` and `left on <integration-branch>: base checkout dirty` are results; silence is not. An
   unmerged branch must never be ambiguous between deliberate and forgotten.

## Final report

Report:

- tasks completed, blocked, skipped, or assigned to non-RPD executors;
- dependency waves and material serialization decisions;
- the delivery decision and terminal Git state for each repository: run ID, integration branch, whether
  it was merged into its base branch or deliberately left, whether the integration is partial and what
  it omits, and every retained worktree path with the exact command that removes it;
- any uncommitted project-state changes left in a repository working tree;
- exact verification commands and results;
- Project Manager evidence state and any remaining blockers.

Do not push, open a pull request, or claim the whole project complete unless its success criteria and
validated project state support that conclusion.
