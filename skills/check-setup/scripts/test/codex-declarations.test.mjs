import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const run = async (files) => runChecks(envFor(fixture(files)));
const claude = (obj) => ({ '.claude/settings.json': JSON.stringify(obj) });
const ghMkt = (repo) => ({ source: { source: 'github', repo } });
const codex = (toml) => ({ '.codex/config.toml': toml });
const CX_MKT = (name, url) => `[marketplaces.${name}]\nsource_type = "git"\nsource = "${url}"\n`;
const CX_PLUGIN = (id) => `[plugins."${id}"]\nenabled = true\n`;

test('P4 passes when Codex declares the marketplace and the plugin', async () => {
  const [p4] = find(
    await run(codex(CX_MKT('m', 'https://github.com/o/m.git') + '\n' + CX_PLUGIN('a@m'))),
    'P4',
  );
  assert.equal(p4.status, 'pass');
  assert.equal(p4.host, 'codex');
  assert.equal(p4.layer, 'project');
});

test('P4 fails when a Codex plugin has no declared marketplace', async () => {
  const [p4] = find(await run(codex(CX_PLUGIN('a@m'))), 'P4');
  assert.equal(p4.status, 'fail');
  assert.match(p4.fix, /\[marketplaces\.m\]/);
});

test('P4 fails when Claude expects plugins but Codex config is missing', async () => {
  const [p4] = find(
    await run(claude({ enabledPlugins: { 'a@m': true }, extraKnownMarketplaces: { m: ghMkt('o/m') } })),
    'P4',
  );
  assert.equal(p4.status, 'fail');
  assert.match(p4.fix, /\.codex\/config\.toml/);
  assert.match(p4.fix, /\[plugins\."a@m"\]/);
  assert.match(p4.fix, /https:\/\/github\.com\/o\/m\.git/);
});

test('P4 reports malformed TOML as a finding', async () => {
  const [p4] = find(await run(codex('[marketplaces.m\nsource = ')), 'P4');
  assert.equal(p4.status, 'fail');
  assert.match(p4.message, /not valid TOML/);
});

test('P4 is skipped when neither Host declares plugins', async () => {
  assert.equal(find(await run({}), 'P4')[0].status, 'skip');
});

test('P4 reads real-world TOML: comments, single-quoted tables, other tables', async () => {
  const toml = [
    '# top comment',
    'model = "x"  # trailing',
    "[projects.'c:\\users\\me\\proj']",
    'trust_level = "trusted"',
    '[mcp_servers.s]',
    'args = ["a", "b"]',
    CX_MKT('m', 'https://github.com/o/m.git'),
    '[plugins."a@m"]',
    'enabled = true # on',
  ].join('\n');
  assert.equal(find(await run(codex(toml)), 'P4')[0].status, 'pass');
});

test('P4 ignores plugins disabled in Codex', async () => {
  const [p4] = find(await run(codex('[plugins."a@m"]\nenabled = false\n')), 'P4');
  assert.equal(p4.status, 'pass');
});

test('P4 exempts plugins from every Codex built-in marketplace', async () => {
  for (const name of ['openai-bundled', 'openai-curated', 'openai-primary-runtime', 'openai-curated-remote']) {
    const [p4] = find(await run(codex(CX_PLUGIN(`github@${name}`))), 'P4');
    assert.equal(p4.status, 'pass', name);
  }
});
