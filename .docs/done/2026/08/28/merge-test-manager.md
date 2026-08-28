# Merge Test Manager into the Project Manager plugin

## Summary

- Added Test Manager `0.1.0` as the canonical, independently installable sibling of Project Manager
  in the root Agent Plugin and released the expanded package as Project Manager `1.11.0`.
- Kept `.projects` delivery coordination and `.tests` QA execution as separate authority and routing
  boundaries, with Test Manager Studio remaining a self-contained loopback-only application.
- Extended package, version, generated-artifact, inventory, mode, unit/integration, skill-validation,
  and isolated standalone Studio/API coverage for both skills.

## Verification

- `npm test` — passed: build, 247 Project Manager tests, and 5 Test Manager tests.
- Both skill quick validators and `npm run check:syntax` — passed.
- `npm run version:check` — Project Manager `1.11.0`; Test Manager `0.1.0`; generated artifacts current.
- `npm run test:e2e:tm` — passed from a copied standalone skill with launcher, advertised and actual
  loopback, token-protected reads/writes, unchanged unauthorized Run history, and two retained
  evidence-backed Runs.
- Independent AR round 2, CR round 4, and VR round 2 — passed.

## Notes

- No `.projects` or `.tests` schema changed.
- Test Manager is not embedded in the Project Manager MCP App.
- The former `yysun/test-manager` repository was not modified, archived, published, or synchronized;
  that external distribution decision remains separate from this repository merge.
