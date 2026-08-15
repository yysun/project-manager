# Project Manager MCP App E2E Specification

## Scenario 1 - Serve over stdio

Given the packaged MCP server bundle and a valid projects root

When the server is started

Then it connects over stdio, completes an MCP initialize exchange, opens no listening socket, and
writes nothing to stdout but JSON-RPC framing

## Scenario 2 - Reject unusable arguments

Given the packaged MCP server bundle

When it is started with an unknown argument, a duplicated argument, or a flag missing its value

Then it exits non-zero and prints the usage string on stderr without connecting a transport

## Scenario 3 - Resolve the projects root from argument or environment

Given a projects root that is not the process working directory

When the server is started with that root supplied by argument, and separately by environment
variable

Then both runs expose the same projects, and a run with neither supplied and no discoverable default
fails with an error naming the path it attempted

## Scenario 4 - Withhold app-only tools from the model

Given a running MCP server with a valid projects root

When a client lists tools as the model would

Then the project status and board tools are present with a `ui://` resource URI in their UI
metadata, and the project payload and project list tools are absent

## Scenario 5 - Return a compact model-facing result

Given a running MCP server with a valid project

When the model-facing project status tool is called

Then the text content is a compact summary rather than the full task collection, the structured
result carries counts rather than task and lane collections, and the tool's own metadata declares the
inline card's UI resource URI

## Scenario 6 - Serve self-contained UI resources

Given a running MCP server

When each registered `ui://` resource is read

Then each returns an HTML document with the MCP Apps content type, and the document references no
external origin for scripts, styles, fonts, images, or network calls

## Scenario 7 - Serve the full payload only to the app

Given a running MCP server with a valid project

When the app-only project payload tool is called with a server-issued project key

Then it returns the full project data including tasks, lanes, and summary

## Scenario 8 - Reject project selections that were never issued

Given a running MCP server

When a project tool is called with a missing, unknown, or path-shaped project key

Then the call fails through the catalog's selection error contract and no project outside the
catalog is read

## Scenario 9 - Expose no write path

Given the MCP App sources and a running MCP server

When its registered tools are enumerated and its sources are inspected

Then no tool mutates project state, and no module under the MCP App references the shared library's
mutation entry points for saving task edits, checking task edits, regenerating status, or performing
atomic project mutations

## Scenario 10 - Render the inline status card within host constraints

Given a host rendering the inline status view with a tool result for a valid project

When the card is displayed

Then it shows at most five project metrics and at most two actions, fits its content height without
an internal vertical scroll container, and uses host theme tokens in both light and dark themes

## Scenario 11 - Offer fullscreen only when the host supports it

Given a host that reports fullscreen among its available display modes, and separately a host that
does not

When the inline status card initializes against each

Then the board control appears only for the host reporting fullscreen support, requesting fullscreen
activates the board view, and a granted mode differing from the requested mode is handled without
error

## Scenario 12 - Render the fullscreen board

Given a host displaying the board view for a valid project

When the board loads

Then it requests the full payload through the app-only tool, shows a loading state until it
resolves, renders lanes with their tasks, discloses task detail inline without a floating panel, and
shows a readable error state when the payload fails

## Scenario 13 - Produce a conformant Agent Plugins package

Given a completed repository build

When the Agent Plugins package directory is generated

Then it contains `plugin.json`, `mcp.json`, and the installable skill with its `SKILL.md`, the
manifests declare the standard's required fields and satisfy its documented constraints, the MCP
server entry resolves through the plugin-root path variable, and no repository source directory is
included

## Scenario 14 - Leave Studio unchanged

Given the repository after the MCP App is added

When the Studio server, client, build outputs, and test suite are exercised

Then Studio behavior, packaging, and tests are unchanged, and no module under the MCP App client
imports from the Studio client
