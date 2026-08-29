// Responsibility: render Test Manager views and submit token-authenticated case and Run mutations.
// State boundary: PASS is created only through the evidence-backed Run API, never card movement.
// Recent change: match Project Manager's labeled, range-sized weekly Timeline canvas.

import {
  barGeometry,
  datePercent,
  dayDiff,
  rangeDays,
  rangeContains,
  timelineContentWidth,
  timelineLayout,
  timelineScaleTicks,
} from "./timeline-model.mjs";

const token = new URLSearchParams(location.search).get("token");
const state = { data: null, view: "kanban", selectedCase: null };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error || body.errors?.join("; ") || `HTTP ${response.status}`,
    );
  return body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cases() {
  return (state.data?.suites || []).flatMap((suite) =>
    suite.cases.map((testCase) => ({
      ...testCase,
      suite: suite.slug,
      suiteTitle: suite.title,
      suitePlannedStart: suite.plannedStart,
      suitePlannedEnd: suite.plannedEnd,
    })),
  );
}

function filteredCases() {
  const suite = $("#suite-filter").value;
  const priority = $("#priority-filter").value;
  const query = $("#search").value.trim().toLowerCase();
  return cases().filter((testCase) => {
    if (suite && testCase.suite !== suite) return false;
    if (priority && testCase.priority !== priority) return false;
    if (
      query &&
      ![
        testCase.id,
        testCase.title,
        testCase.requirementRisk,
        testCase.suiteTitle,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    )
      return false;
    return true;
  });
}

function visibleSuites() {
  const suite = $("#suite-filter").value;
  return state.data.suites.filter((item) => !suite || item.slug === suite);
}

function latestResult(testCase) {
  return testCase.currentRun?.result || "NOT_RUN";
}

function bucket(testCase) {
  if (testCase.state === "RETIRED") return "other";
  if (testCase.state === "DRAFT") return "draft";
  const result = latestResult(testCase);
  if (result === "PASS") return "pass";
  if (result === "FAIL") return "fail";
  if (result === "BLOCKED") return "blocked";
  if (result === "SKIPPED" || result === "INVALID") return "other";
  return "ready";
}

function renderMetrics() {
  const c = state.data.counts;
  const items = [
    ["Suites", c.suites],
    ["Cases", c.cases],
    ["Ready", c.ready],
    ["Pass", c.pass],
    ["Fail", c.fail],
    ["Blocked", c.blocked],
    ["Not run", c.notRun],
  ];
  $("#metrics").innerHTML = items
    .map(
      ([label, value]) =>
        `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`,
    )
    .join("");
  const suiteGate = state.data.gateIndicator;
  const gate = $("#gate");
  gate.textContent = suiteGate;
  gate.dataset.tone =
    suiteGate === "PASS"
      ? "good"
      : ["FAIL", "BLOCKED"].includes(suiteGate)
        ? "bad"
        : "warn";
}

function card(testCase) {
  const result = latestResult(testCase);
  return `<button class="case-card" data-case="${escapeHtml(testCase.id)}">
    <div class="card-top"><span class="case-id">${escapeHtml(testCase.id)}</span><span class="priority">${escapeHtml(testCase.priority)}</span></div>
    <h3>${escapeHtml(testCase.title)}</h3>
    <div class="card-meta"><span>${escapeHtml(testCase.suiteTitle)}</span><span><i class="dot ${result}"></i>${result}</span></div>
  </button>`;
}

function renderKanban() {
  const definitions = [
    ["draft", "Draft"],
    ["ready", "Ready / Not run"],
    ["pass", "Passed"],
    ["fail", "Failed"],
    ["blocked", "Blocked"],
    ["other", "Skipped / Invalid / Retired"],
  ];
  const list = filteredCases();
  $("#kanban-view").innerHTML = `<div class="kanban">${definitions
    .map(([id, title]) => {
      const matching = list.filter((testCase) => bucket(testCase) === id);
      return `<section class="column"><div class="column-head"><h2>${title}</h2><span>${matching.length}</span></div><div class="card-list">${matching.length ? matching.map(card).join("") : '<p class="empty-column">No cases</p>'}</div></section>`;
    })
    .join("")}</div>`;
  $$(".case-card").forEach((element) =>
    element.addEventListener("click", () => openCase(element.dataset.case)),
  );
}

function usefulTimelineValue(value) {
  const text = String(value ?? "").trim();
  return text && !["—", "UNDEFINED", "UNASSIGNED"].includes(text);
}

function timelineLabel(testCase) {
  const result = latestResult(testCase);
  const owner = usefulTimelineValue(testCase.owner)
    ? testCase.owner
    : "Unassigned";
  const design = [testCase.type, testCase.automation]
    .filter(usefulTimelineValue)
    .join(" · ");
  const requirement = usefulTimelineValue(testCase.requirementRisk)
    ? `<span class="timeline-context">Requirement / risk · ${escapeHtml(testCase.requirementRisk)}</span>`
    : "";
  const run = testCase.currentRun;
  const suitePlan = [testCase.suitePlannedStart, testCase.suitePlannedEnd]
    .filter(Boolean)
    .join(" → ");
  const runContext = run
    ? `<span class="timeline-run-context">Latest ${escapeHtml(result)} · ${escapeHtml(run.executedAt.slice(0, 10))} · ${escapeHtml(run.build)} · ${escapeHtml(run.environment)}</span>`
    : '<span class="timeline-run-context">No run recorded</span>';
  const issue =
    run && usefulTimelineValue(run.issue)
      ? `<span class="timeline-run-issue ${escapeHtml(result)}">${escapeHtml(result === "FAIL" ? "Defect" : "Reason")} · ${escapeHtml(run.issue)}</span>`
      : "";

  return `<span class="timeline-label">
    <span class="timeline-title-line"><strong>${escapeHtml(testCase.title)}</strong><span class="case-id">${escapeHtml(testCase.id)}</span></span>
    <span class="timeline-label-meta"><span class="case-state">${escapeHtml(testCase.state)}</span><span class="result ${escapeHtml(result)}">${escapeHtml(result)}</span><span class="priority">${escapeHtml(testCase.priority)}</span><span>${escapeHtml(owner)}</span><span>${escapeHtml(testCase.suiteTitle)}</span></span>
    ${design ? `<span class="timeline-context">${escapeHtml(design)}</span>` : ""}
    ${suitePlan ? `<span class="timeline-context timeline-suite-plan">Suite plan · ${escapeHtml(suitePlan)}</span>` : ""}
    ${requirement}
    ${runContext}
    ${issue}
  </span>`;
}

function unscheduledCase(testCase) {
  return `<button class="unscheduled-case" data-case="${escapeHtml(testCase.id)}">${timelineLabel(testCase)}</button>`;
}

const TIMELINE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function timelineScale(range) {
  const total = rangeDays(range);
  const ticks = timelineScaleTicks(range);
  return `<span class="timeline-scale">${ticks
    .map((date, index) => {
      const elapsed = dayDiff(range.start, date);
      const remaining = total - elapsed;
      const year = date.slice(0, 4);
      const previousYear = ticks[index - 1]?.slice(0, 4);
      const label = `${TIMELINE_DATE_FORMATTER.format(new Date(`${date}T00:00:00Z`))}${index === 0 || year !== previousYear ? `, ${year}` : ""}`;
      const compactEnd = remaining < 5;
      const style = compactEnd
        ? `left:${(elapsed / total) * 100}%;width:88px`
        : `left:${(elapsed / total) * 100}%;width:${(Math.min(7, remaining) / total) * 100}%`;
      return `<span class="timeline-week ${compactEnd ? "timeline-week--end" : ""}" title="${escapeHtml(date)}" aria-label="${escapeHtml(date)}" style="${style}">${escapeHtml(label)}</span>`;
    })
    .join("")}</span>`;
}

function timelineMarkerLayer(markers, range) {
  return markers
    .filter((marker) => rangeContains(marker.date, range))
    .map(
      (marker) =>
        `<i class="timeline-marker timeline-marker--suite-${escapeHtml(marker.kind)}" style="left:${datePercent(marker.date, range)}%" title="${escapeHtml(marker.label)} · ${escapeHtml(marker.date)}"></i>`,
    )
    .join("");
}

function renderTimeline() {
  const list = filteredCases();
  const layout = timelineLayout(list, visibleSuites());
  if (!layout.range) {
    $("#timeline-view").innerHTML =
      `<div class="timeline-shell"><div class="unscheduled"><h3>No timeline scheduled</h3><p class="hint">Set Suite or Case planning dates. Planning dates do not change execution evidence.</p><div class="unscheduled-list">${layout.unscheduled.map(unscheduledCase).join("")}</div></div></div>`;
  } else {
    const { bounds, markers, ordered, range, scheduled, unscheduled } = layout;
    const rows = ordered.length
      ? ordered
          .map((item) => {
            const result = latestResult(item);
            const startDate = item.plannedStart || item.plannedEnd || null;
            const endDate = item.plannedEnd || item.plannedStart || null;
            let schedule =
              '<span class="timeline-unscheduled-track">Unscheduled · add dates</span>';
            if (startDate) {
              const geometry = barGeometry(startDate, endDate, range);
              const barTitle = `${item.title}: ${startDate} → ${endDate}`;
              schedule = `<i class="timeline-bar ${escapeHtml(result)}" style="left:${geometry.left}%;width:${geometry.width}%" title="${escapeHtml(barTitle)}"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(startDate)} → ${escapeHtml(endDate)}</small></i>`;
            }
            return `<button class="timeline-row" data-case="${escapeHtml(item.id)}">${timelineLabel(item)}<span class="timeline-track">${schedule}</span></button>`;
          })
          .join("")
      : '<div class="timeline-row timeline-row--empty"><span class="timeline-label timeline-empty-label">No matching cases</span><span class="timeline-track"></span></div>';
    $("#timeline-view").innerHTML =
      `<div class="timeline-shell"><div class="timeline-summary"><span>${escapeHtml(bounds.start)}</span><strong>${scheduled.length} scheduled · ${unscheduled.length} unscheduled</strong><span>${escapeHtml(bounds.end)}</span></div><div class="timeline-planner" style="--timeline-days:${rangeDays(range)};--timeline-content-width:${timelineContentWidth(range)}px"><div class="timeline-scroll" role="region" aria-label="Scrollable test case timeline" tabindex="0"><div class="timeline-canvas"><div class="timeline-date-header"><span class="timeline-date-label"><strong>Case</strong><span>${list.length} shown</span></span>${timelineScale(range)}</div><span class="timeline-marker-layer" aria-hidden="true">${timelineMarkerLayer(markers, range)}</span>${rows}</div></div></div></div>`;
  }
  $$("#timeline-view [data-case]").forEach((element) =>
    element.addEventListener("click", () => openCase(element.dataset.case)),
  );
}

function renderRuns() {
  const suiteFilter = $("#suite-filter").value;
  const runs = state.data.suites
    .filter((suite) => !suiteFilter || suite.slug === suiteFilter)
    .flatMap((suite) =>
      suite.runs.map((run) => ({ ...run, suite: suite.slug })),
    )
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
  $("#runs-view").innerHTML =
    `<div class="runs-shell"><table><thead><tr><th>Run</th><th>Case</th><th>Suite</th><th>Build / Env</th><th>Result</th><th>Evidence</th><th>Defect / Blocker</th><th>Executed</th></tr></thead><tbody>${
      runs
        .map(
          (run) =>
            `<tr><td>${escapeHtml(run.runId)}</td><td>${escapeHtml(run.caseId)}</td><td>${escapeHtml(run.suite)}</td><td>${escapeHtml(run.build)}<br><span class="hint">${escapeHtml(run.environment)}</span></td><td><span class="result ${run.result}">${run.result}</span></td><td>${escapeHtml(run.evidence)}</td><td>${escapeHtml(run.issue)}</td><td>${escapeHtml(run.executedAt)}<br><span class="hint">${escapeHtml(run.executor)}</span></td></tr>`,
        )
        .join("") || '<tr><td colspan="8">No runs recorded</td></tr>'
    }</tbody></table></div>`;
}

function renderViews() {
  renderKanban();
  renderTimeline();
  renderRuns();
}

function populateFilters() {
  const current = $("#suite-filter").value;
  $("#suite-filter").innerHTML =
    `<option value="">All suites</option>${state.data.suites.map((suite) => `<option value="${suite.slug}">${escapeHtml(suite.title)}</option>`).join("")}`;
  $("#suite-filter").value = state.data.suites.some(
    (suite) => suite.slug === current,
  )
    ? current
    : "";
}

function populateRunCases() {
  const suite = $("#suite-filter").value;
  $("#run-case").innerHTML = cases()
    .filter((testCase) => !suite || testCase.suite === suite)
    .filter((testCase) => testCase.state !== "RETIRED")
    .map(
      (testCase) =>
        `<option value="${testCase.id}" data-suite="${testCase.suite}">${testCase.id} · ${escapeHtml(testCase.title)}</option>`,
    )
    .join("");
}

function renderSuiteFilter() {
  populateRunCases();
  renderViews();
}

async function load() {
  try {
    state.data = await api("/api/state");
    $("#root-path").textContent = state.data.root;
    populateFilters();
    populateRunCases();
    renderMetrics();
    renderViews();
  } catch (error) {
    document.querySelector("main").innerHTML =
      `<div class="fatal"><h2>Studio could not read test status</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function openCase(caseId) {
  const testCase = cases().find((item) => item.id === caseId);
  if (!testCase) return;
  state.selectedCase = testCase;
  $("#case-suite").textContent = `${testCase.suiteTitle} · ${testCase.id}`;
  $("#case-title").textContent = testCase.title;
  $("#case-objective").textContent = testCase.objective || "Objective not defined";
  $("#case-priority").textContent = testCase.priority;
  $("#case-type").textContent = testCase.type;
  $("#case-automation").textContent = testCase.automation;
  $("#case-result").textContent = latestResult(testCase);
  $("#case-state").value = testCase.state;
  $("#case-start").value = testCase.plannedStart || "";
  $("#case-end").value = testCase.plannedEnd || "";
  $("#case-expected").textContent =
    testCase.expectedOutcome || "Expected outcome not defined";
  $("#case-error").textContent = "";
  $("#case-dialog").showModal();
}

async function saveCase(event) {
  event.preventDefault();
  const testCase = state.selectedCase;
  try {
    await api("/api/case", {
      method: "POST",
      body: JSON.stringify({
        suite: testCase.suite,
        caseId: testCase.id,
        state: $("#case-state").value,
        plannedStart: $("#case-start").value,
        plannedEnd: $("#case-end").value,
      }),
    });
    $("#case-dialog").close();
    toast("Case plan saved and validated");
    await load();
  } catch (error) {
    $("#case-error").textContent = error.message;
  }
}

async function saveRun(event) {
  event.preventDefault();
  const option = $("#run-case").selectedOptions[0];
  try {
    const result = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({
        suite: option.dataset.suite,
        caseId: option.value,
        environment: $("#run-environment").value,
        build: $("#run-build").value,
        data: $("#run-data").value,
        result: $("#run-result").value,
        evidence: $("#run-evidence").value,
        issue: $("#run-issue").value,
        executor: $("#run-executor").value,
      }),
    });
    $("#run-dialog").close();
    $("#run-form").reset();
    toast(`Appended ${result.runId}`);
    await load();
  } catch (error) {
    $("#run-error").textContent = error.message;
  }
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2600);
}

$$(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    $$(".view").forEach((item) =>
      item.classList.toggle("active", item.id === `${tab.dataset.view}-view`),
    );
  }),
);
$("#suite-filter").addEventListener("input", renderSuiteFilter);
[$("#priority-filter"), $("#search")].forEach((element) =>
  element.addEventListener("input", renderViews),
);
$("#refresh").addEventListener("click", load);
$("#record-run").addEventListener("click", () => {
  $("#run-error").textContent = "";
  $("#run-dialog").showModal();
});
$("#case-form").addEventListener("submit", saveCase);
$("#run-form").addEventListener("submit", saveRun);
$$(".close-dialog").forEach((button) =>
  button.addEventListener("click", () => button.closest("dialog").close()),
);

load();
