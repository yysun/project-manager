# Goal-Based Test Execution

## Summary

- Added one opt-in `goal-based-ui` Runner Prompt profile for eligible ready Cases. The default prompt
  remains unnamed and byte-compatible; no `standard` profile was introduced.
- Kept the model small: one CLI option, one bundled executor prompt, and one conditional reference.
  No `.tests` field, root file, Run column, Studio control, dashboard, registry, or required choice was
  added.
- Defined a fail-closed fresh-context contract for visible-UI execution, scoped mutations, duplicate
  submission safety, task-outcome versus QA-result mapping, evidence, trace, contamination, and raw
  operational metrics.
- Kept `audit-ui-ops` independent and unchanged. Test Manager owns only the narrower Case-to-Run
  execution handoff.
- Corrected the existing package inventory omission for `assets/runner-prompt.md` while adding the two
  new installable files.

## Verification

- Focused Runner Prompt/profile tests — passed: 9/9.
- Agent Plugin package inventory tests — passed: 10/10.
- `npm test` — passed: build, 247 Project Manager tests, and 19 Test Manager tests.
- `npm run typecheck`, `npm run check:syntax`, and both skill quick validators — passed.
- `npm run test:e2e:tm` — passed from a copied standalone Test Manager skill, including profiled
  rendering, unchanged managed-root inventory, valid Studio/API behavior, and no copied profile asset.
- Fresh-agent execution test — passed: a mechanically eligible Case containing a menu and click path
  was refused before prompt generation or UI action; before/after SHA-256 inventories of the disposable
  test root were identical.
- Standalone installation — verified: `/Users/esun/.codex/skills/test-manager` resolves to the
  canonical repository skill and a complete source/install tree comparison is clean.
- `git diff --check` — passed.

AR risk: non-low — this adds a public CLI option and evidence-bearing execution contract, though the implementation is now bounded, additive, and rollback-safe
AR review round: 3; reviewer: reused
AR fixed: resolved the read-boundary conflict, completed pre-action result semantics, added bounded semantic-preflight coverage, and constrained the design against feature overload; rerun result passed

CR risk: non-low — this changes a public CLI and decision-bearing execution contract
CR review round: 2; reviewer: reused
CR fixed: completed fail-closed contamination coverage, executor identity, and early profile validation; rerun result passed

VR risk: non-low — adds a public CLI option and decision-bearing execution contract where isolation or result-mapping errors could create false QA conclusions; the implementation remains additive, reversible, and schema-neutral.
VR review round: 2; reviewer: reused
VR fixed: removed the circular pre-VR DD dependency from plan task 8 and retained the completed simplification record in the plan; rerun result passed
VR passed: all acceptance criteria complete

## Notes

- No schema migration, release version, tag, publication, or plugin-cache snapshot changed.
- The independent `audit-ui-ops` installation remains its existing symlink to its own repository.
- The existing not-ready prompt mixes Chinese copy into an otherwise English CLI. Normalizing it may
  simplify the public surface, but it changes compatibility output and belongs in a separate small
  requirement with a deliberate golden update.
- The existing argument parser accepts some legacy flags outside their documented command routes.
  Normalizing every option/command combination is a broader public-CLI cleanup; this story validates
  only the newly introduced `--profile` boundary.
- The standalone smoke test contained one stale assertion expecting `Execute CHECKOUT-C001`; it was
  corrected to assert the actual project-owned default prompt contract rather than changing product
  output to satisfy the test.
