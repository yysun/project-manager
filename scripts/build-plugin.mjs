// Assemble the portable runtime package. Source, tests, and build tooling stay
// in the repository; the package contains only manifests and runtime artifacts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist/plugin');
const skill = path.join(root, 'skills/project-manager');
const mcpApp = path.join(root, 'src/project-manager-studio/mcp-app');

// The repository's skill directory also holds its test suite and user guides.
// Neither is read by the agent at runtime.
const EXCLUDED_SKILL_PATHS = new Set([
  'tests',
  'README.md',
  'README-cn.md',
  'assets/project-manager-ai-employee-en.png',
  'assets/project-manager-ai-employee-zh-cn.png',
]);

async function copyRuntime(from, to, excluded = new Set(), relative = '') {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const relativePath = path.posix.join(relative, entry.name);
    if (entry.name === '.DS_Store' || excluded.has(relativePath)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyRuntime(source, target, excluded, relativePath);
    else if (entry.isFile()) await fs.copyFile(source, target);
  }
}

async function required(file) {
  try { await fs.access(file); } catch {
    throw new Error(`Cannot package the Agent Plugin: ${path.relative(root, file)} is missing.`);
  }
}

await Promise.all([
  required(path.join(root, 'plugin.json')),
  required(path.join(root, 'mcp.json')),
  required(path.join(skill, 'SKILL.md')),
  required(path.join(root, 'src/mcp-app/cli.ts')),
  required(path.join(mcpApp, 'status.html')),
  required(path.join(mcpApp, 'board.html')),
]);

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

// Agent Plugins 1.0 portable manifests.
await fs.copyFile(path.join(root, 'plugin.json'), path.join(out, 'plugin.json'));
await fs.copyFile(path.join(root, 'mcp.json'), path.join(out, 'mcp.json'));

await copyRuntime(skill, path.join(out, 'skills/project-manager'), EXCLUDED_SKILL_PATHS);

await esbuild.build({
  entryPoints: [path.join(root, 'src/mcp-app/cli.ts')],
  outfile: path.join(out, 'bin/project-manager-mcp.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // The skill runtime is CommonJS and is bundled into an ESM executable. Give
  // esbuild's compatibility wrapper a real Node require for builtin modules.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
await fs.chmod(path.join(out, 'bin/project-manager-mcp.mjs'), 0o755);

for (const entry of ['status.html', 'board.html']) {
  await viteBuild({
    configFile: false,
    root: mcpApp,
    base: './',
    plugins: [react(), viteSingleFile()],
    logLevel: 'info',
    build: {
      outDir: path.join(out, 'ui'),
      emptyOutDir: false,
      rollupOptions: { input: path.join(mcpApp, entry) },
    },
  });
}

const license = path.join(root, 'LICENSE');
try { await fs.copyFile(license, path.join(out, 'LICENSE')); } catch { /* optional */ }

console.log(`agent plugin -> ${path.relative(root, out)}`);
