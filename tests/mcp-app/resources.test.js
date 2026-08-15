/* MCP App view resources: both ui:// documents resolve through the protocol with
   the MCP Apps content type and are fully self-contained, because views render
   under a default CSP that blocks every external origin. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { connect } = require('./_helpers');

const MIME = 'text/html;profile=mcp-app';
const VIEWS = ['ui://project-manager/status.html', 'ui://project-manager/board.html'];

test('both views are registered as ui:// resources with the MCP Apps content type', async () => {
  const session = await connect();
  try {
    const { resources } = await session.client.listResources();
    const byUri = new Map(resources.map((resource) => [resource.uri, resource]));
    for (const uri of VIEWS) {
      assert.ok(byUri.has(uri), `${uri} should be registered`);
      assert.equal(byUri.get(uri).mimeType, MIME);
    }
  } finally { await session.close(); }
});

test('each view reads back as one HTML document with the MCP Apps content type', async () => {
  const session = await connect();
  try {
    for (const uri of VIEWS) {
      const { contents } = await session.client.readResource({ uri });
      assert.equal(contents.length, 1);
      assert.equal(contents[0].uri, uri);
      assert.equal(contents[0].mimeType, MIME);
      assert.match(contents[0].text, /^<!DOCTYPE html>/i);
      assert.match(contents[0].text, /<div id="root">/);
    }
  } finally { await session.close(); }
});

test('views declare no external origin for scripts, styles, fonts, or images', async () => {
  const session = await connect();
  try {
    for (const uri of VIEWS) {
      const { contents } = await session.client.readResource({ uri });
      const html = contents[0].text;
      // Every src/href must be inline: no protocol-bearing or root-relative asset.
      const external = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/gi)]
        .map((match) => match[1])
        .filter((value) => !value.startsWith('#') && !value.startsWith('data:'));
      assert.deepEqual(external, [], `${uri} must inline every asset`);
      assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*"stylesheet"/i, `${uri} must not link a stylesheet`);
      assert.doesNotMatch(html, /@import\s+url\(/i, `${uri} must not import remote CSS`);
    }
  } finally { await session.close(); }
});

test('views carry their script and style inline so the host can render them offline', async () => {
  const session = await connect();
  try {
    for (const uri of VIEWS) {
      const { contents } = await session.client.readResource({ uri });
      const html = contents[0].text;
      assert.match(html, /<script[^>]*>[\s\S]*createElement[\s\S]*<\/script>/i, `${uri} must inline its script`);
      assert.match(html, /<style[^>]*>[\s\S]*--pm-bg[\s\S]*<\/style>/i, `${uri} must inline its theme tokens`);
    }
  } finally { await session.close(); }
});

test('the status action embeds the real board and keeps its button compact', async () => {
  const session = await connect();
  try {
    const { contents } = await session.client.readResource({ uri: 'ui://project-manager/status.html' });
    const html = contents[0].text;
    assert.match(html, /pm_get_project/, 'status view must load the full board payload');
    assert.match(html, /Loading project board/, 'status view must contain the lane-board renderer');
    assert.match(html, /min-height:32px/, 'Open board button must use the compact height');
  } finally { await session.close(); }
});

test('an unknown ui:// resource is not served', async () => {
  const session = await connect();
  try {
    await assert.rejects(() => session.client.readResource({ uri: 'ui://project-manager/nope.html' }));
  } finally { await session.close(); }
});
