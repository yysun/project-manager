@echo off
rem Responsibility: launch Test Manager Studio from test-root-local configuration.
rem Invariants: never execute configuration, expand only leading ~/ or ~\, and preserve Studio arguments and status.
setlocal
set "TEST_MANAGER_SKILL_PATH="
set "TEST_MANAGER_SKILL_PATH_COUNT=0"
set "TEST_MANAGER_ROOT=%~dp0"
set "TEST_MANAGER_ENV=%~dp0.env.local"

if not exist "%TEST_MANAGER_ENV%" (
  >&2 echo Test Manager Studio: missing %TEST_MANAGER_ENV%
  exit /b 2
)

for /f "usebackq tokens=1,* delims==" %%A in ("%TEST_MANAGER_ENV%") do (
  if "%%A"=="TEST_MANAGER_SKILL_PATH" (
    set /a TEST_MANAGER_SKILL_PATH_COUNT+=1 >nul
    set "TEST_MANAGER_SKILL_PATH=%%B"
  )
)

if not "%TEST_MANAGER_SKILL_PATH_COUNT%"=="1" (
  >&2 echo Test Manager Studio: %TEST_MANAGER_ENV% must contain exactly one TEST_MANAGER_SKILL_PATH
  exit /b 2
)
if not defined TEST_MANAGER_SKILL_PATH (
  >&2 echo Test Manager Studio: TEST_MANAGER_SKILL_PATH must not be empty
  exit /b 2
)

if "%TEST_MANAGER_SKILL_PATH:~0,2%"=="~/" goto test_manager_home
if "%TEST_MANAGER_SKILL_PATH:~0,2%"=="~\" goto test_manager_home
goto test_manager_validate_absolute

:test_manager_home
if not defined USERPROFILE (
  >&2 echo Test Manager Studio: USERPROFILE is required when TEST_MANAGER_SKILL_PATH starts with ~/
  exit /b 2
)
set "TEST_MANAGER_SKILL_PATH=%USERPROFILE%\%TEST_MANAGER_SKILL_PATH:~2%"

:test_manager_validate_absolute
if "%TEST_MANAGER_SKILL_PATH:~0,2%"=="\\" goto test_manager_absolute
if "%TEST_MANAGER_SKILL_PATH:~1,2%"==":\" goto test_manager_absolute
if "%TEST_MANAGER_SKILL_PATH:~1,2%"==":/" goto test_manager_absolute
>&2 echo Test Manager Studio: TEST_MANAGER_SKILL_PATH must be absolute or start with ~/
exit /b 2

:test_manager_absolute
set "TEST_MANAGER_STUDIO=%TEST_MANAGER_SKILL_PATH%\scripts\test-manager-studio.mjs"
if not exist "%TEST_MANAGER_STUDIO%" (
  >&2 echo Test Manager Studio: configured script is missing: %TEST_MANAGER_STUDIO%
  exit /b 2
)
if exist "%TEST_MANAGER_STUDIO%\NUL" (
  >&2 echo Test Manager Studio: configured script is not a regular file: %TEST_MANAGER_STUDIO%
  exit /b 2
)

cd /d "%~dp0.." || exit /b 1
node "%TEST_MANAGER_STUDIO%" --root "%TEST_MANAGER_ROOT%" %*
set "TEST_MANAGER_STUDIO_EXIT=%ERRORLEVEL%"
exit /b %TEST_MANAGER_STUDIO_EXIT%
