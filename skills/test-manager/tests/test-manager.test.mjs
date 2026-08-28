// Responsibility: verify managed-root invariants, launcher behavior, Studio APIs, and run history.
// Test isolation: every fixture uses a disposable temporary workspace removed after the suite.
// Recent change: cover generated and explicit home-relative Studio skill paths.

import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import {
  createSuite,
  initialize,
  inspectRoot,
  portableSkillPath,
} from "../scripts/test-manager.mjs";
import {
  appendRun,
  startStudio,
  updateCase,
} from "../scripts/test-manager-studio.mjs";

const tempRoots = [];

function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), "test-manager-test-"));
  tempRoots.push(workspace);
  const root = join(workspace, ".tests");
  initialize(root, "Fixture Testing");
  createSuite(root, "checkout", "Checkout");
  return { workspace, root, suite: join(root, "checkout") };
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
  assert.match(
    readFileSync(join(root, "SUITES.md"), "utf8"),
    /\| checkout \| Checkout \|/,
  );
  assert.equal(existsSync(join(root, "studio.sh")), true);
  assert.equal(existsSync(join(root, "studio.cmd")), true);
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

test("serves token-protected Studio state and static Kanban UI", async () => {
  const { root, suite } = fixture();
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
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
