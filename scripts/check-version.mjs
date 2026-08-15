import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertVersionConsistency } from './versioning.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const version = await assertVersionConsistency(root);
  console.log(`Project Manager release version ${version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
