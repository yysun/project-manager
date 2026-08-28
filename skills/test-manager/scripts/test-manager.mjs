#!/usr/bin/env node
// Responsibility: manage folder-native test roots, suites, validation, and derived status.
// Invariants: preserve authoritative state, append-only runs, atomic writes, and safe local helpers.
// Recent change: serialize in-home Studio skill paths with a narrowly scoped ~/ prefix.

import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = dirname(scriptDir);
const assetsDir = join(skillDir, "assets");

const ROOT_FILES = ["TESTING.md", "SUITES.md", "STATUS.md"];
const ROOT_HELPER_FILES = new Set(["studio.sh", "studio.cmd"]);
const SUITE_FILES = ["SUITE.md", "CASES.md", "RUNS.md"];
const SUITE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CASE_ID = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-C\d{3}$/;
const CASE_STATES = new Set(["DRAFT", "READY", "RETIRED"]);
const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const SUITE_RISKS = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const SUITE_STATES = new Set([
  "PLANNED",
  "ACTIVE",
  "BLOCKED",
  "COMPLETE",
  "RETIRED",
]);
const RESULTS = new Set(["PASS", "FAIL", "BLOCKED", "SKIPPED", "INVALID"]);
const REQUIRED_READY_SECTIONS = [
  "Objective",
  "Preconditions",
  "Test Data",
  "Expected Outcome",
  "Negative Assertions",
  "Evidence Required",
];

function portableSkillPath(target, home = homedir()) {
  if (!isAbsolute(target) || !isAbsolute(home)) return target;
  const fromHome = relative(home, target);
  if (fromHome === "") return "~/";
  if (
    fromHome === ".." ||
    fromHome.startsWith(`..${sep}`) ||
    isAbsolute(fromHome)
  ) {
    return target;
  }
  return `~/${fromHome.split(sep).join("/")}`;
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    root: resolve(process.cwd(), ".tests"),
    json: false,
    write: false,
  };
  const positionals = [];

  while (args.length) {
    const arg = args.shift();
    if (arg === "--root") {
      const value = args.shift();
      if (!value) fail("--root requires a path");
      options.root = resolve(value);
    } else if (arg === "--title") {
      const value = args.shift();
      if (!value) fail("--title requires text");
      options.title = value;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      fail(`unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  return { command, options, positionals };
}

function usage() {
  return [
    "Usage:",
    "  test-manager.mjs init [--root <tests-root>] [--title <title>]",
    "  test-manager.mjs create-suite <suite-slug> [--root <tests-root>] [--title <title>]",
    "  test-manager.mjs validate [--root <tests-root>] [--json]",
    "  test-manager.mjs status [--root <tests-root>] [--json] [--write]",
  ].join("\n");
}

function assertRegular(path, label, errors) {
  if (!existsSync(path)) {
    errors.push(`${label} is missing: ${path}`);
    return false;
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    errors.push(`${label} must be a regular non-symlink file: ${path}`);
    return false;
  }
  return true;
}

function assertDirectory(path, label, errors) {
  if (!existsSync(path)) {
    errors.push(`${label} is missing: ${path}`);
    return false;
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    errors.push(`${label} must be a real directory, not a symlink: ${path}`);
    return false;
  }
  return true;
}

function readAsset(name) {
  return readFileSync(join(assetsDir, name), "utf8");
}

function renderAsset(name, values) {
  let content = readAsset(name);
  for (const [key, value] of Object.entries(values)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }
  return content;
}

function atomicWrite(path, content) {
  const temp = join(
    dirname(path),
    `.${basename(path)}.test-manager-${process.pid}-${randomBytes(6).toString("hex")}`,
  );
  try {
    writeFileSync(temp, content, { encoding: "utf8", flag: "wx" });
    renameSync(temp, path);
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    throw error;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function suiteId(slug) {
  return slug.toUpperCase();
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    data[field[1]] = field[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return data;
}

function withoutFencedCode(content) {
  return content.replace(/```[\s\S]*?```/g, "");
}

function sectionBody(block, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(
    new RegExp(`^### ${escaped}\\s*$([\\s\\S]*?)(?=^### |$(?![\\s\\S]))`, "m"),
  );
  return match ? match[1].trim() : "";
}

function meaningful(value) {
  const normalized = String(value ?? "").trim();
  return (
    normalized !== "" &&
    normalized !== "—" &&
    !/\bUNDEFINED\b/i.test(normalized)
  );
}

function parseCases(path, slug, errors, warnings) {
  const content = withoutFencedCode(readFileSync(path, "utf8"));
  const heading = /^## ([A-Z0-9]+(?:-[A-Z0-9]+)*-C\d{3}) — (.+)$/gm;
  const matches = [...content.matchAll(heading)];
  const cases = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const end =
      index + 1 < matches.length ? matches[index + 1].index : content.length;
    const block = content.slice(match.index, end);
    const id = match[1];
    const title = match[2].trim();
    const labels = {};
    for (const label of block.matchAll(/^- ([A-Za-z][A-Za-z /]+):\s*(.+)$/gm)) {
      labels[label[1].trim()] = label[2].trim();
    }

    if (!CASE_ID.test(id)) errors.push(`${id}: invalid Case ID format`);
    if (!id.startsWith(`${suiteId(slug)}-C`)) {
      errors.push(`${id}: Case ID must use suite prefix ${suiteId(slug)}-C`);
    }
    if (!meaningful(title)) errors.push(`${id}: title is missing`);

    const state = labels.State;
    const priority = labels.Priority;
    if (!CASE_STATES.has(state)) errors.push(`${id}: invalid or missing State`);
    if (!PRIORITIES.has(priority))
      errors.push(`${id}: invalid or missing Priority`);
    for (const required of [
      "Type",
      "Requirement / Risk",
      "Automation",
      "Owner",
    ]) {
      if (!labels[required]) errors.push(`${id}: missing label ${required}`);
    }

    const sections = Object.fromEntries(
      REQUIRED_READY_SECTIONS.map((name) => [name, sectionBody(block, name)]),
    );
    if (state === "READY") {
      if (!meaningful(labels["Requirement / Risk"])) {
        errors.push(`${id}: READY case needs a Requirement / Risk`);
      }
      for (const [name, body] of Object.entries(sections)) {
        if (!meaningful(body)) errors.push(`${id}: READY case needs ${name}`);
      }
    } else if (state === "DRAFT") {
      const missing = Object.values(sections).filter(
        (body) => !meaningful(body),
      ).length;
      if (missing)
        warnings.push(
          `${id}: DRAFT case has ${missing} incomplete required sections`,
        );
    }

    cases.push({ id, title, state, priority, labels, sections });
  }

  return cases;
}

function parseRuns(path, errors) {
  const lines = readFileSync(path, "utf8").split("\n");
  const rows = [];
  let tableSeen = false;

  for (const line of lines) {
    if (line.startsWith("| Run ID | Case ID |")) {
      tableSeen = true;
      continue;
    }
    if (!tableSeen || !line.startsWith("|")) continue;
    const columns = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!columns.length || columns.every((cell) => /^-+:?$/.test(cell)))
      continue;
    if (columns.length !== 10) {
      errors.push(`${path}: run row must have 10 columns`);
      continue;
    }
    const [
      runId,
      caseId,
      environment,
      build,
      data,
      result,
      evidence,
      issue,
      executedAt,
      executor,
    ] = columns;
    rows.push({
      runId,
      caseId,
      environment,
      build,
      data,
      result,
      evidence,
      issue,
      executedAt,
      executor,
    });
  }

  if (!tableSeen) errors.push(`${path}: missing canonical run table`);
  return rows;
}

function parseStepCaseIds(path) {
  if (!existsSync(path)) return [];
  const content = withoutFencedCode(readFileSync(path, "utf8"));
  return [
    ...content.matchAll(/^## ([A-Z0-9]+(?:-[A-Z0-9]+)*-C\d{3})\s*$/gm),
  ].map((match) => match[1]);
}

function inspectRoot(root) {
  const errors = [];
  const warnings = [];
  const suites = [];
  const allCases = new Map();
  const allRuns = new Map();

  if (!assertDirectory(root, "test root", errors)) {
    return {
      valid: false,
      root,
      errors,
      warnings,
      suites,
      counts: emptyCounts(),
    };
  }

  for (const file of ROOT_FILES) assertRegular(join(root, file), file, errors);
  if (errors.length)
    return {
      valid: false,
      root,
      errors,
      warnings,
      suites,
      counts: emptyCounts(),
    };

  const rootMeta = parseFrontmatter(
    readFileSync(join(root, "TESTING.md"), "utf8"),
  );
  if (!rootMeta || rootMeta.schema !== "test-manager/root/v1") {
    errors.push("TESTING.md must use schema test-manager/root/v1");
  }

  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (
      entry.isFile() &&
      !ROOT_FILES.includes(entry.name) &&
      !ROOT_HELPER_FILES.has(entry.name)
    ) {
      warnings.push(`unrecognized root file: ${entry.name}`);
      continue;
    }
    if (!entry.isDirectory()) continue;

    const slug = entry.name;
    const suitePath = join(root, slug);
    if (!SUITE_SLUG.test(slug))
      errors.push(`invalid suite directory name: ${slug}`);
    if (lstatSync(suitePath).isSymbolicLink()) {
      errors.push(`suite must not be a symlink: ${suitePath}`);
      continue;
    }
    for (const file of SUITE_FILES)
      assertRegular(join(suitePath, file), `${slug}/${file}`, errors);
    if (errors.some((item) => item.includes(`${slug}/`))) continue;

    const meta = parseFrontmatter(
      readFileSync(join(suitePath, "SUITE.md"), "utf8"),
    );
    if (!meta || meta.schema !== "test-manager/suite/v1") {
      errors.push(`${slug}/SUITE.md must use schema test-manager/suite/v1`);
      continue;
    }
    if (meta.suite !== slug)
      errors.push(`${slug}/SUITE.md suite must equal ${slug}`);
    if (!SUITE_RISKS.has(meta.risk))
      errors.push(`${slug}: invalid risk ${meta.risk ?? "missing"}`);
    if (!SUITE_STATES.has(meta.state))
      errors.push(`${slug}: invalid state ${meta.state ?? "missing"}`);
    if (!meaningful(meta.title)) errors.push(`${slug}: missing suite title`);
    if (!meta.owner) errors.push(`${slug}: missing owner`);

    const cases = parseCases(
      join(suitePath, "CASES.md"),
      slug,
      errors,
      warnings,
    );
    for (const testCase of cases) {
      if (allCases.has(testCase.id))
        errors.push(`duplicate Case ID: ${testCase.id}`);
      allCases.set(testCase.id, { ...testCase, suite: slug });
    }
    const runs = parseRuns(join(suitePath, "RUNS.md"), errors);
    suites.push({ slug, path: suitePath, meta, cases, runs });
  }

  for (const suite of suites) {
    for (const run of suite.runs) {
      if (!run.runId || run.runId === "—")
        errors.push(`${suite.slug}: run is missing Run ID`);
      if (allRuns.has(run.runId)) errors.push(`duplicate Run ID: ${run.runId}`);
      allRuns.set(run.runId, run);
      if (!allCases.has(run.caseId))
        errors.push(`${run.runId}: unknown Case ID ${run.caseId}`);
      if (!RESULTS.has(run.result))
        errors.push(`${run.runId}: invalid Result ${run.result}`);
      if (!meaningful(run.environment))
        errors.push(`${run.runId}: Environment is required`);
      if (!meaningful(run.build))
        errors.push(`${run.runId}: Build is required`);
      if (!meaningful(run.data)) errors.push(`${run.runId}: Data is required`);
      if (!meaningful(run.executor))
        errors.push(`${run.runId}: Executor is required`);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(run.executedAt)
      ) {
        errors.push(`${run.runId}: Executed At must be RFC 3339 UTC`);
      }
      if (
        (run.result === "PASS" || run.result === "FAIL") &&
        !meaningful(run.evidence)
      ) {
        errors.push(`${run.runId}: ${run.result} requires Evidence`);
      }
      if (
        ["FAIL", "BLOCKED", "SKIPPED", "INVALID"].includes(run.result) &&
        !meaningful(run.issue)
      ) {
        errors.push(
          `${run.runId}: ${run.result} requires Defect / Blocker / reason`,
        );
      }
    }

    for (const id of parseStepCaseIds(join(suite.path, "STEPS.md"))) {
      if (!allCases.has(id))
        errors.push(`${suite.slug}/STEPS.md references unknown Case ID ${id}`);
      if (!id.startsWith(`${suiteId(suite.slug)}-C`)) {
        errors.push(`${suite.slug}/STEPS.md references another suite: ${id}`);
      }
    }
  }

  const counts = calculateCounts(suites);
  return { valid: errors.length === 0, root, errors, warnings, suites, counts };
}

function emptyCounts() {
  return {
    suites: 0,
    cases: 0,
    ready: 0,
    draft: 0,
    retired: 0,
    pass: 0,
    fail: 0,
    blocked: 0,
    skipped: 0,
    invalid: 0,
    notRun: 0,
  };
}

function currentRuns(suites) {
  const current = new Map();
  for (const suite of suites) {
    for (const run of suite.runs) current.set(run.caseId, run);
  }
  return current;
}

function calculateCounts(suites) {
  const counts = emptyCounts();
  counts.suites = suites.length;
  const current = currentRuns(suites);
  for (const suite of suites) {
    for (const testCase of suite.cases) {
      counts.cases += 1;
      if (testCase.state === "READY") counts.ready += 1;
      if (testCase.state === "DRAFT") counts.draft += 1;
      if (testCase.state === "RETIRED") counts.retired += 1;
      if (testCase.state === "RETIRED") continue;
      const run = current.get(testCase.id);
      if (!run) counts.notRun += 1;
      else counts[run.result.toLowerCase()] += 1;
    }
  }
  return counts;
}

function suiteCurrentResult(suite) {
  const current = new Map();
  for (const run of suite.runs) current.set(run.caseId, run.result);
  const activeCases = suite.cases.filter(
    (testCase) => testCase.state !== "RETIRED",
  );
  const results = activeCases.map(
    (testCase) => current.get(testCase.id) ?? "NOT_RUN",
  );
  if (!activeCases.length || results.every((result) => result === "NOT_RUN"))
    return "NOT_RUN";
  if (results.includes("FAIL")) return "FAIL";
  if (results.includes("BLOCKED")) return "BLOCKED";
  if (results.every((result) => result === "PASS")) return "PASS";
  return "PARTIAL";
}

function gateIndicator(report) {
  const current = currentRuns(report.suites);
  for (const suite of report.suites) {
    for (const testCase of suite.cases) {
      if (testCase.state === "RETIRED" || testCase.priority !== "P0") continue;
      const result = current.get(testCase.id)?.result;
      if (result === "FAIL") return "FAIL";
      if (result === "BLOCKED") return "BLOCKED";
      if (result !== "PASS") return "NOT_READY";
    }
  }
  if (!report.counts.cases || report.counts.draft || report.counts.notRun)
    return "UNKNOWN";
  if (report.counts.fail || report.counts.blocked) return "REVIEW";
  return "PASS";
}

function registryMarkdown(report) {
  const rows = report.suites
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(
      (suite) =>
        `| ${suite.slug} | ${suite.meta.title} | ${suite.meta.risk} | ${suite.meta.state} | ${suite.meta.owner} | ${suite.cases.length} | ${suiteCurrentResult(suite)} |`,
    );
  return [
    "# Test Suites",
    "",
    "This registry is derived from suite state. Regenerate it with `test-manager.mjs status --write`.",
    "",
    "<!-- TEST-MANAGER:SUITES:START -->",
    "",
    "| Suite | Title | Risk | State | Owner | Cases | Current result |",
    "| ----- | ----- | ---- | ----- | ----- | ----: | -------------- |",
    ...rows,
    "",
    "<!-- TEST-MANAGER:SUITES:END -->",
    "",
  ].join("\n");
}

function statusMarkdown(report) {
  const c = report.counts;
  return [
    "# Test Status",
    "",
    "This file is derived. Regenerate it with `test-manager.mjs status --write`.",
    "",
    "<!-- TEST-MANAGER:STATUS:START -->",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Suites: ${c.suites}`,
    `- Cases: ${c.cases} total / ${c.ready} ready / ${c.draft} draft / ${c.retired} retired`,
    `- Current results: ${c.pass} pass / ${c.fail} fail / ${c.blocked} blocked / ${c.skipped} skipped / ${c.invalid} invalid / ${c.notRun} not run`,
    `- Quality gate indicator: ${gateIndicator(report)}`,
    "",
    "The gate indicator is calculated evidence, not release approval. Review TESTING.md exit criteria and residual risk before deciding.",
    "",
    "<!-- TEST-MANAGER:STATUS:END -->",
    "",
  ].join("\n");
}

function serializable(report) {
  return {
    valid: report.valid,
    root: report.root,
    errors: report.errors,
    warnings: report.warnings,
    counts: report.counts,
    gateIndicator: report.valid ? gateIndicator(report) : "INVALID_STATE",
    suites: report.suites.map((suite) => ({
      slug: suite.slug,
      title: suite.meta.title,
      risk: suite.meta.risk,
      state: suite.meta.state,
      owner: suite.meta.owner,
      cases: suite.cases.length,
      runs: suite.runs.length,
      currentResult: suiteCurrentResult(suite),
    })),
  };
}

function initialize(root, title) {
  if (existsSync(root)) {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      fail(`test root is not a real directory: ${root}`);
    const entries = readdirSync(root);
    if (entries.length) {
      const report = inspectRoot(root);
      if (!report.valid)
        fail(`refusing to overwrite non-empty invalid test root: ${root}`);
      return {
        created: false,
        root,
        message: "valid test root already exists",
      };
    }
  }

  const parent = dirname(root);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory()) {
    fail(`parent directory does not exist: ${parent}`);
  }
  const candidate = join(
    parent,
    `.test-manager-init-${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  mkdirSync(candidate, { recursive: false });
  try {
    const values = {
      TITLE: title ?? `${basename(dirname(root))} Testing`,
      DATE: today(),
    };
    writeFileSync(
      join(candidate, "TESTING.md"),
      renderAsset("root-testing.md", values),
      "utf8",
    );
    copyFileSync(
      join(assetsDir, "root-suites.md"),
      join(candidate, "SUITES.md"),
    );
    writeFileSync(
      join(candidate, "STATUS.md"),
      renderAsset("root-status.md", { GENERATED_AT: new Date().toISOString() }),
      "utf8",
    );
    writeFileSync(
      join(candidate, ".env.local"),
      `TEST_MANAGER_SKILL_PATH=${portableSkillPath(skillDir)}\n`,
      "utf8",
    );
    writeFileSync(join(candidate, ".gitignore"), "/.env.local\n", "utf8");
    copyFileSync(join(assetsDir, "studio.sh"), join(candidate, "studio.sh"));
    chmodSync(join(candidate, "studio.sh"), 0o755);
    copyFileSync(join(assetsDir, "studio.cmd"), join(candidate, "studio.cmd"));
    if (existsSync(root)) {
      if (readdirSync(root).length)
        fail(`test root became non-empty during initialization: ${root}`);
      rmSync(root, { recursive: false });
    }
    renameSync(candidate, root);
  } catch (error) {
    if (existsSync(candidate))
      rmSync(candidate, { recursive: true, force: true });
    throw error;
  }
  return { created: true, root, message: "test root initialized" };
}

function createSuite(root, slug, title) {
  if (!SUITE_SLUG.test(slug)) fail(`invalid suite slug: ${slug}`);
  const report = inspectRoot(root);
  if (!report.valid)
    fail(`test root is invalid; run validate before creating a suite`);
  const target = join(root, slug);
  if (existsSync(target)) fail(`suite already exists: ${target}`);
  const candidate = join(
    root,
    `.test-manager-suite-${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  const values = {
    SUITE: slug,
    SUITE_ID: suiteId(slug),
    TITLE: title ?? titleFromSlug(slug),
  };
  mkdirSync(candidate, { recursive: false });
  try {
    writeFileSync(
      join(candidate, "SUITE.md"),
      renderAsset("suite.md", values),
      "utf8",
    );
    writeFileSync(
      join(candidate, "CASES.md"),
      renderAsset("cases.md", values),
      "utf8",
    );
    writeFileSync(
      join(candidate, "RUNS.md"),
      renderAsset("runs.md", values),
      "utf8",
    );
    renameSync(candidate, target);
  } catch (error) {
    if (existsSync(candidate))
      rmSync(candidate, { recursive: true, force: true });
    throw error;
  }
  const updated = inspectRoot(root);
  if (!updated.valid)
    fail(`created suite failed validation: ${updated.errors.join("; ")}`);
  atomicWrite(join(root, "SUITES.md"), registryMarkdown(updated));
  atomicWrite(join(root, "STATUS.md"), statusMarkdown(updated));
  return { root, suite: slug, path: target, message: "suite created" };
}

function printValidation(report, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(serializable(report), null, 2)}\n`);
    return;
  }
  console.log(report.valid ? "VALID" : "INVALID");
  console.log(`Root: ${report.root}`);
  console.log(`Suites: ${report.counts.suites}; Cases: ${report.counts.cases}`);
  for (const warning of report.warnings) console.log(`Warning: ${warning}`);
  for (const error of report.errors) console.log(`Error: ${error}`);
}

function printStatus(report, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(serializable(report), null, 2)}\n`);
    return;
  }
  const c = report.counts;
  console.log(`Test root: ${report.root}`);
  console.log(`Suites: ${c.suites}`);
  console.log(
    `Cases: ${c.cases} total; ${c.ready} ready; ${c.draft} draft; ${c.retired} retired`,
  );
  console.log(
    `Current: ${c.pass} pass; ${c.fail} fail; ${c.blocked} blocked; ${c.skipped} skipped; ${c.invalid} invalid; ${c.notRun} not run`,
  );
  console.log(`Quality gate indicator: ${gateIndicator(report)}`);
}

function main() {
  const { command, options, positionals } = parseArgs(process.argv.slice(2));
  if (options.help || !command) {
    console.log(usage());
    return;
  }

  if (command === "init") {
    if (positionals.length) fail("init accepts no positional arguments");
    const result = initialize(options.root, options.title);
    console.log(`${result.message}: ${result.root}`);
    return;
  }

  if (command === "create-suite") {
    if (positionals.length !== 1)
      fail("create-suite requires exactly one suite slug");
    const result = createSuite(options.root, positionals[0], options.title);
    console.log(`${result.message}: ${result.path}`);
    return;
  }

  if (command === "validate") {
    if (positionals.length) fail("validate accepts no positional arguments");
    const report = inspectRoot(options.root);
    printValidation(report, options.json);
    if (!report.valid) process.exitCode = 1;
    return;
  }

  if (command === "status") {
    if (positionals.length) fail("status accepts no positional arguments");
    const report = inspectRoot(options.root);
    if (!report.valid) {
      printValidation(report, options.json);
      process.exitCode = 1;
      return;
    }
    if (options.write) {
      atomicWrite(join(options.root, "SUITES.md"), registryMarkdown(report));
      atomicWrite(join(options.root, "STATUS.md"), statusMarkdown(report));
    }
    printStatus(report, options.json);
    return;
  }

  fail(`unknown command: ${command}`);
}

if (basename(process.argv[1] ?? "") === "test-manager.mjs") {
  try {
    main();
  } catch (error) {
    console.error(`test-manager: ${error.message}`);
    process.exitCode = 1;
  }
}

export {
  RESULTS,
  atomicWrite,
  createSuite,
  gateIndicator,
  initialize,
  inspectRoot,
  meaningful,
  portableSkillPath,
  registryMarkdown,
  statusMarkdown,
};
