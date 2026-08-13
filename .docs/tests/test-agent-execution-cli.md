# Agent Execution CLI and Host Contract Specification

State-adapter and CLI scenarios below are executable against temporary projects. Subagent scheduling,
capacity, isolation, worker-return, redispatch, and human-gate scenarios specify the host-agent contract;
this repository has no scheduler implementation, so those are verified by instruction conformance and
must not be reported as runtime-executed E2E behavior.

## Scenario: Start an eligible agent task without generated glue

- Given a valid active project with an unblocked dependency-ready task assigned to the `agent` executor
- When the operator runs the built-in agent-start command with JSON output
- Then the command returns the immutable contract ID and absolute contract path
- And the task is `in_progress` with that active contract
- And the project contains no generated `.pm-agent-exec.js` helper

## Scenario: Execute agent tasks through bounded subagents

- Given multiple project tasks assigned to `agent`, including independent and dependency-linked work such as briefing, outline, media preparation, and final video production
- When the user asks Project Manager to execute the project
- Then the main agent starts one bounded subagent per dependency-ready agent task using that task's immutable Task Contract
- And independent tasks run only within available capacity while dependent tasks wait for evidence-backed prerequisites
- And the main agent retains project-state mutation and manifest-ingestion ownership without accumulating each worker's full execution context
- And each worker starts with clean or minimal context containing only its contract path, executor root when present, task-local instruction, and exact compact-manifest return protocol
- And active worker count stays within available capacity after retaining the main coordinator

## Scenario: Serialize shared or uncertain mutation surfaces

- Given dependency-independent agent tasks with a shared executor root, overlapping artifact target, null root with uncertain writes, or the same external write surface
- When the coordinator forms an execution wave
- Then those tasks run serially unless concrete evidence proves their mutations are isolated
- And no two workers concurrently mutate one root or authoritative project-state files

## Scenario: Enforce null-root execution boundaries

- Given one null-root agent task that is filesystem-read-only or names an explicit non-filesystem target, and another null-root task that requires local mutation or has an uncertain target
- When the coordinator evaluates them for execution
- Then it may run the first without granting local write authority
- And it rejects the second before contract issuance until a safe executor root is assigned

## Scenario: Handle unavailable capacity before issuance

- Given a dependency-ready agent task but no available subagent slot after retaining the coordinator
- When the coordinator preflights the execution wave
- Then it does not issue a Task Contract or mutate project state
- And it reports the task as waiting for execution capacity

## Scenario: Handle spawn failure after issuance

- Given a successful capacity/isolation preflight and a newly issued agent Task Contract
- When the subagent spawn fails with a concrete runtime error
- Then the coordinator ingests an exact blocked manifest naming that runtime blocker
- And the attempt remains preserved and visibly blocked rather than stranded or falsely completed

## Scenario: Reject malformed worker output

- Given an active agent worker returns prose, a full transcript, malformed JSON, a non-object value, or a nonterminal manifest payload
- When the coordinator processes the worker result
- Then it does not interpret the output as success evidence
- And it records the concrete protocol failure as blocked or, if it cannot state one truthfully, leaves the active attempt visible and stops

## Scenario: Enforce bounded worker output

- Given otherwise valid terminal manifest payloads at exactly 65,536 UTF-8 bytes and at 65,537 bytes, plus payloads whose longest string is exactly 8,192 bytes and 8,193 bytes
- When the coordinator checks the worker return protocol
- Then it accepts both exact-boundary cases for normal manifest validation
- And it rejects both over-boundary cases as concrete protocol blockers without applying them as success evidence
- And direct CLI ingestion remains governed by the existing manifest schema rather than these worker-only context limits

## Scenario: Recover an uncertain post-issuance attempt safely

- Given an issued Task Contract whose worker outcome is unclassifiable
- When runtime state proves the old worker terminated and project validation proves no manifest exists
- Then the coordinator may dispatch the same immutable contract to one replacement worker
- But when either fact is uncertain, it starts no worker and requires explicit operator resolution

## Scenario: Unlock the next dependency wave

- Given an agent task whose verified completion is a dependency of another agent task
- When its worker returns an exact verified manifest payload and the coordinator successfully ingests it to done
- Then the dependent task becomes eligible in the next wave
- And it receives a new bounded worker rather than reusing the completed worker's context

## Scenario: Wait at a human approval gate

- Given a human task whose explicit outcome is approval and downstream `agent` and `rpd` tasks that depend on it
- When upstream agent work is done but no specific human approval evidence has been recorded
- Then the coordinator starts neither dependent task, including the dedicated RPD execution route
- And after valid human completion marks the approval task done, both dependents remain `planned` until the coordinator revalidates all blockers and dependencies and advances each eligible task to `ready`
- And only then do they become eligible under their respective execution routes

## Scenario: Preserve non-approval human ownership

- Given a human task whose outcome is human-authored work or whose custom evidence cannot be satisfied by one approval
- When project execution reaches that task
- Then the coordinator keeps it human-owned, does not label it approval-only, and does not invoke the lightweight approval adapter
- And dependent agent or RPD tasks continue waiting until the human task is evidence-backed done through its applicable execution policy

## Scenario: Ingest verified agent evidence

- Given an active agent attempt whose contract requires artifact and review evidence
- When the operator supplies an exact verified Evidence Manifest payload as JSON on standard input to the built-in ingest command
- Then the command persists the next gap-free immutable Evidence Manifest
- And the task becomes `done` with matching contract and manifest pointers
- And the project validates with a fresh STATUS cache

## Scenario: Preserve a blocked attempt

- Given an active agent attempt
- When the operator supplies an exact blocked Evidence Manifest payload with a blocker
- Then the command persists the blocked manifest
- And the task remains `in_progress`
- And `blocked_by` contains the exact manifest blocker
- And no retry contract is fabricated

## Scenario: Retry a cleared blocked attempt

- Given an active agent attempt whose terminal blocked manifest is preserved and whose exact blocker is the only current blocker
- When the operator runs the built-in agent-start command with `--retry-blocker` naming that exact blocker
- Then a distinct active Task Contract is issued
- And the prior attempt is byte-for-byte unchanged
- And the task remains `in_progress` with no last-manifest pointer for the new attempt

## Scenario: Maintain change re-verification bindings

- Given an agent task regressed to `ready` by the latest `CHANGES.md` record with pending re-verification
- When the task starts, blocks and retries, then ingests verified evidence that qualifies it for done
- Then the same change record moves from pending to the first in-progress contract, rebinds to the strictly later retry contract, and completes with that retry's verified manifest
- And unrelated change records and narrative remain byte-for-byte unchanged

## Scenario: Keep verified work short of done when a dependency regresses

- Given an active agent attempt whose dependency regressed after start
- When the operator ingests a valid verified Evidence Manifest payload
- Then the manifest is persisted and the task becomes `verified`
- And the command preserves the dependency state instead of forcing `done`

## Scenario: Keep verified work short of done when a blocker appears

- Given an active agent attempt whose task acquired an explicit coordination blocker after start
- When the operator ingests a valid verified Evidence Manifest payload
- Then the manifest is persisted and the task becomes `verified`
- And the command preserves the blocker instead of forcing `done`

## Scenario: Reject an unsafe start without mutation

- Given each independently executed invalid start state: inactive project, wrong provider, deferred disposition, cancelled disposition, wrong lifecycle/pointers, incomplete dependency, explicit blocker, missing or mismatched retry declaration, backdated normal re-verification start, backdated retry, or duplicate contract ID
- When the operator runs the built-in agent-start command for that case
- Then every case returns the specified machine-readable error and exit class
- And every case preserves all project bytes exactly

## Scenario: Reject invalid manifest input without mutation

- Given each independently executed invalid ingest state or input: inactive project, wrong provider, deferred disposition, cancelled disposition, missing active contract, terminal blocked attempt, already-verified attempt, empty input, malformed JSON, scalar JSON, multiple JSON values, trailing non-whitespace, contract/task binding mismatch, invalid evidence, illegal progression, replay, missing source, or mismatched source hash
- When the operator runs the built-in ingest command for that case
- Then every case returns the specified machine-readable error and exit class
- And every case preserves all project bytes exactly

## Scenario: Reject a concurrent project change without mutation loss

- Given a project that changes after an agent command reads its stable revision but before atomic replacement
- When the command attempts to apply its candidate
- Then the command returns a concurrent-change error
- And it preserves the newer live project bytes exactly

## Scenario: Keep project and executor roots free of generated helpers

- Given an eligible agent task bound to an absolute executor root
- When the task is started and verified evidence is ingested through the built-in commands
- Then neither the managed project nor the executor root contains `.pm-agent-exec.js` or another generated execution helper
