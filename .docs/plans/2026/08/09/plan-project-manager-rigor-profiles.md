# Project Manager Rigor Profiles Plan

## Goal

Make Project Manager genuinely lightweight for ordinary human work while preserving its controlled
execution guarantees. Profiles will select the human completion policy, dispositions will make
deferred/cancelled work truthful, and Studio will project the existing governed lifecycle into an
ordinary operating view.

## Current Context

- `skills/project-manager/scripts/lib/project-state.js` owns exact task schemas, lifecycle validation,
  next-work selection, completion gates, deterministic status/report facts, and Studio projection.
- `skills/project-manager/scripts/lib/contracts.js` already permits a verified manifest as the first
  manifest and defines human approval evidence; it must remain the single contract/evidence engine.
- `skills/project-manager/scripts/lib/mutations.js` already authorizes a newly validated attempt subtree
  and restores exact prior bytes after failure.
- `skills/project-manager/scripts/lib/task-editor.js` separates specification and schedule authority but
  has no orthogonal coordination field.
- Studio consumes `src/project-manager-studio/shared/api.ts`; its board lanes and status chips currently
  expose internal lifecycle stages.
- TASKS schema v1 has no schedules; v2 adds schedules. A new field therefore requires v3 rather than
  silently widening old exact schemas.
- Existing tests cover contract replay, RPD evidence, rollback, Studio edit authority, selection, and
  Timeline behavior. Public state/output and Studio behavior require an E2E specification.

## Decisions

- Add one policy function derived from project profile. `minimal` and `standard` use lightweight human
  completion; `controlled` requires explicitly governed human execution. Every non-human executor uses
  governed execution in every profile.
- Implement lightweight completion as an atomic convenience over the existing engine: validate the live
  task, create its immutable Task Contract and first verified Evidence Manifest, map one explicit approval
  record to every acceptance item, update pointers/status, regenerate STATUS, validate the candidate, and
  replace atomically. Do not create an unproven direct-done path or a second completion artifact format.
- Keep detailed lifecycle unchanged. Add `display_status` as a projection: disposition overrides first;
  otherwise planned and ready remain distinct, done remains done, and in-progress through verified display
  as active.
- Define TASKS v3 as the strict superset of v2: it accepts the same optional paired schedule fields plus
  paired `disposition` and `disposition_changed_at` fields. Absence means active. `deferred|cancelled`
  requires an RFC3339 UTC change timestamp; active is represented by omitting both fields. V1/V2 reject
  both fields and keep their existing normalized object shape so unchanged projects do not acquire stale
  STATUS. Any disposition edit upgrades v1/v2 to v3 without changing or dropping schedules.
- Exclude disposition metadata from the task specification hash because coordination changes must not
  invalidate an execution contract. For a non-active task with an attempt, reject every stored manifest
  observed after `disposition_changed_at`. Every contract-issuance and manifest-ingestion instruction or
  helper must require active disposition before lifecycle advancement.
- Allow disposition changes independently for non-done tasks in a non-complete project and non-complete
  milestone. `active ↔ deferred` is allowed. `active|deferred → cancelled` is terminal; cancelled tasks
  cannot be reactivated. Specification edits remain limited to never-started active tasks; schedules
  remain separate.
- Treat cancelled work as intentionally closed for milestone/project task-completion gates, but never as a
  completed dependency or verified success. Deferred and cancelled tasks are never actionable. Blocker
  lists/counts include only active-disposition tasks; an active task waiting on a cancelled dependency still
  reports that dependency as unfinished.
- For project success and traceability, remove cancelled mappings before calculation. A criterion is covered
  only when at least one non-cancelled mapping remains, and verified only when at least one remains and every
  remaining mapped task is evidence-backed done. Cancelled mappings neither prove nor poison success.
- Lightweight completion accepts exactly one explicit approval record. It is eligible only when that record
  can satisfy every cumulative verified-stage evidence group and every acceptance mapping, and every bound
  current source already has an immutable version or content hash. The existing manifest validator is the
  final authority; custom requirements or unverifiable sources fail atomically rather than being weakened or
  silently supplemented.
- Bump deterministic status/report and Studio projection payloads to schema version 2 when adding policy
  and disposition facts. Leave unrelated CLI payload versions unchanged.
- Keep the nine routes. Document “add a task” and lightweight human completion as `project update`
  intentions. Do not add aliases to the routing surface.
- No compatibility flag or automatic rewrite is needed. Existing v1/v2 task files remain valid; the first
  saved non-active disposition upgrades TASKS directly to v3.

## Phased Tasks

### Phase 1 - State contract and policy foundation

- [x] Add profile-policy and display-status helpers to `project-state.js`, expose them for tests and Studio projection, and keep internal lifecycle constants unchanged.
- [x] Extend task normalization and validation with scheduling-capable TASKS v3 disposition/timestamp pairs while preserving the exact v1/v2 normalized shape, field rejection, and schedule behavior.
- [x] Update attempt validation, dependency, next-work, milestone/project completion, success, coverage, blocker, status, and report calculations for the exact freeze/filter semantics of deferred/cancelled work.
- [x] Add schema-v2 status/report projections with profile policy and disposition counts while retaining raw lifecycle counts.

### Phase 2 - Atomic lightweight human completion

- [x] Add `scripts/lib/human-completion.js` with a source-file comment block and a focused API that validates profile/provider/disposition/dependency/blocker/source/evidence eligibility, builds existing contract/manifest artifacts, rewrites only the selected task metadata, regenerates STATUS, and uses `atomicProjectMutation`.
- [x] Reuse/export strict task-record parsing and rendering from `task-editor.js` rather than adding a competing Markdown grammar.
- [x] Add a small internal `project-complete-human.js` command used by the `project update` route, with explicit approval reference/result inputs and JSON output.
- [x] Verify all rejection cases are mutation-free and all accepted attempts pass the existing immutable-history and replay validators.

### Phase 3 - Disposition editing and Studio projection

- [x] Extend `task-editor.js` with coordination-field authority, v3 upgrade/preserved-schedule behavior, generated change timestamps, terminal cancellation, completed-milestone protection, and disposition eligibility independent from specification/schedule edits.
- [x] Update `src/project-manager-studio/shared/api.ts` and server/client consumers for disposition, projected display status, profile policy, and schema-v2 Kanban data.
- [x] Replace the Verified board lane with ordinary Active projection and add Deferred/Cancelled side lanes without removing raw lifecycle audit details from the task dialog.
- [x] Update Studio styles and Timeline state chips so ordinary projected status is primary and internal lifecycle remains inspectable.

### Phase 4 - Tests and documentation

- [x] Extend `skills/project-manager/tests/project-manager.test.js` for profile policy, v3 exactness and v2-schedule preservation, old-schema STATUS compatibility, lightweight completion success/evidence/source rejection/rollback, disposition freeze/graph semantics, status/report facts, and board projection.
- [x] Extend `tests/project-manager-studio/task-editor.test.js`, server tests, and relevant model tests for coordination editing, schema upgrades, and the changed API projection.
- [x] Update `SKILL.md`, `README.md`, `README-cn.md`, `references/conventions.md`, `references/tasks.md`, and `references/track.md` with progressive-disclosure behavior and no new route.
- [x] Update generated Studio server/client bundles through the repository build rather than editing generated files by hand.

### Phase 5 - Verification evidence

- [x] Run `npm run typecheck`, `npm run build`, `npm run test:pm`, and the skill validator; fix scoped failures and record exact results.
- [x] Execute the scenarios in `.docs/tests/test-project-manager-rigor-profiles.md`, including mutation-free rejection hashes and controlled/RPD regression checks.
- [x] Confirm Git scope contains only this story's skill, Studio, tests, generated bundle, and RPD artifacts, then mark every plan task complete.

## Validation

- `npm run typecheck`
- `npm run build`
- `npm run test:pm`
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
- E2E: execute every Given/When/Then scenario in `.docs/tests/test-project-manager-rigor-profiles.md`
- Mutation safety: compare project tree hashes before/after every rejected lightweight completion and an injected replacement failure.
- Regression: create and validate an RPD attempt using the unchanged contract/manifest format.

## Rollback / Risk

- TASKS v3 is a persisted compatibility boundary. Rollback requires clearing non-active dispositions,
  changing only the TASKS schema version back to the applicable prior version, validating, and regenerating
  STATUS; existing v1/v2 projects need no rollback action.
- Cancelling an active task while retaining its attempt can surprise consumers that equate active contract
  with executable work. All next/status projections and lifecycle mutations must check disposition before
  actionability, while the disposition timestamp prevents later evidence from being presented as earlier
  progress.
- Treating cancelled tasks as closed for project completion but unfinished for dependencies is deliberate:
  cancellation cannot silently fulfill required work. Plans must remove or replace the dependency.
- The convenience completion operation records a reported human approval at observation time; it must not
  claim that the work was pre-authorized. Controlled projects retain the pre-issued contract requirement.
  Custom human evidence requirements and unverifiable sources deliberately fall back to governed execution.
- Generated Studio bundles can create noisy diffs. Build only after source/tests stabilize and review source
  and generated changes together.
- Rollback is a scoped revert of this story; no external state or dependency migration is introduced.
