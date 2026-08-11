/* Studio dashboard panel preference regressions: complete payload restoration,
   invalid-data defaults, and non-fatal browser-storage access failures. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

function hostWith(raw) {
  const values = new Map(raw === undefined ? [] : [['project-manager-studio:panel-preferences', raw]]);
  return {
    values,
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
    },
  };
}

test('panel preferences restore both independent collapsed states', async () => {
  const { readPanelPreferences } = await import('../../src/project-manager-studio/client/panel-preferences.mjs');
  assert.deepEqual(readPanelPreferences(hostWith('{"summaryCollapsed":true,"filtersCollapsed":false}')), {
    summaryCollapsed: true,
    filtersCollapsed: false,
  });
  assert.deepEqual(readPanelPreferences(hostWith('{"summaryCollapsed":false,"filtersCollapsed":true}')), {
    summaryCollapsed: false,
    filtersCollapsed: true,
  });
});

test('missing, malformed, partial, or non-boolean preferences default both panels to expanded', async () => {
  const { readPanelPreferences } = await import('../../src/project-manager-studio/client/panel-preferences.mjs');
  const expanded = { summaryCollapsed: false, filtersCollapsed: false };
  assert.deepEqual(readPanelPreferences(hostWith()), expanded);
  assert.deepEqual(readPanelPreferences(hostWith('{')), expanded);
  assert.deepEqual(readPanelPreferences(hostWith('{"summaryCollapsed":true}')), expanded);
  assert.deepEqual(readPanelPreferences(hostWith('{"summaryCollapsed":true,"filtersCollapsed":"yes"}')), expanded);
});

test('unavailable localStorage access is non-fatal for reads and writes', async () => {
  const { readPanelPreferences, writePanelPreferences } = await import('../../src/project-manager-studio/client/panel-preferences.mjs');
  const throwingGetter = Object.create(null, { localStorage: { get() { throw new Error('blocked'); } } });
  assert.deepEqual(readPanelPreferences(throwingGetter), { summaryCollapsed: false, filtersCollapsed: false });
  const throwingOperations = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  assert.deepEqual(readPanelPreferences(throwingOperations), { summaryCollapsed: false, filtersCollapsed: false });
  assert.equal(writePanelPreferences(throwingGetter, { summaryCollapsed: true, filtersCollapsed: true }), false);
  assert.equal(writePanelPreferences(throwingOperations, { summaryCollapsed: true, filtersCollapsed: true }), false);
});

test('panel preference writes replace the complete stored payload', async () => {
  const { PANEL_PREFERENCES_KEY, writePanelPreferences } = await import('../../src/project-manager-studio/client/panel-preferences.mjs');
  const host = hostWith();
  assert.equal(writePanelPreferences(host, { summaryCollapsed: true, filtersCollapsed: false }), true);
  assert.equal(host.values.get(PANEL_PREFERENCES_KEY), '{"summaryCollapsed":true,"filtersCollapsed":false}');
});
