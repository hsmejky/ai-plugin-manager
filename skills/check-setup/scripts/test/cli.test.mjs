import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from './helpers.mjs';

const script = fileURLToPath(new URL('../check-setup.mjs', import.meta.url));

function cli(files, args = []) {
  const dir = fixture(files);
  const r = spawnSync(process.execPath, [script, '--project', dir, ...args], {
    env: { PATH: '' },
    encoding: 'utf8',
  });
  return { ...r, json: JSON.parse(r.stdout) };
}

test('CLI prints JSON findings and exits 1 on a fail', () => {
  const r = cli({});
  assert.equal(r.status, 1);
  assert.ok(Array.isArray(r.json.findings));
  assert.equal(r.json.findings.find((f) => f.id === 'P1').status, 'fail');
});

test('CLI exits 0 when nothing fails', () => {
  const r = cli({ 'AGENTS.md': 'x', 'CLAUDE.md': '@AGENTS.md\n' });
  assert.equal(r.status, 0);
  assert.ok(r.json.findings.every((f) => f.status !== 'fail'));
});
