# Agent Execution CLI Plan

## Goal

Make governed agent execution a built-in Project Manager capability so Codex can start agent tasks and persist returned evidence without inventing project-local JavaScript.

## Current Context

- `skills/project-manager/scripts/lib/contracts.js` owns exact contract and manifest construction, hashing, and validation.
- `skills/project-manager/scripts/lib/mutations.js` owns atomic candidate replacement, immutable-attempt enforcement, concurrency revisions, and rollback.
- `skills/project-manager/scripts/lib/human-completion.js` demonstrates a provider-specific mutation adapter but intentionally cannot serve agent work.
- `skills/project-manager/scripts/lib/project-state.js` validates lifecycle pointers, contract bindings, manifest sequences, blockers, source hashes, and STATUS freshness.
- `skills/project-manager/scripts/lib/task-editor.js` provides record-preserving TASKS parsing/rendering that execution mutations can reuse.
- `skills/project-manager/references/impact.md` and `project-state.js` require the latest re-verification binding to move atomically with its task contract and verified completion.
- No installed CLI currently starts or advances a governed `agent` attempt; `project-complete-human.js` is the only concrete write-side CLI.
- The public command contract and persistent state boundary make this planned work. A CLI consumer-contract E2E specification is required.

## Decisions

- Add a focused `lib/agent-execution.js` adapter and two small CLIs: `project-start-agent.js` and `project-ingest-agent-manifest.js`.
- Keep the adapter agent-specific. A provider-generic executor API would imply unsupported human, external, and RPD orchestration semantics.
- Accept exactly one manifest payload object as JSON from standard input, followed only by whitespace. Empty, malformed, scalar, multiple, or trailing non-whitespace input is an argument failure. This gives Codex a machine-readable boundary without requiring a temporary or project-local helper file.
- Make start output identify the immutable contract and absolute path; execution itself remains the host agent's responsibility.
- The main host agent coordinates. For each dependency-ready `agent` task it starts one bounded subagent with the immutable Task Contract path and only task-local context. Independent tasks may form capacity-bounded parallel waves; dependent tasks wait for evidence-backed completion. Human work stays with the user, and RPD work stays on the dedicated RPD route.
- A human task is never delegated to an agent worker. When its outcome is explicit approval, downstream `agent` and `rpd` tasks remain `planned` until the human task is evidence-backed `done`; minimal/standard may use the existing one-step approval adapter, while controlled retains governed human execution. Human completion itself does not promote dependents. The coordinator then revalidates blockers and every dependency and performs the separate ordinary `planned → ready` coordination update before the applicable agent or RPD execution route starts. Human tasks may also represent non-approval human work, so executor type alone must not invent a gate description.
- Preflight callable subagent support, available capacity, and safe execution isolation before issuing contracts. Retain the coordinator slot. If capacity is unavailable before issuance, do not mutate project state; report the task as waiting.
- Spawn agent workers with clean context (`fork_turns:"none"` when supported) and pass only the readable absolute Task Contract path, resolved executor root when present, a task-local instruction to satisfy the contract, and the exact return protocol. One worker lifetime owns one project task.
- A worker must return exactly one canonical Evidence Manifest payload JSON object with terminal status `verified` or `blocked`, using the contract's project/task bindings, acceptance keys, evidence schema, and current sequence. The serialized worker return must be at most 65,536 UTF-8 bytes and every JSON string at most 8,192 UTF-8 bytes. These are host-orchestration limits, not additional restrictions on direct use of the manifest-ingestion CLI. It must not return full transcripts or edit `PROJECT.md`, `TASKS.md`, `STATUS.md`, `CHANGES.md`, or `handoffs/`. The coordinator validates and ingests the payload; prose is never normalized into success evidence.
- A concrete spawn failure after issuance is coordinator-observed execution failure, so the coordinator ingests a blocked payload naming that exact runtime blocker. Malformed, transcript-heavy, or nonterminal worker output is likewise an exact protocol blocker and may be recorded blocked. If the failure cannot be stated concretely, leave the attempt visibly `in_progress`, do not fabricate a manifest, stop that task, and report it.
- After an unclassifiable post-issuance failure, the coordinator may dispatch the same immutable contract again only when runtime state proves the prior worker terminated and project validation proves no manifest was ingested. If either fact is uncertain, stop for explicit operator resolution; never create a second contract or concurrent worker for the attempt.
- Parallelize only tasks that are dependency-independent and mutation-isolated. Resolved executor roots must be distinct, and known artifact paths/external write surfaces must not overlap. A null root, shared root, overlapping target, or uncertain write surface serializes unless evidence proves the workers are read-only with respect to one another. Workers never mutate authoritative project-state paths.
- A null-root task is executable only for filesystem-read-only work or work with a specifically identified non-filesystem artifact/write target, such as a connected creative service. The worker receives no local write authority. If the task needs local mutation or its target is uncertain, stop before contract issuance and require an explicit safe project-scoped or absolute executor root.
- Reuse the exact manifest payload schema. Do not introduce a second evidence schema or translate relaxed evidence claims.
- Map manifest status to task status using the existing lifecycle contract: `implemented`, `verification`, `verified`, or `in_progress` for blocked; promote verified to `done` only when existing completion gates hold.
- On a blocked manifest, append its exact blocker to `blocked_by` only when absent; preserve every pre-existing coordination blocker. Non-blocked manifests preserve `blocked_by` unchanged.
- Both operations require `project.status === "active"`, provider `agent`, and active task disposition. Manifest ingestion rejects deferred or cancelled tasks before candidate mutation.
- A normal start accepts only a `ready` agent task with no active contract or manifest pointers for its current specification, no blockers, and completed dependencies. Existing inactive attempt history from an older attempt/specification is allowed, but a contract-ID collision fails without overwrite.
- A retry accepts only an agent task whose active attempt ends in a blocked manifest and whose exact blocker is supplied through `--retry-blocker`. The retry removes only that exact blocker, rejects if any blocker remains, preserves the entire old attempt, issues a distinct contract, clears `last_manifest`, and binds the new active contract while retaining `in_progress`. Its `created_at` must be strictly later than the blocked manifest's `observed_at`.
- Reject `planned`, active non-blocked, `implemented`, `verification`, `verified`, `done`, deferred, cancelled, dependency-incomplete, or otherwise pointer-inconsistent starts. Never turn ordinary `start` into implicit planning or retry.
- A verified manifest maps to `done` only when dependencies are still complete and `blocked_by` is empty at ingestion time. Otherwise it maps to `verified`; no blocker is discarded to force completion.
- Manifest `sources` are references only. The caller must stage every project-relative regular evidence file before ingestion with the declared SHA-256; the command never copies executor artifacts. Missing, unsafe, or hash-mismatched source bytes fail in candidate validation without changing live project bytes.
- Export and reuse the existing canonical `parseAttempt` primitive from `project-state.js` to read the active Task Contract and prior Evidence Manifest payloads. Do not create a second or relaxed attempt-document parser in the agent adapter.
- When the latest change record maps the task for re-verification, normal start requires its binding to be `pending` and `created_at` strictly later than the change's `observed_at`, then atomically records `{status:"in_progress",contract_id,manifest_id:null}`. Retry atomically rebinds that same entry to the new later contract. Ingestion retains `in_progress` for intermediate, blocked, or verified-but-not-done states and records `{status:"complete",contract_id,manifest_id}` only when the verified manifest advances the task to `done`.
- Reuse `parseTaskRecords` and `renderRecord` as the existing record-preserving collection metadata editor for the selected `CHANGES.md` record; do not rewrite unrelated change records or narrative. Candidate validation remains authoritative.
- Do not add feature flags, environment configuration, compatibility wrappers, or an all-provider execution abstraction.

### Public CLI contract

- Start: `node project-start-agent.js <project-folder> <task-id> [--created-at <RFC3339-UTC>] [--retry-blocker <exact-blocker>|--retry-blocker=<exact-blocker>] [--json] [--help]`. The equals form is required when exact blocker text begins with `--`.
- Ingest: `node project-ingest-agent-manifest.js <project-folder> <task-id> [--json] [--help]`, with exactly one manifest payload JSON object on standard input.
- Start success JSON is `{ok:true,command:"start-agent",project:{id,root},data:{task_id,status,contract_id,contract_path,retry}}`.
- Ingest success JSON is `{ok:true,command:"ingest-agent-manifest",project:{id,root},data:{task_id,status,contract_id,manifest_id,manifest_path,sequence}}`.
- `--json` selects the success JSON envelope; without it, stdout is a concise human-readable summary. Errors always write one JSON envelope to stderr and nothing to stdout.
- Errors are `{ok:false,command,project:null|{id,root},errors:[{code,path,message,usage}]}`. Semantic eligibility/evidence/conflict failures exit 1. CLI syntax, stdin grammar, selector/path, and unexpected grammar/I/O failures exit 2.
- `--help` must be the sole argument, print usage to stdout, and exit 0. Duplicate flags, unknown flags, missing values, wrong positional counts, and mixing `--help` with execution fail with exit 2.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `contracts.js`, `project-state.js`, `mutations.js`, `human-completion.js`, and agent attempt tests to confirm exact start, manifest, lifecycle, source-binding, and rollback invariants.
- [x] Confirm `project-state.js`'s existing `parseAttempt` is the canonical stored-attempt parser to export and reuse; reject duplicate parsing logic in the new adapter.
- [x] Inspect `impact.md` and `validateReverificationBindings` to identify the latest applicable CHANGES record and lock its pending, in-progress, retry, and complete transitions plus strict timestamp rules.
- [x] Confirm implementation points for the locked Public CLI contract, including stdin framing, stable envelopes, error classification, and exit codes.
- [x] Record that agent runtime scheduling, RPD orchestration, external execution, controlled-human execution, Studio actions, and legacy helper cleanup remain out of scope.

### Phase 2 - Governed agent mutation foundation

- [x] Export the existing canonical `parseAttempt` from `project-state.js` before adapter work and use it for contract/manifest reconstruction without introducing a parallel parser.
- [x] Implement shared source-binding, record-preserving TASKS/CHANGES mutation, latest re-verification selection, eligibility, chronology, stable-snapshot, conflict, and narrow test-injection helpers in `agent-execution.js` before public start/ingest operations.
- [x] Implement the locked normal-start and explicit blocked-retry eligibility state machine on those foundations, including active-project/disposition gates, retry chronology, old-attempt preservation, and duplicate-contract rejection.
- [x] Add the atomic start operation that binds current sources, creates one immutable contract, updates TASKS and applicable CHANGES state, and regenerates STATUS.
- [x] Add manifest ingestion that reads the active contract and prior sequence through the canonical parser, validates the supplied exact payload through `contracts.js`, writes only the next manifest, preserves/deduplicates blockers, updates lifecycle and re-verification pointers, and regenerates STATUS atomically.
- [x] Use stable project revision checks and narrow test injection hooks in both public operations so concurrent changes and replacement failures preserve exact live bytes.
- [x] Keep the adapter provider-specific and reject non-agent tasks and unsupported attempt states clearly.

### Phase 3 - Agent subagent orchestration contract

- [x] Update `SKILL.md` and `references/track.md` so natural-language execution starts one bounded subagent per dependency-ready agent task with its Task Contract, while the main agent retains coordination, state mutation, and evidence-ingestion ownership.
- [x] Define capacity-bounded waves for dependency- and mutation-independent agent tasks, shared/uncertain-root serialization, clean/minimal context transfer, one-worker-per-task lifetime, coordinator-slot retention, and the stop condition when subagents or safe isolation are unavailable.
- [x] Define null-root read-only/non-filesystem execution, rooted local mutation, and rejection of uncertain write targets before issuance.
- [x] Define the exact terminal manifest-payload worker return protocol and its 65,536-byte/8,192-byte-string orchestration limits, the prohibition on worker project-state mutation/full transcripts, and coordinator handling for blocked, malformed, over-limit, preflight-capacity, post-issuance-spawn, and uncertain-worker-state outcomes.
- [x] Keep human tasks with the user and RPD tasks on `execute-rpd`; do not implement scheduling inside the Node.js mutation commands.
- [x] Document explicit human approval tasks as dependency gates, including the separate post-approval revalidation and `planned → ready` coordination action, without redefining every human task as approval-only or allowing an agent or RPD worker to bypass them.

### Phase 4 - Built-in CLI surfaces

- [x] Add `skills/project-manager/scripts/project-start-agent.js` implementing the exact start arguments, help behavior, envelopes, error classes, and exit codes in the Public CLI contract.
- [x] Add `skills/project-manager/scripts/project-ingest-agent-manifest.js` implementing exact single-object stdin framing plus the exact ingest arguments, help behavior, envelopes, error classes, and exit codes in the Public CLI contract.
- [x] Ensure both commands produce deterministic JSON success/error envelopes and never write helper code into managed project or executor roots.

### Phase 5 - Tests and verification wiring

- [x] Extend `skills/project-manager/tests/project-manager.test.js` with distinct library tests for normal agent start, staged and verified completion, verified-with-regressed-dependency retention, verified-with-explicit-blocker retention, blocked ingestion with blocker preservation/deduplication, and explicit blocked retry with chronology and old-attempt preservation.
- [x] Add tests for re-verification normal start, blocked retry rebinding, verified-to-done completion, record/narrative preservation, and exact-byte rejection of a backdated normal or retry contract.
- [x] Add independently executed exact before/after tree-hash rejection cases for inactive project, provider on both operations, disposition on both operations, missing active contract, unsupported/terminal ingest lifecycle, lifecycle/pointers, dependency, blocker/retry declaration, backdated retry, contract binding/tampering, duplicate contract, manifest evidence, progression, missing source, mismatched source hash, replay, concurrent revision conflict, and injected replacement rollback.
- [x] Add CLI tests for every argument/stdin framing class, stable success/error envelopes and exit codes, agent start, standard-input manifest ingestion, and helper absence from both the managed project and an absolute executor root.
- [x] Perform a line-by-line host-contract conformance review for minimal-context prompts, worker count within capacity while retaining the coordinator, shared/uncertain-root serialization, allowed null-root read-only/non-filesystem work, rejected null-root local/uncertain mutation, pre-issuance capacity failure, post-issuance spawn failure, safe same-contract redispatch, uncertain redispatch refusal, malformed/over-limit worker output at both boundaries, blocked worker output, and verified completion unlocking the next dependency wave. Record these as instruction-contract checks, not runtime executions; a host scheduler is explicitly out of scope.
- [x] Run `npm run test:pm` and record the passing result.
- [x] Run `npm run typecheck` and `npm run build` to confirm the installable scripts and bundled Studio remain valid.

### Phase 6 - Skill contract and installation sync

- [x] Update `skills/project-manager/SKILL.md`, `references/track.md`, `references/impact.md`, `references/conventions.md`, and `README.md` with the agent subagent execution model, built-in commands, CHANGES binding behavior, and prohibition on generated project-local helpers.
- [x] Update `CHANGELOG.md` with the built-in agent execution boundary.
- [x] Run the CLI scenarios in `.docs/tests/test-agent-execution-cli.md` and record observable evidence.
- [x] Sync the complete `skills/project-manager/` directory to `~/.agents/skills/project-manager/` and verify the installed copy matches.
- [x] Mark plan tasks complete only after their corresponding implementation or evidence exists.

## Validation

- `npm run test:pm` must pass all Project Manager unit and integration tests.
- `npm run typecheck` must pass.
- `npm run build` must pass and regenerate the standalone Studio bundle from current sources.
- Execute every state-adapter and CLI scenario in `.docs/tests/test-agent-execution-cli.md` against temporary projects. For host-only orchestration scenarios, perform and record a line-by-line conformance review of the skill instructions; do not claim runtime execution because this repository deliberately supplies no host scheduler.
- Compare `diff -qr skills/project-manager ~/.agents/skills/project-manager`; it must return no differences.
- Inspect `git diff --check` and the final scoped diff before review.

## Rollback / Risk

- Incorrect TASKS rewriting could corrupt user narrative or lifecycle pointers; reuse the established record parser/renderer and verify candidate state before replacement.
- Stored-attempt parser drift could accept documents differently from project validation; export and reuse only the existing canonical `parseAttempt` implementation.
- Re-verification binding drift could make an otherwise valid candidate fail or falsely report stale work complete; update the latest applicable CHANGES record in the same transaction and test every binding transition.
- One subagent per tiny internal action would fragment ownership; use the project task as the delegation unit and decompose it first only when its outcome or evidence boundary is genuinely too broad.
- Worker prose or transcripts would move context growth back into the coordinator; require one exact compact manifest payload and reject nonconforming output as a protocol blocker.
- Even valid JSON can be unbounded; enforce the worker-only 65,536-byte serialized and 8,192-byte per-string limits before bringing a result into coordinator reasoning.
- Dependency independence does not prove write isolation; serialize shared or uncertain execution roots and artifact/external write surfaces.
- A null executor root is not a scratch directory; permit only filesystem-read-only or explicitly targeted non-filesystem work and require a declared root for local mutation.
- Incorrect manifest sequencing or status mapping could falsely complete work; delegate validation to the existing exact contract engine and test every terminal class, including verified work held short of done by a new dependency or blocker.
- Source-relative evidence could escape the project; rely on existing manifest source validation and project-state safe reads rather than adding a weaker path check.
- Concurrent project writes could be lost; bind both operations to a stable mutation revision and test exact-byte rollback with a narrow internal injection hook.
- Rollback is removal of the new adapter/CLIs and documentation. No schema or migration is introduced.
