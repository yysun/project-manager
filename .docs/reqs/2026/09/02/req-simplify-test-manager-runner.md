# Simplify Test Manager Runner Policy

## Problem

Test Manager added a named `goal-based-ui` prompt profile with its own bundled instructions,
eligibility rules, trace format, and operational metrics. That makes a general QA state manager own a
specific execution methodology, while projects already own runner behavior through
`RUNNER_PROMPT.md` and Case-level Runner Instructions. It also duplicates concepts from the
independent `audit-ui-ops` skill.

## Requirement

Remove the named execution profile and keep Test Manager's runner surface generic. Projects define
specialized execution and reporting through the existing project-owned prompt and Case instructions.
`audit-ui-ops` remains independent and unchanged.

## Acceptance Criteria

- [x] `test-manager.mjs prompt` has no `--profile` option and rejects it as unknown without mutation.
- [x] Prompt generation continues to render the project-owned `RUNNER_PROMPT.md` byte-for-byte.
- [x] Profile-specific assets, references, eligibility logic, JSON output, and package inventory are
  removed.
- [x] Test Manager guidance routes specialized methods to project instructions or independent skills.
- [x] `.tests` schema, initialized files, Studio projections, and the Run ledger remain unchanged.
- [x] The independent `audit-ui-ops` repository and installation are untouched.

## Non-Goals

- Add a replacement profile registry, mission file, template layer, or Studio control.
- Change Case fields, Run results, evidence validation, or release-gate behavior.
