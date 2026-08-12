# Execute RPD Tasks

Use this process for `project execute-rpd <folder|project-name>` and equivalent English or Chinese
requests to finish the selected project's RPD software work. Examples include `Execute all RPD work
for the Website Launch project` and `执行“网站上线”项目中的所有 RPD 工作`. The request authorizes local Project Manager state updates,
Git branches and worktrees, RPD execution, tests, reviews, local integration, and scoped commits. It
does not authorize pushes, pull requests, destructive cleanup, executor reassignment, or task-scope
changes.

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
5. Create one `codex/` integration branch and coordinator worktree per repository represented in the
   selected tasks. Base each task worktree on its repository's current integration branch.
6. Before issuing a never-started task's contract, create its dedicated worktree and atomically bind
   its RPD executor root to that existing absolute path. Then issue the immutable Task Contract. Do
   not move an already-started task to a different root; preserve its attempt or use the documented
   blocked-retry path.

If the runtime lacks subagents, Git worktrees, or enough repository context for safe integration,
stop with a concrete blocker. Do not silently degrade this route into shared-checkout execution.

## Dependency-wave scheduler

Repeat until all eligible RPD tasks are done or no further task can run:

1. Revalidate project state and calculate the current ready set.
2. Form a wave from dependency-independent ready tasks. Serialize tasks when repository evidence
   shows likely conflicting high-risk surfaces even if the dependency graph permits concurrency.
3. Bound the wave by runtime capacity. Keep the coordinator active and reserve at least one subagent
   slot for independent RPD review; never fill every available slot with mutating workers.
4. Assign one implementation subagent to each task worktree. Give it only the readable absolute Task
   Contract path and the contract's exact deterministic executor prompt. Let RPD own its complete
   workflow.
5. Never let two agents mutate one worktree. Reviews may overlap mutations in other isolated
   worktrees, but the worktree and snapshot under review must remain stable.
6. Keep each task's AR, CR, and VR gates serial and independent as required by RPD. An implementation
   agent may not review its own work.
7. When a task blocks, ingest a blocked manifest for that attempt, preserve its worktree and evidence,
   and continue only with unrelated ready tasks. Do not fabricate a retry or relax acceptance.

## Integration and evidence

Integrate completed task branches one at a time in project dependency order:

1. In the task worktree, merge the latest repository integration branch into the task branch before
   integrating the task. Resolve conflicts there, not by editing the coordinator worktree.
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
   from the updated integration branch, never from the original base.

Remove a task worktree only when it is clean, its commits are reachable from the integration branch,
its evidence is captured, and no retry is active. Never force removal. Retain and report each
integration branch and coordinator worktree so the user can inspect or publish the result.

## Final report

Report:

- tasks completed, blocked, skipped, or assigned to non-RPD executors;
- dependency waves and material serialization decisions;
- integration branch and retained coordinator-worktree path for each repository;
- exact verification commands and results;
- Project Manager evidence state and any remaining blockers.

Do not push, open a pull request, or claim the whole project complete unless its success criteria and
validated project state support that conclusion.
