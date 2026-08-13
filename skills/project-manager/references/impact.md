# Assess Change Impact

Use this only when sources, success criteria, scope, or decisions change.

1. Record the changed source or decision and its stable ID.
2. Compare the new facts with the prior version; do not infer a diff from a label alone.
3. Follow source → criterion → task links when traceability is configured.
4. Identify affected milestones, evidence that is now stale, and verified tasks requiring re-verification.
5. State delivery and risk consequences explicitly.
6. Add a `CHANGES.md` record with an exact UTC `observed_at`, then regress stale execution state atomically. A re-verification contract must be created strictly after that timestamp.

For the latest change record affecting a task, keep its re-verification binding in lockstep with
governed execution:

- regression creates `pending` with null contract and manifest bindings;
- normal start changes it to `in_progress` with the new later contract;
- a blocked retry preserves history and rebinds `in_progress` to the distinct, strictly later retry
  contract with a null manifest;
- intermediate, blocked, or verified-but-not-done evidence keeps it `in_progress`; and
- only the verified manifest that supports task `done` changes it to `complete` with matching contract
  and manifest IDs.

Apply the task and latest applicable change-record transition in one atomic mutation. Preserve older
change records and unrelated narrative byte for byte.

Source code is one source kind, not privileged. For unverifiable current sources, allow planning and execution but prevent verified completion until an immutable version or content hash exists.
