// Responsibility: expose the explicit unified plugin release-version operation.
// Scope: update the plugin, Project Manager, Test Manager, and MCP App runtime together.
// Recent change: bring both bundled skills under the same release number.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setReleaseVersion } from './versioning.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.length !== 1) {
  console.error('Usage: npm run release:version -- <semver>');
  process.exitCode = 2;
} else {
  try {
    const result = await setReleaseVersion(root, args[0]);
    console.log(`Unified release ${result.previous} -> ${result.version}`);
    console.log('Next: update CHANGELOG.md, run npm test, then sync the plugin or affected standalone skills.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
