# Generic Project Manager Skill Delivery

## Outcome

Delivered an installable `project-manager` skill whose core object is an explicitly selected project folder, not a repository. The skill starts with structured Markdown project state, supports multiple independent projects in one workspace, and keeps Git, source code, trackers, and RPD optional.

Project Manager owns `plan → coordinate → track → report`. Executors own task work. The optional RPD adapter preserves `understand → implement → test → correct → verify` behind an immutable Task Contract → Evidence Manifest boundary.

## Delivered

- Generic skill guidance and metadata under `skills/project-manager/`.
- Strict v1 Markdown state schemas for projects, compact tasks, optional modules, contracts, manifests, and discovery indexes.
- Six explicit-folder, read-only Node.js commands for validation, status, next work, blockers, configured coverage, and normalized report facts.
- Canonical SHA-256 Task Contracts and Evidence Manifests with source/task binding, staged evidence, exact acceptance mapping, replay rejection, immutable attempts, and deterministic lifecycle transitions.
- Optional human, RPD, agent, and external executors, including portable project-scoped roots and exact-story RPD evidence snapshots.
- Same-filesystem atomic mutation helper with private validation, immutable-history protection, exact rollback, and preserved recovery bytes on rollback failure.
- Generic-to-controlled progressive structure, timestamped change impact/re-verification, stable ownership reporting, and four audience views from one truth.

## Evidence

- `node --test skills/project-manager/tests/project-manager.test.js` — 31 passed, 0 failed.
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager` — `Skill is valid!`.
- Eight E2E scenarios passed with isolated folders, sibling invariance, read-only hashes, rollback, all providers, change impact, and four report audiences.
- Clean-context generic forward test passed across two non-software projects and 12 CLI calls. Its ownership finding was fixed and the affected test reran with deterministic, read-only output.
- Clean-context RPD forward test passed contract issuance, exact-story artifact snapshots, verified manifest ingestion, final done state, and a cross-attempt rejection control.
- All 17 requirement acceptance criteria were independently verified complete.

## Review Gates

AR fixed: clarified portable executor roots, immutable attempts, and timestamped re-verification; rerun result passed

CR fixed: hardened historical roots, mutation preflight, instant ordering, and report ownership; rerun result passed

VR passed: all acceptance criteria complete

## Scope and Risk

The delivery adds only `skills/project-manager/` and matching `.docs` story artifacts. It does not modify RPD or add Git, tracker, database, service, UI, or deployment integrations.

No known acceptance gaps remain. The strict schema intentionally rejects ambiguous Markdown and stale evidence. Rollback is removal of the new skill and matching story artifacts; no migration or external state exists.
