// Responsibility: validate and update the plugin, both skills, and runtime release version atomically.
// Version boundary: Project Manager, Test Manager, and the plugin ship under one release version.
// Recent change: include Test Manager metadata and body in lockstep release updates.

import fs from 'node:fs/promises';
import path from 'node:path';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const FILES = {
  plugin: 'plugin.json',
  skill: 'skills/project-manager/SKILL.md',
  testManager: 'skills/test-manager/SKILL.md',
  runtime: 'src/version.ts',
};

const SKILL_VERSION = /^\*\*Version:\*\* `([^`]+)`$/m;
const RUNTIME_VERSION = /^export const PROJECT_MANAGER_VERSION = '([^']+)' as const;$/m;
const PLUGIN_VERSION = /^(\s*"version"\s*:\s*")([^"]+)("\s*,?\s*)$/m;
const TEST_MANAGER_FILE = 'skills/test-manager/SKILL.md';
const TEST_MANAGER_VERSION = /^  version:\s*"([^"]+)"\s*$/m;
const TEST_MANAGER_SOURCE = /^  source:\s*"([^"]+)"\s*$/m;
const EXPECTED_TEST_MANAGER_SOURCE = 'https://github.com/yysun/project-manager/tree/main/skills/test-manager';

function oneMatch(text, pattern, label) {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  const matches = [...text.matchAll(global)];
  if (matches.length !== 1) throw new Error(`${label} must contain exactly one matching metadata value.`);
  return matches[0][1];
}

function validVersion(version) {
  if (!SEMVER.test(version)) throw new Error(`Invalid semantic version: ${JSON.stringify(version)}`);
  return version;
}

async function readFiles(root) {
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, relative]) => {
    const file = path.join(root, relative);
    return [key, { file, relative, text: await fs.readFile(file, 'utf8') }];
  }));
  return Object.fromEntries(entries);
}

function versionsFrom(files) {
  let manifest;
  try { manifest = JSON.parse(files.plugin.text); } catch (error) {
    throw new Error(`plugin.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    plugin: validVersion(manifest.version),
    skill: validVersion(oneMatch(files.skill.text, SKILL_VERSION, files.skill.relative)),
    testManager: testManagerMetadataFrom(files.testManager).version,
    runtime: validVersion(oneMatch(files.runtime.text, RUNTIME_VERSION, files.runtime.relative)),
  };
}

function testManagerMetadataFrom(file) {
  const version = validVersion(oneMatch(file.text, TEST_MANAGER_VERSION, file.relative));
  const bodyVersion = validVersion(oneMatch(file.text, SKILL_VERSION, file.relative));
  if (bodyVersion !== version) {
    throw new Error(`${file.relative} version drift: metadata is ${version}; body is ${bodyVersion}.`);
  }
  const source = oneMatch(file.text, TEST_MANAGER_SOURCE, file.relative);
  if (source !== EXPECTED_TEST_MANAGER_SOURCE) {
    throw new Error(`${file.relative} source must be ${EXPECTED_TEST_MANAGER_SOURCE}.`);
  }
  return { version, source };
}

export async function readReleaseVersions(root) {
  return versionsFrom(await readFiles(root));
}

export async function readTestManagerMetadata(root) {
  const file = path.join(root, TEST_MANAGER_FILE);
  const text = await fs.readFile(file, 'utf8');
  return testManagerMetadataFrom({ file, relative: TEST_MANAGER_FILE, text });
}

export async function assertVersionConsistency(root) {
  const versions = await readReleaseVersions(root);
  const expected = versions.plugin;
  const drift = Object.entries(versions).filter(([, version]) => version !== expected);
  if (drift.length > 0) {
    throw new Error(`Release version drift: plugin.json is ${expected}; ${drift.map(([name, version]) => `${name} is ${version}`).join('; ')}. Run npm run release:version -- <semver>.`);
  }
  return expected;
}

export async function assertGeneratedVersionConsistency(root) {
  const expected = await assertVersionConsistency(root);
  const studioAssets = path.join(root, 'skills/project-manager/studio/dist/assets');
  const studioEntries = (await fs.readdir(studioAssets, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^index-.*\.js$/.test(entry.name));
  if (studioEntries.length !== 1) {
    throw new Error(`Expected exactly one generated Project Manager Studio index asset; found ${studioEntries.length}. Run npm run build.`);
  }
  const generated = [
    'bin/project-manager-mcp.mjs',
    'ui/status.html',
    'ui/board.html',
    path.join('skills/project-manager/studio/dist/assets', studioEntries[0].name),
  ];
  for (const relative of generated) {
    const text = await fs.readFile(path.join(root, relative), 'utf8');
    if (!text.includes(expected)) {
      throw new Error(`Generated artifact ${relative} does not contain Project Manager release ${expected}. Run npm run build.`);
    }
  }
  return expected;
}

function replaceOne(text, pattern, replacement, label) {
  oneMatch(text, pattern, label);
  return text.replace(pattern, replacement);
}

function replacePluginVersion(text, version, label) {
  const global = new RegExp(PLUGIN_VERSION.source, `${PLUGIN_VERSION.flags.replace('g', '')}g`);
  const matches = [...text.matchAll(global)];
  if (matches.length !== 1) throw new Error(`${label} must contain exactly one release version field.`);
  return text.replace(PLUGIN_VERSION, `$1${version}$3`);
}

export async function setReleaseVersion(root, nextVersion) {
  validVersion(nextVersion);
  const files = await readFiles(root);
  const current = versionsFrom(files);
  if (new Set(Object.values(current)).size !== 1) {
    throw new Error(`Refusing to bump inconsistent release files: ${Object.entries(current).map(([name, version]) => `${name}=${version}`).join(', ')}.`);
  }
  if (current.plugin === nextVersion) throw new Error(`Release version is already ${nextVersion}.`);

  const testManagerWithMetadata = replaceOne(
    files.testManager.text,
    TEST_MANAGER_VERSION,
    `  version: "${nextVersion}"`,
    files.testManager.relative,
  );
  const testManager = replaceOne(
    testManagerWithMetadata,
    SKILL_VERSION,
    `**Version:** \`${nextVersion}\``,
    files.testManager.relative,
  );
  const updates = [
    [files.plugin.file, replacePluginVersion(files.plugin.text, nextVersion, files.plugin.relative)],
    [files.skill.file, replaceOne(files.skill.text, SKILL_VERSION, `**Version:** \`${nextVersion}\``, files.skill.relative)],
    [files.testManager.file, testManager],
    [files.runtime.file, replaceOne(files.runtime.text, RUNTIME_VERSION, `export const PROJECT_MANAGER_VERSION = '${nextVersion}' as const;`, files.runtime.relative)],
  ];

  // Validate every replacement before writing, then replace each file through a
  // same-directory temporary file so readers never observe truncated content.
  for (const [file, text] of updates) {
    const temporary = `${file}.release-version-${process.pid}.tmp`;
    await fs.writeFile(temporary, text, { flag: 'wx' });
    try { await fs.rename(temporary, file); } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }

  await assertVersionConsistency(root);
  return { previous: current.plugin, version: nextVersion };
}
