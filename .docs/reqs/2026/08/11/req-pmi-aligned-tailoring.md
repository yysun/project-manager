# PMI-Aligned Tailoring and Schema-Only PMI Modules

## Problem

The project-manager skill governs execution and scope traceability rigorously, but a PMI-literate
reader cannot tell whether an absent area (cost, stakeholders, procurement) was a deliberate tailoring
decision or an oversight. PMBOK 7 makes tailoring a first-class principle and PMBOK 6 states processes
are selected per project, so omitting an area is compliant **only when the omission is documented**.
Today nothing records that decision, so the skill cannot honestly claim PMI alignment.

Separately, four PMI artifacts that carry no derived math and would fit the existing optional-module
pattern are missing entirely: the assumption log, the issue log (distinct from risks), the stakeholder
register, and the lessons/closure records. Blockers are free-text strings on tasks, and risks lack PMI's
response-strategy taxonomy and opportunity (positive-risk) handling.

## Requirement

Introduce a mandatory, declare-only tailoring record and five new optional modules, so that a project
can claim *PMBOK 7 principles-aligned with documented tailoring* while every currently-mandatory
execution-governance and scope-traceability rule stays exactly as strict as it is now.

Specifically:

1. `PROJECT.md` schema version 2 adds a required `tailoring` object declaring each of the ten PMBOK 6
   knowledge areas as applied or tailored out, with a rationale required whenever an area is tailored
   out. `PROJECT.md` schema version 1 remains exact, keeps its current field set, and rejects
   `tailoring`, so existing projects stay valid without migration.
2. New optional collection modules `ASSUMPTIONS.md`, `ISSUES.md`, `STAKEHOLDERS.md`, `LESSONS.md`, and
   `CLOSURE.md` load through the existing `{configured, items}` optional-module path and are fail-closed
   on their own schemas once present.
3. `RISKS.md` schema version 2 adds PMI response strategy, opportunity/threat direction, trigger, and
   residual-risk fields. `RISKS.md` schema version 1 remains exact and rejects the new fields.
4. A configured module whose knowledge area is declared tailored out is a semantic validation failure,
   so the tailoring declaration cannot drift into fiction.
5. Deterministic outputs expose tailoring and the new modules using the established
   `{configured:false}` / explicit-unknown idiom, never invented zeroes, and reports name a tailored-out
   area as tailored out together with its recorded rationale.

## Acceptance Criteria

- [x] A `PROJECT.md` declaring `schema_version: 2` loads only when `tailoring` declares every one of the
      ten PMBOK 6 knowledge areas exactly once, and fails closed on a missing area, an unknown area, a
      malformed entry, or a tailored-out area whose rationale is absent or empty.
- [x] A `PROJECT.md` declaring `schema_version: 1` continues to load with its current exact field set,
      rejects a `tailoring` key, and requires no migration.
- [x] Every currently-mandatory rule is unchanged: minimal project files, the Task Contract to Evidence
      Manifest boundary, acceptance mapping, lifecycle gating, disposition rules, and change-driven
      re-verification all still pass their existing tests without modification to those tests' intent.
- [x] `ASSUMPTIONS.md`, `ISSUES.md`, `STAKEHOLDERS.md`, `LESSONS.md`, and `CLOSURE.md` are optional: a
      project without them loads and reports them as unconfigured rather than empty or zero.
- [x] Each new module, once present, is fail-closed on its own exact schema, its own namespaced ID
      prefix, unknown fields, malformed records, and invalid cross-references to tasks, milestones,
      risks, sources, or success criteria.
- [x] `RISKS.md` schema version 2 accepts the PMI response-strategy, direction, trigger, and residual
      fields with strategies constrained to the direction of the risk, and schema version 1 rejects
      those fields while keeping its current normalized shape.
- [x] Configuring a module whose knowledge area is declared tailored out fails validation with a
      specific semantic error naming the area and the module.
- [x] Adding this feature does not stale any existing `STATUS.md`: a project that configures none of the
      new modules and stays on the current schema versions produces a byte-identical `source_sha256` to
      the value produced before this change.
- [x] Status and report data expose the tailoring declaration, report tailored-out areas with their
      rationale, and report undeclared tailoring on schema-version-1 projects as explicitly undeclared
      rather than as applied or as zero coverage.
- [x] The deterministic scripts keep their locked exit-code and envelope contract, and any output schema
      whose shape changed carries an incremented schema version.
- [x] Studio continues to load, validate, and project both a schema-version-1 project and a
      schema-version-2 project that configures every new module, without regressing existing views.
- [x] The skill's own documentation states the tailoring contract, the new module schemas, and the
      narrative rule for tailored-out areas, and a version bump accompanies the additive schema change.
- [x] Documentation claims alignment in the accurate form (principles-aligned with documented
      tailoring) and does not assert PMI certification or conformance of the tool.

## Constraints

- Backward compatibility is mandatory: existing projects on `PROJECT.md` v1, `TASKS.md` v1/v2/v3, and
  `RISKS.md` v1 must load unchanged and must not become stale.
- The existing invariant that installing a new capability cannot stale an untouched `STATUS.md` must
  hold, mirroring the guarantee already covered for schedule support.
- New modules must reuse the existing collection grammar (`## ID - title` plus one single-line fenced
  JSON object) and the existing `{configured, items}` loader.
- Deterministic scripts stay read-only, keep exit code 0/1/2 semantics, and never emit `data` on
  failure or `errors` on success.
- No invented facts: absent cost, schedule forecast, or coverage evidence stays `unknown`,
  `unconfigured`, or `tailored out`, never a zero or an optimistic default.

## Non-Goals

- `COST.md`, budgets, cost baselines, and Earned Value (PV/EV/AC, SPI/CPI, EAC) are out of scope.
- `TASKS.md` schema version 4, effort or duration estimates, typed dependencies, lead/lag, float, and
  derived critical path are out of scope.
- New Studio panels, views, or editors for the new modules are out of scope; Studio must not regress,
  but it does not need to surface the new modules in this story.
- No migration tool, no automatic upgrade of existing `PROJECT.md` files, and no compatibility shim that
  silently injects a default tailoring block into a v1 project.
- No change to the lifecycle state machine, evidence rules, contract identity, or rigor profiles.

## Open Questions

None.
