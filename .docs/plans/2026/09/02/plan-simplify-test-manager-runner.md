# Simplify Test Manager Runner Policy

1. Remove `goal-based-ui` argument parsing, rendering branches, assets, and reference material.
2. Keep `RUNNER_PROMPT.md` and Runner Instructions as the only project execution-policy surface.
3. Replace profile tests with a non-mutation rejection test and preserve ordinary prompt coverage.
4. Update package inventory and standalone smoke coverage.
5. Rebuild, run the full suite, validate both skills, run the standalone Studio/API smoke test, and
   refresh the complete local plugin installation.
