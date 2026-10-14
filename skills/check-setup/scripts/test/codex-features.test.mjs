import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const POSIX = '/home/jan/repo';
const installed = async (cmd) =>
  cmd === 'claude' ? { ok: true, stdout: '2.1.296 (Claude Code)' } : { ok: true, stdout: 'codex-cli 0.162.1' };

async function m6({ home = {}, project = {}, runCommand = installed }) {
  const env = envFor(fixture(project), { platform: 'linux', runCommand, homeDir: fixture(home) });
  return find(await runChecks(env), 'M6');
}
const userToml = (text) => ({ '.codex/config.toml': text });

test('M6 fails when the user Codex config sets [features] plugins = false, naming file and key', async () => {
  const [f, ...rest] = await m6({ home: userToml('[features]\nplugins = false\n') });
  assert.equal(rest.length, 0);
  assert.equal(f.status, 'fail');
  assert.equal(f.host, 'codex');
  assert.equal(f.layer, 'machine');
  assert.match(f.message, /~\/\.codex\/config\.toml/);
  assert.match(f.fix, /~\/\.codex\/config\.toml/);
  assert.match(f.fix, /\[features\]/);
  assert.match(f.fix, /plugins/);
});

test('M6 passes when no config sets the flag, and when it is true', async () => {
  for (const home of [{}, userToml('[features]\nplugins = true\n')]) {
    const [f] = await m6({ home });
    assert.equal(f.status, 'pass');
  }
});

test('M6 fails when the project .codex/config.toml sets [features] plugins = false', async () => {
  const [f] = await m6({ project: { '.codex/config.toml': '[features]\nplugins = false\n' } });
  assert.equal(f.status, 'fail');
  assert.match(f.message, /\.codex\/config\.toml/);
  assert.doesNotMatch(f.message, /~\/\.codex/);
  assert.match(f.fix, /\[features\]/);
  assert.match(f.fix, /\.codex\/config\.toml/);
});

test('M6: a trusted project setting plugins = true overrides the user false; an untrusted one does not', async () => {
  const projectDir = fixture({ '.codex/config.toml': '[features]\nplugins = true\n' });
  const run = async (trusted) => {
    const trust = trusted ? `[projects.'${projectDir}']\ntrust_level = "trusted"\n\n` : '';
    const homeDir = fixture(userToml(`${trust}[features]\nplugins = false\n`));
    const env = envFor(projectDir, { platform: 'linux', runCommand: installed, homeDir });
    return find(await runChecks(env), 'M6')[0];
  };
  assert.equal((await run(true)).status, 'pass');
  const untrusted = await run(false);
  assert.equal(untrusted.status, 'fail');
  assert.match(untrusted.message, /~\/\.codex\/config\.toml/);
});

test('M6 is skipped with the file and parse error when a Codex config cannot be parsed', async () => {
  const bad = '[features\nplugins = false\n';
  const [user] = await m6({ home: userToml(bad) });
  assert.equal(user.status, 'skip');
  assert.match(user.message, /~\/\.codex\/config\.toml.*line 1/);
  const [project] = await m6({ project: { '.codex/config.toml': bad } });
  assert.equal(project.status, 'skip');
  assert.match(project.message, /\.codex\/config\.toml.*line 1/);
});

test('M6 is skipped when Codex is not installed', async () => {
  const runCommand = async (cmd) => (cmd === 'codex' ? { ok: false, error: 'not found' } : installed(cmd));
  const [f] = await m6({ home: userToml('[features]\nplugins = false\n'), runCommand });
  assert.equal(f.status, 'skip');
  assert.match(f.message, /M1/);
});
