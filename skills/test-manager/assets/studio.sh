#!/bin/sh
# Responsibility: launch Test Manager Studio from test-root-local configuration.
# Invariants: never source configuration, expand only leading ~/, and preserve Studio arguments and status.

unset TEST_MANAGER_SKILL_PATH
test_manager_skill_path_count=0
test_manager_cr=$(printf '\r')
test_manager_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || exit 1
test_manager_workspace=$(CDPATH= cd -- "$test_manager_root/.." && pwd -P) || exit 1
test_manager_env="$test_manager_root/.env.local"

if [ -L "$test_manager_env" ] || [ ! -f "$test_manager_env" ]; then
  echo "Test Manager Studio: missing $test_manager_env" >&2
  exit 2
fi

while IFS= read -r test_manager_line || [ -n "$test_manager_line" ]; do
  test_manager_line=${test_manager_line%"$test_manager_cr"}
  case "$test_manager_line" in
    TEST_MANAGER_SKILL_PATH=*)
      test_manager_skill_path_count=$((test_manager_skill_path_count + 1))
      TEST_MANAGER_SKILL_PATH=${test_manager_line#*=}
      ;;
  esac
done < "$test_manager_env"

if [ "$test_manager_skill_path_count" -ne 1 ] || [ -z "$TEST_MANAGER_SKILL_PATH" ]; then
  echo "Test Manager Studio: $test_manager_env must contain exactly one non-empty TEST_MANAGER_SKILL_PATH" >&2
  exit 2
fi

case "$TEST_MANAGER_SKILL_PATH" in
  "~/"*)
    test_manager_home=${HOME-}
    case "$test_manager_home" in
      /*) TEST_MANAGER_SKILL_PATH="$test_manager_home/${TEST_MANAGER_SKILL_PATH#??}" ;;
      *)
        echo "Test Manager Studio: HOME must be absolute when TEST_MANAGER_SKILL_PATH starts with ~/" >&2
        exit 2
        ;;
    esac
    ;;
  /*) ;;
  *)
    echo "Test Manager Studio: TEST_MANAGER_SKILL_PATH must be absolute or start with ~/" >&2
    exit 2
    ;;
esac

test_manager_studio="$TEST_MANAGER_SKILL_PATH/scripts/test-manager-studio.mjs"
if [ -L "$test_manager_studio" ] || [ ! -f "$test_manager_studio" ]; then
  echo "Test Manager Studio: configured script is missing: $test_manager_studio" >&2
  exit 2
fi

cd -- "$test_manager_workspace" || exit 1
exec node "$test_manager_studio" --root "$test_manager_root" "$@"
