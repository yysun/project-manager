// Responsibility: prove the generated Test Manager demo is valid and covers
// the Studio states its Kanban, Timeline, filters, and Runs views advertise.

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectRoot } from "../../skills/test-manager/scripts/test-manager.mjs";
import { statePayload } from "../../skills/test-manager/scripts/test-manager-studio.mjs";
import { createTestManagerDemo } from "./create-browser-fixture.mjs";

test("generates a valid multi-Suite Test Manager Studio demo", () => {
  const temporary = mkdtempSync(join(tmpdir(), "tm-demo-test-"));
  try {
    const fixture = createTestManagerDemo({ out: join(temporary, "demo") });
    const report = inspectRoot(fixture.root);
    assert.equal(report.valid, true, report.errors.join("\n"));
    assert.deepEqual(report.counts, {
      suites: 3,
      cases: 7,
      ready: 5,
      draft: 1,
      retired: 1,
      pass: 2,
      fail: 1,
      blocked: 1,
      skipped: 0,
      invalid: 0,
      notRun: 2,
    });
    const state = statePayload(fixture.root);
    assert.equal(state.gateIndicator, "BLOCKED");
    assert.equal(state.suites.length, 3);
    assert.equal(state.suites.flatMap((suite) => suite.runs).length, 5);
    const regression = state.suites.find((suite) => suite.slug === "regression");
    assert.equal(regression.plannedStart, "2026-08-27");
    assert.equal(regression.plannedEnd, "2026-09-15");
    assert.equal(
      regression.cases.find((item) => item.id === "REGRESSION-C001")
        .plannedStart,
      null,
    );
    assert.equal(createTestManagerDemo({ out: fixture.workspace }).counts.cases, 7);

    const unrelated = join(temporary, "unrelated");
    mkdirSync(unrelated);
    writeFileSync(join(unrelated, "keep.txt"), "preserve me\n", "utf8");
    assert.throws(
      () => createTestManagerDemo({ out: unrelated }),
      /not a generated Test Manager demo/,
    );
    assert.equal(existsSync(join(unrelated, "keep.txt")), true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
