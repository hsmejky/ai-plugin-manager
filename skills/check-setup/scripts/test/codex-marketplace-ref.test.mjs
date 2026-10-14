import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const mkt = (extra = '') =>
  `[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/o/m.git"\n${extra}`;
const run = async (toml) => find(await runChecks(envFor(fixture({ '.codex/config.toml': toml }))), 'P8');
const FULL = 'a157af3' + '0'.repeat(33);

test('P8 passes with no ref', async () => {
  const [f] = await run(mkt());
  assert.equal(f.status, 'pass');
  assert.equal(f.host, 'codex');
  assert.equal(f.layer, 'project');
});

test('P8 passes with a full 40-hex SHA', async () => {
  assert.equal((await run(mkt(`ref = "${FULL}"\n`)))[0].status, 'pass');
});

test('P8 passes with a branch or tag name', async () => {
  for (const ref of ['main', 'v1.2.3', 'release/2026', 'deadbeef-fix']) {
    assert.equal((await run(mkt(`ref = "${ref}"\n`)))[0].status, 'pass', ref);
  }
});

test('P8 warns on a short SHA and names the marketplace and fix', async () => {
  const [f] = await run(mkt('ref = "a157af3"\n'));
  assert.equal(f.status, 'warn');
  assert.match(f.message, /"m".*a157af3/);
  assert.match(f.fix, /full 40-character SHA/);
  assert.match(f.fix, /tag/);
});

test('P8 warns on an uppercase 12-character short SHA', async () => {
  assert.equal((await run(mkt('ref = "A157AF3C0DE1"\n')))[0].status, 'warn');
});

test('P8 is skipped without a Codex config or marketplaces', async () => {
  assert.equal(find(await runChecks(envFor(fixture({}))), 'P8')[0].status, 'skip');
  assert.equal((await run('model = "x"\n'))[0].status, 'skip');
});
