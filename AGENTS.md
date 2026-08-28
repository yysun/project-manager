# Repository Instructions

## Agent Plugin packaging

- The repository root is the single Agent Plugins 1.0 package and source of truth for the canonical
  `skills/project-manager/` and `skills/test-manager/` installable skills.
- Do not recreate `dist/plugin/`, `plugins/project-manager/`, or a repository-local Codex marketplace;
  duplicate skill identities and generated package copies have undefined precedence.
- After an edit that affects `skills/project-manager/` or the MCP App runtime, run
  `npm run build:plugin` and commit the generated root `bin/` and `ui/` directories. After changing
  plugin release metadata or `src/version.ts`, run the complete `npm run build` so the standalone
  Project Manager Studio artifacts also carry the new version.
- `plugin.json` is the canonical release version. Change it only with
  `npm run release:version -- <semver>` so the skill and MCP App runtime stay synchronized.
- After any edit that could affect an installed plugin or standalone skill, sync the complete
  affected installable unit before considering the work complete: use the repository root for the
  plugin and the complete applicable `skills/project-manager/` or `skills/test-manager/` directory
  for a skill-only installation. Sync after rebuilding so the installed copy includes current
  generated artifacts. Never sync only the edited files, and never modify Codex cache snapshots
  directly.
- Keep Test Manager's default managed root at `<cwd>/.tests`, preserve case design state separately
  from execution result, keep `RUNS.md` append-only, and never create PASS without a
  validator-compliant evidence-backed Run.
- Keep Test Manager Studio loopback-only and token-protected for every API read and write.
- Validate the root package, run the complete test suite, run both skill quick validators, and run
  the temporary-workspace Test Manager Studio/API smoke test before considering affected work complete.
