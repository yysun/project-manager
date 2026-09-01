# Goal-Based UI Execution

Read this reference only when planning or executing a visible-UI Case from a business goal without a
known navigation path.

## Boundary

`goal-based-ui` is an execution profile, not a Case type, persistent field, Studio setting, or new
tester skill. It asks whether a fresh executor can discover and complete the business outcome through
the visible interface. It complements rather than replaces conventional functional, integration,
regression, security, performance, accessibility, or business E2E coverage.

`audit-ui-ops` remains an independent skill for standalone operational UX audits and controlled
comparisons. Test Manager owns the Case, oracle, evidence link, Run result, defects, and quality gate.

## Preflight the Case

Use the profile only when all of these are true:

- the Case is `READY`;
- Automation is `AI_BROWSER` or `HYBRID`;
- Runner Instructions identify the visible execution surface and safety or stop boundaries;
- the objective is a business outcome rather than a prescribed interface path;
- preconditions, data, oracle, negative assertions, and evidence requirements are sufficient to judge
  the result.

Review every Case field that the prompt will include. Reject the profile before generation when it
contains selectors, coordinates, menu or click sequences, intended navigation, implementation
details, or discoveries from an earlier run. The CLI checks only mechanical eligibility; it cannot
certify unrestricted prose as goal-safe.

Root validation may inspect `RUNS.md` and `STEPS.md`, but the generated mission does not include or
derive content from either file.

## Generate and isolate the mission

Generate the mission with:

```bash
node <absolute-skill-dir>/scripts/test-manager.mjs prompt <case-id> --root <tests-root> --profile goal-based-ui
```

Give only the rendered prompt to a fresh execution context. Do not pass the coordinator's conversation,
PRD, designs, source code, test steps, previous evidence, successful paths, selectors, or earlier
product-specific discoveries. Ordinary interface conventions and necessary business knowledge remain
allowed.

If a fresh context is unavailable after the coordinator has received prohibited knowledge, do not
silently downgrade the method or claim zero-training evidence. Report that the profile cannot produce
a valid run in the current context.

## Execute and return evidence

The generated prompt is the executor contract. It requires visible-UI-only operation, scoped
authorization, safe handling of ambiguous submissions, final-state verification, a concise ordered
trace, contamination disclosure, and raw operational counters. Those counters can overlap:

- an action is one meaningful visible operation, with normal text entry counted once;
- navigation changes working context;
- a lookup completes or abandons one information-retrieval objective;
- a decision applies business or policy judgment;
- exploration abandons one unproductive branch;
- a retry repeats an equivalent uncertain or failed action;
- a recovery repairs one distinct mistake or failed state;
- an error is one distinct application or workflow failure.

Elapsed time starts at the first UI observation and ends at verification or stop. Use `NOT_STARTED`
for a terminal pre-observation result and `UNKNOWN` when a started run cannot be measured. Do not
calculate a composite complexity score.

## Map task outcome to the Run

Task outcome and QA result answer different questions. Apply this mapping:

| Observed condition | Task outcome | Run result |
| --- | --- | --- |
| Full goal, positive assertions, negative assertions, and evidence are supported | `COMPLETED` | `PASS` |
| Valid execution exposes an unmet, partial, incorrect, or unrecoverable product outcome | `PARTIAL` or `FAILED` | `FAIL` |
| External prerequisite or interruption prevents safe execution or completion | `BLOCKED` or `PARTIAL` | `BLOCKED` |
| Contamination, wrong context/data/build, executor/tool failure, or inadequate evidence | `BLOCKED`, `PARTIAL`, or `FAILED` | `INVALID` |

`PARTIAL` never passes. `SKIPPED` is a coordinator-only pre-execution scope or waiver decision and is
not returned by the profiled executor.

Store the executor's returned trace and metrics under the Run evidence path, then append the ordinary
ten-column `RUNS.md` row through the existing validated flow. Prompt generation does not store or
validate evidence and adds no profile or metric field to managed state.
