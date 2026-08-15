# Auto-Select a Single Project

## Summary

- Project Manager now uses the sole valid project below the selected workspace root when no project
  folder or selector is supplied, instead of asking for confirmation.
- Multiple valid projects still require an explicit choice, while zero valid projects still require a
  folder; discovery remains confined to the selected workspace and rejects symlinked state.
- Recursive discovery now prunes only marker-proven internal recovery roots, preventing transaction
  backups from creating false ambiguity or becoming mutation targets while preserving similarly named
  legitimate projects.
- English and Chinese guidance and the skill-contract regression test now describe and enforce the
  selection boundary.

## Verification

- Focused selection-contract test passed after the recovery-root fix.
- `npm test` passed 201/201, including production builds and the complete project test suite.
- Independent CR found and drove the recovery-root safety fix; the final rerun reported
  `CR passed: no major findings`.
- The complete Codex package was rebuilt from a clean story-only worktree and reinstalled from the
  personal marketplace as `1.7.0+codex.20260815195534`.

## Notes

- Deterministic CLI commands still require explicit folder arguments; this change is the agent skill's
  omitted-selector behavior, not a new CLI discovery API.
- Unrelated edits in `config/codex-plugin/mcp.json` and `tests/mcp-app/plugin-package.test.js` were
  excluded from review, packaging, and the scoped story commit.
