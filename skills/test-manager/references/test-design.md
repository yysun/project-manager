# Risk-based test design

Read this reference when planning suites, deriving cases, reviewing coverage, or deciding whether test steps or automation are justified.

## Start from risk, not pages

For each quality risk, state:

- undesirable event;
- affected user, business process, data, or system;
- impact and reversibility;
- likelihood and exposure;
- how quickly the failure would be detected outside testing;
- authoritative oracle;
- cheapest test level that can prove the risk.

Use qualitative ratings unless the organization already has a calibrated scoring model. A numeric score without shared definitions creates false precision.

## Choose the proving level

| Need to prove                                                   | Prefer                                |
| --------------------------------------------------------------- | ------------------------------------- |
| Pure calculation, validation, or state rule                     | Unit/component                        |
| Consumer/provider payload compatibility                         | Contract/API                          |
| Transaction across services or storage                          | Integration                           |
| User-visible cross-module business outcome                      | Business E2E                          |
| Layout, language, accessibility, or operational discoverability | UI/accessibility/manual or AI-browser |
| Throughput, latency, resource limits                            | Performance                           |
| Failure containment, retry, restore, rollback                   | Recovery/resilience                   |

Do not duplicate the same assertion at every level. Lower levels localize rules; a small set of E2E cases proves that the assembled business journey works.

## Keep classification dimensions separate

- **Type or level** states what boundary proves the risk: unit, API, integration, business E2E, UI,
  performance, and so on.
- **Purpose** explains why coverage is selected or rerun: functional conformance, regression,
  recovery, exploration, or another quality objective.
- **Automation** states the mechanism: human, AI browser, automated runner, hybrid, or unsuitable.

Do not turn purpose or mechanism into sibling tester skills or a core execution-profile registry. A
business E2E Case may be selected for regression and executed by an AI browser at the same time. Put
specialized operating constraints in the project-owned Runner Prompt or Case instructions; use an
independent methodology skill when the purpose is a distinct audit rather than a Test Manager Run.

## Select design techniques deliberately

- **Equivalence partitions:** representative valid and invalid classes.
- **Boundary values:** just below, at, and just above limits; include time, money, quantity, capacity, and length.
- **Decision tables:** combinations of rules, eligibility, pricing, permissions, or approval conditions.
- **State transitions:** allowed and forbidden transitions, terminal states, undo, correction, and history.
- **Pairwise/combinatorial:** broad configuration interactions where exhaustive coverage is infeasible.
- **Cause-effect:** upstream events and all required downstream consequences.
- **Error guessing:** only as a supplement informed by incidents and implementation risk.
- **Exploratory charters:** investigation under uncertainty with a time box, mission, risks, data, and debrief.

For irreversible, financial, entitlement, capacity, or compliance behavior, always include negative and recovery assertions. For concurrent or retryable operations, include idempotency, response loss, duplicate submission, and stale-version cases when applicable.

## Build a usable oracle

An expected result must identify authoritative facts, not say “works” or “success message appears.” For business workflows, consider five layers:

1. action feedback matches what happened;
2. state persists after refresh or re-entry;
3. a second business view agrees;
4. source, actor, time, reason, version, and reversal remain traceable;
5. forbidden side effects did not occur.

API or database reads may strengthen evidence. They do not replace the visible user path when the product claim is that a user can complete the task in the UI.

## Design business E2E as missions

Keep the business instruction independent of today’s menu structure. Record the start facts, user decision, required end facts, and invariants. Allow a human or browser agent to discover the route unless exact steps are justified.

Separate these outcomes:

- task completion;
- business correctness;
- capability support;
- operational complexity;
- UI/design findings.

A difficult but correct flow may pass functionally and still produce a UX defect. A clear success message with wrong downstream facts is a functional failure.

## Data and environment design

- Give each mutating run an isolated or resettable data set.
- Record build, environment, tenant/site, business time zone, server time, feature flags, and relevant integrations.
- Prepare positive, negative, boundary, expired, conflicted, partially completed, and recovery states before execution.
- Use synthetic or approved data. Never copy production personal or payment data merely for realism.
- Decide cleanup before the run; do not make evidence depend on data that cleanup will erase.

## Automation decision

Automate when the assertion is stable, repeated, deterministic, and cheaper to maintain than to rerun manually. Keep manual or exploratory coverage for changing workflows, subjective judgment, discovery, and low-frequency cases whose setup dominates execution.

Avoid fixed-click automation for business validation when the actual question is whether a user can discover and complete an outcome. Use semantic locators and observable business assertions when UI automation is appropriate.

## Readiness review

Before changing a case to `READY`, verify:

- the risk or requirement is explicit;
- the objective tests one coherent outcome;
- preconditions and data can be reproduced;
- the oracle is observable and authoritative;
- positive, negative, boundary, state, and recovery coverage are proportionate to risk;
- dependencies, environment, owner, and evidence are known;
- steps are included only when they add real control;
- no hidden permission, external write, payment, notification, or destructive assumption remains.
