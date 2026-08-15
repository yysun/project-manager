# Repository Instructions

## Agent Plugin packaging

- The repository root is the single Agent Plugins 1.0 package and source of truth.
- Do not recreate `dist/plugin/`, `plugins/project-manager/`, or a repository-local Codex marketplace;
  duplicate skill identities and generated package copies have undefined precedence.
- After an edit that affects `skills/project-manager/` or the MCP App runtime, run
  `npm run build:plugin` and commit the generated root `bin/` and `ui/` directories.
- After any edit that could affect an installed plugin or standalone skill, sync the complete
  affected installable unit before considering the work complete: use the repository root for the
  plugin and `skills/project-manager/` for a skill-only installation. Sync after rebuilding so the
  installed copy includes current generated artifacts. Never sync only the edited files, and never
  modify Codex cache snapshots directly.
- Validate the root package and run the complete test suite before considering the work complete.
