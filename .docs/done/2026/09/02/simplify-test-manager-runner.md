# Simplify Test Manager Runner Policy

## Summary

- Removed the `goal-based-ui` CLI profile, bundled prompt, dedicated reference, eligibility branch,
  fixed trace, and operational-metric contract.
- Kept Test Manager generic: projects own specialized execution through `RUNNER_PROMPT.md` and Case
  Runner Instructions; independent methodologies remain independent skills.
- Preserved the `.tests` schema, initialized root inventory, ordinary prompt output, Studio
  projections, evidence rules, and immutable Run ledger.
- Unified the Project Manager skill, Test Manager skill, plugin, and MCP App runtime at release
  `1.12.1`; future release bumps update both skills together.

## Verification

- `npm test` — passed: complete build, 247 Project Manager tests, and 16 Test Manager tests.
- `npm run typecheck` and `npm run check:syntax` — passed.
- Project Manager and Test Manager quick validators — passed.
- `npm run test:e2e:tm` — passed against a copied standalone skill and temporary workspace.
- `npm run version:check` — passed for Project Manager `1.12.1` and Test Manager `1.12.1`.
- `codex plugin add project-manager@personal --json` — refreshed the complete local plugin; the
  installed Test Manager skill is byte-equivalent to the repository source.
- `git diff --check` — passed.
