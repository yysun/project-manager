// Build the portable Agent Plugin in place. The repository root is the plugin
// root, so Git clients can install it without a generated package directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = path.join(root, 'skills/project-manager');
const mcpApp = path.join(root, 'src/project-manager-studio/mcp-app');

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

await fs.rm(path.join(root, 'bin'), { recursive: true, force: true });
await fs.rm(path.join(root, 'ui'), { recursive: true, force: true });
await fs.mkdir(path.join(root, 'bin'), { recursive: true });
await fs.mkdir(path.join(root, 'ui'), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src/mcp-app/cli.ts')],
  outfile: path.join(root, 'bin/project-manager-mcp.mjs'),
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
await fs.chmod(path.join(root, 'bin/project-manager-mcp.mjs'), 0o755);

for (const entry of ['status.html', 'board.html']) {
  await viteBuild({
    configFile: false,
    root: mcpApp,
    base: './',
    plugins: [react(), viteSingleFile()],
    logLevel: 'info',
    build: {
      outDir: path.join(root, 'ui'),
      emptyOutDir: false,
      rollupOptions: { input: path.join(mcpApp, entry) },
    },
  });
}

console.log('agent plugin -> repository root');
