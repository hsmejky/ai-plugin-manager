import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const SHA = 'a157af3' + '0'.repeat(33);
const files = ({ claudeRef, codexRef } = {}) => ({
  '.claude/settings.json': JSON.stringify({
    enabledPlugins: { 'a@m': true },
    extraKnownMarketplaces: {
      m: { source: { source: 'github', repo: 'o/m', ...(claudeRef === undefined ? {} : { ref: claudeRef }) } },
    },
  }),
  '.codex/config.toml': `[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/o/m.git"\n${
    codexRef === undefined ? '' : `ref = "${codexRef}"\n`
  }\n[plugins."a@m"]\nenabled = true\n`,
});
const p9 = async (opts) => find(await runChecks(envFor(fixture(files(opts)))), 'P9')[0];

test('P9 passes with no ref on either Host', async () => {
  const f = await p9();
  assert.equal(f.status, 'pass');
  assert.equal(f.host, 'both');
  assert.equal(f.layer, 'project');
});

test('P9 passes with the same tag on both Hosts', async () => {
  assert.equal((await p9({ claudeRef: 'v0.5.0', codexRef: 'v0.5.0' })).status, 'pass');
});

test('P9 warns when only Codex pins, naming the Claude pin to set', async () => {
  const f = await p9({ codexRef: 'v0.5.0' });
  assert.equal(f.status, 'warn');
  assert.match(f.message, /"m".*Codex is pinned to "v0\.5\.0".*Claude Code is not pinned/s);
  assert.match(f.fix, /"ref": "v0\.5\.0"/);
  assert.match(f.fix, /\.claude\/settings\.json/);
  assert.match(f.fix, /plugin-authoring\.md#pin-a-marketplace-to-a-release/);
});

test('P9 warns when only Claude pins, naming the Codex pin to set', async () => {
  const f = await p9({ claudeRef: 'v0.5.0' });
  assert.equal(f.status, 'warn');
  assert.match(f.message, /Codex is not pinned.*Claude Code is pinned to "v0\.5\.0"/s);
  assert.match(f.fix, /ref = "v0\.5\.0"/);
  assert.match(f.fix, /\.codex\/config\.toml/);
});

test('P9 warns when the refs differ', async () => {
  const f = await p9({ claudeRef: 'v0.4.0', codexRef: 'v0.5.0' });
  assert.equal(f.status, 'warn');
  assert.match(f.message, /v0\.4\.0/);
  assert.match(f.message, /v0\.5\.0/);
});

test('P9 warns about a Codex full SHA and says to use a tag on both Hosts', async () => {
  for (const claudeRef of [undefined, SHA]) {
    const f = await p9({ codexRef: SHA, claudeRef });
    assert.equal(f.status, 'warn');
    assert.match(f.message, /full commit SHA/);
    assert.match(f.fix, /tag on both Hosts/);
  }
});

test('P9 is skipped when no marketplace is declared in both Hosts', async () => {
  const toml = '[marketplaces.m]\nsource_type = "git"\nsource = "https://x/y.git"\nref = "v1"\n';
  const f = find(await runChecks(envFor(fixture({ '.codex/config.toml': toml }))), 'P9')[0];
  assert.equal(f.status, 'skip');
});
