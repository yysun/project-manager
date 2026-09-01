// Responsibility: verify managed-root invariants, launcher behavior, Studio APIs, and run history.
// Test isolation: every fixture uses a disposable temporary workspace removed after the suite.
// Recent change: cover opt-in goal-based UI prompts and unchanged default projections.

import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildRunnerPrompt,
  createSuite,
  initialize,
  inspectRoot,
  loadRunnerPromptTemplate,
  portableSkillPath,
} from "../scripts/test-manager.mjs";
import {
  appendRun,
  startStudio,
  statePayload,
  updateCase,
} from "../scripts/test-manager-studio.mjs";
import {
  barGeometry,
  datePercent,
  dayDiff,
  rangeDays,
  rangeContains,
  timelineContentWidth,
  timelineLayout,
  timelineMarkers,
  timelineRange,
  timelineScaleTicks,
} from "../ui/timeline-model.mjs";

const tempRoots = [];
const managerScript = fileURLToPath(
  new URL("../scripts/test-manager.mjs", import.meta.url),
);
const studioHtml = fileURLToPath(new URL("../ui/studio.html", import.meta.url));

function treeSnapshot(root, current = root) {
  return Object.fromEntries(
    readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const path = join(current, entry.name);
      if (entry.isDirectory()) return Object.entries(treeSnapshot(root, path));
      return [[path.slice(root.length + 1), readFileSync(path, "utf8")]];
    }),
  );
}

function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), "test-manager-test-"));
  tempRoots.push(workspace);
  const root = join(workspace, ".tests");
  initialize(root, "Fixture Testing");
  createSuite(root, "checkout", "Checkout");
  return { workspace, root, suite: join(root, "checkout") };
}

function setSuitePlan(suite, plannedStart, plannedEnd) {
  const path = join(suite, "SUITE.md");
  let content = readFileSync(path, "utf8");
  if (/^planned_start:.*$/m.test(content)) {
    content = content.replace(
      /^planned_start:.*$/m,
      `planned_start: ${plannedStart}`,
    );
  } else {
    content = content.replace(
      /^owner:.*$/m,
      (owner) => `${owner}\nplanned_start: ${plannedStart}`,
    );
  }
  if (/^planned_end:.*$/m.test(content)) {
    content = content.replace(/^planned_end:.*$/m, `planned_end: ${plannedEnd}`);
  } else {
    content = content.replace(
      /^planned_start:.*$/m,
      (start) => `${start}\nplanned_end: ${plannedEnd}`,
    );
  }
  writeFileSync(path, content, "utf8");
}

function readyCase() {
  return `# Checkout Test Cases

## CHECKOUT-C001 — Submit a valid payment

- State: READY
- Priority: P0
- Type: BUSINESS_E2E
- Requirement / Risk: PAY-R01
- Automation: AI_BROWSER
- Owner: QA
- Planned Start: 2026-08-28
- Planned End: 2026-08-29

### Objective

Prove that an authorized payment creates one order and one payment fact.

### Preconditions

- A clean cart and approved test account exist.

### Test Data

- PAY-D01

### Runner Instructions

- Use /browser to open the prepared checkout UI.
- Complete the payment through visible controls; stop before retrying an uncertain submission.

### Expected Outcome

- The order persists and reconciles from a second view.

### Negative Assertions

- No duplicate charge or orphan order exists.

### Evidence Required

- Before, after, order ID, payment ID, and reconciliation evidence.
`;
}

function draftCase() {
  return `# Checkout Test Cases

## CHECKOUT-C001 — Incomplete draft

- State: DRAFT
- Priority: P1
- Type: BUSINESS_E2E
- Requirement / Risk: UNDEFINED
- Automation: MANUAL
- Owner: UNASSIGNED
- Planned Start: UNPLANNED
- Planned End: UNPLANNED

### Objective

UNDEFINED
`;
}

test.after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

test("initializes a valid folder-native test root and suite", () => {
  const { root } = fixture();
  const report = inspectRoot(root);
  assert.equal(report.valid, true);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.counts.suites, 1);
  assert.equal(report.counts.cases, 0);
  const suiteCharter = readFileSync(join(root, "checkout", "SUITE.md"), "utf8");
  assert.match(suiteCharter, /^planned_start: UNPLANNED$/m);
  assert.match(suiteCharter, /^planned_end: UNPLANNED$/m);
  assert.match(
    readFileSync(join(root, "SUITES.md"), "utf8"),
    /\| checkout \| Checkout \|/,
  );
  assert.equal(existsSync(join(root, "studio.sh")), true);
  assert.equal(existsSync(join(root, "studio.cmd")), true);
  assert.equal(existsSync(join(root, "RUNNER_PROMPT.md")), true);
  assert.equal(existsSync(join(root, "goal-based-ui-runner-prompt.md")), false);
  assert.deepEqual(readdirSync(root).sort(), [
    ".env.local",
    ".gitignore",
    "RUNNER_PROMPT.md",
    "STATUS.md",
    "SUITES.md",
    "TESTING.md",
    "checkout",
    "studio.cmd",
    "studio.sh",
  ]);
  assert.match(
    readFileSync(join(root, "RUNNER_PROMPT.md"), "utf8"),
    /\{\{Runner Instructions \| unbullet\}\}/,
  );
  assert.equal(statSync(join(root, "studio.sh")).mode & 0o777, 0o755);
  assert.equal(
    readFileSync(join(root, ".gitignore"), "utf8"),
    "/.env.local\n",
  );
  const config = readFileSync(join(root, ".env.local"), "utf8");
  assert.match(config, /^TEST_MANAGER_SKILL_PATH=.+\n$/);
  const configuredSkillPath = config
    .trim()
    .slice("TEST_MANAGER_SKILL_PATH=".length);
  assert.equal(
    configuredSkillPath.startsWith("~/") || isAbsolute(configuredSkillPath),
    true,
  );

  const syntheticHome = join(tmpdir(), "test-manager-home");
  assert.equal(
    portableSkillPath(
      join(syntheticHome, ".codex", "skills", "test-manager"),
      syntheticHome,
    ),
    "~/.codex/skills/test-manager",
  );
  const outsideHome = dirname(syntheticHome);
  assert.equal(portableSkillPath(outsideHome, syntheticHome), outsideHome);

  const launch = spawnSync(join(root, "studio.sh"), ["--help"], {
    encoding: "utf8",
  });
  assert.equal(launch.status, 0, launch.stderr);
  assert.match(launch.stdout, /Usage: test-manager-studio\.mjs/);

  const absoluteSkillPath = configuredSkillPath.startsWith("~/")
    ? resolve(homedir(), configuredSkillPath.slice(2))
    : configuredSkillPath;
  writeFileSync(
    join(root, ".env.local"),
    `TEST_MANAGER_SKILL_PATH=~/${basename(absoluteSkillPath)}\n`,
    "utf8",
  );
  const homeRelativeLaunch = spawnSync(join(root, "studio.sh"), ["--help"], {
    encoding: "utf8",
    env: { ...process.env, HOME: dirname(absoluteSkillPath) },
  });
  assert.equal(homeRelativeLaunch.status, 0, homeRelativeLaunch.stderr);
  assert.match(
    homeRelativeLaunch.stdout,
    /Usage: test-manager-studio\.mjs/,
  );

  const invalidHomeLaunch = spawnSync(join(root, "studio.sh"), ["--help"], {
    encoding: "utf8",
    env: { ...process.env, HOME: "relative/home" },
  });
  assert.equal(invalidHomeLaunch.status, 2);
  assert.match(invalidHomeLaunch.stderr, /HOME must be absolute/);

  writeFileSync(
    join(root, ".env.local"),
    "TEST_MANAGER_SKILL_PATH=relative/skill\n",
    "utf8",
  );
  const relativeLaunch = spawnSync(join(root, "studio.sh"), ["--help"], {
    encoding: "utf8",
  });
  assert.equal(relativeLaunch.status, 2);
  assert.match(relativeLaunch.stderr, /must be absolute or start with ~\//);

  const windowsLauncher = readFileSync(join(root, "studio.cmd"), "utf8");
  assert.match(windowsLauncher, /USERPROFILE/);
  assert.ok(
    windowsLauncher.includes(
      'set "TEST_MANAGER_SKILL_PATH=%USERPROFILE%\\%TEST_MANAGER_SKILL_PATH:~2%"',
    ),
  );
});

test("validates optional Suite plan dates and projects them into Studio state", () => {
  const { root, suite } = fixture();
  const charter = join(suite, "SUITE.md");
  writeFileSync(
    charter,
    readFileSync(charter, "utf8").replace(/^planned_(?:start|end):.*\n/gm, ""),
    "utf8",
  );
  let report = inspectRoot(root);
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(statePayload(root).suites[0].plannedStart, null);
  assert.equal(statePayload(root).suites[0].plannedEnd, null);

  setSuitePlan(suite, "2026-08-25", "2026-09-12");
  report = inspectRoot(root);
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(report.suites[0].meta.planned_start, "2026-08-25");
  assert.equal(report.suites[0].meta.planned_end, "2026-09-12");
  assert.deepEqual(
    {
      plannedStart: statePayload(root).suites[0].plannedStart,
      plannedEnd: statePayload(root).suites[0].plannedEnd,
    },
    { plannedStart: "2026-08-25", plannedEnd: "2026-09-12" },
  );

  setSuitePlan(suite, "2026-09-12", "2026-08-25");
  report = inspectRoot(root);
  assert.equal(report.valid, false);
  assert.match(report.errors.join("\n"), /planned_end must not be before planned_start/);
});

test("validates a ready case, schedules it, and records an evidence-backed pass", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");

  let report = inspectRoot(root);
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(report.counts.ready, 1);

  updateCase(root, {
    suite: "checkout",
    caseId: "CHECKOUT-C001",
    state: "READY",
    plannedStart: "2026-09-01",
    plannedEnd: "2026-09-03",
  });
  assert.match(
    readFileSync(join(suite, "CASES.md"), "utf8"),
    /- Planned Start: 2026-09-01/,
  );

  const run = appendRun(root, {
    suite: "checkout",
    caseId: "CHECKOUT-C001",
    environment: "test",
    build: "abc123",
    data: "PAY-D01",
    result: "PASS",
    evidence: "evidence/run-1/after.png",
    issue: "",
    executor: "QA",
    executedAt: "2026-09-01T12:30:00Z",
  });
  assert.match(run.runId, /CHECKOUT-C001-R1$/);

  report = inspectRoot(root);
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(report.counts.pass, 1);
  assert.equal(report.counts.notRun, 0);
});

test("projects optional Runner Instructions and a complete copy-ready prompt", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");

  const report = inspectRoot(root);
  assert.equal(report.valid, true, report.errors.join("\n"));
  const testCase = report.suites[0].cases[0];
  assert.match(
    testCase.sections["Runner Instructions"],
    /Use \/browser/,
  );

  const template = loadRunnerPromptTemplate(root);
  const prompt = buildRunnerPrompt(testCase, template);
  assert.match(prompt, /^Use \/browser to open the prepared checkout UI\./);
  assert.match(prompt, /Case: CHECKOUT-C001 — Submit a valid payment/);
  assert.match(prompt, /Objective: Prove that an authorized payment/);
  assert.match(prompt, /Test data: PAY-D01/);
  assert.match(prompt, /Expected: The order persists/);
  assert.doesNotMatch(prompt, /Preconditions\n|Negative assertions\n|Evidence required\n|Execution discipline\n/);
  assert.ok(prompt.length < 1000, `prompt too long: ${prompt.length}`);
  assert.match(prompt, /Return only:/);
  assert.match(prompt, /Run Context: executed at \| environment \| build \| data ID/);
  assert.match(prompt, /Issue \/ Reason:/);

  const projected = statePayload(root).suites[0].cases[0];
  assert.equal(projected.runnerInstructions, testCase.sections["Runner Instructions"]);
  assert.equal(projected.runnerPrompt, prompt);
});

test("generates the same Runner Prompt from core CLI without Studio", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  const report = inspectRoot(root);
  const testCase = report.suites[0].cases[0];
  const result = spawnSync(
    process.execPath,
    [managerScript, "prompt", testCase.id, "--root", root],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    buildRunnerPrompt(testCase, loadRunnerPromptTemplate(root)),
  );
});

test("preserves literal project-owned Runner Prompt stdout and JSON without a profile", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  writeFileSync(
    join(root, "RUNNER_PROMPT.md"),
    "{{Runner Instructions | unbullet}}\n\nDEFAULT {{Case ID}}\n",
    "utf8",
  );

  const args = ["prompt", "CHECKOUT-C001", "--root", root];
  const plain = spawnSync(process.execPath, [managerScript, ...args], {
    encoding: "utf8",
  });
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(
    plain.stdout,
    "Use /browser to open the prepared checkout UI.\nComplete the payment through visible controls; stop before retrying an uncertain submission.\n\nDEFAULT CHECKOUT-C001\n",
  );

  const json = spawnSync(
    process.execPath,
    [managerScript, ...args, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(json.status, 0, json.stderr);
  assert.equal(
    json.stdout,
    `${JSON.stringify(
      {
        caseId: "CHECKOUT-C001",
        prompt:
          "Use /browser to open the prepared checkout UI.\nComplete the payment through visible controls; stop before retrying an uncertain submission.\n\nDEFAULT CHECKOUT-C001",
      },
      null,
      2,
    )}\n`,
  );
});

test("renders an eligible Case through the goal-based UI profile without mutation", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  writeFileSync(
    join(root, "RUNNER_PROMPT.md"),
    "PROJECT DEFAULT {{Case ID}}\n",
    "utf8",
  );
  const before = treeSnapshot(root);
  const args = [
    "prompt",
    "CHECKOUT-C001",
    "--root",
    root,
    "--profile",
    "goal-based-ui",
  ];

  const plain = spawnSync(process.execPath, [managerScript, ...args], {
    encoding: "utf8",
  });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /^You are a fresh goal-based UI tester\./);
  assert.match(plain.stdout, /Case: CHECKOUT-C001 — Submit a valid payment/);
  assert.match(plain.stdout, /A clean cart and approved test account exist\./);
  assert.match(plain.stdout, /PAY-D01/);
  assert.match(plain.stdout, /Use \/browser to open the prepared checkout UI\./);
  assert.match(plain.stdout, /The order persists and reconciles from a second view\./);
  assert.match(plain.stdout, /No duplicate charge or orphan order exists\./);
  assert.match(plain.stdout, /Before, after, order ID, payment ID/);
  assert.match(
    plain.stdout,
    /Task Outcome `BLOCKED`, Result `INVALID`, zero counters, elapsed `NOT_STARTED`/,
  );
  assert.match(
    plain.stdout,
    /implementation details or artifacts.*prior-run evidence or screenshots.*hidden API or database knowledge/,
  );
  assert.match(plain.stdout, /`PASS` requires Task Outcome `COMPLETED`/);
  assert.match(
    plain.stdout,
    /partial, incorrect, or unrecoverable product outcome/,
  );
  assert.match(plain.stdout, /Counters may overlap/);
  assert.match(plain.stdout, /Do not calculate a composite score/);
  assert.match(plain.stdout, /Executor: name \| agent \| runtime identity/);
  assert.doesNotMatch(plain.stdout, /PROJECT DEFAULT/);

  const jsonResult = spawnSync(
    process.execPath,
    [managerScript, ...args, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const parsed = JSON.parse(jsonResult.stdout);
  assert.equal(parsed.caseId, "CHECKOUT-C001");
  assert.equal(parsed.profile, "goal-based-ui");
  assert.equal(parsed.prompt, plain.stdout.trim());
  assert.deepEqual(treeSnapshot(root), before);

  const projected = statePayload(root).suites[0].cases[0];
  assert.equal(Object.hasOwn(projected, "executionProfile"), false);
  assert.equal(Object.hasOwn(projected, "metrics"), false);
  assert.doesNotMatch(
    readFileSync(studioHtml, "utf8"),
    /goal-based-ui|execution profile/i,
  );
});

test("rejects invalid goal-based profile arguments without mutation", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  const before = treeSnapshot(root);
  const cases = [
    {
      args: ["prompt", "CHECKOUT-C001", "--root", root, "--profile"],
      error: /--profile requires a value/,
    },
    {
      args: [
        "prompt",
        "DOES-NOT-EXIST-C001",
        "--root",
        root,
        "--profile",
        "goal-based-ui",
        "--profile",
        "goal-based-ui",
      ],
      error: /--profile may be specified only once/,
    },
    {
      args: [
        "prompt",
        "CHECKOUT-C001",
        "--root",
        root,
        "--profile",
        "unknown",
      ],
      error: /unsupported prompt profile: unknown; supported: goal-based-ui/,
    },
    {
      args: ["validate", "--root", root, "--profile", "goal-based-ui"],
      error: /--profile is only valid with prompt/,
    },
    {
      args: [
        "validate",
        "--root",
        root,
        "--profile",
        "goal-based-ui",
        "--help",
      ],
      error: /--profile is only valid with prompt/,
    },
  ];

  for (const item of cases) {
    const result = spawnSync(process.execPath, [managerScript, ...item.args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, item.error);
    assert.deepEqual(treeSnapshot(root), before);
  }
});

test("rejects mechanically ineligible goal-based Cases", () => {
  const { root, suite } = fixture();
  const casePath = join(suite, "CASES.md");
  const args = [
    managerScript,
    "prompt",
    "CHECKOUT-C001",
    "--root",
    root,
    "--profile",
    "goal-based-ui",
  ];

  writeFileSync(
    casePath,
    readyCase().replace("- Automation: AI_BROWSER", "- Automation: HYBRID"),
    "utf8",
  );
  let result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  writeFileSync(
    casePath,
    readyCase().replace("- Automation: AI_BROWSER", "- Automation: MANUAL"),
    "utf8",
  );
  result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires Automation AI_BROWSER or HYBRID/);

  writeFileSync(
    casePath,
    readyCase().replace(
      /\n### Runner Instructions\n\n- Use \/browser to open the prepared checkout UI\.\n- Complete the payment through visible controls; stop before retrying an uncertain submission\.\n/,
      "",
    ),
    "utf8",
  );
  result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires Runner Instructions/);
});

test("keeps profiled non-ready prompts isolated and identifies the requested profile in JSON", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), draftCase(), "utf8");
  const result = spawnSync(
    process.execPath,
    [
      managerScript,
      "prompt",
      "CHECKOUT-C001",
      "--root",
      root,
      "--profile",
      "goal-based-ui",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.profile, "goal-based-ui");
  assert.match(parsed.prompt, /^此测试尚未准备好/);
  assert.doesNotMatch(
    parsed.prompt,
    /CHECKOUT-C001|Incomplete draft|goal-based UI tester|Outcome oracle/,
  );
});

test("uses a project-owned Runner Prompt template in core, CLI, and Studio", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  writeFileSync(
    join(root, "RUNNER_PROMPT.md"),
    "{{Runner Instructions | unbullet}}\n\nTASK {{Case ID}}: {{Objective | compact}}\nEXPECT: {{Expected Outcome | first}}\n",
    "utf8",
  );
  const report = inspectRoot(root);
  assert.equal(report.valid, true, report.errors.join("\n"));
  const testCase = report.suites[0].cases[0];
  const template = loadRunnerPromptTemplate(root);
  const prompt = buildRunnerPrompt(testCase, template);
  assert.match(prompt, /^Use \/browser/);
  assert.match(prompt, /TASK CHECKOUT-C001: Prove that an authorized payment/);
  assert.match(prompt, /EXPECT: The order persists/);
  assert.equal(statePayload(root).suites[0].cases[0].runnerPrompt, prompt);

  const cli = spawnSync(
    process.execPath,
    [managerScript, "prompt", testCase.id, "--root", root],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.trim(), prompt);
});

test("rejects unknown project-owned Runner Prompt placeholders", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  writeFileSync(
    join(root, "RUNNER_PROMPT.md"),
    "TASK {{Case ID}}: {{Project-Specific Secret}}\n",
    "utf8",
  );

  const report = inspectRoot(root);
  assert.equal(report.valid, false);
  assert.match(
    report.errors.join("\n"),
    /RUNNER_PROMPT\.md uses unknown placeholder: Project-Specific Secret/,
  );
});

test("keeps Runner Instructions optional for READY cases", () => {
  const { root, suite } = fixture();
  const withoutInstructions = readyCase().replace(
    /\n### Runner Instructions\n\n- Use \/browser to open the prepared checkout UI\.\n- Complete the payment through visible controls; stop before retrying an uncertain submission\.\n/,
    "",
  );
  writeFileSync(join(suite, "CASES.md"), withoutInstructions, "utf8");

  const report = inspectRoot(root);
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(report.suites[0].cases[0].sections["Runner Instructions"], "");
  assert.match(
    buildRunnerPrompt(
      report.suites[0].cases[0],
      loadRunnerPromptTemplate(root),
    ),
    /^Case: CHECKOUT-C001/,
  );
});

test("keeps non-ready Runner Prompts free of internal Case identity", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), draftCase(), "utf8");
  const testCase = inspectRoot(root).suites[0].cases[0];
  const prompt = buildRunnerPrompt(testCase, loadRunnerPromptTemplate(root));

  assert.match(prompt, /^此测试尚未准备好/);
  assert.doesNotMatch(prompt, /CHECKOUT-C001|Incomplete draft|Case State/);
  assert.match(prompt, /Result: INVALID/);
});

test("rejects promotion of an incomplete draft and restores exact state", () => {
  const { root, suite } = fixture();
  const before = draftCase();
  writeFileSync(join(suite, "CASES.md"), before, "utf8");
  assert.equal(inspectRoot(root).valid, true);

  assert.throws(
    () =>
      updateCase(root, {
        suite: "checkout",
        caseId: "CHECKOUT-C001",
        state: "READY",
        plannedStart: "",
        plannedEnd: "",
      }),
    /update rejected by validation/,
  );
  assert.equal(readFileSync(join(suite, "CASES.md"), "utf8"), before);
});

test("rejects PASS without evidence and leaves the run ledger unchanged", () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  const before = readFileSync(join(suite, "RUNS.md"), "utf8");

  assert.throws(
    () =>
      appendRun(root, {
        suite: "checkout",
        caseId: "CHECKOUT-C001",
        environment: "test",
        build: "abc123",
        data: "PAY-D01",
        result: "PASS",
        evidence: "",
        issue: "",
        executor: "QA",
      }),
    /PASS requires evidence/,
  );
  assert.equal(readFileSync(join(suite, "RUNS.md"), "utf8"), before);
});

test("Timeline uses Project Manager-style UTC weekly scale and readable width", () => {
  const range = timelineRange([
    { plannedStart: "2026-12-30", plannedEnd: "2027-01-02" },
    { plannedStart: "2027-03-08", plannedEnd: "2027-03-10" },
  ]);
  assert.deepEqual(range, { start: "2026-12-27", end: "2027-03-13" });
  assert.equal(rangeDays(range), 77);
  assert.equal(dayDiff("2027-03-07", "2027-03-09"), 2);
  assert.ok(timelineScaleTicks(range).some((date) => date.startsWith("2027-")));
  assert.equal(timelineContentWidth(range), 1020);
  assert.equal(
    timelineContentWidth({ start: "2026-01-01", end: "2026-04-30" }),
    1584,
  );
  assert.deepEqual(barGeometry("2026-12-30", "2027-01-02", range), {
    left: (3 / 77) * 100,
    width: (4 / 77) * 100,
  });
  assert.equal(datePercent("2026-12-27", range), (0.5 / 77) * 100);
  assert.equal(rangeContains("2027-01-01", range), true);
  assert.equal(rangeContains("2027-03-14", range), false);
  assert.deepEqual(
    timelineRange([
      { plannedStart: "2027-01-01", plannedEnd: "2027-01-02" },
      { plannedStart: "2026-12-20", plannedEnd: "2027-03-20" },
    ]),
    { start: "2026-12-17", end: "2027-03-23" },
  );

  const suiteOnly = timelineLayout(
    [{ id: "ALPHA-C001", suiteTitle: "Alpha", plannedStart: null, plannedEnd: null }],
    [
      {
        slug: "alpha",
        title: "Alpha",
        plannedStart: "2027-01-05",
        plannedEnd: "2027-01-12",
      },
      {
        slug: "beta",
        title: "Beta",
        plannedStart: "2027-01-08",
        plannedEnd: "2027-01-19",
      },
    ],
  );
  assert.deepEqual(suiteOnly.range, {
    start: "2027-01-02",
    end: "2027-01-22",
  });
  assert.deepEqual(suiteOnly.bounds, {
    start: "2027-01-05",
    end: "2027-01-19",
  });
  assert.equal(suiteOnly.scheduled.length, 0);
  assert.equal(suiteOnly.unscheduled.length, 1);
  assert.equal(suiteOnly.ordered.length, 1);
  assert.deepEqual(
    timelineMarkers([
      {
        slug: "alpha",
        title: "Alpha",
        plannedStart: "2027-01-05",
        plannedEnd: "2027-01-12",
      },
    ]),
    [
      { date: "2027-01-05", kind: "start", label: "Alpha start", suite: "alpha" },
      { date: "2027-01-12", kind: "target", label: "Alpha target", suite: "alpha" },
    ],
  );
});

test("serves token-protected Studio state and static Kanban UI", async () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  setSuitePlan(suite, "2026-08-25", "2026-09-12");
  const studio = startStudio({ root, port: 0, open: false });
  const { url, token, port } = await studio.ready;

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/state`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(authorized.status, 200);
    const payload = await authorized.json();
    assert.equal(payload.suites[0].cases[0].id, "CHECKOUT-C001");
    assert.equal(payload.suites[0].plannedStart, "2026-08-25");
    assert.equal(payload.suites[0].plannedEnd, "2026-09-12");

    const page = await fetch(url);
    assert.equal(page.status, 200);
    const pageText = await page.text();
    assert.match(pageText, /Test Manager Studio/);
    assert.doesNotMatch(pageText, /\p{Script=Han}/u);

    const script = await fetch(`http://127.0.0.1:${port}/studio.js`);
    assert.equal(script.status, 200);
    assert.doesNotMatch(await script.text(), /\p{Script=Han}/u);
  } finally {
    studio.server.close();
    await once(studio.server, "close");
  }
});
