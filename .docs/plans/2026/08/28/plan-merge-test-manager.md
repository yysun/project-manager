# Plan: Merge Test Manager into the Project Manager plugin

## Goal

Ship Test Manager as a canonical sibling skill in the Project Manager Agent Plugin while preserving
the independent installation and runtime contracts of both skills.

## Current Context and Decisions

- The root Agent Plugin already discovers immediate child directories of `skills/` that contain a
  `SKILL.md`; no second plugin manifest or generated plugin tree is needed.
- Test Manager is a complete, dependency-free runtime under its existing `skills/test-manager`
  directory. Its JavaScript, HTML, and CSS are directly runnable, so a parallel `src/test-manager`
  tree would create needless source/artifact duplication.
- The imported directory becomes canonical. The former repository remains untouched by this story;
  archival or one-way mirror publication is an explicit follow-up because it changes external state.
- The plugin release moves from `1.10.0` to `1.11.0`. Project Manager's skill and MCP runtime continue
  to follow that plugin version. Test Manager records its independent `0.1.0` version.
- Test Manager Studio remains its local loopback-only application. The existing Project Manager MCP
  server and embedded views remain Project Manager-only.
- Test Manager's independent identity is stored as string-valued `metadata.version` and
  `metadata.source` fields in its own `SKILL.md`. `version:check` validates and reports it but the
  Project Manager release bump updates only `plugin.json`, Project Manager's `SKILL.md`, and the MCP
  runtime constant. A versioning regression test proves that separation.
- Skill selection uses mutually exclusive boundaries in frontmatter and body text: Project Manager
  owns delivery coordination and `.projects`, not QA case/run execution; Test Manager owns QA
  design/execution/evidence and `.tests`, not product-delivery coordination.
- The existing Test Manager root CLI wrappers are repository conveniences, not part of the complete
  standalone skill. The merged package will expose direct npm scripts and the skill's generated
  workspace launchers instead of adding files that Project Manager's plugin build deletes from `bin/`.

## Tasks

- [x] Import the complete current `test-manager/skills/test-manager` tree into
  `project-manager/skills/test-manager`, then add independent version/source metadata and explicit
  cross-skill ownership boundaries without changing Test Manager state or runtime behavior. Pin the
  reviewed `da771c8` installable file inventory and executable modes in package tests.
- [x] Update `package.json`, `scripts/build-plugin.mjs`, package tests, and repository instructions so
  builds require both skills, `npm test` executes both suites, syntax checks are available, and
  installed-plugin/standalone-skill synchronization rules cover both complete installable units.
- [x] Extend version checking and its tests to validate/report Test Manager `0.1.0` independently and
  prove a Project Manager release bump leaves that version unchanged.
- [x] Update English and Chinese package documentation, plugin metadata, skill documentation, and
  `CHANGELOG.md` for the root-plugin and two standalone installation modes.
- [x] Run the supported release-version command for `1.11.0`, rebuild committed plugin artifacts, and
  confirm release-bearing files stay consistent.
- [x] Run focused source syntax checks and both skill quick validators.
- [x] Run all Project Manager and Test Manager unit/integration suites through `npm test`.
- [x] Add and execute a reusable standalone smoke harness for
  `.docs/tests/test-merge-test-manager.md`. It must copy only `skills/test-manager` to an isolated
  install directory, run CLI and generated-launcher behavior there, inspect the actual listening
  socket, prove an unauthorized run write is rejected without changing `RUNS.md`, and append two
  authorized runs referring to a real disposable evidence artifact.
- [x] Review the final package and verify every requirement criterion against repository and command
  evidence.

RPD completion documentation and the story-only commit follow a passing VR. They are not AP
implementation tasks and cannot be prerequisites for the VR gate that authorizes them.

## Validation

- `npm run check:syntax`
- `python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/project-manager`
- `python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/test-manager`
- `npm test`
- Execute `.docs/tests/test-merge-test-manager.md` in a disposable workspace.
- `npm run version:check`
- Inspect `git diff --check`, root package inventory, and release-bearing file versions.

## Risk

Non-low. The change expands a public plugin distribution and standalone installation contract. The
main risks are incomplete source import, ambiguous skill routing, release-version drift, accidentally
coupling Test Manager to Project Manager runtime state, and weakening Studio or evidence invariants.
Before release, rollback is a single story revert because no managed `.projects` or `.tests` schema
changes. After installation or publication, rollback must be a roll-forward or a standalone-skill
reinstall followed by refreshed generated launchers/skill paths; an already published `1.11.0`
cannot be semantically replaced by republishing `1.10.0`.
