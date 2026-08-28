# Execution, triage, and reporting

Read this reference before running tests, recording results, retesting defects, applying release gates, or producing a status report.

## Entry gate

Do not begin a decision-bearing run until the applicable entry criteria are met:

- scope, build, environment, owner, and change set are identified;
- the case is `READY` and its dependencies are available;
- test data is in a known state and cleanup/reset is possible;
- expected results and evidence requirements are reviewable;
- required accounts and approvals exist without expanding the test scope;
- known environment incidents are separated from product behavior;
- irreversible or external effects are explicitly authorized.

If a prerequisite is wrong, record `INVALID` or `BLOCKED`; do not improvise a different acceptance standard mid-run.

## Choose the first and next action

State one concrete first action before execution begins. After any result or status update, choose exactly one primary next action using this order, modified by real dependencies and business impact:

1. Honor an explicit user-selected case or decision when its entry gate is satisfied.
2. Resolve the smallest prerequisite blocking the selected or already-started work.
3. Retest an available fix for an unresolved critical or P0 failure, then run its impact-based regression.
4. Execute a `READY` case covering the highest unverified current-build risk; prefer P0 over P1 only when dependencies and impact do not justify another order.
5. Make the highest-risk uncovered or incomplete case ready when no suitable ready case exists.
6. Apply the release gate or produce the closure decision when required execution and retest work is complete.

Name the suite or Case ID, explain why it is next in one sentence, and identify the exact prerequisite or owner only when known. Never infer a fix is available, an approval exists, or a blocker has cleared. When the current request authorizes execution and the action is safe, perform it rather than returning it as advice. When user action is required, ask for one concrete unblocker instead of presenting several competing next steps.

## Run discipline

1. Record Run ID, case, build, environment, data identity, executor, and start time.
2. Capture the minimum before-state required to prove change and conservation.
3. Perform the user or system action through the scoped surface.
4. Record actual behavior as observed, including errors and uncertainty.
5. Refresh or re-enter to prove persistence.
6. Check required downstream facts and forbidden side effects.
7. Save evidence under the run and append one result row.
8. If submission state is uncertain, investigate before retrying any non-idempotent action.

For exploratory work, record the charter, time box, coverage notes, observations, risks, and follow-up cases. Exploration produces evidence and hypotheses; it is not automatically a pass for unexecuted scripted coverage.

## Result classification

- `PASS`: all applicable assertions are supported by current evidence.
- `FAIL`: the product violates an assertion. Preserve exact behavior and impact.
- `BLOCKED`: the intended test cannot complete because of an unresolved prerequisite, environment, data, dependency, or unsupported capability.
- `SKIPPED`: an authorized scope decision excludes the run; name the decision or waiver.
- `INVALID`: the run cannot support a quality conclusion. Exclude it from execution and pass-rate denominators.

Do not turn missing UI into a pass because an internal API works. Do not turn a UI inconvenience into a functional failure unless it prevents completion or causes an incorrect business result.

## Defect record quality

A defect or triage reference should contain:

- concise observed problem and business/user impact;
- build, environment, data and object IDs;
- linked Case ID and Run ID;
- reproducibility and exact starting state;
- expected versus actual result;
- evidence and relevant logs/trace;
- severity and rationale;
- containment, workaround, and retest scope when known.

Severity reflects impact; priority reflects scheduling. Suggested severity:

| Severity | Meaning                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| Blocker  | Testing or a critical business path cannot proceed, or irreversible widespread harm is credible |
| Critical | Incorrect money, entitlement, privacy, integrity, safety, or unrecoverable state                |
| Major    | Important workflow failure, misleading result, or costly workaround                             |
| Minor    | Limited impact with a practical workaround                                                      |
| Trivial  | Cosmetic or polish issue without material task impact                                           |

## Triage, retest, and regression

- Classify product defect, test defect, data defect, environment defect, expected behavior, or unsupported capability.
- Preserve the original failed run. A code change, closed ticket, or developer statement is not retest evidence.
- Retest the same assertion against the intended build and known data, then append a new Run ID linked to the defect.
- Select regression by change impact: touched rule, callers, consumers, state transitions, stored data, interfaces, configuration, rollback, and adjacent high-risk paths.
- Reopen or create a new defect when the observed failure differs materially; do not hide a new issue in an old ticket.

## Exit gate and release recommendation

Make exit criteria risk-based and observable. Typical release evidence includes:

- all critical risks have current valid coverage;
- required P0/P1 cases are executed with no unresolved blocking failure;
- open defects have explicit severity, owner, containment, and decision;
- failed fixes were retested and impact-based regression completed;
- blocked, skipped, invalid, and not-run work is visible;
- residual risks and waivers identify decision owner and expiry/review point;
- evidence is retained and sensitive data is handled correctly.

Never infer release approval from a pass percentage. A single failed critical invariant can outweigh hundreds of passing low-risk cases.

## Metrics

Calculate before narrating:

- inventory: total, draft, ready, retired cases;
- execution: cases with a current valid run, not merely total run rows;
- results: pass, fail, blocked, skipped, invalid, and not run;
- risk/requirement coverage and uncovered critical items;
- open defects by severity and age where data exists;
- retest success and regression completion;
- environment failure and invalid-run rate;
- automation coverage only where automated results are current and trustworthy.

State the denominator for every rate. Keep absent facts `UNKNOWN`; never convert missing dates, ownership, estimates, or coverage into zero.

## Report audiences

| Audience        | Emphasis                                                                           |
| --------------- | ---------------------------------------------------------------------------------- |
| Tester/operator | One primary next action, exact blockers, data and environment actions               |
| Test lead       | Coverage gaps, execution trend, defect clusters, retest/regression, capacity risks |
| Release owner   | Critical outcomes, unmet gates, residual risk, waivers, go/no-go recommendation    |
| Executive       | Business exposure, confidence, major unknowns, decision needed                     |

Lead with the decision or blocker. Keep evidence links near the claim they support. Separate current facts, uncertainty, judgment, and recommendation.
