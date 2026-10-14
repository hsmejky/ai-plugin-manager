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
