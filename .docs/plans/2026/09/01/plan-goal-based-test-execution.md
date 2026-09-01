# Plan: Goal-Based Test Execution

## Goal

Add a lean, opt-in `goal-based-ui` Runner Prompt profile to Test Manager so a ready business case can
be handed to a fresh visible-UI executor with explicit isolation, safety, evidence, outcome, and raw
complexity contracts, without adding another skill or changing `.tests` state or Studio.

## Current Context and Decisions

- `test-manager.mjs prompt` already renders authoritative Case data through either the project-owned
  `RUNNER_PROMPT.md` or the bundled default, and returns the same projection used by Studio.
- `Runner Instructions` already carry Case-specific tools, safety boundaries, evidence discipline,
  and stop conditions, but they are unrestricted prose. The coordinator must preflight every field
  included in a goal-based mission; the CLI will not pretend to sanitize semantic content.
- The new profile is a prompt-generation choice, not a Case `Type`, automation value, persisted label,
  Run result, or Studio preference.
- Simplicity is a release constraint: no new Case or Run fields, root files, Studio controls, generic
  executor framework, or required configuration. The normal workflow must not expose profile concepts.
- No profile means the current behavior. There is no named default or `standard` profile.
- `--profile goal-based-ui` uses a bundled product-neutral template rather than the project-owned
  default template; authoritative Case facts still provide the target surface and business context.
- The goal-based prompt may disclose business outcomes and invariants needed to judge correctness,
  but it must not disclose product-specific navigation, implementation knowledge, or prior discoveries.
- Mechanical profile eligibility requires a ready Case, Automation `AI_BROWSER` or `HYBRID`, and
  non-empty Runner Instructions. The coordinating agent additionally rejects included prose with
  navigation, implementation, or prior-run knowledge. The generated prompt performs a final
  fail-closed contamination check before action.
- Existing root inspection remains the single validation path and may read `RUNS.md` and `STEPS.md`;
  those sources never contribute content to the rendered goal-based mission.
- A fresh context is a methodological requirement. A contaminated executor performs no UI action and
  returns `INVALID` rather than presenting the run as zero-training evidence.
- The immutable `RUNS.md` row remains the QA authority. The prompt requires profile and executor
  identity, task outcome, trace, contamination, and raw operational metrics in the returned evidence;
  the existing coordinator, not prompt generation, stores that evidence and links the Run row.
- Task outcome and QA result use an explicit matrix: only `COMPLETED` with all positive, negative, and
  evidence assertions supported can be `PASS`; observed unmet or partial product outcomes are `FAIL`;
  external entry/runtime prerequisites or interruptions are `BLOCKED`; contamination, wrong
  context/data/build, executor/tool failure, or inadequate evidence is `INVALID`; `SKIPPED` remains a
  coordinator-only pre-execution decision outside the profiled response. Pre-action contamination
  returns task outcome `BLOCKED`, Run result `INVALID`, zero counters, and elapsed `NOT_STARTED`.
- Raw metric definitions are fixed by the requirement. Counters may overlap, elapsed time spans first
  UI observation through final verification or stop, and unavailable measurements remain `UNKNOWN`.
- `audit-ui-ops` remains independently installable and unchanged. Test Manager implements only the
  narrower execution contract needed to produce an evidence-backed QA Run.

### Simplification review

- Reuse the existing `inspectRoot` and `buildRunnerPrompt` path. A second Case loader, validator,
  renderer, or Studio projection would add divergence without improving isolation.
- Resolve one allow-listed `goal-based-ui` profile directly. Do not build a profile registry,
  configuration file, named default, inheritance model, or plugin adapter before another real
  executor requires one.
- Keep the ordinary Studio Case dialog, state payload, root inventory, and project-owned default
  template unchanged. Adding a selector or metrics display would expose complexity to every user for
  an optional execution method.
- Keep goal-based routing concise in `SKILL.md`; place conditional methodology in one focused
  reference and the executor-facing contract in one bundled prompt asset.
- Correct the existing exact-package inventory omission for `assets/runner-prompt.md` while adding the
  two new files. This removes a false inventory baseline rather than creating another packaging path.
- No existing Case field or Studio control in the affected prompt path is proven redundant enough to
  remove safely: `Runner Instructions` owns Case-specific execution constraints, while
  `RUNNER_PROMPT.md` owns project presentation. Collapsing them would mix responsibilities.

### Deferred simplification opportunities

- The existing not-ready prompt is written in Chinese while the rest of the CLI and bundled prompt
  contract are English. Normalizing that message would simplify the public surface, but it would also
  change compatibility output and needs its own small requirement and golden update.
- The existing argument parser accepts some command-irrelevant legacy flags outside their documented
  routes. Normalizing all option/command combinations would simplify CLI behavior, but is a broader
  compatibility cleanup; this story validates only the new `--profile` option at the command boundary.

## Tasks

- [x] Add a bundled `goal-based-ui` Runner Prompt template under `skills/test-manager/assets/` with
  fresh-context, visible-UI, scoped-mutation, duplicate-submit, verification, dual-outcome, trace,
  contamination, explicit result mapping, and defined raw-metric rules.
- [x] Extend `skills/test-manager/scripts/test-manager.mjs` with the optional
  `prompt <case-id> --profile goal-based-ui` route, deterministic bundled-profile loading, clear
  invalid-argument handling, rejection on other commands, mechanical Case eligibility, profile-aware
  JSON output, and no-profile compatibility.
- [x] Update `skills/test-manager/SKILL.md`, `references/conventions.md`, and
  `references/test-design.md`; add a focused `references/goal-based-ui.md` that defines routing,
  context isolation, the sealed mission, result mapping, evidence metrics, and the boundary from test
  type, regression purpose, automation, Studio state, and `audit-ui-ops`. Keep the entrypoint terse and
  load the new reference only for goal-based planning or execution.
- [x] Extend `skills/test-manager/tests/test-manager.test.mjs` with focused profile rendering,
  authoritative-field coverage, literal/golden no-profile stdout and JSON compatibility, JSON output,
  separate invalid-option diagnostics, other-command rejection, no-mutation, non-ready isolation,
  missing-instructions, non-browser eligibility, unchanged initialization inventory, absent Studio
  profile/metric properties, and profile-asset non-copy tests.
- [x] Correct the Agent Plugin inventory baseline to include the existing `assets/runner-prompt.md`,
  add the new profile asset/reference, and update the standalone Test Manager smoke flow so profiled
  CLI behavior is exercised from the installed skill copy.
- [x] Add an Unreleased changelog entry describing the opt-in profile, unchanged state schema, and
  independent `audit-ui-ops` boundary.
- [x] Review the implemented prompt and guidance for duplication and remove any field, control,
  abstraction, or instruction that is not necessary for isolation, safe execution, or evidence.
- [x] Record any broader simplification opportunity discovered during implementation in the plan
  instead of expanding source scope without its own requirement and verification.
- [x] Run focused Test Manager prompt/profile tests, syntax checks, and the executable scenarios in
  `.docs/tests/test-goal-based-test-execution.md`; fix failures before broader verification.
- [x] Run the E2E spec's bounded model-driven contaminated-Case scenario in a disposable test root:
  give a fresh Test Manager agent only the explicit goal-profile request, skill, and contaminated
  fixture; require refusal without prompt generation or state mutation.
- [x] Run the complete repository build and test suite, both skill quick validators, and the isolated
  Test Manager Studio/API smoke test required by repository policy.
- [x] Synchronize or verify the complete supported standalone Test Manager installation without
  editing Codex cache snapshots, then compare the installed and source skill trees.

## Validation

- `node --test --test-name-pattern='Runner Prompt|goal-based|profile' skills/test-manager/tests/test-manager.test.mjs`
- `npm run check:syntax`
- `.docs/tests/test-goal-based-test-execution.md`
- `npm run build:plugin`
- `npm test`
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
- `python3 /Users/esun/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/test-manager`
- `npm run test:e2e:tm`
- Complete source/install tree comparison for the supported standalone Test Manager installation

## Risk

Non-low risk: this adds a public CLI option and a decision-bearing execution contract whose value
depends on truthful context isolation and correct separation of task completion from QA PASS. The
change is additive and readily reversible, uses a single allow-listed profile, leaves all stored
schemas and Studio behavior unchanged, rejects contaminated missions before handoff or requires the
executor to report them `INVALID`, and preserves the existing prompt path byte-for-byte when
`--profile` is omitted.

Rollback is to revert this story's source and documentation files; no `.tests` migration or cleanup
is required. The current symlinked standalone installation follows the source revert automatically;
if a copied supported installation exists at rollback time, synchronize the complete reverted skill
tree rather than individual files.
