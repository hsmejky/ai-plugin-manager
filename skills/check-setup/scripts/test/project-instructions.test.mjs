import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const run = async (files) => runChecks(envFor(fixture(files)));

test('P1 fails with a fix when AGENTS.md is missing', async () => {
  const [p1] = find(await run({}), 'P1');
  assert.equal(p1.status, 'fail');
  assert.equal(p1.layer, 'project');
  assert.equal(p1.host, 'both');
  assert.match(p1.fix, /AGENTS\.md/);
});

test('P1 passes when AGENTS.md exists', async () => {
  const [p1] = find(await run({ 'AGENTS.md': '# x\n' }), 'P1');
  assert.equal(p1.status, 'pass');
});

test('P2 fails when CLAUDE.md is missing', async () => {
  const [p2] = find(await run({ 'AGENTS.md': 'x' }), 'P2');
  assert.equal(p2.status, 'fail');
  assert.equal(p2.host, 'claude');
  assert.match(p2.fix, /@AGENTS\.md/);
});

test('P2 fails when CLAUDE.md does not import @AGENTS.md', async () => {
  const [p2] = find(await run({ 'AGENTS.md': 'x', 'CLAUDE.md': '# notes\nsee AGENTS.md\n' }), 'P2');
  assert.equal(p2.status, 'fail');
  assert.match(p2.fix, /@AGENTS\.md/);
});

test('P2 passes when CLAUDE.md imports @AGENTS.md on its own line', async () => {
  const [p2] = find(await run({ 'AGENTS.md': 'x', 'CLAUDE.md': '@AGENTS.md\n' }), 'P2');
  assert.equal(p2.status, 'pass');
});

test('every finding has the documented shape', async () => {
  for (const f of await run({})) {
    assert.deepEqual(Object.keys(f).sort(), ['fix', 'host', 'id', 'layer', 'message', 'status']);
    assert.ok(['pass', 'warn', 'fail', 'skip'].includes(f.status));
    assert.ok(['project', 'machine'].includes(f.layer));
  }
});
