# E2E: Merged Test Manager standalone runtime

## Scenario: initialize from the merged skill and launch its generated Studio helper

Given only the canonical `project-manager/skills/test-manager` directory has been copied to an
isolated disposable installation location outside the repository

When the merged Test Manager CLI initializes `.tests` and creates a suite

Then the root validates successfully

And `.tests/.env.local` identifies the isolated standalone skill path

And generated `studio.sh --help` resolves the merged Studio script successfully

## Scenario: preserve Studio API protection

Given Studio is launched on an ephemeral port against the disposable initialized root

When `/api/state` is requested without the generated bearer token

Then the response is `401`

And the Studio server's actual listening address is `127.0.0.1`

When `/api/run` is posted without the generated bearer token

Then the response is `401`

And `RUNS.md` remains byte-identical

When `/api/state` is requested with the generated bearer token

Then the response is `200` and identifies the initialized test root

And the advertised host is loopback-only

## Scenario: record an evidence-backed pass without rewriting history

Given the disposable suite contains one validator-compliant READY case and a real suite-local
evidence artifact

When Studio's authorized run API appends a PASS with build, environment, data, executor, execution
time, and evidence

Then the response succeeds with the first immutable Run ID

And validation reports one passed case

When a second evidence-backed PASS is appended as a retest

Then the response succeeds with a different Run ID

And `RUNS.md` retains both run rows in order and both reference the retained evidence artifact

And no case-state edit is used to manufacture either PASS
