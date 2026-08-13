# Agent Execution CLI

## Summary

- Added installed `project-start-agent.js` and `project-ingest-agent-manifest.js` commands so governed agent work no longer needs generated `.pm-agent-exec.js` glue.
- Added atomic contract issuance, blocked retry, manifest ingestion, lifecycle progression, source validation, concurrency protection, rollback, and CHANGES re-verification binding support.
- Defined the main-agent coordinator model: one bounded, minimal-context subagent per dependency-ready agent task, capacity/isolation-aware waves, strict terminal-manifest returns, and safe failure recovery.
- Clarified human approval gates for both agent and RPD dependents, including the separate post-approval `planned → ready` coordination step.
- Updated guide images to PNG while intentionally retaining Studio screenshots as JPG.

## Verification

- `npm run test:pm` passed: 115 tests, 0 failures, 0 skipped.
- `npm run typecheck` and `npm run build` passed; the standalone Studio server/client bundle was regenerated.
- All three new agent scripts passed `node --check`; `git diff --check` passed.
- Independent gates passed: `AR passed: no blocking architecture flaws`, `CR passed: no major findings`, and `VR passed: all acceptance criteria complete`.
- The complete installable directory was synchronized and `diff -qr skills/project-manager /Users/esun/.agents/skills/project-manager` returned no differences at verification time.

## Notes

- Host subagent scheduling remains an instructed Codex behavior, not a Node.js scheduler; its scenarios are recorded as contract-conformance checks rather than falsely claimed runtime E2E passes.
- No push or pull request was requested or performed.
