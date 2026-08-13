# Coordinate and Track

Starting a task is an explicit coordination act:

1. Validate the selected project and confirm the task is ready with active disposition.
2. Generate a Task Contract from the current normalized task and source bindings.
3. Persist it under `handoffs/<task>/<contract>/TASK-CONTRACT.md` without overwriting anything.
4. Move the task to `in_progress` and record the active contract atomically.
5. Give the contract to the selected executor.

Returned evidence must be normalized into the exact Evidence Manifest schema. Ingest manifests in a gap-free sequence. Reject unsupported versions, unknown fields, task/source hash mismatch, invalid progression, insufficient stage evidence, missing acceptance mappings, and replayed evidence fingerprints without changing project state.

## Agent execution

Use the installed commands for governed `agent` tasks. Do not create a project-local or executor-local
helper script:

```bash
node <absolute-skill-dir>/scripts/project-start-agent.js <project-folder> <task-id> [--created-at <RFC3339-UTC>] [--retry-blocker <exact-blocker>|--retry-blocker=<exact-blocker>] --json
node <absolute-skill-dir>/scripts/project-ingest-agent-manifest.js <project-folder> <task-id> --json
```

The ingest command reads exactly one Evidence Manifest payload JSON object from standard input,
followed only by whitespace. Empty input, malformed or non-object JSON, multiple values, and trailing
non-whitespace fail without mutation. `--help` must be the sole argument. Both commands write stable
JSON errors to standard error; semantic eligibility/evidence/conflict failures exit 1, while command,
selector, path, grammar, and unexpected I/O failures exit 2.

Normal start requires an active project and one active, unblocked, dependency-complete `ready` task
whose provider is `agent` and whose current specification has no active contract or manifest pointer.
It atomically creates a collision-free immutable Task Contract, records its pointer, changes lifecycle
to `in_progress`, refreshes `STATUS.md`, and returns the contract ID and absolute path. Older inactive
attempt history is allowed and never changed.

Retry is explicit. `--retry-blocker` must exactly name the sole cleared blocker from the active
attempt's terminal blocked manifest. Remove only that blocker, preserve the old attempt byte for byte,
issue a distinct contract created strictly after the blocked manifest, clear `last_manifest`, and keep
the task `in_progress`. Reject ordinary start as an implicit retry, and reject planned, active
non-blocked, later-stage, done, deferred, cancelled, dependency-incomplete, pointer-inconsistent, or
otherwise ineligible tasks before mutation.
When the exact blocker begins with `--`, pass it as `--retry-blocker=<exact-blocker>` so it cannot be
misread as another flag.

Manifest ingestion requires the active contract and current task/source bindings to match exactly.
The caller stages every referenced project-relative regular evidence file with its declared SHA-256;
the command validates but never copies executor artifacts. It persists only the next gap-free immutable
manifest. `implemented`, `verification`, and `verified` advance to their supported lifecycle; `blocked`
keeps the task `in_progress` and adds its exact blocker without discarding or duplicating existing
coordination blockers. A verified manifest advances to `done` only while dependencies remain complete
and `blocked_by` is empty; otherwise it remains `verified`.

The main agent coordinates execution and owns all project-state mutation. Before issuing any contract,
confirm callable subagent support, available capacity after retaining the coordinator slot, and safe
execution isolation. One clean/minimal-context bounded worker owns one dependency-ready agent task and
receives only its absolute contract path, resolved executor root when present, task-local instruction,
and return protocol. Independent tasks may share a capacity-bounded wave only when executor roots,
artifact targets, and external write surfaces are also proven independent. Shared or uncertain roots
or targets serialize.

A null-root worker may perform filesystem-read-only work or write to one explicit non-filesystem
target without local write authority. Local mutation or an uncertain target requires a safe declared
project-scoped or absolute executor root before issuance. Workers never edit authoritative project
state or `handoffs/`.

Each worker returns exactly one canonical terminal (`verified` or `blocked`) Evidence Manifest payload JSON
object, not prose or a transcript. Before bringing the return into coordinator context, enforce a
65,536-byte UTF-8 maximum for the serialized object and an 8,192-byte UTF-8 maximum for every JSON
string. Exact-boundary returns proceed to normal manifest validation. These limits apply only to the
bounded-worker return protocol; direct CLI ingestion retains the existing manifest schema limits.

No preflight capacity means no contract and no state change. A concrete spawn failure after issuance,
or a concrete malformed/over-limit worker return, may be ingested as a blocked manifest naming that
exact failure. If the failure cannot be classified truthfully, leave the active attempt visible and
ingest nothing. Redispatch the same contract only when the runtime proves the prior worker terminated
and project validation proves no manifest exists. If either is uncertain, stop for operator resolution;
never run two workers for one attempt.

Before every contract issuance or manifest ingestion, require `disposition: active`. A deferred or
cancelled task may retain immutable attempt history, but no evidence observed after its disposition
timestamp may advance lifecycle.

For `minimal` and `standard` human tasks that have never started, `project update` may use the internal
`project-complete-human.js` adapter. It accepts one explicit approval reference/result and atomically
creates the normal Task Contract plus first verified Evidence Manifest before marking the task done.
Reject this convenience path for controlled projects, non-human executors, non-active dispositions,
blockers, unfinished dependencies, existing history, custom evidence one approval cannot satisfy, or
unverifiable bound sources. Do not weaken evidence to force the shortcut.

Human tasks are never delegated to agent workers. When a human task explicitly represents approval,
its specific approval evidence is a dependency gate and dependent agent or RPD work remains `planned`
until it is `done`. Human completion does not change dependent lifecycle. After approval, revalidate
every blocker and dependency and use an ordinary coordination update to move each eligible dependent
from `planned` to `ready`; only then start its agent or RPD execution route. Human tasks can also
represent human-authored or custom-evidence work; do not relabel those tasks as approval-only or force
them through the lightweight adapter.

For RPD, snapshot the exact matching REQ, AP, optional E2E test, DD, and terminal evidence into the project attempt before using their hashes in a manifest. Project Manager reads RPD outcomes; it does not take over RPD's workflow.

A blocked manifest is terminal for that attempt. Clear the explicit blocker, preserve the old attempt, and issue a new Task Contract for retry.

For the latest `CHANGES.md` record that requires a task's re-verification, normal agent start requires
`pending` and a contract created strictly after the change's `observed_at`, then atomically records
`in_progress` with that contract and a null manifest. A blocked retry rebinds the same entry to the new,
strictly later contract. Intermediate, blocked, and verified-but-not-done ingestion retain
`in_progress`. Only the verified manifest that advances the task to `done` records `complete` with the
matching contract and manifest. Preserve unrelated change records and narrative exactly.

When current sources or the task specification change, preserve immutable history but clear stale active pointers and return the task to planning/readiness as appropriate.
