# Project Manager MCP App

## Summary

- Added a read-only MCP App under `src/mcp-app/`: a stdio MCP server exposing validated project
  facts, plus an inline status card and a fullscreen board rendered inside supporting hosts.
- Model-facing tools (`pm_project_status`, `pm_open_board`) return a compact summary and link a
  `ui://` view; app-only tools (`pm_get_project`, `pm_list_projects`) carry the full payload and are
  withheld from the model's tool list, so task collections never enter model context.
- Project facts come from the existing `scripts/lib` functions and resolve through the Studio
  `ProjectCatalog`'s opaque keys, so parsing, derivation, and path validation are not forked.
- The frontend is deliberately independent of Studio's client — the chat surface has no address bar,
  caps inline height, and supplies its own theme tokens — and is enforced by an import assertion.
- Views ship as single-file HTML with everything inlined, because MCP App views run under a default
  CSP of `default-src 'none'`.
- `npm run build` now also emits `dist/agent-plugin/`, an Agent Plugins 1.0 package carrying the
  installable skill and the MCP server config in the standard's fixed root layout.
- Studio is untouched: same source, same behavior, same packaging, same tests.

## Verification

- `npm run typecheck` — exit 0.
- `npm test` — 185/185 pass (155 pre-existing, 30 new across five files in `tests/mcp-app/`).
- `npm run build` — emits both server bundles, both views, and the Agent Plugins package.
- E2E spec `.docs/tests/test-mcp-app.md`, all 14 scenarios. Scenarios 1–9, 13, 14 are covered by the
  automated suite. Scenarios 10–12 need a host, so they were run against a throwaway stub host that
  speaks the `ui/` postMessage protocol: the initialize handshake, tool-result delivery, an
  app-initiated `tools/call`, `ui/request-display-mode` granting fullscreen, the board control being
  absent when the host does not offer fullscreen, inline task disclosure, and dark-theme fallback
  with no host tokens supplied were each observed directly.
- Installable skill synchronized to `~/.agents/skills/project-manager/` per `AGENTS.md`.

## Notes

- **Not verified against a real host.** Claude Desktop is the only target confirmed to render MCP
  Apps UI, and it was not available here; the stub host is a faithful protocol harness, not proof.
  Codex Desktop reportedly does not render `ui://` resources (openai/codex#21019), and ChatGPT is out
  of scope since it cannot launch stdio servers.
- **AR, CR, and VR ran in the primary agent**, not independent subagents — this session prohibits
  spawning agents unless asked. Same checklists and pass criteria, but not independent review.
- Scope corrected mid-implementation from dual-transport to stdio-only. The Streamable HTTP path was
  written and then removed; no Express or CORS dependency ships.
- Read-only is enforced at the call site, not by bundle content: `loadRevisionedProject` shares a
  module with `saveTaskEdit`, so the revision-safe read necessarily bundles write code. Keeping the
  revision guard matters because the agent writes while the app reads.
- Each view bundle is ~490 kB (~129 kB gzipped), mostly React. Fine over a local stdio transport, but
  a lighter runtime is the obvious lever if inline payload size ever matters.
- Deferred by design: picture-in-picture, live refresh of a rendered view, `.mcpb` packaging for
  Claude Desktop, and any write path.
