@echo off
rem Responsibility: launch Project Manager Studio from workspace-local configuration.
rem Invariants: never inherit a skill path, never execute configuration, and preserve Studio arguments and status.
setlocal
set "PROJECT_MANAGER_SKILL_PATH="
set "PROJECT_MANAGER_SKILL_PATH_COUNT=0"
set "PROJECT_MANAGER_ENV=%~dp0.env.local"

if not exist "%PROJECT_MANAGER_ENV%" (
  >&2 echo Project Manager Studio: missing %PROJECT_MANAGER_ENV%
  exit /b 2
)

for /f "usebackq tokens=1,* delims==" %%A in ("%PROJECT_MANAGER_ENV%") do (
  if "%%A"=="PROJECT_MANAGER_SKILL_PATH" (
    set /a PROJECT_MANAGER_SKILL_PATH_COUNT+=1 >nul
    set "PROJECT_MANAGER_SKILL_PATH=%%B"
  )
)

if not "%PROJECT_MANAGER_SKILL_PATH_COUNT%"=="1" (
  >&2 echo Project Manager Studio: %PROJECT_MANAGER_ENV% must contain exactly one PROJECT_MANAGER_SKILL_PATH
  exit /b 2
)
if not defined PROJECT_MANAGER_SKILL_PATH (
  >&2 echo Project Manager Studio: PROJECT_MANAGER_SKILL_PATH must not be empty
  exit /b 2
)

if "%PROJECT_MANAGER_SKILL_PATH:~0,2%"=="\\" goto project_manager_absolute
if "%PROJECT_MANAGER_SKILL_PATH:~1,2%"==":\" goto project_manager_absolute
if "%PROJECT_MANAGER_SKILL_PATH:~1,2%"==":/" goto project_manager_absolute
>&2 echo Project Manager Studio: PROJECT_MANAGER_SKILL_PATH must be absolute
exit /b 2

:project_manager_absolute
set "PROJECT_MANAGER_STUDIO=%PROJECT_MANAGER_SKILL_PATH%\scripts\project-manager-studio.js"
if not exist "%PROJECT_MANAGER_STUDIO%" (
  >&2 echo Project Manager Studio: configured script is missing: %PROJECT_MANAGER_STUDIO%
  exit /b 2
)
if exist "%PROJECT_MANAGER_STUDIO%\NUL" (
  >&2 echo Project Manager Studio: configured script is not a regular file: %PROJECT_MANAGER_STUDIO%
  exit /b 2
)

cd /d "%~dp0.." || exit /b 1
node "%PROJECT_MANAGER_STUDIO%" %*
set "PROJECT_MANAGER_STUDIO_EXIT=%ERRORLEVEL%"
exit /b %PROJECT_MANAGER_STUDIO_EXIT%
