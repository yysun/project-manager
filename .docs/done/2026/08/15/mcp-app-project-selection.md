# MCP App Project Selection

## Summary

- The MCP App no longer needs a projects path at launch. Model-facing tools accept a project folder,
  resolved at call time, so nothing has to be written into `claude_desktop_config.json` or an Agent
  Plugin's `mcp.json`.
- This adopts the model the rest of the product already uses: every CLI script takes the project
  folder as a positional argument and `SKILL.md` tells the agent to resolve it. The MCP App had been
  the only surface demanding the location be fixed before the conversation started.
- Selection accepts a configured ID or name first, then falls back to treating the value as a folder.
  An ambiguous ID is refused rather than guessed, matching the skill's "ambiguity is not selection".
- A configured projects root is now opt-in **confinement**: with one set, a project outside it is
  refused. Without one, the server reaches as far as the CLI already lets the agent reach.
- `ProjectCatalog` gained an opt-in `allowEmpty` construction and a `register(root)` method. Both are
  additive; Studio passes neither and keeps its launch-time, non-empty behavior.
- The view boundary is unchanged. App-only tools still accept only server-issued opaque keys, and a
  filesystem path handed to one is refused.

## Verification

- `npm run typecheck` — exit 0, with Studio's types untouched.
- `npm test` — 197/197 pass (11 new in `selection.test.js`, plus updated `cli.test.js` and
  `server.test.js`).
- `npm run build` — emits both server bundles, both views, and the Agent Plugins package.
- E2E `.docs/tests/test-mcp-app-project-selection.md`, all 10 scenarios. Scenario 1 was executed
  directly against the packaged bundle: launched with no arguments in a directory containing no
  `.projects`, it completed the MCP initialize exchange and returned `tools/list` with empty stderr
  and exit 0. The rest are covered by the automated suite.
- Installable skill synchronized to `~/.agents/skills/project-manager/`.

## Notes

- **Deliberate reach change.** With no projects root configured, the server can read any Project
  Manager project on the machine. In Codex this grants nothing new — the agent already runs the CLI
  with arbitrary folders. In Claude Desktop, where the user may have connected no filesystem tool, it
  is a real widening. It stays narrow (only folders that parse as a project, never arbitrary files),
  and `--projects-root` confines it. Documented in the README rather than left implicit.
- **One intermittent test failure, investigated and not reproduced.** A Studio SSE watcher test failed
  once during a full-suite run. It did not recur in four further full-suite runs, three isolated runs,
  or three runs against the pre-change baseline. Filesystem-timing sensitive and surfaced by the added
  parallel load; recorded rather than silenced.
- **Error message regression caught and fixed during review.** Falling through to path resolution made
  a mistyped ID report "folder does not exist" instead of listing available projects. Selection now
  names both possibilities.
- `register` grows the catalog for the session, and `data()` re-validates every entry on each
  selection, so per-call disk reads scale with the number of folders selected. Negligible at
  realistic counts; the obvious lever if a session ever selects many projects.
- AR, CR, and VR ran in the primary agent, not independent subagents — this session prohibits
  spawning agents unless asked. Same checklists and pass criteria, but not independent review.
- Not committed. Planned routing ends at this document; say the word and I will commit.
