# Generic Project Manager Skill E2E Specification

## Scenario 1 - Initialize two folder-native projects

Given one repository/workspace containing an empty non-software rollout folder and an empty software delivery folder

When Project Manager initializes each folder from its objective or source

Then each folder becomes an independent project object with `PROJECT.md`, `TASKS.md`, and `STATUS.md`

And neither project requires Git, a repository, source code, RPD, milestones, or traceability

And every deterministic result requires and echoes the explicitly selected folder

And reading or updating one folder leaves the sibling byte-identical

And an optional workspace `PROJECTS.md` with relative, non-escaping entries can discover both folders, rejects duplicates/stale/mismatched/symlink entries, and never becomes authoritative project state

## Scenario 2 - Add structure only when the project needs it

Given a valid minimal non-software project

When risks, milestones, source documents, and formal traceability become operationally necessary

Then Project Manager adds only the corresponding optional modules

And existing project/task IDs and compact task records remain stable

And missing optional modules report `unconfigured` or `unknown`, not false zeroes or errors

## Scenario 3 - Select the next executable task

Given an active selected project with ready, blocked, dependency-blocked, and complete tasks

When `project-next.js <project-folder> --json` runs

Then it returns only valid ready tasks from that project

And it ranks declared critical work, tasks newly unblocked, priority, current milestone, and ID in that order

And it does not claim duration-based critical-path scheduling

And the selected and sibling project bytes remain unchanged

## Scenario 4 - Coordinate a human executor through evidence

Given a ready non-software task assigned to a human executor

When Project Manager starts it and later receives approval and artifact evidence

Then it persists one immutable, hashed Task Contract bound to the current task and sources

And it normalizes the provider result into one matching immutable Evidence Manifest

And Task Contract issuance alone moves ready work to in-progress while only validated manifests advance implemented, verification, verified, or done state

And every acceptance item and provider evidence minimum is satisfied before verified/done

And acceptance evidence is drawn from the main evidence set, provider any-of groups count deterministically, and the same evidence fingerprint cannot be disguised by sequence, status, time, or notes

And stale source, changed task, unsupported version, malformed field, sequence gap, duplicate evidence, or replayed manifest input is rejected without mutation

And explicit blocker strings remain separate from unfinished dependency task IDs in state and output

And other-agent and external providers use the same contracts/manifests with their own enabled-provider and root rules

## Scenario 5 - Coordinate RPD without absorbing RPD

Given a ready software task whose selected project enables the RPD adapter

When Project Manager coordinates the task

Then the Task Contract states the outcome, constraints, acceptance, sources, and evidence expectations

And RPD alone owns understanding, architecture, implementation, testing, correction, and verification

And the attempt-qualified RPD story expands its digest suffix until it cannot collide with another project, task, or retry

And Project Manager hashes exact-story RPD artifacts and terminal evidence into the Evidence Manifest

And it snapshots every consumed RPD artifact into the immutable project attempt before using project-relative manifest sources

And mismatched, stale, same-task prior-attempt, sibling-project, or incomplete evidence cannot mark the task done

And moving a project with no active attempt preserves historical evidence while moving an active attempt forces a new contract

And the RPD prompt provides a readable absolute contract path while project identity and hashes remain portable

## Scenario 6 - Validate dependencies, lifecycle, and rollback

Given invalid project variants with malformed records, duplicate IDs, unknown dependencies, a cycle, stale reverse links, illegal lifecycle/evidence combinations, or descendant symlinks

When validation runs with each explicit project folder

Then semantic errors exit `1`, selector/path/grammar errors exit `2`, and every error identifies the selected project and affected path

And an invalid candidate leaves the live project byte-identical

And an injected failure after the first replacement restores the full prior byte snapshot and removes new paths

## Scenario 7 - Track sources and requirement changes when configured

Given a controlled project with current and superseded sources plus traceability

When a new source version changes or removes criteria

Then Project Manager identifies affected tasks, milestones, verified work, evidence requiring re-verification, scope, and delivery risk

And it records the change, regresses stale task evidence, and keeps source code as only one possible source kind

And coverage results distinguish configured coverage from unconfigured projects

And empty, duplicate, unresolved, or unstably ordered traceability criteria are rejected instead of inflating coverage

## Scenario 8 - Report one truth to different audiences

Given one selected project with tasks and optional milestones, blockers, risks, decisions, sources, changes, forecasts, and evidence

When operator, project-manager, executive, and board reports are requested

Then every view derives from the same deterministic report data

And emphasis changes without changing facts or leaking sibling state

And any other audience is rejected before a report filename can be constructed

And missing schedule, coverage, or forecast evidence remains explicitly unknown or unconfigured

And project completion is rejected until every success criterion is mapped to evidence-backed done work

## Execution Evidence

Executed on 2026-08-08 with isolated temporary folders. No fixture wrote to the repository.

- Automated contract suite: `node --test skills/project-manager/tests/project-manager.test.js` — 31 tests passed, 0 failed. The suite covers minimal/core isolation, multi-project discovery, ranking/blockers, optional modules, all providers, contracts/manifests, replay and stale binding rejection, RPD snapshots, project moves, exact CLI envelopes, parser/date failures, immutable history, and rollback.
- Skill package: `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager` — `Skill is valid!`.
- Scenario 1: two non-software projects initialized atomically with exactly the three core files; all six CLIs echoed the selected identity, and sibling/project hashes were unchanged.
- Scenario 2: one project remained minimal while the other added milestone, risk, source, traceability, then change state only when each became operationally necessary.
- Scenario 3: five-task festival fixture returned venue first because it was declared critical and unlocked two tasks; blocked output separated dependency task IDs from the police-staffing blocker.
- Scenario 4: provider defaults and roots passed for human, RPD, agent, and external executors; hashed human completion, blocker retry, acceptance mapping, replay, stale source, sequence, and malformed-manifest controls all executed.
- Scenario 5: an RPD-enabled software fixture issued an attempt-qualified hashed contract, snapshotted exact-story REQ/AP/test/DD/terminal artifacts, accepted required artifact/command/review evidence, reached done, and rejected a canonical rehashed cross-attempt story with `RPD_SOURCE_STORY`.
- Scenario 6: invalid fields, grammar, IDs, dependencies, cycles, lifecycle lies, symlinks, and CLI exit classes executed; injected candidate and post-replacement failures restored exact prior tree hashes, while rollback failure preserved a recovery path.
- Scenario 7: source/traceability/change fixtures distinguished configured coverage from absence, identified affected tasks/milestone, required post-change re-verification contracts, and rejected unstable or duplicate criteria and ambiguous change instants.
- Scenario 8: operator, project-manager, executive, and board narratives were derived from one captured report payload; all four carried canonical fact digest `6a5de7d8c848bab2`. Unsupported audience `finance` was rejected before filename construction or writes.

Clean-context forward results:

- Generic fixture: 12/12 CLI calls across two projects exited 0; repeated report output was byte-identical; ownership included all five named festival owners and preserved an ownerless grant task as null; pre/post tree hashes matched.
- RPD fixture: contract `tc-7b592…`, manifest `em-44add…`, and final done state validated; a separate one-test executor suite passed; validate/status/report-data exited 0; Project Manager coordinated but did not perform the RPD workflow.

Review gates:

- `AR fixed: clarified portable executor roots, immutable attempts, and timestamped re-verification; rerun result passed`
- `CR fixed: hardened historical roots, mutation preflight, instant ordering, and report ownership; rerun result passed`

And optional external tracker references remain display-only mappings that cannot replace project-owned task IDs
