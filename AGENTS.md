# Repository Instructions

## Plugin installation sync

- The Codex plugin is the active installation. Do not recreate the standalone
  `~/.agents/skills/project-manager/` copy while the plugin is installed; duplicate skill identities
  have undefined precedence.
- After an edit that affects `skills/project-manager/`, rebuild the Codex package, sync the complete
  `dist/codex-plugin/project-manager/` directory to `~/plugins/project-manager/`, update its cachebuster,
  and reinstall it from the personal marketplace before considering the work complete.
- Sync complete directories, not only edited files, so removed and generated files do not leave the
  installed plugin stale.
