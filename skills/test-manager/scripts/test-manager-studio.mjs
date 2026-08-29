#!/usr/bin/env node
// Responsibility: serve Test Manager's local Kanban, Timeline, and immutable Run API.
// Security: bind only to loopback and require the generated bearer token for every API route.
// Recent change: ship as a self-contained sibling skill in the Project Manager plugin.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  RESULTS,
  atomicWrite,
  gateIndicator,
  inspectRoot,
  meaningful,
  registryMarkdown,
  statusMarkdown,
} from "./test-manager.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = dirname(scriptDir);
const uiDir = join(skillDir, "ui");
const CASE_STATES = new Set(["DRAFT", "READY", "RETIRED"]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    root: resolve(process.cwd(), ".tests"),
    port: 0,
    open: true,
  };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--root") {
      const value = args.shift();
      if (!value) fail("--root requires a path");
      options.root = resolve(value);
    } else if (arg === "--port") {
      const value = Number(args.shift());
      if (!Number.isInteger(value) || value < 0 || value > 65535)
        fail("--port must be 0-65535");
      options.port = value;
    } else if (arg === "--no-open") {
      options.open = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail(`unknown option: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: test-manager-studio.mjs [--root <tests-root>] [--port <port>] [--no-open]",
    "",
    "Defaults to <cwd>/.tests and binds only to 127.0.0.1.",
  ].join("\n");
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function asset(response, name, contentType) {
  const content = readFileSync(join(uiDir, name));
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(content);
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > 1_000_000) {
        reject(new Error("request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function safeCell(value, name, { optional = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text && !optional) fail(`${name} is required`);
  if (text.includes("|") || /[\r\n]/.test(text))
    fail(`${name} must not contain pipes or newlines`);
  if (text.length > 500) fail(`${name} is too long`);
  return text || "—";
}

function validDate(value, name, { optional = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text && optional) return "UNPLANNED";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(`${name} must be YYYY-MM-DD`);
  return text;
}

function caseBlockRange(content, caseId) {
  const escaped = caseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## ${escaped} — .+$`, "m");
  const match = heading.exec(content);
  if (!match) fail(`Case ID not found: ${caseId}`);
  const next = content
    .slice(match.index + match[0].length)
    .search(/^## [A-Z0-9-]+-C\d{3} — /m);
  const end = next < 0 ? content.length : match.index + match[0].length + next;
  return { start: match.index, end };
}

function setCaseLabel(block, label, value) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = new RegExp(`^- ${escaped}:.*$`, "m");
  if (line.test(block)) return block.replace(line, `- ${label}: ${value}`);
  const owner = /^- Owner:.*$/m;
  if (owner.test(block))
    return block.replace(owner, (match) => `${match}\n- ${label}: ${value}`);
  fail(`case block is missing Owner label; cannot add ${label}`);
}

function updateCase(root, payload) {
  const suite = safeCell(payload.suite, "suite");
  const caseId = safeCell(payload.caseId, "caseId");
  const state = safeCell(payload.state, "state");
  if (!CASE_STATES.has(state)) fail(`invalid case state: ${state}`);
  const plannedStart = validDate(payload.plannedStart, "plannedStart", {
    optional: true,
  });
  const plannedEnd = validDate(payload.plannedEnd, "plannedEnd", {
    optional: true,
  });
  if (
    plannedStart !== "UNPLANNED" &&
    plannedEnd !== "UNPLANNED" &&
    plannedEnd < plannedStart
  ) {
    fail("plannedEnd must not be before plannedStart");
  }

  const report = inspectRoot(root);
  if (!report.valid) fail(`test root is invalid: ${report.errors.join("; ")}`);
  const targetSuite = report.suites.find((item) => item.slug === suite);
  if (!targetSuite || !targetSuite.cases.some((item) => item.id === caseId)) {
    fail(`case does not belong to suite: ${suite}/${caseId}`);
  }

  const path = join(root, suite, "CASES.md");
  const previous = readFileSync(path, "utf8");
  const range = caseBlockRange(previous, caseId);
  let block = previous.slice(range.start, range.end);
  block = setCaseLabel(block, "State", state);
  block = setCaseLabel(block, "Planned Start", plannedStart);
  block = setCaseLabel(block, "Planned End", plannedEnd);
  const updated = `${previous.slice(0, range.start)}${block}${previous.slice(range.end)}`;

  atomicWrite(path, updated);
  const validation = inspectRoot(root);
  if (!validation.valid) {
    atomicWrite(path, previous);
    fail(`update rejected by validation: ${validation.errors.join("; ")}`);
  }
  atomicWrite(join(root, "SUITES.md"), registryMarkdown(validation));
  atomicWrite(join(root, "STATUS.md"), statusMarkdown(validation));
  return { ok: true, caseId, state, plannedStart, plannedEnd };
}

function appendRun(root, payload) {
  const suite = safeCell(payload.suite, "suite");
  const caseId = safeCell(payload.caseId, "caseId");
  const environment = safeCell(payload.environment, "environment");
  const build = safeCell(payload.build, "build");
  const data = safeCell(payload.data, "data");
  const result = safeCell(payload.result, "result");
  const evidence = safeCell(payload.evidence, "evidence", { optional: true });
  const issue = safeCell(payload.issue, "defect / blocker", { optional: true });
  const executor = safeCell(payload.executor, "executor");
  const executedAt = String(payload.executedAt || new Date().toISOString());
  if (!RESULTS.has(result)) fail(`invalid result: ${result}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(executedAt)) {
    fail("executedAt must be RFC 3339 UTC");
  }
  if ((result === "PASS" || result === "FAIL") && !meaningful(evidence)) {
    fail(`${result} requires evidence`);
  }
  if (
    ["FAIL", "BLOCKED", "SKIPPED", "INVALID"].includes(result) &&
    !meaningful(issue)
  ) {
    fail(`${result} requires a defect, blocker, waiver, or reason`);
  }

  const report = inspectRoot(root);
  if (!report.valid) fail(`test root is invalid: ${report.errors.join("; ")}`);
  const targetSuite = report.suites.find((item) => item.slug === suite);
  if (!targetSuite || !targetSuite.cases.some((item) => item.id === caseId)) {
    fail(`case does not belong to suite: ${suite}/${caseId}`);
  }
  const ordinal =
    targetSuite.runs.filter((run) => run.caseId === caseId).length + 1;
  const compactTime = executedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const runId = `${compactTime}-${caseId}-R${ordinal}`;
  const path = join(root, suite, "RUNS.md");
  const previous = readFileSync(path, "utf8");
  const row = `| ${runId} | ${caseId} | ${environment} | ${build} | ${data} | ${result} | ${evidence} | ${issue} | ${executedAt} | ${executor} |`;
  const updated = `${previous.trimEnd()}\n${row}\n`;

  atomicWrite(path, updated);
  const validation = inspectRoot(root);
  if (!validation.valid) {
    atomicWrite(path, previous);
    fail(`run rejected by validation: ${validation.errors.join("; ")}`);
  }
  atomicWrite(join(root, "SUITES.md"), registryMarkdown(validation));
  atomicWrite(join(root, "STATUS.md"), statusMarkdown(validation));
  return { ok: true, runId };
}

function statePayload(root) {
  const report = inspectRoot(root);
  if (!report.valid)
    return {
      valid: false,
      root,
      errors: report.errors,
      warnings: report.warnings,
    };
  const suites = report.suites.map((suite) => {
    const current = new Map();
    for (const run of suite.runs) current.set(run.caseId, run);
    return {
      slug: suite.slug,
      title: suite.meta.title,
      risk: suite.meta.risk,
      state: suite.meta.state,
      owner: suite.meta.owner,
      plannedStart: /^\d{4}-\d{2}-\d{2}$/.test(suite.meta.planned_start ?? "")
        ? suite.meta.planned_start
        : null,
      plannedEnd: /^\d{4}-\d{2}-\d{2}$/.test(suite.meta.planned_end ?? "")
        ? suite.meta.planned_end
        : null,
      cases: suite.cases.map((testCase) => ({
        id: testCase.id,
        title: testCase.title,
        state: testCase.state,
        priority: testCase.priority,
        type: testCase.labels.Type,
        automation: testCase.labels.Automation,
        owner: testCase.labels.Owner,
        requirementRisk: testCase.labels["Requirement / Risk"],
        plannedStart: /^\d{4}-\d{2}-\d{2}$/.test(
          testCase.labels["Planned Start"] ?? "",
        )
          ? testCase.labels["Planned Start"]
          : null,
        plannedEnd: /^\d{4}-\d{2}-\d{2}$/.test(
          testCase.labels["Planned End"] ?? "",
        )
          ? testCase.labels["Planned End"]
          : null,
        objective: testCase.sections.Objective,
        expectedOutcome: testCase.sections["Expected Outcome"],
        currentRun: current.get(testCase.id) ?? null,
      })),
      runs: [...suite.runs].reverse(),
    };
  });
  return {
    valid: true,
    root,
    generatedAt: new Date().toISOString(),
    counts: report.counts,
    gateIndicator: gateIndicator(report),
    warnings: report.warnings,
    suites,
  };
}

function authorized(request, url, token) {
  const header = request.headers.authorization;
  return (
    header === `Bearer ${token}` || url.searchParams.get("token") === token
  );
}

function openBrowser(url) {
  const commands =
    process.platform === "darwin"
      ? [["open", [url]]]
      : process.platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [["xdg-open", [url]]];
  const [command, args] = commands[0];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function startStudio({ root, port = 0, open = true }) {
  const initial = inspectRoot(root);
  if (!initial.valid) fail(`invalid test root: ${initial.errors.join("; ")}`);
  const token = randomBytes(24).toString("hex");

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        asset(response, "studio.html", "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/studio.css") {
        asset(response, "studio.css", "text/css; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/studio.js") {
        asset(response, "studio.js", "text/javascript; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/timeline-model.mjs") {
        asset(response, "timeline-model.mjs", "text/javascript; charset=utf-8");
        return;
      }
      if (!authorized(request, url, token)) {
        json(response, 401, { error: "unauthorized" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        const state = statePayload(root);
        json(response, state.valid ? 200 : 409, state);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/case") {
        json(response, 200, updateCase(root, await readBody(request)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/run") {
        json(response, 200, appendRun(root, await readBody(request)));
        return;
      }
      json(response, 404, { error: "not found" });
    } catch (error) {
      json(response, 400, { error: error.message });
    }
  });

  const ready = new Promise((resolveReady, rejectReady) => {
    server.once("error", rejectReady);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}/?token=${token}`;
      console.log(`Test Manager Studio: ${url}`);
      console.log(`Test root: ${root}`);
      if (open) openBrowser(url);
      resolveReady({ url, token, port: address.port });
    });
  });
  return { server, ready, token };
}

if (basename(process.argv[1] ?? "") === "test-manager-studio.mjs") {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(usage());
    else startStudio(options);
  } catch (error) {
    console.error(`test-manager-studio: ${error.message}`);
    process.exitCode = 1;
  }
}

export { appendRun, startStudio, statePayload, updateCase };
