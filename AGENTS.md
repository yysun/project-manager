# Repository Instructions

## Agent Plugin packaging

- The repository root is the single Agent Plugins 1.0 package and source of truth.
- Do not recreate `dist/plugin/`, `plugins/project-manager/`, or a repository-local Codex marketplace;
  duplicate skill identities and generated package copies have undefined precedence.
- After an edit that affects `skills/project-manager/` or the MCP App runtime, run
  `npm run build:plugin` and commit the generated root `bin/` and `ui/` directories.
- Validate the root package and run the complete test suite before considering the work complete.
