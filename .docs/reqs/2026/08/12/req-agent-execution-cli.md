# Agent Execution CLI

## Problem

Project Manager declares `agent` as a governed executor, but the installed skill exposes no built-in operation for issuing an agent Task Contract or ingesting the agent's Evidence Manifest. During ordinary execution, Codex can compensate by generating project-local glue such as `.pm-agent-exec.js`. That file is neither project state nor an executor artifact, is not documented by the skill, and makes identical lifecycle behavior depend on improvised code.

## Requirement

The installable Project Manager skill must provide deterministic, reusable commands for starting an agent task and ingesting its returned evidence. Those commands must use the existing Task Contract, Evidence Manifest, change re-verification, validation, immutable-attempt, concurrency, STATUS regeneration, and atomic rollback boundaries. Natural-language project execution must use these built-in commands and must not generate project-local execution helpers. The main agent must remain the coordinator and delegate each dependency-ready `agent` task to a bounded subagent, running independent tasks in capacity-bounded parallel waves and dependent tasks only after their prerequisites are evidence-backed done.

## Acceptance Criteria

- [x] A built-in command starts one eligible `ready` `agent` task with no active pointers for its current specification, or explicitly retries one blocked agent attempt after its exact blocker is declared cleared, by atomically issuing a new immutable Task Contract, setting its lifecycle to `in_progress`, and returning the contract path and identifiers without changing prior attempts.
- [x] A built-in command ingests one manifest payload for the active agent attempt, validates the exact existing contract and gap-free progression, persists the next immutable Evidence Manifest, and atomically updates lifecycle pointers and blocker state.
- [x] Starting, retrying, and completing an agent task governed by the latest `CHANGES.md` re-verification record atomically advances that binding from `pending` to `in_progress`, rebinds it on retry, and advances it to `complete` only with the verified manifest that supports `done`.
- [x] A verified agent manifest advances the task to `done` only when dependencies are complete and no blocker exists; earlier stages and blocked attempts retain the lifecycle required by the existing state contract.
- [x] Invalid provider, disposition, lifecycle or pointers, dependency, blocker or retry declaration, contract binding, duplicate contract, manifest, source bytes or hash, replay, or concurrent-change input fails without changing project bytes.
- [x] The commands accept machine-readable input/output suitable for Codex orchestration without creating a helper script inside the managed project or executor root.
- [x] Skill instructions and user documentation direct agent execution through the built-in commands and explicitly prohibit generated project-local execution helpers.
- [x] Skill instructions define one bounded subagent per dependency-ready agent task as the normal execution unit, reserve the main agent for coordination and evidence ingestion, parallelize only independent tasks within runtime capacity, and pass each worker the immutable Task Contract instead of the coordinator's accumulated context.
- [x] Each agent worker receives minimal task-local context, never edits Project Manager state, and returns exactly one concise Evidence Manifest payload JSON object with terminal `verified` or `blocked` status; malformed or transcript-heavy output is rejected rather than interpreted as success.
- [x] The bounded-worker return protocol accepts at most 65,536 UTF-8 bytes and no individual JSON string over 8,192 UTF-8 bytes; over-limit output is a protocol failure and the general manifest-ingestion CLI remains governed only by the existing manifest schema.
- [x] Agent tasks run in parallel only when both dependencies and mutation surfaces are proven independent; shared or uncertain executor roots, artifact paths, or external write surfaces serialize.
- [x] An agent task with a null executor root runs only when its work is filesystem-read-only or uses an explicitly identified non-filesystem artifact/write target; local mutation or an uncertain target is rejected until a safe executor root is assigned.
- [x] A dependency-ready `human` task remains human-owned; when modeled as an approval task it is an explicit gate, and no dependent `agent` or `rpd` task starts until specific approval evidence marks that human task done and the coordinator separately revalidates and advances each eligible dependent from `planned` to `ready` under ordinary coordination rules.
- [x] Subagent availability and capacity are checked before contract issuance; a concrete spawn failure after issuance is recorded as a blocked manifest, while an unclassifiable failure leaves the active attempt visible and stops without fabricated evidence.
- [x] An unclassifiable post-issuance failure may reuse the same immutable contract only after the runtime proves no prior worker remains active and no manifest was ingested; otherwise execution requires explicit operator resolution and never starts a second worker for the attempt.
- [x] Automated tests cover successful start and manifest ingestion, staged and blocked transitions, CLI behavior, and rollback or rejection paths.
- [x] The complete installable skill is synchronized to the global Project Manager installation after verification.

## Constraints

- Preserve the existing Task Contract and Evidence Manifest schemas and hashes.
- Preserve immutable handoff history and same-filesystem atomic mutation behavior.
- Do not weaken RPD, human, or external executor rules.
- Do not add dependencies, feature flags, environment variables, or compatibility fallbacks.
- Do not make executor-produced artifacts authoritative project state.
- Preserve the existing subagent availability, capacity, and isolation constraints of the host runtime.
- Retain the main agent's capacity slot and never pass full conversation history to an agent worker when clean or minimal context spawning is available.

## Non-Goals

- Implement a generic agent runtime or subagent scheduler inside Node.js.
- Replace the dedicated dependency-aware `execute-rpd` orchestration route.
- Add Studio controls for executing tasks.
- Automatically execute `external` or controlled `human` tasks.
- Treat every human task as approval-only; human remains a general executor whose default evidence happens to be approval.
- Delete previously generated helper files from unrelated projects.
