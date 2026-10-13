import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { detectHosts } from '../hosts.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const CLAUDE_OK = '2.1.296 (Claude Code)\n';
const CODEX_OK = 'codex-cli 0.160.1\n';

function stub(outputs) {
  return async (cmd) =>
    cmd in outputs ? { ok: true, stdout: outputs[cmd] } : { ok: false, error: `${cmd}: command not found` };
}
const run = (outputs, extra = {}) =>
  runChecks(envFor(fixture({ 'AGENTS.md': 'x' }), { runCommand: stub(outputs), ...extra }));
const m1 = (findings, host) => find(findings, 'M1').find((f) => f.host === host);

test('M1 passes for both Hosts at the tested versions', async () => {
  const findings = await run({ claude: CLAUDE_OK, codex: CODEX_OK });
  for (const host of ['claude', 'codex']) {
    assert.equal(m1(findings, host).status, 'pass');
    assert.equal(m1(findings, host).layer, 'machine');
  }
});

test('M1 passes for a newer version', async () => {
  const findings = await run({ claude: '2.2.0 (Claude Code)', codex: 'codex-cli 1.0.0' });
  assert.equal(m1(findings, 'claude').status, 'pass');
  assert.equal(m1(findings, 'codex').status, 'pass');
});

test('M1 warns for an outdated CLI and names both versions', async () => {
  const findings = await run({ claude: '2.1.295 (Claude Code)', codex: 'codex-cli 0.99.0' });
  const c = m1(findings, 'claude');
  assert.equal(c.status, 'warn');
  assert.match(c.message, /2\.1\.295/);
  assert.match(c.message, /2\.1\.296/);
  assert.ok(c.fix);
  assert.equal(m1(findings, 'codex').status, 'warn');
});

test('M1 compares numerically, not lexically', async () => {
  const findings = await run({ claude: '2.1.1000 (Claude Code)', codex: 'codex-cli 0.160.1' });
  assert.equal(m1(findings, 'claude').status, 'pass');
});

test('M1 warns when a Host is missing, without crashing', async () => {
  const findings = await run({ claude: CLAUDE_OK });
  const c = m1(findings, 'codex');
  assert.equal(c.status, 'warn');
  assert.match(c.message, /not installed|missing|not found/i);
  assert.equal(m1(findings, 'claude').status, 'pass');
});

test('M1 warns when the version output is unparseable', async () => {
  const findings = await run({ claude: 'garbage', codex: CODEX_OK });
  assert.equal(m1(findings, 'claude').status, 'warn');
});

test('M2 is skipped with a reason for a missing Host', async () => {
  const findings = await run({ claude: CLAUDE_OK });
  const m2 = find(findings, 'M2').find((f) => f.host === 'codex');
  assert.equal(m2.status, 'skip');
  assert.match(m2.message, /codex/i);
});

test('detectHosts returns installed and version per Host', async () => {
  const hosts = await detectHosts({ runCommand: stub({ claude: CLAUDE_OK }) });
  assert.deepEqual(hosts.claude, { installed: true, version: '2.1.296' });
  assert.deepEqual(hosts.codex, { installed: false, version: null });
});

test('detectHosts reports installed with null version when output is unparseable', async () => {
  const hosts = await detectHosts({ runCommand: stub({ claude: 'weird', codex: CODEX_OK }) });
  assert.deepEqual(hosts.claude, { installed: true, version: null });
  assert.equal(hosts.codex.version, '0.160.1');
});
