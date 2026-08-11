# PMI-Aligned Tailoring E2E Specification

## Scenario 1 - Declare tailoring without mandating PMI process

Given a `PROJECT.md` declaring schema version 2 with a tailoring block covering all ten PMBOK 6
knowledge areas, some applied and some tailored out with recorded rationales

When the project is validated and its status and report facts are calculated

Then the project loads and validates successfully

And status reports the tailoring declaration with its applied and tailored-out areas

And report data lists each tailored-out area as an explicit unknown carrying its recorded rationale

And no tailored-out area is reported as zero, absent, complete, or on track

## Scenario 2 - Fail closed on an incomplete or dishonest declaration

Given schema-version-2 projects whose tailoring block omits an area, names an unknown area, uses a
non-boolean `applied`, uses an invalid `decided` date, or tailors out an area with an empty rationale

When each project is loaded

Then every case fails semantic validation with a specific error

And no partially accepted tailoring state is produced

## Scenario 3 - Preserve existing projects without migration

Given an existing project on `PROJECT.md` schema version 1 that configures none of the new modules

When the project is loaded and validated after the feature is installed

Then it loads with its current exact field set and requires no migration

And a `tailoring` key in a schema-version-1 project is rejected as an unknown field

And its `source_sha256` is byte-identical to the value produced before the feature existed

And its existing `STATUS.md` does not become stale

## Scenario 4 - Add PMI modules only when they are wanted

Given a project that configures none of `ASSUMPTIONS.md`, `ISSUES.md`, `STAKEHOLDERS.md`,
`LESSONS.md`, and `CLOSURE.md`

When status, report, and validation facts are calculated

Then each absent module is reported as unconfigured

And no absent module is reported as an empty set, a zero count, or a satisfied condition

## Scenario 5 - Enforce each configured module exactly

Given projects that configure each new module with unknown fields, a wrong namespaced ID prefix,
malformed records, contradictory status and evidence combinations, or references to unknown tasks,
milestones, sources, risks, or success criteria

When each project is loaded

Then every invalid case fails semantic validation with a specific error

And valid module records normalize into deterministic report truth ordered by ID

## Scenario 6 - Keep risk records honest about direction and response

Given a `RISKS.md` declaring schema version 2 with threat and opportunity records

When the project is loaded

Then threat records accept only avoid, transfer, mitigate, accept, or escalate strategies

And opportunity records accept only exploit, share, enhance, accept, or escalate strategies

And a record whose strategy contradicts its direction is rejected

And a `RISKS.md` declaring schema version 1 rejects the new fields and keeps its existing normalized shape

## Scenario 7 - Prevent the tailoring declaration from becoming fiction

Given a schema-version-2 project that declares the risk area tailored out while configuring `RISKS.md`,
and another that declares the stakeholder area tailored out while configuring `STAKEHOLDERS.md`

When each project is loaded

Then each fails semantic validation with an error naming both the knowledge area and the module

## Scenario 8 - Bind closure records to real completion

Given closure records scoped to the project and to milestones, in pending and accepted states

When each project is loaded

Then an accepted project-scoped closure requires the project to be complete

And an accepted milestone-scoped closure requires that milestone to be complete

And an accepted closure requires an acceptor, an acceptance date, and at least one evidence record

And duplicate project-scoped or duplicate milestone-scoped closure records are rejected

## Scenario 9 - Preserve every existing guarantee and surface

Given the full existing skill contract test suite and the Studio test suite

When the complete build and test run executes after the feature is installed

Then all existing execution-governance, evidence, lifecycle, disposition, and re-verification tests pass
unchanged

And the deterministic scripts keep exit code 0 for success, 1 for semantic invalidity, and 2 for
selector failure, never emitting `data` on failure or `errors` on success

And Studio loads, validates, and projects both a schema-version-1 project and a schema-version-2 project
that configures every new module
