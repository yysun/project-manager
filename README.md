# Project Manager

**An AI project manager you work with through conversation.**

Brief Project Manager as you would a human colleague: explain the outcome, constraints, authority,
and what is changing in the real world. It takes responsibility for the working plan—decomposing the
outcome, coordinating dependencies and owners, maintaining schedules and risks, tracking evidence,
and following changes through.

You set direction and make the business decisions that require your authority. Project Manager
manages the project. You do not have to convert reality into card movements, field edits, statuses,
dependencies, or reports.

![Four-panel overview of working with Project Manager as an AI project manager](skills/project-manager/assets/project-manager-ai-employee-en.png)

> “The vendor API will not be available until September 15. The launch date cannot move. Show me the
> credible options.”

Project Manager traces the affected work, tests the plan against the constraint, updates what the
facts support, and brings back the real tradeoff. One conversation can change tasks, dependencies,
schedules, risks, decisions, evidence, and reporting together.

```text
project reality → reasoning → coordinated change
```

## What you get

- An AI project manager that builds and maintains a verifiable plan tied to your outcome and success
  criteria.
- A current view of progress: what changed, what can move, what is blocked, what threatens the
  outcome, and which decision is needed.
- Connected updates across tasks, dependencies, schedules, risks, and decisions when reality changes.
- Completion backed by evidence, with missing information called out instead of invented.
- Status reports shaped for operators, project managers, executives, or boards without changing the
  underlying facts.
- One coherent project record across people, delegated agents, external executors, and optional
  software workflows such as [RPD](https://github.com/yysun/rpd).

Project truth stays in a durable, versionable Markdown folder and is validated before changes are
saved. Kanban and Timeline visualize that state; they do not become a second source of truth.

## PMI alignment

Project Manager is **PMBOK 7 principles-aligned with documented tailoring**. It is not certified by
PMI, and no tool can be — this describes how the skill is built, not an accreditation.

Tailoring is the load-bearing idea. PMBOK 7 makes tailoring a principle and PMBOK 6 states processes
are selected per project, so leaving out an area is compliant *only when the omission is a recorded
decision*. A project therefore declares each of the ten PMBOK 6 knowledge areas as applied or tailored
out, and tailoring an area out requires a rationale. Reports name a tailored-out area as tailored out
with that rationale — never as zero, absent, or on track.

What that buys you: cost, procurement, or stakeholder management can be genuinely absent from a small
project without the plan looking negligent, while an area you *do* claim to run is enforced. Declaring
an area out while configuring its module is a validation failure, so the declaration cannot become
fiction.

Applied by default: integration (change control, re-verification), scope (success criteria and
traceability), quality (acceptance and evidence), and risk. Available when wanted: assumption log,
issue log, stakeholder register, lessons register, and closure records. Cost, Earned Value, and
critical-path scheduling are not implemented — declare them tailored out, or manage them elsewhere and
say so in the rationale.

## User guides

- [English user guide](skills/project-manager/README.md) — manage through outcomes, events,
  constraints, evidence, and decisions.
- [中文使用指南](skills/project-manager/README-cn.md) — 通过目标、事件、约束、证据和决策管理项目。

## Studio

Kanban shows planned, ready, active, completed, deferred, and cancelled work.

![Project Manager Studio Kanban view](docs/images/project-manager-studio-kanban.jpg)

Timeline shows schedules, dependencies, blockers, and date conflicts.

![Project Manager Studio Timeline view](docs/images/project-manager-studio-timeline.jpg)

Studio watches the selected project's durable state and refreshes automatically when the CLI, an
agent, or another editor changes it. Automatic refresh waits while a task form or schedule draft is
open so local edits are not discarded; the Refresh button remains available as a manual recovery.

## MCP App

Studio is a browser window. The MCP App puts the same project facts inside the conversation, so the
status you are talking about sits next to the sentence that changed it.

It ships two views. An inline card shows task counts, blocked work, verified success criteria, owner
gaps, and the target date. A fullscreen board shows every lane with task detail disclosed in place.

The MCP App is **read-only**. You change projects by talking to the agent, and by the skill and CLI
scripts as before; the app never writes. It runs as a stdio CLI over MCP, reading the same validated
project state Studio reads.

Hosts that do not render MCP Apps still get the tools — they receive the compact text summary
instead of a view.

### Install as an Agent Plugin

`npm run build` produces `dist/agent-plugin/`, an [Agent Plugins 1.0](https://agent-plugins.org/)
package carrying both the skill and the MCP server. Point a conformant client at that directory.

### Install in Claude Desktop

Claude Desktop does not read Agent Plugins packages, so add the server to
`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`):

```json
{
  "mcpServers": {
    "project-manager": {
      "command": "node",
      "args": ["/absolute/path/to/skills/project-manager/scripts/project-manager-mcp.js"]
    }
  }
}
```

### Selecting a project

No projects path is configured, because the agent selects the project the way it already does for
every CLI script — `project status <folder>` takes a folder, and so does the MCP App. Ask for the
status of a project by folder and the agent passes it through. A folder is accepted whether or not
anything was configured at launch.

Configuration is optional and does two things when you use it. `--projects-root <folder>` (or
`PROJECT_MANAGER_PROJECTS_ROOT`) lets projects be selected by ID or name instead of path, **and
confines selection to that root** — a project outside it is refused. `--project <folder>` pins a
single project. Without either, the server starts with nothing configured and waits to be told.

Worth knowing: with no projects root configured, the server can read any Project Manager project on
the machine — the same reach the CLI scripts already give the agent. It only reads folders that
parse as a project, never arbitrary files. Set a projects root if you want that confined.

## Install

In your AI agent app, ask:

> Install the `project-manager` skill from `yysun/project-manager`.

## Development

```bash
npm ci
npm test
npm run pm-studio:dev
```

The development server generates a fresh disposable demo project on every start, so you can run it
with no setup. To open a specific project instead:

```bash
npm run pm-studio:dev -- --project /absolute/path/to/project
```

Because a Task Contract binds an absolute project root, a demo is only valid for the checkout that
generated it, so the demo is generated rather than committed. Create a persistent one — useful when
you want Studio edits to survive a restart — with:

```bash
npm run demo
```

That writes `demo/pm-studio-demo/` (gitignored), which you can then pass with
`npm run pm-studio:dev -- --project demo/pm-studio-demo`.

The installable skill is in `skills/project-manager/` and Studio source is in
`src/project-manager-studio/`.

## Technical documentation

- [Skill contract](skills/project-manager/SKILL.md)
- [Project conventions](skills/project-manager/references/conventions.md)
- [Changelog](CHANGELOG.md)
