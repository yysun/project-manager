# Generic Test Manager Runner Verification

## Cases

1. A ready Case rendered through `prompt <case-id>` uses the project-owned `RUNNER_PROMPT.md` in CLI,
   JSON, core, and Studio projections.
2. `--profile goal-based-ui` fails as an unknown option and leaves the test root byte-identical.
3. Initialization creates the same managed-root inventory as before.
4. The standalone copied skill validates, renders its ordinary prompt, protects Studio/API access,
   and appends evidence-backed Runs.
5. The root plugin package contains no execution-profile asset or reference.

## Gate

The change passes only when the root package validates, the complete test suite and both skill quick
validators pass, the standalone Test Manager Studio/API smoke passes, and the rebuilt plugin is
refreshed as one complete installation.
