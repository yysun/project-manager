// Responsibility: report validated plugin and independently versioned bundled-skill identities.
// Failure behavior: source, generated-artifact, or Test Manager metadata drift fails closed.
// Recent change: reject stale standalone Studio, MCP, and embedded-App release artifacts.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGeneratedVersionConsistency, readTestManagerMetadata } from './versioning.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const [version, testManager] = await Promise.all([
    assertGeneratedVersionConsistency(root),
    readTestManagerMetadata(root),
  ]);
  console.log(`Project Manager release version ${version}`);
  console.log(`Test Manager standalone version ${testManager.version} (${testManager.source})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
