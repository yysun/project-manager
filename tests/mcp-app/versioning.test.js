/* Release versioning: Project Manager's plugin, skill, and runtime stay in lockstep;
   bundled Test Manager metadata is validated but retains an independent version. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');

async function versioning() {
  return import(pathToFileURL(path.join(root, 'scripts/versioning.mjs')).href);
}

function fixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-version-'));
  for (const relative of [
    'plugin.json',
    'skills/project-manager/SKILL.md',
    'skills/test-manager/SKILL.md',
    'src/version.ts',
  ]) {
    const destination = path.join(target, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  return target;
}

test('plugin, skill, and runtime expose one release version', async () => {
  const { assertVersionConsistency, readReleaseVersions } = await versioning();
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')).version;
  assert.equal(await assertVersionConsistency(root), expected);
  assert.deepEqual(await readReleaseVersions(root), { plugin: expected, skill: expected, runtime: expected });
});

test('generated plugin and standalone Studio artifacts expose the current release version', async () => {
  const { assertGeneratedVersionConsistency } = await versioning();
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')).version;
  assert.equal(await assertGeneratedVersionConsistency(root), expected);
});

test('Test Manager exposes an independently validated standalone identity', async () => {
  const { readTestManagerMetadata } = await versioning();
  assert.deepEqual(await readTestManagerMetadata(root), {
    version: '0.1.0',
    source: 'https://github.com/yysun/project-manager/tree/main/skills/test-manager',
  });
});

test('release version bump updates every release-bearing file together', async () => {
  const target = fixture();
  try {
    const { readReleaseVersions, readTestManagerMetadata, setReleaseVersion } = await versioning();
    const previous = (await readReleaseVersions(target)).plugin;
    const testManagerBefore = await readTestManagerMetadata(target);
    const next = `${Number(previous.split('.')[0]) + 100}.3.4-beta.1+build.7`;
    const result = await setReleaseVersion(target, next);
    assert.deepEqual(result, { previous, version: next });
    assert.deepEqual(await readReleaseVersions(target), {
      plugin: next,
      skill: next,
      runtime: next,
    });
    assert.deepEqual(await readTestManagerMetadata(target), testManagerBefore);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('release version bump rejects invalid, repeated, and already-drifted versions without mutation', async () => {
  const target = fixture();
  try {
    const { setReleaseVersion } = await versioning();
    const snapshot = () => [
      'plugin.json',
      'skills/project-manager/SKILL.md',
      'skills/test-manager/SKILL.md',
      'src/version.ts',
    ]
      .map((relative) => fs.readFileSync(path.join(target, relative), 'utf8'));
    const original = snapshot();
    const current = JSON.parse(original[0]).version;
    await assert.rejects(() => setReleaseVersion(target, 'v2'), /Invalid semantic version/);
    await assert.rejects(() => setReleaseVersion(target, current), new RegExp(`already ${current.replaceAll('.', '\\.')}`));
    assert.deepEqual(snapshot(), original);

    const drift = current === '9.0.0' ? '10.0.0' : '9.0.0';
    fs.writeFileSync(path.join(target, 'src/version.ts'), `export const PROJECT_MANAGER_VERSION = '${drift}' as const;\n`);
    const drifted = snapshot();
    await assert.rejects(() => setReleaseVersion(target, '2.0.0'), /Refusing to bump inconsistent release files/);
    assert.deepEqual(snapshot(), drifted);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('invalid Test Manager metadata fails version validation without coupling versions', async () => {
  const target = fixture();
  try {
    const { assertVersionConsistency, readReleaseVersions, readTestManagerMetadata } = await versioning();
    const skill = path.join(target, 'skills/test-manager/SKILL.md');
    const originalRelease = await readReleaseVersions(target);
    fs.writeFileSync(
      skill,
      fs.readFileSync(skill, 'utf8').replace('version: "0.1.0"', 'version: "not-semver"'),
    );
    await assert.rejects(() => readTestManagerMetadata(target), /Invalid semantic version/);
    await assert.rejects(() => assertVersionConsistency(target), /Invalid semantic version/);
    assert.deepEqual(await readReleaseVersions(target), originalRelease);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});
