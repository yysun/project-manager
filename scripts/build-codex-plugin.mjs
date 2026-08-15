// Adapt the portable Agent Plugin into a separate Codex package. Client-specific
// metadata never enters dist/plugin, so the portable package remains conformant.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portable = path.join(root, 'dist/plugin');
const out = path.join(root, 'dist/codex-plugin/project-manager');
const config = path.join(root, 'config/codex-plugin');

for (const required of [
  path.join(portable, 'plugin.json'),
  path.join(portable, 'mcp.json'),
  path.join(portable, 'skills/project-manager/SKILL.md'),
  path.join(portable, 'bin/project-manager-mcp.mjs'),
  path.join(config, 'plugin.json'),
  path.join(config, 'mcp.json'),
]) {
  try { await fs.access(required); } catch {
    throw new Error(`Cannot build the Codex plugin: ${path.relative(root, required)} is missing.`);
  }
}

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, '.codex-plugin'), { recursive: true });
await fs.cp(portable, out, { recursive: true });

// Codex discovers these companion manifests instead of the portable root
// manifests, so the client package carries only one active metadata contract.
await fs.rm(path.join(out, 'plugin.json'));
await fs.rm(path.join(out, 'mcp.json'));
await fs.copyFile(path.join(config, 'plugin.json'), path.join(out, '.codex-plugin/plugin.json'));
await fs.copyFile(path.join(config, 'mcp.json'), path.join(out, '.mcp.json'));

console.log(`codex plugin -> ${path.relative(root, out)}`);
