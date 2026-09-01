# Goal-Based Test Execution

## Problem

Test Manager can render a case into a copy-ready Runner Prompt, but it does not define a trustworthy
way to execute a business goal as a fresh tester that knows the required outcome without knowing the
product's intended navigation. A coordinator can currently improvise those constraints in Case-level
Runner Instructions, which makes context isolation, visible-UI discipline, outcome classification,
trace evidence, and operational metrics inconsistent between runs.

The missing capability is an execution profile, not another test category. Functional, integration,
and business E2E describe what or where a case proves; regression describes why it is rerun;
goal-based UI describes how much product-specific knowledge the executor receives and how it explores
the interface. Treating those as sibling test types would create overlapping classifications and
duplicate Test Manager's existing strategy, case, Run, evidence, and gate responsibilities.

## Requirement

Test Manager must provide an optional `goal-based-ui` Runner Prompt profile that converts an eligible,
goal-safe ready Case into a product-neutral execution mission for an independent tester context. A
Case is mechanically eligible only when its automation is `AI_BROWSER` or `HYBRID` and it has
non-empty Runner Instructions. Before prompt generation, the coordinating agent must review every
included Case field and reject instructions that disclose selectors, coordinates, menu or click
paths, implementation details, or prior discoveries. The CLI does not claim to semantically sanitize
free-form Case prose. The generated prompt repeats the contamination check before any UI action and
requires `INVALID` without execution when prohibited knowledge still appears.

For an eligible, reviewed Case, the profile preserves the business goal, starting facts, authorized
data, outcome oracle, negative assertions, evidence requirements, and goal-safe Runner Instructions.
Root validation may read ordinary authoritative state, including `RUNS.md` and optional `STEPS.md`,
but the rendered mission never includes, exposes, or derives prompt content from test steps, source
code, implementation artifacts, or prior run evidence.

The existing prompt path with no profile remains the default behavior; there is no `standard`
profile. The profile is selected at prompt-generation time and the prompt requires the executor to
return its identity, trace, contamination state, and metrics for the coordinator to store and link
through the existing evidence flow. Prompt generation does not ingest or validate evidence. Profile
data is not persisted as a Case label, Run-table column, `.tests` schema field, or Studio setting in
this version. `audit-ui-ops` remains an independent skill and repository; Test Manager must not
require or bundle it.

## Acceptance Criteria

- [x] `test-manager.mjs prompt <case-id> --profile goal-based-ui` renders a deterministic goal-based
  Runner Prompt from the authoritative ready Case without changing the Case, Run ledger, or test-root
  schema.
- [x] Omitting `--profile` preserves the current project-owned `RUNNER_PROMPT.md` behavior and output;
  no default or `standard` profile is introduced.
- [x] Unknown, missing-valued, duplicate, or unsupported `--profile` arguments fail clearly without
  mutating the test root; `--profile` is rejected on commands other than `prompt`; JSON output
  identifies the selected profile when one is requested, including for a non-ready Case.
- [x] The profile rejects a ready Case whose Automation is not `AI_BROWSER` or `HYBRID`, or whose
  Runner Instructions are empty. Test Manager guidance requires a semantic goal-safety preflight and
  prohibits generation when included Case prose contains product navigation, implementation details,
  or prior discoveries.
- [x] A goal-based Runner Prompt supplies the business objective, starting context, test data,
  Runner Instructions, expected outcome, negative assertions, and evidence requirements without
  prescribing selectors, coordinates, menu paths, or click steps.
- [x] The profile requires a fresh execution context that has not received the PRD, design path,
  source code, test steps, prior traces, or earlier system-specific discoveries; when that isolation
  cannot be established, or prohibited information remains in the mission, the executor performs no
  UI action and returns `INVALID` with the contamination reason.
- [x] The profile restricts execution to the visible UI, permits only scoped authorized mutations,
  prevents unsafe duplicate retries after ambiguous submissions, and permits technical checks only
  as labelled read-only secondary evidence.
- [x] The result contract separates task outcome (`COMPLETED`, `PARTIAL`, `BLOCKED`, or `FAILED`) from
  the profiled executor's Test Manager Run result (`PASS`, `FAIL`, `BLOCKED`, or `INVALID`) and
  applies this mapping: `PASS` requires `COMPLETED` plus supported positive, negative, and evidence
  assertions; an unmet oracle after valid execution is `FAIL`; an external prerequisite preventing
  execution is `BLOCKED`; isolation failure, wrong context/data/build, executor failure, ambiguous or
  inadequate evidence is `INVALID`. A partial observed product outcome maps to `FAIL`; an external
  interruption maps to `BLOCKED`; uncertain context or evidence maps to `INVALID`. Product behavior
  causing an unrecoverable failed outcome maps to `FAIL`, while executor or tool failure maps to
  `INVALID`. `SKIPPED` remains a coordinator-only explicit pre-execution scope or waiver decision and
  is never returned by the profiled executor.
- [x] The prompt requires returned evidence to include run context, completion evidence, a concise
  ordered interaction trace, contamination or limitations, and raw actions, navigation, lookups,
  decisions, exploration, retries, recoveries, errors, and elapsed time; the existing coordinator
  remains responsible for storing that evidence and linking the Run row.
- [x] Metrics follow defined counting rules: one meaningful visible-UI operation is one action and
  normal text entry is one action; navigation changes the working context; a lookup is one distinct
  information-retrieval objective; a decision requires business or policy judgment; exploration is
  one abandoned unproductive branch; a retry repeats an equivalent action after failure or
  uncertainty; a recovery repairs one distinct mistake or failed state; an error is one distinct
  application or workflow failure. Counters may overlap. Elapsed time runs from the first UI
  observation through final verification or stop and is `UNKNOWN` when the runtime cannot measure it.
  Any terminal result before the first UI observation uses elapsed `NOT_STARTED`. Pre-action
  contamination returns task outcome `BLOCKED`, Run result `INVALID`, and zero counters. No composite
  complexity score is calculated.
- [x] Test Manager guidance explains that test level/type, regression purpose, automation, and
  execution profile are separate concerns, and routes goal-based UI execution through the new
  profile without creating `functional-test`, `regression-test`, `integration-test`, or another
  public tester skill.
- [x] Existing Test Manager validation, status, prompt generation, Studio projections, and standalone
  installation remain compatible, and focused tests cover the new profile and unchanged default
  behavior.
- [x] The ordinary Test Manager experience remains simple: this story adds no Case fields, sections,
  Run columns, root files, Studio controls, panels, filters, dashboards, generic profile registry, or
  mandatory choices. Goal-based detail is loaded only when that profile is requested, and its Runner
  Prompt avoids duplicating the full Test Manager or `audit-ui-ops` instructions.
- [x] Initialization creates the same managed-root inventory as before, the bundled profile asset is
  not copied into `.tests`, and Studio state exposes no execution-profile or operational-metric fields.
- [x] The implementation reviews the existing prompt/execution design for simplification and removes
  only redundancy directly evidenced in the affected path; broader unrelated cleanup is reported as
  a follow-up rather than mixed into this story.
- [x] The complete affected installable Test Manager skill is synchronized to its standalone
  installation after verification, while plugin cache snapshots and the independent `audit-ui-ops`
  installation remain untouched.

## Constraints

- Keep `.tests` root and suite schemas unchanged.
- Keep `RUNS.md` append-only and retain its existing ten-column table.
- Prefer one optional CLI argument, one bundled prompt asset, and one focused reference over new
  state, controls, abstractions, or configuration.
- Keep the profile product-neutral and independent of any particular URL, application, project,
  business domain, or browser implementation.
- Treat free-form Case content as coordinator-reviewed input, not as text the CLI can reliably
  sanitize or certify as goal-safe.
- Preserve project-owned `RUNNER_PROMPT.md` as the no-profile presentation authority.
- Preserve existing authorization boundaries for external writes, production data, destructive
  actions, payments, and notifications.
- Do not claim that an AI executor is equivalent to novice-human research.

## Non-Goals

- Persist an execution profile or complexity metrics in `.tests` state.
- Add profile selection or operational metrics to Test Manager Studio.
- Add new Case sections, labels, templates, root files, report sections, or mandatory setup for users
  who do not request goal-based execution.
- Create a generic executor registry, plugin dependency system, or runtime scheduler.
- Add `standard`, functional, regression, integration, performance, accessibility, security, or other
  executor profiles in this story.
- Add semantic natural-language linting for navigation or implementation knowledge.
- Copy, move, bundle, rename, or modify `audit-ui-ops`.
- Define a universal complexity score or absolute good/bad thresholds.
- Replace conventional functional, integration, regression, or business E2E coverage.

## Open Questions

None.
