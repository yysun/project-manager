# Coordinate and Track

Starting a task is an explicit coordination act:

1. Validate the selected project and confirm the task is ready with active disposition.
2. Generate a Task Contract from the current normalized task and source bindings.
3. Persist it under `handoffs/<task>/<contract>/TASK-CONTRACT.md` without overwriting anything.
4. Move the task to `in_progress` and record the active contract atomically.
5. Give the contract to the selected executor.

Returned evidence must be normalized into the exact Evidence Manifest schema. Ingest manifests in a gap-free sequence. Reject unsupported versions, unknown fields, task/source hash mismatch, invalid progression, insufficient stage evidence, missing acceptance mappings, and replayed evidence fingerprints without changing project state.

Before every contract issuance or manifest ingestion, require `disposition: active`. A deferred or
cancelled task may retain immutable attempt history, but no evidence observed after its disposition
timestamp may advance lifecycle.

For `minimal` and `standard` human tasks that have never started, `project update` may use the internal
`project-complete-human.js` adapter. It accepts one explicit approval reference/result and atomically
creates the normal Task Contract plus first verified Evidence Manifest before marking the task done.
Reject this convenience path for controlled projects, non-human executors, non-active dispositions,
blockers, unfinished dependencies, existing history, custom evidence one approval cannot satisfy, or
unverifiable bound sources. Do not weaken evidence to force the shortcut.

For RPD, snapshot the exact matching REQ, AP, optional E2E test, DD, and terminal evidence into the project attempt before using their hashes in a manifest. Project Manager reads RPD outcomes; it does not take over RPD's workflow.

A blocked manifest is terminal for that attempt. Clear the explicit blocker, preserve the old attempt, and issue a new Task Contract for retry.

When current sources or the task specification change, preserve immutable history but clear stale active pointers and return the task to planning/readiness as appropriate.
