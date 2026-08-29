#!/usr/bin/env node
/* Creates a disposable or persistent Test Manager Studio demo with multiple
   Suites, every Kanban lane, Suite-only dates, continuous Timeline markers,
   immutable retest history, evidence, defects, and a blocking release gate. */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  createSuite,
  initialize,
  inspectRoot,
  registryMarkdown,
  statusMarkdown,
} from "../../skills/test-manager/scripts/test-manager.mjs";
import {
  appendRun,
  statePayload,
} from "../../skills/test-manager/scripts/test-manager-studio.mjs";

const DEMO_MARKER = "Test Manager Studio demo v1\n";
const DEMO_MARKER_NAME = ".test-manager-demo-v1";

const suites = [
  {
    slug: "checkout",
    title: "Checkout",
    risk: "CRITICAL",
    owner: "Payments QA",
    plannedStart: "2026-08-24",
    plannedEnd: "2026-09-08",
    purpose: "Protect payment integrity and order creation across the checkout boundary.",
    cases: [
      {
        id: "CHECKOUT-C001",
        title: "Complete an authorized payment exactly once",
        state: "READY",
        priority: "P0",
        type: "BUSINESS_E2E",
        risk: "PAY-R01 · duplicate charge or missing order",
        automation: "AI_BROWSER",
        owner: "Mina",
        start: "2026-08-25",
        end: "2026-08-28",
        objective: "Prove one authorized payment creates exactly one durable order and payment fact.",
        expected: "The confirmation, refreshed order history, and payment reconciliation agree on one transaction.",
        negative: "No duplicate charge, orphan order, or silent partial success exists.",
      },
      {
        id: "CHECKOUT-C002",
        title: "Recover safely after issuer decline",
        state: "READY",
        priority: "P1",
        type: "RECOVERY",
        risk: "PAY-R02 · decline leaves a poisoned cart",
        automation: "HYBRID",
        owner: "Noah",
        start: "2026-08-29",
        end: "2026-09-04",
        objective: "Prove a declined attempt can be corrected without duplicating the cart or payment intent.",
        expected: "The decline is explicit and a subsequent approved attempt creates one order.",
        negative: "No order is created for the decline and no stale error survives the approved retry.",
      },
      {
        id: "CHECKOUT-C003",
        title: "Explore interrupted confirmation recovery",
        state: "DRAFT",
        priority: "P2",
        type: "EXPLORATORY",
        risk: "PAY-R03 · response loss creates ambiguous completion",
        automation: "MANUAL",
        owner: "UNASSIGNED",
        start: "UNPLANNED",
        end: "UNPLANNED",
        objective: "Explore recovery signals after the confirmation response is interrupted.",
        expected: "A future ready version will define the authoritative recovery oracle.",
        negative: "Do not infer failure or retry payment while final state is uncertain.",
      },
    ],
  },
  {
    slug: "regression",
    title: "Release Regression",
    risk: "HIGH",
    owner: "Release QA",
    plannedStart: "2026-08-27",
    plannedEnd: "2026-09-15",
    purpose: "Protect current-build business behavior across the release candidate.",
    cases: [
      {
        id: "REGRESSION-C001",
        title: "Verify production-like test data is available",
        state: "READY",
        priority: "P0",
        type: "INTEGRATION",
        risk: "REL-R01 · release evidence uses an invalid environment",
        automation: "MANUAL",
        owner: "Ravi",
        start: "UNPLANNED",
        end: "UNPLANNED",
        objective: "Prove the release environment exposes the approved isolated data set and dependencies.",
        expected: "All seeded accounts and service dependencies are reachable on the recorded build.",
        negative: "No production identity, credential, or personal data is used.",
      },
      {
        id: "REGRESSION-C002",
        title: "Complete the returning-customer journey",
        state: "READY",
        priority: "P1",
        type: "BUSINESS_E2E",
        risk: "REL-R02 · session changes break repeat purchase",
        automation: "AI_BROWSER",
        owner: "Ravi",
        start: "2026-09-05",
        end: "2026-09-10",
        objective: "Prove a returning customer can authenticate, reorder, and see the durable result.",
        expected: "The new order persists and the prior order remains unchanged.",
        negative: "No cross-account data, stale price, or duplicate order appears.",
      },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    risk: "HIGH",
    owner: "Inclusive Design QA",
    plannedStart: "2026-08-31",
    plannedEnd: "2026-09-12",
    purpose: "Protect keyboard and assistive-technology access to the critical purchase path.",
    cases: [
      {
        id: "ACCESSIBILITY-C001",
        title: "Complete checkout with keyboard navigation",
        state: "READY",
        priority: "P1",
        type: "ACCESSIBILITY",
        risk: "A11Y-R01 · keyboard users cannot complete payment",
        automation: "HYBRID",
        owner: "Iris",
        start: "2026-09-01",
        end: "2026-09-06",
        objective: "Prove the checkout can be completed with keyboard input and visible focus.",
        expected: "Focus order, labels, validation, and confirmation remain operable and understandable.",
        negative: "No focus trap, hidden error, or pointer-only control blocks completion.",
      },
      {
        id: "ACCESSIBILITY-C002",
        title: "Review the retired legacy payment form",
        state: "RETIRED",
        priority: "P3",
        type: "ACCESSIBILITY",
        risk: "A11Y-R00 · obsolete flow retained in active coverage",
        automation: "NOT_SUITABLE",
        owner: "Iris",
        start: "UNPLANNED",
        end: "UNPLANNED",
        objective: "Preserve the retired Case ID and its historical scope without scheduling execution.",
        expected: "The case remains retired and excluded from the active release gate.",
        negative: "The retired identifier is never reused for new coverage.",
      },
    ],
  },
];

const runs = [
  {
    suite: "checkout",
    caseId: "CHECKOUT-C001",
    environment: "release-candidate",
    build: "demo-101",
    data: "PAY-DEMO-01",
    result: "FAIL",
    issue: "DEF-201 · confirmation returned before order persistence",
    executedAt: "2026-08-26T14:00:00Z",
    evidence: "The confirmation was visible, but the refreshed order history was empty.",
  },
  {
    suite: "checkout",
    caseId: "CHECKOUT-C001",
    environment: "release-candidate",
    build: "demo-102",
    data: "PAY-DEMO-02",
    result: "PASS",
    issue: "",
    executedAt: "2026-08-28T16:20:00Z",
    evidence: "Confirmation, order history, and reconciliation showed one matching transaction.",
  },
  {
    suite: "checkout",
    caseId: "CHECKOUT-C002",
    environment: "release-candidate",
    build: "demo-102",
    data: "PAY-DEMO-DECLINE-01",
    result: "FAIL",
    issue: "DEF-204 · decline banner persists after approved retry",
    executedAt: "2026-09-02T15:10:00Z",
    evidence: "The approved retry created one order, but the stale decline banner remained visible.",
  },
  {
    suite: "regression",
    caseId: "REGRESSION-C001",
    environment: "release-candidate",
    build: "demo-102",
    data: "REL-DEMO-SEED",
    result: "BLOCKED",
    issue: "ENV-17 · seeded returning-customer account is unavailable",
    executedAt: "2026-09-03T13:30:00Z",
    evidence: "",
  },
  {
    suite: "accessibility",
    caseId: "ACCESSIBILITY-C001",
    environment: "release-candidate",
    build: "demo-102",
    data: "A11Y-DEMO-01",
    result: "PASS",
    issue: "",
    executedAt: "2026-09-06T18:45:00Z",
    evidence: "Keyboard traversal, validation recovery, and confirmation completed with visible focus.",
  },
];

function prepareWorkspace(target) {
  if (!target) return mkdtempSync(join(tmpdir(), "tm-studio-"));
  const workspace = resolve(target);
  if (existsSync(workspace)) {
    const marker = join(workspace, DEMO_MARKER_NAME);
    if (!existsSync(marker) || readFileSync(marker, "utf8") !== DEMO_MARKER) {
      throw new Error(
        `Refusing to replace ${workspace}: it is not a generated Test Manager demo`,
      );
    }
    rmSync(workspace, { recursive: true });
  }
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, DEMO_MARKER_NAME), DEMO_MARKER, "utf8");
  return realpathSync(workspace);
}

function rootStrategy() {
  return `---
schema: test-manager/root/v1
title: "Commerce Release QA"
status: ACTIVE
created: "2026-08-24"
---

# Test Strategy

## Quality objective and decision

- Quality objective: Protect payment integrity, release stability, and accessible task completion.
- Release decision supported: Decide whether build demo-102 is safe to release.
- Decision owner: Release Council

## Scope

### In scope

- Checkout, returning-customer regression, and keyboard accessibility.

### Out of scope

- Production payments, load testing, and native mobile applications.

## Quality risks

| Risk ID | Undesirable event and impact | Rating | Owner | Planned evidence |
| ------- | ---------------------------- | ------ | ----- | ---------------- |
| PAY-R01 | Payment and order facts diverge | CRITICAL | Payments QA | Reconciled E2E evidence |
| REL-R01 | Invalid environment produces false confidence | HIGH | Release QA | Seed and dependency proof |
| A11Y-R01 | Keyboard users cannot purchase | HIGH | Inclusive Design QA | Keyboard journey evidence |

## Test approach

- Test levels: Integration and business E2E.
- Test types: Functional, recovery, regression, exploratory, and accessibility.
- Manual / automation boundary: Stable assertions are automated; discovery and accessibility judgment remain hybrid.
- Regression policy: Retest defects, then cover adjacent payment, session, and accessibility risks.

## Environments and builds

| Environment | Purpose | Build source | Dependencies | Owner |
| ----------- | ------- | ------------ | ------------ | ----- |
| release-candidate | Release evidence | demo-102 | Payment sandbox and seeded accounts | Release QA |

## Test data and time

- Data source and privacy policy: Synthetic demo identities only.
- Isolation / reset method: One named data set per mutating Case.
- Cleanup and retention: Reset after execution; retain redacted evidence for 30 days.
- Business time zone / server clock: UTC.

## Entry criteria

- Build, environment, owners, synthetic data, and expected outcomes are identified.

## Exit criteria and quality gates

- Every P0 Case has a current PASS and no critical blocker remains.

## Defects, waivers, and evidence

- Severity model: Blocker / Critical / Major / Minor / Trivial.
- Triage workflow: Link every FAIL or BLOCKED Run to a defect or environment issue.
- Waiver authority and expiry: Release Council; no open-ended waiver.
- Evidence location and retention: Suite-local evidence, redacted, retained for 30 days.

## Reporting

- Audiences: Test lead and release owner.
- Cadence: Daily during release qualification.
- Required decisions: Resolve ENV-17 and DEF-204 before release.
`;
}

function suiteCharter(suite) {
  return `---
schema: test-manager/suite/v1
suite: ${suite.slug}
title: "${suite.title}"
risk: ${suite.risk}
state: ACTIVE
owner: "${suite.owner}"
planned_start: ${suite.plannedStart}
planned_end: ${suite.plannedEnd}
---

# ${suite.title}

## Purpose and decision

- Purpose: ${suite.purpose}
- Quality decision supported: Determine whether this risk area is acceptable for build demo-102.

## Scope

### In scope

- The demo Cases recorded in this Suite.

### Out of scope

- Production writes and unrelated product areas.

## Risks and traceability

| Risk / Requirement | Impact | Required evidence | Case IDs |
| ------------------ | ------ | ----------------- | -------- |
| ${suite.cases[0].risk} | Release confidence | Observable current-build evidence | ${suite.cases.map((item) => item.id).join(", ")} |

## Dependencies

- Product / service dependencies: Demo release candidate.
- External systems: Synthetic sandbox only.
- Accounts / permissions assumed: Approved demo tester accounts.

## Environment and data

- Environment: release-candidate.
- Build source: demo-102.
- Data sets and reset: Suite-local synthetic IDs; reset after mutation.
- Time-zone or clock requirements: UTC.

## Entry criteria

- Case is READY, build is identified, and required demo data is available.

## Exit criteria

- Required current Runs support the Suite decision with linked issues for exceptions.

## Regression obligation

- Retest failures and cover adjacent state, retry, and persistence behavior.

## Known limitations and residual risk

- Demo evidence illustrates workflow and is not a real release claim.
`;
}

function caseMarkdown(suite) {
  return `# ${suite.title} Test Cases\n${suite.cases
    .map(
      (item) => `
## ${item.id} — ${item.title}

- State: ${item.state}
- Priority: ${item.priority}
- Type: ${item.type}
- Requirement / Risk: ${item.risk}
- Automation: ${item.automation}
- Owner: ${item.owner}
- Planned Start: ${item.start}
- Planned End: ${item.end}

### Objective

${item.objective}

### Preconditions

- Build demo-102 and the named synthetic data set are available.

### Test Data

- Data set: ${item.id}-DEMO; synthetic and resettable.

### Expected Outcome

- ${item.expected}

### Negative Assertions

- ${item.negative}

### Evidence Required

- Visible outcome, persisted state, downstream agreement, and relevant object IDs.
`,
    )
    .join("")}`;
}

function expectedRunId(caseId, executedAt, ordinal) {
  return `${executedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${caseId}-R${ordinal}`;
}

function recordRuns(root) {
  const ordinals = new Map();
  for (const run of runs) {
    const ordinal = (ordinals.get(run.caseId) ?? 0) + 1;
    ordinals.set(run.caseId, ordinal);
    const runId = expectedRunId(run.caseId, run.executedAt, ordinal);
    let evidence = "";
    if (run.evidence) {
      const directory = join(root, run.suite, "evidence", runId);
      mkdirSync(directory, { recursive: true });
      const filename = `${runId}_${run.caseId}_after.md`;
      writeFileSync(
        join(directory, filename),
        `# Demo evidence\n\n${run.evidence}\n\nSynthetic fixture; no production data.\n`,
        "utf8",
      );
      evidence = `evidence/${runId}/${filename}`;
    }
    const result = appendRun(root, {
      ...run,
      evidence,
      executor: "Demo QA",
    });
    if (result.runId !== runId) {
      throw new Error(`Unexpected Run ID: ${result.runId}; expected ${runId}`);
    }
  }
}

export function createTestManagerDemo({ out = null } = {}) {
  const workspace = prepareWorkspace(out);
  if (!existsSync(join(workspace, DEMO_MARKER_NAME))) {
    writeFileSync(join(workspace, DEMO_MARKER_NAME), DEMO_MARKER, "utf8");
  }
  const root = join(workspace, ".tests");
  initialize(root, "Commerce Release QA");
  writeFileSync(join(root, "TESTING.md"), rootStrategy(), "utf8");
  for (const suite of suites) {
    createSuite(root, suite.slug, suite.title);
    writeFileSync(join(root, suite.slug, "SUITE.md"), suiteCharter(suite), "utf8");
    writeFileSync(join(root, suite.slug, "CASES.md"), caseMarkdown(suite), "utf8");
  }
  let report = inspectRoot(root);
  if (!report.valid) throw new Error(report.errors.join("\n"));
  writeFileSync(join(root, "SUITES.md"), registryMarkdown(report), "utf8");
  writeFileSync(join(root, "STATUS.md"), statusMarkdown(report), "utf8");
  recordRuns(root);
  report = inspectRoot(root);
  if (!report.valid) throw new Error(report.errors.join("\n"));
  const state = statePayload(root);
  return {
    workspace: realpathSync(workspace),
    root: realpathSync(root),
    counts: state.counts,
    gateIndicator: state.gateIndicator,
  };
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : null;
  if (outIndex >= 0 && !out) throw new Error("--out requires a directory");
  const consumed = new Set(outIndex >= 0 ? [outIndex, outIndex + 1] : []);
  const unknown = args.filter((_, index) => !consumed.has(index));
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
  process.stdout.write(`${JSON.stringify(createTestManagerDemo({ out }))}\n`);
}

if (basename(process.argv[1] ?? "") === "create-browser-fixture.mjs") {
  try {
    main();
  } catch (error) {
    console.error(`test-manager-demo: ${error.message}`);
    process.exitCode = 1;
  }
}
