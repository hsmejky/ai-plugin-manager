import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const run = async (files) => runChecks(envFor(fixture(files)));
const claude = (plugins, markets = {}) => ({
  '.claude/settings.json': JSON.stringify({
    enabledPlugins: Object.fromEntries(plugins.map((p) => [p, true])),
    extraKnownMarketplaces: Object.fromEntries(
      Object.entries(markets).map(([n, repo]) => [n, { source: { source: 'github', repo } }]),
    ),
  }),
});
const codex = (plugins, markets = {}) => ({
  '.codex/config.toml':
    Object.entries(markets)
      .map(([n, url]) => `[marketplaces.${n}]\nsource_type = "git"\nsource = "${url}"\n`)
      .join('\n') + plugins.map((p) => `\n[plugins."${p}"]\nenabled = true\n`).join(''),
});
const both = (plugins, claudeMarkets, codexMarkets) => ({
  ...claude(plugins, claudeMarkets),
  ...codex(plugins, codexMarkets),
});

test('P5 passes when both Hosts enable the same plugins', async () => {
  const [p5] = find(await run(both(['a@m'], { m: 'o/m' }, { m: 'https://github.com/o/m.git' })), 'P5');
  assert.equal(p5.status, 'pass');
  assert.equal(p5.host, 'both');
  assert.equal(p5.layer, 'project');
});

test('P5 warns when a plugin is enabled only in Claude, with a Codex fix', async () => {
  const files = {
    ...claude(['a@m', 'b@m'], { m: 'o/m' }),
    ...codex(['a@m'], { m: 'https://github.com/o/m.git' }),
  };
  const [p5] = find(await run(files), 'P5');
  assert.equal(p5.status, 'warn');
  assert.match(p5.message, /b@m.*only in Claude/);
  assert.match(p5.fix, /\[plugins\."b@m"\]/);
  assert.match(p5.fix, /Host-specific/);
});

test('P5 warns when a plugin is enabled only in Codex, with a Claude fix', async () => {
  const files = { ...claude(['a@m'], { m: 'o/m' }), ...codex(['a@m', 'c@m'], { m: 'https://github.com/o/m.git' }) };
  const [p5] = find(await run(files), 'P5');
  assert.equal(p5.status, 'warn');
  assert.match(p5.message, /c@m.*only in Codex/);
  assert.match(p5.fix, /"c@m": true/);
});

test('P5 is skipped when a Host config is unreadable (reported by P3 or P4)', async () => {
  const [p5] = find(await run({ ...claude(['a@m']), '.codex/config.toml': '[oops' }), 'P5');
  assert.equal(p5.status, 'skip');
});

test('P5 is skipped when the project declares no plugins at all', async () => {
  assert.equal(find(await run({}), 'P5')[0].status, 'skip');
});

test('P6 passes when github repo and git URL point at the same source', async () => {
  const [p6] = find(await run(both(['a@m'], { m: 'O/M' }, { m: 'git@github.com:o/m.git' })), 'P6');
  assert.equal(p6.status, 'pass');
});

test('P6 fails when the same marketplace has different sources', async () => {
  const [p6] = find(await run(both(['a@m'], { m: 'o/m' }, { m: 'https://github.com/evil/m.git' })), 'P6');
  assert.equal(p6.status, 'fail');
  assert.equal(p6.host, 'both');
  assert.match(p6.message, /"m"/);
  assert.match(p6.fix, /https:\/\/github\.com\/o\/m\.git/);
});

test('P6 is skipped when no marketplace is declared in both Hosts', async () => {
  const files = { ...claude(['a@m'], { m: 'o/m' }), ...codex([], { n: 'https://github.com/o/n.git' }) };
  assert.equal(find(await run(files), 'P6')[0].status, 'skip');
});
