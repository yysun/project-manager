# Run Orchestration and Execution Telemetry Specification

CLI and state-adapter scenarios below are executable against temporary projects. Scheduler promotion
and concurrency-budget scenarios specify the coordinator contract in
`references/execute-rpd.md`; this repository has no scheduler implementation, so those are verified
by instruction conformance and must not be reported as runtime-executed E2E behavior.

## Scenario: Open a run and record its integration identity

- Given a valid active project with at least one dependency-ready task
- When the operator runs the run-start command with a run ID, a title, and one repository binding
- Then the command returns the run ID and status `active`
- And `RUNS.md` exists and records the integration branch, base branch, base commit, and coordinator worktree for that repository
- And the project still loads and validates

## Scenario: Refuse to open a second run beside an unfinished one

- Given a project whose run record already contains an `active` run
- When the operator runs the run-start command with a different run ID
- Then the command fails with the `RUN_ACTIVE` code and names the unfinished run
- And no second run record is written
- And every state file is byte-unchanged

## Scenario: Resume an interrupted run from recorded state alone

- Given a project whose run record has an active run with two bound tasks, one integrated and one not
- And no task branch or worktree exists on the filesystem
- When the operator runs the run-resume command
- Then the command reports `resumable` true with that run's ID, repositories, and started and updated timestamps
- And it lists exactly the integrated task under integrated tasks and the other under pending tasks
- And it performs no Git or filesystem discovery to produce that answer

## Scenario: Report not resumable rather than inventing a run

- Given a project with no run record, or one whose runs are all terminal
- When the operator runs the run-resume command
- Then the command reports `resumable` false with a null run and a stated reason
- And an advance command against that project fails with the `RUN_MISSING` code

## Scenario: Ingest an evidence manifest carrying execution counts

- Given an active agent attempt on a task
- When the executor submits a `schema_version: 2` manifest whose `execution` object reports LLM calls, tool calls, and input and output tokens
- Then ingestion succeeds and the counts are stored with the attempt
- And the execution projection reports the task's totals as the sum of its manifests
- And elapsed seconds are derived from the contract creation time and the latest manifest observation time

## Scenario: Preserve an unreported count as unreported

- Given an attempt whose first manifest reports an LLM call count and whose second reports `null` for it
- When the execution projection is calculated
- Then the reported total counts only the manifest that reported
- And the unreported tally for that metric is one
- And no metric is rendered as zero on the strength of a missing report

## Scenario: Reject an invalid execution count at ingestion

- Given an active agent attempt on a task
- When the executor submits a manifest whose execution count is negative, fractional, or non-numeric
- Then ingestion fails with an error naming the offending count
- And no manifest is stored

## Scenario: Keep stored version-1 evidence valid

- Given a project containing evidence manifests written before execution telemetry existed
- When the project is loaded, which re-validates every stored manifest
- Then every stored manifest still validates
- And a version-1 manifest that carries an `execution` field is rejected as an unexpected key

## Scenario: Rank ready work by longest remaining dependency chain

- Given a project with one ready task heading a chain of three dependents and another ready task with more immediate dependents that are all leaves
- When the operator runs the next-work command
- Then the chain-heading task ranks first
- And its reported depth exceeds the fan-out task's depth
- And the fan-out task's immediate-unlock count is the larger of the two

## Scenario: Leave ranking unchanged when depth does not discriminate

- Given a project whose ready tasks all have no dependents
- When the operator runs the next-work command
- Then the order is decided by the pre-existing criticality, priority, milestone, and identifier tie-breaks
- And every reported depth is zero

## Scenario: Promote the next ready task as soon as a slot frees (coordinator contract)

- Given a run with more dependency-ready tasks than available mutating slots
- When one in-flight task settles and its evidence is captured and integrated
- Then the coordinator records the integration on the run record
- And promotes the next dependency-ready task immediately, without waiting for other in-flight tasks to finish

## Scenario: Budget read-only reviewers outside mutating capacity (coordinator contract)

- Given a runtime capacity that admits a coordinator, implementation subagents, and reviewers
- When the coordinator bounds in-flight work
- Then only mutating implementation subagents count against the concurrency limit
- And read-only reviewers are budgeted separately, because each task's review gates are serial with its own implementation agent and a read-only reviewer cannot conflict with a worktree

## Scenario: Dispatch a value-concentrating sink task with company (coordinator contract)

- Given a run containing a full vertical-slice task that no other task depends on
- When the coordinator schedules work
- Then that task is dispatched while other work is still in flight rather than last and alone
- And the coordinator requires checkpoint commits from it
