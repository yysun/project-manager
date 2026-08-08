# Generic Project Manager Skill

## Problem

Project management context is easily trapped in chats, issue trackers, source repositories, or human memory. Existing approaches often make Git, software requirements, or ticket systems fundamental, which excludes general projects such as office moves, operational rollouts, marketing campaigns, certification, acquisitions, and renovations. They also confuse task closure with evidence-backed completion and allow project identity to collapse into repository identity.

## Requirement

Create an installable `project-manager` skill for lightweight, folder-native project management. A project is a first-class folder containing structured Markdown state. The folder may live inside or outside Git, and one repository/workspace may contain many independent project folders with an optional discovery index. Every operation must select one folder explicitly; the skill must never assume repository equals project.

The generic core must support planning, coordination, tracking, and reporting without source code or RPD. Start with `PROJECT.md`, `TASKS.md`, and `STATUS.md`, then add milestones, risks, decisions, sources, traceability, changes, handoffs, and report history only when they have an operational purpose.

Execution providers are optional adapters. Project Manager owns `plan → coordinate → track → report`. An executor owns the work itself. For software tasks using RPD, RPD owns `understand → implement → test → correct → verify`. The execution boundary is an immutable, versioned Task Contract from Project Manager to the selected executor and matching immutable Evidence Manifests back. Issuing a contract authorizes `ready → in_progress`; implemented, verification, verified, and done state may advance only from validated manifests, never from code presence, commit state, issue closure, or an agent's confidence.

Deterministic Node.js scripts must validate and calculate project status, next work, blockers, optional source/acceptance coverage, and normalized report data. Semantic work—decomposition, coordination judgment, risk analysis, source impact, and audience narrative—remains the agent's responsibility.

## Acceptance Criteria

- [x] `skills/project-manager/SKILL.md` triggers for generic project planning, coordination, tracking, status, next-work, review, and reporting requests without requiring Git, source code, or RPD.
- [x] The skill treats each explicitly selected folder as an independent first-class project object and never reads repository or sibling-project state as implicit project state.
- [x] Multiple projects can coexist under one repository/workspace, optionally listed in a non-authoritative `PROJECTS.md` discovery index, while each project remains independently movable and usable.
- [x] The minimal project structure is `PROJECT.md`, `TASKS.md`, and `STATUS.md`; optional files/directories are added only for real milestone, risk, decision, source, traceability, change, handoff, or reporting needs.
- [x] Project Manager ownership is limited to `plan → coordinate → track → report`; executors own task work, and the optional RPD adapter preserves RPD's `understand → implement → test → correct → verify` responsibility.
- [x] Generic tasks support human, RPD, other-agent, and external executors through the same project-qualified Task Contract → Evidence Manifest boundary.
- [x] Task Contracts and Evidence Manifests are immutable per-attempt artifacts with exact versioned schemas, canonical content hashes, task/source revision binding, typed evidence, stale/replay/mismatch rejection, and deterministic lifecycle mapping.
- [x] The task lifecycle distinguishes `planned`, `ready`, `in_progress`, `implemented`, `verification`, `verified`, and `done`; blocking is separate; `done` requires a verified manifest and satisfied dependencies.
- [x] Task IDs are project-owned and stable; dependencies resolve only within the selected project; optional external tracker IDs never replace project IDs.
- [x] Optional sources and traceability support documents, PDFs, spreadsheets, requirements, specifications, and other evidence without treating source code as privileged.
- [x] The optional RPD adapter uses an attempt-qualified story and hashed RPD artifacts to produce an Evidence Manifest without modifying the RPD skill or accepting stale evidence from another project, task, or attempt.
- [x] Deterministic Node.js commands validate project structure and state, calculate status, rank next work, list blockers, calculate configured source/acceptance coverage, and emit normalized report data from only the selected folder.
- [x] Next-work ranking filters dependency- or explicitly blocked tasks, then orders by declared criticality, tasks newly unblocked, priority, current milestone, and stable ID without pretending to calculate a duration-based critical path.
- [x] Reporting supports developer/operator, project-manager, executive, and board views from the same deterministic facts while keeping missing schedule or coverage evidence explicitly unknown or unconfigured.
- [x] `agents/openai.yaml` accurately describes the skill and includes a default prompt that invokes `$project-manager`.
- [x] The standard skill validator, Node.js test suite, all E2E scenarios, and clean-context forward tests pass for both a non-software project and a software project using the RPD adapter.
- [x] The story commit contains only the new skill and matching RPD artifacts; it does not change RPD or add tracker, Git, database, service, UI, or deployment integrations.

## Constraints

- Keep the installable artifact under `skills/project-manager/`; keep this repository's workflow artifacts under `.docs/`.
- Use Node.js standard-library code with no new runtime dependency.
- Require an explicit project folder argument for every deterministic command; do not default to the repository or current working directory.
- Treat folder Markdown as authoritative. Git may preserve history but is never required or authoritative.
- Keep the minimal profile usable for a small general project; do not force requirement baselines, milestones, or RPD handoffs where they do not apply.
- Add optional structure monotonically and preserve task/project IDs when a project grows.
- Keep deterministic scripts read-only. Skill-led mutations must use validated candidate state and recover the prior bytes on failure.
- Do not infer completion from task counts or manually entered `done` status without evidence.

## Non-Goals

- Reimplement RPD, perform executor work, launch coding agents, coordinate worktrees, or manage source commits inside Project Manager.
- Require a repository, Git history, source-code layout, software requirement baseline, or issue tracker.
- Build GitHub, Azure DevOps, Jira, Linear, Drive, or other storage/tracker adapters in v1.
- Build portfolio rollups, cross-project dependency scheduling, a database, service, dashboard UI, or deployment.
- Automatically migrate compact tasks into per-task files or invent a schedule forecast from task counts.
- Import or model the referenced PMS3 document in this story.
