# Project Manager MCP App

## Problem

Project truth lives in durable Markdown folders, and people already change it by talking to an AI
agent. What they cannot do is *see* that project while they talk. Studio shows it, but Studio is a
separate browser window with its own lifecycle: the user leaves the conversation, loses the thread
that produced the change, and comes back to re-explain context.

MCP Apps close that gap. A host that speaks the MCP Apps extension can render an interactive HTML
view inside the conversation itself, so a status card or a board sits next to the sentence that
changed it. Project Manager ships no such surface today: it exposes a skill, CLI scripts, and a
loopback Express Studio, none of which an MCP host can render.

## Requirement

Ship a read-only MCP App for Project Manager: an MCP server that exposes validated project facts as
tools and serves two `ui://` HTML views, plus a self-contained frontend that renders those views.

The server must run as a CLI over stdio. It must never mutate project state; all writes stay with
the agent, the skill, and the existing CLI scripts.

The frontend is a new application under `src/mcp-app/` with its own presentation. It must not import
Studio's React components, styles, or transport. It must render a compact inline status card and a
fullscreen board, adopt the host's theme tokens, and degrade to the tool's text result on hosts that
do not render MCP Apps.

The whole thing must be distributable as an Agent Plugins 1.0 package that carries both the existing
skill and the MCP server configuration.

## Acceptance Criteria

- [x] An MCP server module under `src/mcp-app/` runs as a CLI over stdio, writes nothing but JSON-RPC
      framing to stdout, and reports a clear error for unusable arguments.
- [x] The server registers model-facing tools that return a compact text summary suitable for model
      context, and app-only tools carrying the full project payload that are withheld from the
      model's tool list.
- [x] The server registers two UI resources under the `ui://` scheme with the MCP Apps HTML content
      type, one for the inline status card and one for the fullscreen board, and serves each as a
      self-contained HTML document with no external origins.
- [x] Project facts are read through the existing `skills/project-manager/scripts/lib` project-state
      functions rather than a reimplementation or a subprocess, and every project read resolves
      through a server-issued opaque key rather than a caller-supplied path.
- [x] The server performs no project mutation: no registered tool writes, and no module under
      `src/mcp-app/` references the shared library's mutation entry points.
- [x] The inline view declares inline and fullscreen display support, renders within the host's
      inline card constraints without nested scrolling, and offers a control that requests the
      fullscreen board only when the host reports fullscreen availability.
- [x] The fullscreen view renders lanes and task detail for the selected project without floating
      panels, and remains usable at narrow widths.
- [x] Both views style themselves from the host's theme tokens with a defined fallback, and remain
      legible in light and dark themes.
- [x] `src/mcp-app/` imports no module from `src/project-manager-studio/client`, and the existing
      Studio server, client, build outputs, and tests behave exactly as before.
- [x] The repository produces an Agent Plugins 1.0 package directory carrying `plugin.json`,
      `mcp.json`, and the installable skill, whose manifests declare the standard's required fields
      and satisfy its documented constraints, and whose MCP server entry resolves through the
      standard's plugin-root path variable. Conformance is checked by an offline automated test.
- [x] The projects location is configurable at launch through a documented argument and environment
      variable, so a host that starts the server with an unrelated working directory can still find
      projects.
- [x] Automated tests cover tool registration and visibility, UI resource content type and
      self-containment, read-only enforcement, project-key resolution, argument parsing and the
      stdio launch, and plugin manifest validity.
- [x] Typecheck, the repository test suite, and the production build pass, and documentation
      describes installing the MCP App on the supported hosts including the manual Claude Desktop
      configuration.

## Constraints

- Read-only. The MCP server must expose no write path, and adding one is a separate story.
- Reuse `skills/project-manager/scripts/lib/project-state.js` and the Studio project catalog as the
  fact source; do not fork project parsing, derivation, or validation.
- Keep Studio source, behavior, packaging, and tests unchanged apart from any strictly additive
  extraction needed to share the catalog.
- MCP App views run under a restrictive default Content Security Policy. Bundles must inline all
  script, style, and assets and declare no external origins.
- Views must not assume durable browser storage, an address bar, or host navigation.
- The packaged server must run on plain Node.js with no runtime dependency install, matching how
  the packaged Studio server is shipped today.
- Rebuild and synchronize the complete installable `skills/project-manager/` directory after source
  changes, per repository instructions.

## Non-Goals

- Editing, creating, deleting, scheduling, or otherwise mutating tasks or projects from the app.
- Picture-in-picture display, and the change polling that a persistent pinned view would require.
- Live refresh of an already-rendered view, whether by SSE, subscription, or poll.
- `.mcpb` Claude Desktop bundle packaging and Claude Code `.claude-plugin` packaging; the manual
  Claude Desktop configuration is documented instead, and bundle formats are a later story.
- Any network transport. The server is stdio-only; Streamable HTTP, remote hosting, and therefore
  ChatGPT — which cannot launch stdio servers — are out of scope.
- Reusing or refactoring Studio's React components, CSS, or HTTP transport into a shared UI layer.
- Retiring or changing the existing skill installation path, the Studio launchers, or the CLI
  scripts.
- Feature flags, environment-gated fallback modes, or compatibility layers for hosts that do not
  support MCP Apps; those hosts receive the tool's text result.
