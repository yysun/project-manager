# E2E: Home-relative Project Manager skill path

## Scenario: initialize a workspace and launch with a home-relative skill path

Given a temporary real workspace and the current Project Manager skill under the current user's home directory

When `project-init-workspace.js` initializes a direct-child project

Then `.projects` contains `.env.local`, `.gitignore`, executable `studio.sh`, and `studio.cmd`

And `.env.local` contains exactly one managed `PROJECT_MANAGER_SKILL_PATH` beginning with `~/`

When `./.projects/studio.sh --no-open` is executed

Then Studio resolves from the configured skill, binds to loopback, and starts for that workspace catalog

And a request without the generated token is rejected

And a request with the generated token succeeds

## Scenario: preserve strict configuration parsing

Given a generated POSIX launcher and controlled local configuration variants

When the managed value is `~/...` and `$HOME` is an absolute directory containing the skill

Then the configured Studio script executes with forwarded arguments and exit status

When `$HOME` is relative, the managed value is an ordinary relative path, the key is missing or duplicated, or the configured Studio script is unavailable

Then the launcher exits with a diagnostic and does not use an inherited skill path or another fallback

## Scenario: preserve unrelated local configuration

Given an existing `.projects/.env.local` containing unrelated keys and one stale managed path

When another project is initialized in the same workspace

Then unrelated lines remain byte-for-byte intact

And exactly one canonical `PROJECT_MANAGER_SKILL_PATH` replaces the stale managed line

## Scenario: upgrade the previously published projects-root launchers

Given `.projects/studio.sh` and `.projects/studio.cmd` contain the exact bytes published before home-relative support

When another project is initialized in that workspace

Then both launchers are replaced transactionally with the current canonical assets

And an unrelated file at either launcher path is still refused as an operator-owned conflict
