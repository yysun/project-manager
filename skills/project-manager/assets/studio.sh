#!/bin/sh
# Responsibility: launch Project Manager Studio from workspace-local configuration.
# Invariants: never source configuration, never use an inherited skill path, and preserve Studio arguments and status.

unset PROJECT_MANAGER_SKILL_PATH
project_manager_skill_path_count=0
project_manager_cr=$(printf '\r')
project_manager_workspace=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || exit 1
project_manager_env="$project_manager_workspace/.projects/.env.local"

if [ -L "$project_manager_env" ] || [ ! -f "$project_manager_env" ]; then
  echo "Project Manager Studio: missing $project_manager_env" >&2
  exit 2
fi

while IFS= read -r project_manager_line || [ -n "$project_manager_line" ]; do
  project_manager_line=${project_manager_line%"$project_manager_cr"}
  case "$project_manager_line" in
    PROJECT_MANAGER_SKILL_PATH=*)
      project_manager_skill_path_count=$((project_manager_skill_path_count + 1))
      PROJECT_MANAGER_SKILL_PATH=${project_manager_line#*=}
      ;;
  esac
done < "$project_manager_env"

if [ "$project_manager_skill_path_count" -ne 1 ] || [ -z "$PROJECT_MANAGER_SKILL_PATH" ]; then
  echo "Project Manager Studio: .projects/.env.local must contain exactly one non-empty PROJECT_MANAGER_SKILL_PATH" >&2
  exit 2
fi

case "$PROJECT_MANAGER_SKILL_PATH" in
  /*) ;;
  *)
    echo "Project Manager Studio: PROJECT_MANAGER_SKILL_PATH must be absolute" >&2
    exit 2
    ;;
esac

project_manager_studio="$PROJECT_MANAGER_SKILL_PATH/scripts/project-manager-studio.js"
if [ -L "$project_manager_studio" ] || [ ! -f "$project_manager_studio" ]; then
  echo "Project Manager Studio: configured script is missing: $project_manager_studio" >&2
  exit 2
fi

cd -- "$project_manager_workspace" || exit 1
exec node "$project_manager_studio" "$@"
