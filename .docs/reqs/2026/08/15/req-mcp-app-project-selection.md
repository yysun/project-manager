# MCP App Project Selection

## Problem

The MCP App requires the projects location at launch, through `--projects-root`, `--project`, or
`PROJECT_MANAGER_PROJECTS_ROOT`, and refuses to start without one. That forces an absolute path into
`claude_desktop_config.json` or an Agent Plugin's `mcp.json`, where it is invisible, easy to get
wrong, and wrong again as soon as the user works on a second workspace.

It is also inconsistent with the rest of the product. Every CLI script takes the project folder as a
mandatory positional argument and the skill instructs the agent to resolve it — `project status
<folder>`. The user never types a path because the agent supplies one. The MCP App is the only
surface that demands the location be fixed before the conversation starts.

The launch-time requirement was inherited from Studio, where the opaque-key catalog is load-bearing
because Studio's client is a browser that must never name a filesystem path. An agent caller is not
a browser: it already receives arbitrary folder paths on every CLI invocation.

## Requirement

Let the agent select the project, the way it already does for the CLI.

Model-facing tools must accept a project folder path and resolve it at call time. They must continue
to accept an ID or name when a projects root is configured. The server must start and serve tools
with no project arguments at all.

The boundary between the server and the view must stay: the sandboxed view never names a filesystem
path, so app-only tools continue to accept only server-issued opaque keys.

A configured projects root must remain available as an opt-in confinement. When one is configured,
project selection outside it must be refused.

## Acceptance Criteria

- [x] The server starts and serves its tools with no project arguments and no discoverable projects
      root, rather than failing at launch.
- [x] A model-facing tool accepts a project folder path, resolves it through the same real-path and
      identity validation used for configured projects, and returns that project's facts.
- [x] A model-facing tool continues to accept a project ID or name, resolved against the configured
      projects root when one is present.
- [x] Selecting a path that is missing, a symlink, not a real directory, or not a valid Project
      Manager project fails with an error naming the rejected path.
- [x] When a projects root is configured, selecting a project outside it is refused, so the
      configured root is a usable confinement.
- [x] App-only tools accept only server-issued opaque keys; a filesystem path supplied to them is
      refused, and no view names a filesystem path.
- [x] Repeated selection of the same project root yields the same opaque key, so a key already held
      by a rendered view stays valid.
- [x] Tool descriptions tell the agent it may pass a project folder, so the model can supply one
      without out-of-band instruction.
- [x] `--project`, `--projects-root`, and `PROJECT_MANAGER_PROJECTS_ROOT` continue to work, and
      installation documentation no longer requires a hardcoded projects path.
- [x] Studio's source, behavior, packaging, and tests are unchanged; any change to shared catalog
      code is strictly additive and leaves existing call sites behaving as before.
- [x] Automated tests cover no-argument launch, path selection, ID selection, rejection of invalid
      paths, confinement when a root is configured, key stability, and the view's key-only boundary.
- [x] Typecheck, the repository test suite, and the production build pass.

## Constraints

- Read-only is unchanged: this story adds selection, never mutation.
- Reuse the existing real-path, symlink, and project-identity validation rather than reimplementing
  it for ad-hoc paths.
- Keep the opaque key as the only project handle the view ever sees.
- Rebuild and synchronize the complete installable `skills/project-manager/` directory after source
  changes, per repository instructions.

## Non-Goals

- Detecting projects automatically by scanning the filesystem, walking up from the working
  directory, or maintaining a user-level workspace registry.
- Adopting MCP's `roots` capability, which is deprecated as of protocol revision 2026-07-28 and was
  never an access-control boundary.
- Changing Studio's project selection, which keeps its launch-time catalog because its client is a
  browser.
- Any write path, live refresh, picture-in-picture, or packaging change.
- A separate permission flag for arbitrary paths; a configured projects root already provides
  confinement, and its absence already matches what the CLI grants the agent today.
