# MCP App Project Selection E2E Specification

## Scenario 1 - Start with no project arguments

Given the packaged MCP server bundle, no project arguments, and a working directory containing no
`.projects` folder

When the server is started

Then it completes an MCP initialize exchange and lists its model-facing tools instead of exiting

## Scenario 2 - Select a project by folder path

Given a running MCP server started with no project arguments and a valid project folder elsewhere on
disk

When a model-facing tool is called with that folder as the project argument

Then it returns that project's summary, including an opaque project key

## Scenario 3 - Select a project by ID when a projects root is configured

Given a running MCP server started with a projects root containing a known project

When a model-facing tool is called with that project's ID, and separately with its name

Then both calls return the same project's summary

## Scenario 4 - Refuse an unusable folder

Given a running MCP server started with no project arguments

When a model-facing tool is called with a missing path, a symlinked path, or a real directory that is
not a Project Manager project

Then each call fails with an error naming the rejected path, and no partial project is returned

## Scenario 5 - Confine selection to a configured projects root

Given a running MCP server started with an explicit projects root, and a valid project folder outside
that root

When a model-facing tool is called with the outside folder

Then the call is refused with an error naming the rejected path and the configured root, and a call
naming a project inside the root still succeeds

## Scenario 6 - Keep opaque keys stable for a rendered view

Given a running MCP server and a project selected by folder path

When the same folder is selected again in a later call

Then the returned opaque project key is identical, so a key already held by a rendered view remains
valid

## Scenario 7 - Keep the view on keys only

Given a running MCP server and a project already selected by folder path

When an app-only tool is called with a filesystem path instead of an issued key

Then the call is refused through the catalog's selection error contract, and calling it with the
issued key succeeds

## Scenario 8 - Report a missing selection clearly

Given a running MCP server started with no project arguments and no discoverable projects

When a model-facing tool is called with no project argument

Then it fails with an error telling the caller to pass a project folder

## Scenario 9 - Still fail loudly for an explicitly requested bad root

Given the packaged MCP server bundle

When it is started with an explicit projects root that does not exist, and separately with that root
supplied by environment variable

Then both launches exit non-zero naming the path, because the caller asked for something specific

## Scenario 10 - Leave Studio's selection unchanged

Given the repository after this change

When Studio's server, catalog, and test suite are exercised

Then Studio's launch-time catalog, empty-catalog rejection, and project selection behave exactly as
before
