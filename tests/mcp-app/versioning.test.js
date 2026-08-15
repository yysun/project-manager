/* Release versioning: plugin.json is canonical, the standalone skill and MCP
   runtime stay in lockstep, and the explicit bump operation updates all three. */
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
  for (const relative of ['plugin.json', 'skills/project-manager/SKILL.md', 'src/version.ts']) {
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

test('release version bump updates every release-bearing file together', async () => {
  const target = fixture();
  try {
    const { readReleaseVersions, setReleaseVersion } = await versioning();
    const previous = (await readReleaseVersions(target)).plugin;
    const next = `${Number(previous.split('.')[0]) + 100}.3.4-beta.1+build.7`;
    const result = await setReleaseVersion(target, next);
    assert.deepEqual(result, { previous, version: next });
    assert.deepEqual(await readReleaseVersions(target), {
      plugin: next,
      skill: next,
      runtime: next,
    });
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('release version bump rejects invalid, repeated, and already-drifted versions without mutation', async () => {
  const target = fixture();
  try {
    const { setReleaseVersion } = await versioning();
    const snapshot = () => ['plugin.json', 'skills/project-manager/SKILL.md', 'src/version.ts']
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
