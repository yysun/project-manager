# E2E: Goal-Based Test Execution

## Scenario: preserve the existing no-profile Runner Prompt

Given a temporary valid `.tests` root with a ready Case and a project-owned `RUNNER_PROMPT.md`

When `test-manager.mjs prompt <case-id>` runs without `--profile`

Then the output is rendered from the project-owned template exactly as before

And the output and JSON envelope do not invent a default or `standard` profile

And no Case, Run, status, registry, template, or evidence file changes

And literal stdout and JSON golden expectations prove the default projection did not drift with the
profile renderer

## Scenario: render an isolated goal-based UI mission

Given a temporary valid `.tests` root with a ready business E2E Case using `AI_BROWSER` Automation and
containing an objective, preconditions, test data, Runner Instructions, expected outcome, negative
assertions, and evidence requirements

When `test-manager.mjs prompt <case-id> --profile goal-based-ui` runs

Then the output identifies `goal-based-ui` and includes every authoritative Case input needed to
execute and judge the business outcome

And it requires a fresh context without PRD, design-path, source-code, step, prior-trace, or remembered
product-navigation knowledge

And it restricts action to the visible UI, scoped authorization, safe retry behavior, and verified
outcome evidence

And it states that only `COMPLETED` with supported positive, negative, and evidence assertions can
produce `PASS`

And it maps a partial observed product outcome to `FAIL`, an external interruption to `BLOCKED`, and
uncertain context or evidence to `INVALID`

And it keeps coordinator-only `SKIPPED` outside the profiled executor response

And it requests an ordered trace, contamination disclosure, elapsed time, and raw action, navigation,
lookup, decision, exploration, retry, recovery, and error counts without a composite score

And it defines overlapping counters and the elapsed-time boundary rather than only naming metrics

And the JSON form contains `profile: "goal-based-ui"` and the same rendered prompt

And the executor response contract includes both execution-profile and executor identity

And the project-owned no-profile template is not used for the profiled output

And no managed test state changes

## Scenario: fail closed on an ineligible or contaminated mission

Given a ready Case without Runner Instructions or without `AI_BROWSER` or `HYBRID` Automation

When `test-manager.mjs prompt <case-id> --profile goal-based-ui` runs

Then the command rejects the Case as ineligible without exposing a goal-based mission or changing
managed state

Given an otherwise mechanically eligible Case whose free-form content contains navigation,
implementation details, or prior discoveries

When a fresh agent receives only the installed Test Manager skill, that disposable test root, and the
request `Generate the goal-based-ui Runner Prompt for <case-id>`

Then the agent's Test Manager coordinator preflight refuses to generate or invoke the profiled prompt

And it identifies the contaminated Case content without revealing a runnable mission

And managed state remains byte-for-byte unchanged

If prohibited knowledge nevertheless reaches a generated mission

Then the executor is instructed to perform no UI action and return task outcome `BLOCKED`, Run result
`INVALID`, zero counters, elapsed `NOT_STARTED`, and the contamination reason

## Scenario: reject invalid profile requests safely

Given a temporary valid `.tests` root with a ready Case

When `--profile` has no value, is repeated, names an unsupported profile, or is supplied to a command
other than `prompt`

Then the command exits unsuccessfully with a specific diagnostic

And no Case, Run, status, registry, template, or evidence file changes

## Scenario: refuse to expose a non-ready Case through the profile

Given a temporary valid `.tests` root with a draft Case

When `test-manager.mjs prompt <case-id> --profile goal-based-ui` runs

Then the command returns the existing non-ready `INVALID` instruction

And it does not expose the Case identity, goal, expected outcome, or goal-based execution mission

And JSON output identifies the requested profile while retaining the same non-ready instruction

## Scenario: run from the complete installed Test Manager skill

Given the complete affected Test Manager installation synchronized or linked from the repository

When a disposable test root is initialized and the profiled prompt command is executed from that
installed skill

Then the installed command renders the goal-based UI contract and the test root remains validator-valid

And the independent `audit-ui-ops` installation and every Codex plugin cache snapshot remain untouched

## Scenario: keep the ordinary Test Manager surface unchanged

Given a disposable workspace initialized by the updated Test Manager

When initialization and Studio state projection complete without requesting a profile

Then `.tests` contains the same managed-root files as before

And no goal-based profile asset is copied into the managed root

And Studio state contains no execution-profile or operational-metric properties or controls
