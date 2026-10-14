import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const run = async (files) => runChecks(envFor(fixture(files)));
const claude = (obj) => ({ '.claude/settings.json': typeof obj === 'string' ? obj : JSON.stringify(obj) });
const ghMkt = (repo) => ({ source: { source: 'github', repo } });

test('P3 fails on invalid Claude settings JSON instead of crashing', async () => {
  const [p3] = find(await run(claude('{ "enabledPlugins": ')), 'P3');
  assert.equal(p3.status, 'fail');
  assert.equal(p3.host, 'claude');
  assert.equal(p3.layer, 'project');
  assert.match(p3.message, /not valid JSON/);
  assert.match(p3.fix, /settings\.json/);
});

test('P3 passes when every enabled plugin marketplace is declared', async () => {
  const [p3] = find(
    await run(claude({ enabledPlugins: { 'a@m': true }, extraKnownMarketplaces: { m: ghMkt('o/m') } })),
    'P3',
  );
  assert.equal(p3.status, 'pass');
});

test('P3 fails with an exact fix when a marketplace is not declared', async () => {
  const [p3] = find(await run(claude({ enabledPlugins: { 'a@m': true } })), 'P3');
  assert.equal(p3.status, 'fail');
  assert.match(p3.message, /a@m/);
  assert.match(p3.fix, /extraKnownMarketplaces/);
  assert.match(p3.fix, /"m"/);
});

test('P3 ignores disabled plugins and the built-in official marketplace', async () => {
  const [p3] = find(
    await run(claude({ enabledPlugins: { 'a@m': false, 'b@claude-plugins-official': true } })),
    'P3',
  );
  assert.equal(p3.status, 'pass');
});

test('P3 is skipped when the project has no Claude settings', async () => {
  const [p3] = find(await run({}), 'P3');
  assert.equal(p3.status, 'skip');
});

test('P3 fix snippet includes "autoUpdate": true', async () => {
  const [p3] = find(await run(claude({ enabledPlugins: { 'a@m': true } })), 'P3');
  assert.match(p3.fix, /"autoUpdate": true/);
});

const mkt = (extra) => ({ ...ghMkt('o/m'), ...extra });

test('P7 passes when every declared marketplace has "autoUpdate": true', async () => {
  const [p7] = find(await run(claude({ extraKnownMarketplaces: { m: mkt({ autoUpdate: true }) } })), 'P7');
  assert.equal(p7.status, 'pass');
  assert.equal(p7.host, 'claude');
  assert.equal(p7.layer, 'project');
});

test('P7 warns with an exact fix when "autoUpdate" is missing', async () => {
  const [p7] = find(await run(claude({ extraKnownMarketplaces: { m: mkt() } })), 'P7');
  assert.equal(p7.status, 'warn');
  assert.match(p7.message, /"m"/);
  assert.match(p7.fix, /"autoUpdate": true/);
  assert.match(p7.fix, /extraKnownMarketplaces/);
  assert.match(p7.fix, /"m"/);
});

test('P7 warns when "autoUpdate" is false', async () => {
  const [p7] = find(await run(claude({ extraKnownMarketplaces: { m: mkt({ autoUpdate: false }) } })), 'P7');
  assert.equal(p7.status, 'warn');
});

test('P7 names only the marketplaces that lack it', async () => {
  const [p7] = find(
    await run(claude({ extraKnownMarketplaces: { ok: mkt({ autoUpdate: true }), bad: mkt() } })),
    'P7',
  );
  assert.equal(p7.status, 'warn');
  assert.match(p7.message, /"bad"/);
  assert.doesNotMatch(p7.message, /"ok"/);
});

test('P7 does not warn for default-on official names sourced from github.com/anthropics/', async () => {
  for (const name of ['claude-plugins-official', 'anthropic-agent-skills']) {
    const [p7] = find(
      await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('anthropics/some-repo') } })),
      'P7',
    );
    assert.equal(p7.status, 'skip', name);
  }
});

test('P7 treats a git URL under github.com/anthropics/ as an official source', async () => {
  const [p7] = find(
    await run(
      claude({
        extraKnownMarketplaces: {
          'claude-code-plugins': { source: { source: 'git', url: 'https://github.com/anthropics/x.git' } },
        },
      }),
    ),
    'P7',
  );
  assert.equal(p7.status, 'skip');
});

test('P7 still warns for the official names that do not auto-update by default', async () => {
  for (const name of ['knowledge-work-plugins', 'first-party-plugins']) {
    const [p7] = find(
      await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('anthropics/some-repo') } })),
      'P7',
    );
    assert.equal(p7.status, 'warn', name);
    assert.match(p7.message, new RegExp(name));
  }
});

test('P7 still warns for the community name', async () => {
  const [p7] = find(
    await run(claude({ extraKnownMarketplaces: { 'claude-community': ghMkt('anthropics/some-repo') } })),
    'P7',
  );
  assert.equal(p7.status, 'warn');
});

test('P7 skips a reserved name from a non-Anthropic source, P3 fails it instead', async () => {
  const [p7] = find(
    await run(claude({ extraKnownMarketplaces: { 'claude-plugins-official': ghMkt('evil/anthropics') } })),
    'P7',
  );
  assert.equal(p7.status, 'skip');
});

test('P3 fails a reserved official or community name sourced outside github.com/anthropics/', async () => {
  for (const name of ['claude-plugins-official', 'knowledge-work-plugins', 'claude-community', 'healthcare']) {
    const [p3] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('evil/anthropics') } })), 'P3');
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, new RegExp(name));
    assert.match(p3.message, /untrusted source/);
    assert.match(p3.fix, /[Rr]ename/);
    assert.match(p3.fix, /github\.com\/anthropics\//);
    assert.doesNotMatch(p3.fix, /autoUpdate/);
  }
});

test('P3 passes a reserved name sourced from github.com/anthropics/', async () => {
  const [p3] = find(
    await run(claude({ extraKnownMarketplaces: { 'claude-community': ghMkt('anthropics/x') } })),
    'P3',
  );
  assert.equal(p3.status, 'pass');
});

test('P7 is skipped when there is no Claude settings file or it is unreadable', async () => {
  assert.equal(find(await run({}), 'P7')[0].status, 'skip');
  assert.equal(find(await run(claude('{ "x": ')), 'P7')[0].status, 'skip');
});

test('P7 is skipped when no marketplace is declared', async () => {
  assert.equal(find(await run(claude({ enabledPlugins: {} })), 'P7')[0].status, 'skip');
});
