# Studio Project Selection E2E

## Scenario 1 - Default projects root opens selectable projects

Given the Studio process is launched from a workspace containing `.projects/alpha` and `.projects/beta` as valid projects
And neither `--project` nor `--projects-root` is passed
When the tokenized Studio URL is opened and the session handshake completes
Then Studio lists Alpha and Beta in deterministic order
And one valid project is selected and rendered
And no sibling outside `.projects` is offered

## Scenario 2 - Switching replaces all project-scoped state

Given Studio is running with two valid selectable projects
And the first project has a distinct task, owner, and project name
And the second project has different project state
And the operator has set an owner filter, opened a first-project task dialog, and created a Timeline schedule draft
And an old-project refresh or save response is delayed
When the operator selects the second project
Then the header, summary, filters, Kanban, and Timeline use the second project
And any open task dialog and project-scoped filters from the first project are cleared
And the Timeline draft is cleared
And the delayed old-project response is ignored
And a subsequent task mutation changes only the second project

## Scenario 3 - Browser tabs keep independent selections

Given two browser tabs share the authenticated Studio session
And each tab has a different server-issued project key
When each tab reads and edits a task whose ID and revision values may match across projects
Then each request reads or changes only the project identified by its own key
And a missing or unknown key is rejected by the server before any project mutation
And a response whose key or request generation does not match a tab's current selection is rejected by that client tab

## Scenario 4 - Selection stays inside the configured root

Given Studio is running with an explicit projects root
And an unrelated valid project exists outside that root
When a client submits an unknown key, traversal text, or an absolute path as a key
Then Studio rejects the selection
And the currently selected project remains unchanged
And no outside project state is read or mutated through Studio

## Scenario 5 - Issued key expires after project removal

Given Studio issued a key for a valid direct-child project
When that child is removed after launch
Then its issued key is rejected as stale

## Scenario 6 - Issued key expires after project rename

Given Studio issued a key for a valid direct-child project
When that child is renamed after launch
Then its issued key is rejected as stale

## Scenario 7 - Issued key expires after symlink replacement

Given Studio issued a key for a valid direct-child project
When that child is replaced by a symlink after launch
Then its issued key is rejected as stale

## Scenario 8 - Explicit single-project launch remains isolated

Given a valid project has an unrelated valid sibling
When Studio is launched with only `--project <folder>`
Then the selector contains exactly the explicit project
And the sibling cannot be selected
And existing project reads and task edits still work

## Scenario 9 - Combined launch accepts a direct child

Given Studio is launched with both `--projects-root <root>` and `--project <folder>`
When the explicit project is a valid direct real child of the root
Then Studio opens with that project selected and offers the other valid direct-child projects

## Scenario 10 - Combined launch rejects an outside project

Given Studio is launched with `--projects-root <root>`
When the explicit project is outside the root
Then Studio exits non-zero before listening with a containment error

## Scenario 11 - Combined launch rejects a nested project

Given Studio is launched with `--projects-root <root>`
When the explicit project is nested below a direct child of the root
Then Studio exits non-zero before listening with a containment error

## Scenario 12 - Combined launch rejects a symlinked project

Given Studio is launched with `--projects-root <root>`
When the explicit project is a symlink under the root
Then Studio exits non-zero before listening with a containment error

## Scenario 13 - Missing default projects root fails distinctly

Given Studio is launched without explicit selectors from a working directory where `.projects` is missing
When startup validates the default projects root
Then it exits non-zero with `PROJECTS_ROOT_MISSING`
And it does not fall back to a visible `projects` directory

## Scenario 14 - Non-directory projects root fails distinctly

Given the configured projects root is a file
When Studio starts
Then it exits non-zero with `PROJECTS_ROOT_INVALID`

## Scenario 15 - Symlinked projects root fails distinctly

Given the configured projects root is a symlink
When Studio starts
Then it exits non-zero with `PROJECTS_ROOT_INVALID`

## Scenario 16 - Empty projects root fails distinctly

Given the configured projects root is an empty directory
When Studio starts
Then it exits non-zero with `PROJECTS_ROOT_EMPTY`

## Scenario 17 - Malformed project child fails distinctly

Given a direct child contains malformed project state
When Studio builds its catalog
Then it exits non-zero with `PROJECT_CATALOG_INVALID`

## Scenario 18 - Symlinked project child fails distinctly

Given a direct child is a symlink
When Studio builds its catalog
Then it exits non-zero with `PROJECT_CATALOG_INVALID`

## Scenario 19 - Duplicate project identity fails distinctly

Given two valid direct children declare the same project ID at startup
When Studio builds its catalog
Then it exits non-zero with `PROJECT_ID_DUPLICATE`

## Scenario 20 - Project identity drift invalidates access

Given Studio cataloged a valid direct-child project with one project ID
When that child's `PROJECT.md` is externally changed to a different valid project ID
Then Studio rejects catalog access with `PROJECT_SELECTION_STALE`
And no task mutation is applied under the changed identity

## Scenario 21 - Missing explicit-project value fails clearly

Given `--project` is missing its value
When Studio parses its launch arguments
Then it exits non-zero before listening
And stderr prints the supported launch syntax and the argument error

## Scenario 22 - Missing projects-root value fails clearly

Given `--projects-root` is missing its value
When Studio parses its launch arguments
Then it exits non-zero before listening
And stderr prints the supported launch syntax and the argument error

## Scenario 23 - Repeated explicit-project selector fails clearly

Given `--project` is repeated
When Studio parses its launch arguments
Then it exits non-zero before listening
And stderr prints the supported launch syntax and the argument error

## Scenario 24 - Repeated projects-root selector fails clearly

Given `--projects-root` is repeated
When Studio parses its launch arguments
Then it exits non-zero before listening
And stderr prints the supported launch syntax and the argument error

## Scenario 25 - Unknown CLI argument fails clearly

Given Studio is launched with an unknown argument
When Studio parses its launch arguments
Then it exits non-zero before listening
And stderr prints the supported launch syntax and the argument error
