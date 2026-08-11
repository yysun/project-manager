# Plan - PMI-Aligned Tailoring and Schema-Only PMI Modules

## Goal

`PROJECT.md` schema version 2 carries a mandatory, declare-only tailoring record for the ten PMBOK 6
knowledge areas; five new optional collection modules and `RISKS.md` schema version 2 cover the
schema-only PMI gaps; and every existing project keeps loading with a byte-identical `source_sha256`.

## Current Context

- `scripts/lib/project-state.js` is the single authority. `parseProject` (line ~207) builds an exact
  frontmatter field list, calls `exactKeys`, then asserts every field present, then asserts
  `schema_version === 1`. Adding a required field to v1 would break every existing project, so the
  tailoring record requires a `PROJECT.md` version bump.
- `OPTIONAL_FILES` (line 17) plus the `module(name, kind)` closure inside `loadProject` (line ~584)
  already implement the `{configured, items}` contract. `normalizeSimple` (line ~321) dispatches per
  kind. New modules slot into both without new machinery.
- `parseCollection` accepts `options.schemaVersions` and attaches a non-enumerable `schema_version` to
  the returned records array. `module()` currently ignores it; `RISKS.md` v2 needs it threaded through
  to `normalizeSimple`.
- `state.source_sha256` (line ~598) hashes project, tasks, and every optional module. The existing test
  `v1 schedule support preserves legacy source hashes` (tests line ~206) locks the invariant that a new
  capability cannot stale an untouched `STATUS.md`. `canonicalValue` keeps `undefined` values as object
  keys and `JSON.stringify` then drops them — the codebase already relies on this via `{ ...project,
  root: undefined }`. New modules must therefore contribute `undefined` when unconfigured.
- `kanbanData` (line ~808) reads only `status.tasks`, `status.success`, `status.coverage`,
  `status.risks`, `status.decisions` into `summary`. Adding new keys to `statusData` therefore leaves
  Studio's payload byte-identical, which keeps Studio a true non-goal.
- `renderStatus` writes a `schema_version: 1` STATUS envelope plus a task-count snapshot line, so a
  `statusData` schema bump does not alter `STATUS.md` bytes.
- Resolved during AR preflight, with evidence:
  - `src/project-manager-studio/shared/api.ts:27` pins `KanbanData.schema_version` as the **literal
    type `2`**. Changing `kanbanData`'s version would fail `tsc --noEmit`, confirming the decision to
    leave `kanbanData` untouched.
  - `statusData`, `reportData`, `coverageData`, and `validateData` are referenced **nowhere** in
    `src/`; only `kanbanData` crosses to Studio. Their schema bumps are therefore safe.
  - `scripts/lib/task-editor.js:101-102` rewrites only the `TASKS.md` collection version, never
    `PROJECT.md`; `scripts/lib/human-completion.js:103` is an Evidence Manifest payload version, not a
    project version. Nothing writes `PROJECT.md` programmatically outside test fixtures, so
    `PROJECT.md` v2 is a reader-side addition only.
  - `canonicalJson({a:1,b:undefined,c:3})` returns `{"a":1,"c":3}`, confirming the conditional-
    `undefined` hashing strategy preserves legacy `source_sha256`.

## Decisions

- **`PROJECT.md` v2, not a v1 optional field.** A tailoring record that is optional cannot support the
  compliance claim, and a mandatory v1 field breaks every existing project. Versioning matches the
  established `TASKS.md` v1/v2/v3 precedent: v1 stays exact and rejects `tailoring`.
- **Declare-only, never content-enforcing.** Validation checks that all ten areas are declared and that
  a tailored-out area carries a rationale. It never requires an area to be applied, and never requires
  module content. This is what makes PMI tailoring compliant rather than PMI process mandating.
- **Anti-fiction cross-check.** A configured module whose area is declared tailored out fails
  validation. Enforced only for the unambiguous pairs `risk → RISKS.md` and
  `stakeholder → STAKEHOLDERS.md`. `MILESTONES.md` is deliberately *not* bound to the `schedule` area
  because milestones serve scope and integration reporting too, and a false binding would force
  incorrect declarations.
- **Rejected: auto-injecting a default tailoring block into v1 projects.** That would fabricate a
  governance decision the user never made, violating the skill's own "never invent" bar.
- **Rejected: a compatibility flag or environment variable to relax v2 strictness.** Explicitly a
  non-goal per REQ; the version number is the compatibility mechanism.
- **Rejected: extending `statusData` into `kanbanData.summary`.** Studio is a non-goal; leaving the
  Studio payload unchanged is both less work and a stronger no-regression guarantee.
- **`CLOSURE.md` is a collection, not a singleton**, keyed `CLO-`, with a `scope` of `project` or
  `milestone`. This matches PMI's "Close Project *or Phase*" and reuses the existing grammar exactly.
- **`contracts.js` is untouched.** Tailoring is project-level governance metadata; it never enters
  `taskSpecHash`, the Task Contract payload, or the Evidence Manifest, so contract identity and every
  stored attempt stay bit-stable across this change.
- **Non-goals restated for implementation:** no `COST.md`, no EVM, no `TASKS.md` v4, no estimates, no
  critical path, no new Studio panels, no migration tooling.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `src/` Studio client and `tests/project-manager-studio/*.test.js` to confirm whether
      `kanbanData.schema_version` or the exact `statusData` key set is asserted anywhere, and record
      the result so the Studio no-regression claim is evidence-based.
- [x] Confirm by direct experiment that `canonicalJson({a:1,b:undefined})` omits `b`, so the
      conditional-module hashing strategy provably preserves legacy `source_sha256`.
- [x] Record the exact current `source_sha256` of a minimal fixture project before any edit, to use as
      the regression oracle in Phase 5.

### Phase 2 - Foundation: PROJECT.md v2 and the tailoring contract

- [x] Add a `KNOWLEDGE_AREAS` constant to `scripts/lib/project-state.js` listing the ten PMBOK 6 areas
      in fixed order, and a `TAILORING_KEYS` constant for the per-area record fields.
- [x] Reorder `parseProject` so `schema_version` is validated against `[1, 2]` before the field list is
      built, then build the field list with `tailoring` appended only for version 2, so v1 keeps its
      exact current field set and rejects `tailoring` as an unknown field.
- [x] Implement `validateTailoring` in `project-state.js` enforcing exactly the ten area keys, per-area
      `{applied, rationale, decided}` exact keys, boolean `applied`, date-only `decided`, and a
      non-empty `rationale` whenever `applied` is false.
- [x] Confirm `parseProject`'s return value adds no `tailoring` key for v1 projects so the project
      object spread into `source_sha256` stays byte-identical.

### Phase 3 - New optional modules and RISKS v2

- [x] Extend `OPTIONAL_FILES` with `ASSUMPTIONS.md`, `ISSUES.md`, `STAKEHOLDERS.md`, `LESSONS.md`, and
      `CLOSURE.md`.
- [x] Change the `module(name, kind)` closure in `loadProject` to `module(name, kind, schemaVersions)`,
      pass `schemaVersions` into `parseCollection`, and pass the parsed records' non-enumerable
      `schema_version` as a new trailing argument to `normalizeSimple`, so per-kind normalizers can
      branch on collection version. Default `schemaVersions` to `[1]` so existing call sites are
      unchanged in behavior.
- [x] Add a `normalizeSimple` branch for `assumptions` (`ASM-`) validating status, kind, statement,
      owner, dates, typed `affects` references, and `impact_if_false`, and rejecting a `validated_date`
      on an open assumption.
- [x] Add a `normalizeSimple` branch for `issues` (`ISS-`) validating status, severity, description,
      owner, `raised_date`, `resolved_date`, `resolution`, typed `affects`, and `escalated`, requiring
      resolution evidence exactly when the issue is resolved or closed and forbidding a
      `resolved_date` earlier than `raised_date`.
- [x] Add a `normalizeSimple` branch for `stakeholders` (`STK-`) validating role, organization,
      interest, influence, current and target engagement levels, owner, and strategy, and requiring a
      non-empty strategy whenever current engagement differs from target engagement.
- [x] Add a `normalizeSimple` branch for `lessons` (`LES-`) validating category, statement,
      recommendation, date, `source_tasks`, and `source_milestone`.
- [x] Add a `normalizeSimple` branch for `closure` (`CLO-`) validating scope, milestone, status,
      `accepted_by`, `accepted_date`, `acceptance_evidence` via the existing `validateEvidenceRecord`,
      `outstanding_items`, and `archive_ref`, requiring a milestone exactly when scope is `milestone`
      and requiring acceptor, date, and at least one evidence record when status is `accepted`.
- [x] Extend the `risks` branch of `normalizeSimple` so collection schema version 2 additionally
      permits `direction`, `strategy`, `trigger`, and `residual`, constraining threat strategies to
      avoid/transfer/mitigate/accept/escalate and opportunity strategies to
      exploit/share/enhance/accept/escalate, while version 1 rejects those fields and returns its
      current normalized shape unchanged.
- [x] Load `RISKS.md` with `{ schemaVersions: [1, 2] }` and every new module at version 1 only.
- [x] Register the five new modules on the loaded `state` object using the existing `module()` helper.

### Phase 4 - Integration rules and deterministic outputs

- [x] Extend `state.source_sha256` so each new module contributes its items only when configured and
      `undefined` otherwise, preserving legacy hashes exactly.
- [x] Extend `validateGraph` to reject a configured `RISKS.md` when `tailoring.risk.applied` is false
      and a configured `STAKEHOLDERS.md` when `tailoring.stakeholder.applied` is false, naming both the
      area and the module in the error.
- [x] Extend `validateGraph` to resolve every new module's cross-references: assumption and issue
      `affects` targets, lesson `source_tasks` and `source_milestone`, and closure `milestone`.
- [x] Extend `validateGraph` so an accepted project-scoped closure requires project status `complete`,
      an accepted milestone-scoped closure requires that milestone complete, at most one project-scoped
      closure record exists, and milestone-scoped closure records do not duplicate a milestone.
- [x] Extend `validateData` with the five new modules in `modules` and their counts in `counts`.
- [x] Extend `statusData` with a `tailoring` block reporting `{declared:false}` for v1 projects and
      applied plus tailored-out areas for v2, and with `{configured:false}`-style summaries for
      assumptions, issues, stakeholders, lessons, and closure; increment its schema version.
- [x] Extend `reportData` with the five new modules via `configuredItems`, add an explicit `unknowns`
      entry for each tailored-out area carrying its recorded rationale and one for undeclared tailoring
      on v1 projects, and increment its schema version.
- [x] Verify `kanbanData` output is unchanged by re-reading its `summary` construction after the
      `statusData` change, so the Studio non-goal holds.

### Phase 5 - Tests

- [x] Add a test asserting a v2 project with a complete tailoring block loads, and that a missing area,
      an unknown area, a non-boolean `applied`, an invalid `decided`, and a tailored-out area with an
      empty rationale each fail closed.
- [x] Add a test asserting a v1 project still loads with its current field set and rejects a
      `tailoring` key as an unknown field.
- [x] Add a regression test asserting that a project configuring none of the new modules produces the
      exact `source_sha256` recorded in Phase 1, proving no existing `STATUS.md` becomes stale.
- [x] Add tests asserting each of the five new modules is optional when absent, fail-closed on unknown
      fields, wrong ID prefix, malformed records, and invalid cross-references, and normalizes into
      report truth when present.
- [x] Add a test asserting `RISKS.md` v2 accepts direction-appropriate strategies, rejects an
      opportunity declared with a threat-only strategy, and that v1 rejects the new fields.
- [x] Add a test asserting a configured module contradicting its tailored-out area fails validation
      with the specific error, for both enforced pairs.
- [x] Add a test asserting accepted closure records are consistent with project and milestone
      completion and that duplicate or over-broad closure records are rejected.
- [x] Add a test asserting `statusData` and `reportData` expose tailoring, mark tailored-out areas as
      unknowns with rationale, and report undeclared tailoring for v1 projects.
- [x] Run `node --test skills/project-manager/tests/project-manager.test.js` and record the pass count.
- [x] Run `npm test` and record that the build, the skill contract tests, and the Studio tests all pass.
- [x] Run `npm run typecheck` and record the result.

### Phase 6 - Documentation

- [x] Update `references/conventions.md` with the `PROJECT.md` v2 tailoring schema, the five new module
      schemas with their namespaced ID prefixes, `RISKS.md` v2, the anti-fiction cross-check, and the
      new deterministic-output schema versions.
- [x] Update `references/init.md` with the v2 `PROJECT.md` template including a tailoring block, and
      guidance that tailoring out an area is a recorded decision requiring a rationale.
- [x] Update `references/report.md` with the rule that a tailored-out area is reported as tailored out
      with its rationale, never as zero, absent, or on track.
- [x] Update `references/review.md` so review challenges tailoring drift: areas tailored out whose
      rationale no longer holds, and undeclared tailoring on v1 projects.
- [x] Update `SKILL.md` optional-module list, add the tailoring contract to the load-state and plan
      sections, and bump the skill version for the additive schema change.
- [x] Update `README.md` to state alignment accurately as PMBOK 7 principles-aligned with documented
      tailoring, without claiming PMI certification or tool conformance.
- [x] Update the file comment block of every edited source file per the File Comment Blocks rule.

## Validation

- `node --test skills/project-manager/tests/project-manager.test.js` — all skill contract tests pass,
  including the new tailoring, module, and hash-stability tests.
- `npm test` — runs `build:pm-server`, `build:pm-client`, then the skill tests and the Studio tests;
  expected evidence is a clean build followed by zero failing tests.
- `npm run typecheck` — `tsc --noEmit` clean.
- Manual determinism check: load a fixture project configuring every new module and confirm
  `project-validate.js`, `project-status.js`, and `project-report-data.js` exit 0 with `data` and no
  `errors`, and that a deliberately contradictory tailoring declaration exits 1.
- Manual regression check: the recorded pre-change `source_sha256` for an unmodified fixture equals the
  post-change value.

## Rollback / Risk

- **Highest risk: silently staling every existing `STATUS.md`.** Mitigated by the conditional-`undefined`
  hashing strategy, the Phase 1 recorded oracle, and a dedicated regression test. If the hash changes,
  the change is wrong and must be reworked, not accepted.
- **Second risk: `exactKeys` ordering in `parseProject`.** Validating `schema_version` before building
  the field list is required; getting the order wrong turns a v1 project into a validation failure.
  Covered by the v1-still-loads test.
- **Third risk: `RISKS.md` v1 normalized-shape drift.** Adding fields unconditionally would change the
  v1 risk item shape and therefore `source_sha256` for every project using risks. The version-branch in
  `normalizeSimple` plus the hash regression test cover this.
- **Studio regression risk** is low because `kanbanData.summary` selects fields explicitly, but Phase 1
  verifies this rather than assuming it, and `npm test` runs the Studio suite.
- Rollback is a plain revert: all changes are additive to one library file, the test file, and
  documentation. No data migration, no persisted state change, and no existing project file is
  rewritten, so reverting restores prior behavior completely.
