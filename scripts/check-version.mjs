// Responsibility: report the validated release shared by the plugin and both bundled skills.
// Failure behavior: source, generated-artifact, or cross-package version drift fails closed.
// Recent change: report Test Manager as part of the unified release identity.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGeneratedVersionConsistency, readTestManagerMetadata } from './versioning.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const [version, testManager] = await Promise.all([
    assertGeneratedVersionConsistency(root),
    readTestManagerMetadata(root),
  ]);
  console.log(`Unified release version ${version}`);
  console.log(`Project Manager ${version}`);
  console.log(`Test Manager ${testManager.version} (${testManager.source})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
