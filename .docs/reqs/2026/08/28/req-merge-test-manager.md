# Merge Test Manager into the Project Manager plugin

## Problem

Project Manager and Test Manager are maintained as separate repositories even though Project
Manager's Agent Plugin package already discovers sibling skills from its root `skills/` directory.
The separation makes the plugin incomplete for project delivery, duplicates release and installation
work, and leaves no single package that can coordinate projects while retaining a specialized QA
operating model.

The merge must not collapse Test Manager into the Project Manager skill. They have different state,
triggering, authority, and evidence contracts. It must also not trade away Test Manager's standalone
installation or its loopback-only, token-protected Studio.

## Requirement

Move the complete Test Manager installable source into the Project Manager repository as the sibling
skill `skills/test-manager`. The Project Manager repository root becomes the canonical source and
Agent Plugin package for both skills. Each skill remains a self-contained, independently installable
unit, while installing the root plugin exposes both.

The merged repository must test and validate both skills, document the three supported installation
modes, distinguish their operating boundaries, and release the added plugin capability as Project
Manager `1.11.0` without coupling Test Manager's own skill version to the plugin version.

## Acceptance Criteria

- [x] `skills/project-manager` and `skills/test-manager` are both complete immediate-child skills in
  the root Agent Plugin package, and package validation explicitly requires both.
- [x] `skills/test-manager` contains the complete runnable Test Manager skill—contract, metadata,
  templates, references, scripts, UI, launchers, and tests—with no runtime dependency on the former
  Test Manager repository or on `skills/project-manager`.
- [x] Test Manager declares string-valued `metadata.version: "0.1.0"` and
  `metadata.source: "https://github.com/yysun/project-manager/tree/main/skills/test-manager"` in its
  `SKILL.md`; version checks validate and report that identity without coupling it to the plugin,
  Project Manager skill, or MCP runtime version.
- [x] Test Manager preserves its managed-root, design-state versus execution-result, append-only run
  history, evidence, loopback binding, and API token invariants.
- [x] Project Manager and Test Manager descriptions and documentation make their ownership boundary
  explicit enough to prevent generic project work and QA execution from being routed to the wrong
  skill.
- [x] Documentation distinguishes root-plugin installation (both skills plus the Project Manager MCP
  App), standalone Project Manager skill installation, and standalone Test Manager skill installation.
- [x] Project Manager's build/package checks verify both skills without treating Test Manager Studio
  as an embedded MCP App or deleting its runtime artifacts.
- [x] The repository test command runs Project Manager tests and Test Manager tests, and both
  installable skill directories pass the skill quick validator.
- [x] A temporary-workspace Test Manager CLI and Studio/API smoke test proves the merged installed
  path works, Studio is loopback-only and token-protected, and a validator-compliant evidence-backed
  run can be appended without rewriting history.
- [x] The plugin, Project Manager skill, MCP runtime, generated plugin artifacts, changelog, and package
  documentation consistently identify the new plugin release as `1.11.0`; Test Manager retains its
  independent `0.1.0` identity.

Completion documentation and the story-only commit follow a passing VR under the requested RPD
workflow; they are delivery stages, not acceptance prerequisites for VR.

## Constraints

- `project-manager/skills/test-manager` is the only editable canonical Test Manager source after the
  merge; do not create a copied generated plugin tree or a second in-repository skill copy.
- Keep both skills independently usable. Test Manager must not require Project Manager project state,
  its MCP server, or its Studio.
- Do not weaken either repository's validation, security, evidence, or append-only-history rules.
- Preserve the current Test Manager source behavior; this story changes packaging and ownership, not
  its testing schema or workflow.
- Pin import completeness to the installable file inventory and executable modes reviewed at Test
  Manager commit `da771c8`, allowing only the planned skill metadata and routing changes.
- Preserve unrelated user-authored changes and files.

## Non-Goals

- Embedding Test Manager Studio or a Test Manager dashboard into the Project Manager MCP App.
- Combining `.projects` and `.tests` schemas or making one state tree authoritative for the other.
- Automatically archiving, deleting, publishing, or force-updating the existing GitHub
  `yysun/test-manager` repository.
- Building a two-way synchronization mechanism between repositories.
- Redesigning either Studio or adding new testing features.

## Open Questions

None.
