#!/usr/bin/env node
/* Starts Test Manager Studio against an explicit root or a fresh disposable
   demo, mirroring Project Manager Studio's zero-setup development entrypoint. */

import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureScript = join(
  repositoryRoot,
  "tests/test-manager/create-browser-fixture.mjs",
);
const studioScript = join(
  repositoryRoot,
  "skills/test-manager/scripts/test-manager-studio.mjs",
);
const passedArgs = process.argv.slice(2);
const bypassDemo =
  passedArgs.includes("--root") ||
  passedArgs.includes("--help") ||
  passedArgs.includes("-h");
let disposableWorkspace = null;

function createDisposableDemo() {
  const result = spawnSync(process.execPath, [fixtureScript], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail =
      result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`;
    throw new Error(`Could not create the Test Manager Studio demo: ${detail}`);
  }
  let fixture;
  try {
    fixture = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(
      "Could not create the Test Manager Studio demo: fixture output was not valid JSON",
    );
  }
  if (!fixture.root || !fixture.workspace) {
    throw new Error(
      "Could not create the Test Manager Studio demo: test root was missing",
    );
  }
  disposableWorkspace = fixture.workspace;
  return fixture.root;
}

function cleanup() {
  if (!disposableWorkspace) return;
  const resolved = resolve(disposableWorkspace);
  const temporaryPrefix = `${realpathSync(tmpdir())}/`;
  const marker = join(resolved, ".test-manager-demo-v1");
  if (
    resolved.startsWith(temporaryPrefix) &&
    basename(resolved).startsWith("tm-studio-") &&
    existsSync(marker) &&
    readFileSync(marker, "utf8") === "Test Manager Studio demo v1\n"
  ) {
    rmSync(resolved, { recursive: true });
  }
  disposableWorkspace = null;
}

const serverArgs = bypassDemo
  ? passedArgs
  : ["--root", createDisposableDemo(), ...passedArgs];
const child = spawn(process.execPath, [studioScript, ...serverArgs], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.once("error", (error) => {
  cleanup();
  console.error(`tm-studio:dev: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  cleanup();
  if (signal && !stopping) console.error(`tm-studio:dev: exited on ${signal}`);
  process.exit(code ?? (signal ? 1 : 0));
});
