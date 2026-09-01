// Responsibility: prove the bundled Test Manager skill works when copied and installed alone.
// Security: verify the actual loopback socket and that unauthorized writes cannot alter Run history.
// Recent change: verify the installed skill renders the opt-in goal-based UI prompt profile.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const sourceSkill = join(repositoryRoot, "skills/test-manager");
const temporary = mkdtempSync(join(tmpdir(), "project-manager-test-skill-"));
let studio;

function runNode(script, args, cwd = temporary) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
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

- Use the visible checkout UI and stop before retrying an uncertain submission.

### Expected Outcome

- The order persists and reconciles from a second view.

### Negative Assertions

- No duplicate charge or orphan order exists.

### Evidence Required

- Before, after, order ID, payment ID, and reconciliation evidence.
`;
}

async function postRun(port, token, payload) {
  return fetch(`http://127.0.0.1:${port}/api/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

async function expectJson(response, expectedStatus) {
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
  return JSON.parse(body);
}

try {
  const installParent = join(temporary, "standalone");
  const copiedSkill = join(installParent, "test-manager");
  mkdirSync(installParent, { recursive: true });
  cpSync(sourceSkill, copiedSkill, { recursive: true });
  const installedSkill = realpathSync(copiedSkill);
  const cli = join(installedSkill, "scripts/test-manager.mjs");
  const testsRoot = join(temporary, "workspace/.tests");
  mkdirSync(dirname(testsRoot), { recursive: true });

  runNode(cli, ["init", "--root", testsRoot, "--title", "Standalone QA"]);
  runNode(cli, ["create-suite", "checkout", "--root", testsRoot, "--title", "Checkout"]);
  const initialValidation = JSON.parse(runNode(cli, ["validate", "--root", testsRoot, "--json"]));
  assert.equal(initialValidation.valid, true, initialValidation.errors?.join("\n"));
  assert.equal(
    readFileSync(join(testsRoot, ".env.local"), "utf8"),
    `TEST_MANAGER_SKILL_PATH=${installedSkill}\n`,
  );

  const launcher = spawnSync(join(testsRoot, "studio.sh"), ["--help"], {
    cwd: testsRoot,
    encoding: "utf8",
  });
  assert.equal(launcher.status, 0, launcher.stderr || launcher.stdout);
  assert.match(launcher.stdout, /Usage: test-manager-studio\.mjs/);

  const suite = join(testsRoot, "checkout");
  writeFileSync(join(suite, "CASES.md"), readyCase(), "utf8");
  const evidencePath = join(suite, "evidence/run-1/after.txt");
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, "Observed order and payment reconciliation.\n", "utf8");
  const validReady = JSON.parse(runNode(cli, ["validate", "--root", testsRoot, "--json"]));
  assert.equal(validReady.valid, true, validReady.errors?.join("\n"));
  const goalPrompt = JSON.parse(
    runNode(cli, [
      "prompt",
      "CHECKOUT-C001",
      "--root",
      testsRoot,
      "--profile",
      "goal-based-ui",
      "--json",
    ]),
  );
  assert.equal(goalPrompt.profile, "goal-based-ui");
  assert.match(goalPrompt.prompt, /^You are a fresh goal-based UI tester\./);
  assert.match(
    goalPrompt.prompt,
    /Task Outcome: COMPLETED \| PARTIAL \| BLOCKED \| FAILED/,
  );
  assert.match(goalPrompt.prompt, /Executor: name \| agent \| runtime identity/);
  assert.match(goalPrompt.prompt, /Do not calculate a composite score/);
  assert.equal(existsSync(join(testsRoot, "goal-based-ui-runner-prompt.md")), false);

  const studioModule = await import(pathToFileURL(join(installedSkill, "scripts/test-manager-studio.mjs")).href);
  studio = studioModule.startStudio({ root: testsRoot, port: 0, open: false });
  const { url, token, port } = await studio.ready;
  assert.equal(new URL(url).hostname, "127.0.0.1");
  const address = studio.server.address();
  assert.equal(typeof address, "object");
  assert.equal(address.address, "127.0.0.1");

  const unauthorizedState = await fetch(`http://127.0.0.1:${port}/api/state`);
  assert.equal(unauthorizedState.status, 401);
  await unauthorizedState.text();

  const runLedger = join(suite, "RUNS.md");
  const beforeUnauthorizedWrite = readFileSync(runLedger, "utf8");
  const firstPayload = {
    suite: "checkout",
    caseId: "CHECKOUT-C001",
    environment: "test",
    build: "abc123",
    data: "PAY-D01",
    result: "PASS",
    evidence: "evidence/run-1/after.txt",
    issue: "",
    executor: "QA",
    executedAt: "2026-08-28T16:00:00Z",
  };
  const unauthorizedRun = await postRun(port, "", firstPayload);
  assert.equal(unauthorizedRun.status, 401);
  await unauthorizedRun.text();
  assert.equal(readFileSync(runLedger, "utf8"), beforeUnauthorizedWrite);

  const authorizedState = await fetch(`http://127.0.0.1:${port}/api/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(authorizedState.status, 200);
  const state = await authorizedState.json();
  assert.equal(state.valid, true);
  assert.equal(state.root, testsRoot);
  assert.match(state.suites[0].cases[0].runnerInstructions, /visible checkout UI/);
  assert.match(
    state.suites[0].cases[0].runnerPrompt,
    /^Use the visible checkout UI[\s\S]*Case: CHECKOUT-C001/,
  );

  const firstResponse = await postRun(port, token, firstPayload);
  const firstRun = await expectJson(firstResponse, 200);
  const secondResponse = await postRun(port, token, {
    ...firstPayload,
    build: "abc124",
    executedAt: "2026-08-28T17:00:00Z",
  });
  const secondRun = await expectJson(secondResponse, 200);
  assert.notEqual(firstRun.runId, secondRun.runId);

  const ledger = readFileSync(runLedger, "utf8");
  assert.ok(ledger.indexOf(firstRun.runId) < ledger.indexOf(secondRun.runId));
  assert.equal(ledger.match(/evidence\/run-1\/after\.txt/g)?.length, 2);
  assert.equal(existsSync(evidencePath), true);
  const finalValidation = JSON.parse(runNode(cli, ["validate", "--root", testsRoot, "--json"]));
  assert.equal(finalValidation.valid, true, finalValidation.errors?.join("\n"));
  assert.equal(finalValidation.counts.pass, 1);
  assert.equal(finalValidation.suites[0].runs, 2);

  console.log("Test Manager standalone Studio/API smoke passed");
} finally {
  if (studio?.server.listening) {
    await new Promise((resolveClose, rejectClose) => {
      studio.server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
  }
  rmSync(temporary, { recursive: true, force: true });
}
