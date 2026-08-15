// Assembles the Agent Plugins 1.0 package: the standard's fixed root layout of
// plugin.json, mcp.json, and skills/, carrying the installable skill and the
// packaged MCP server. Repository sources, tests, and dev tooling stay out, so
// installing the plugin never drags the build toolchain onto a user's machine.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist/agent-plugin');
const manifests = path.join(root, 'src/mcp-app/plugin');
const skill = path.join(root, 'skills/project-manager');

// The skill directory doubles as the repository's test home; the plugin ships
// the runtime only.
const EXCLUDED = new Set(['tests', 'node_modules', '.DS_Store']);

async function copySkill(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copySkill(source, target);
    else if (entry.isFile()) await fs.copyFile(source, target);
  }
}

async function required(file) {
  try { await fs.access(file); } catch {
    throw new Error(`Cannot package the Agent Plugin: ${path.relative(root, file)} is missing. Run the full build first.`);
  }
}

await required(path.join(skill, 'SKILL.md'));
await required(path.join(skill, 'scripts/project-manager-mcp.js'));
await required(path.join(skill, 'mcp-app/status.html'));
await required(path.join(skill, 'mcp-app/board.html'));

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.copyFile(path.join(manifests, 'plugin.json'), path.join(out, 'plugin.json'));
await fs.copyFile(path.join(manifests, 'mcp.json'), path.join(out, 'mcp.json'));
await copySkill(skill, path.join(out, 'skills/project-manager'));

const license = path.join(root, 'LICENSE');
try { await fs.copyFile(license, path.join(out, 'LICENSE')); } catch { /* optional per the spec */ }

console.log(`agent plugin -> ${path.relative(root, out)}`);
