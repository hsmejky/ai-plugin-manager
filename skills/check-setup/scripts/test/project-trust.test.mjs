import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const runCommand = async (cmd) =>
  cmd === 'claude' ? { ok: true, stdout: '2.1.296 (Claude Code)' } : { ok: true, stdout: 'codex-cli 0.160.1' };

const WIN = 'C:\\Users\\jan\\repo';
const POSIX = '/home/jan/repo';

async function m2(host, { platform, projectDir, files = {} }) {
  const env = envFor(projectDir, { platform, runCommand, homeDir: fixture(files) });
  return find(await runChecks(env), 'M2').find((f) => f.host === host);
}
const claudeJson = (projects) => ({ '.claude.json': JSON.stringify({ projects }) });
const codexToml = (text) => ({ '.codex/config.toml': text });

// Claude

test('M2 Claude passes for a trusted project under a forward-slash path (Windows)', async () => {
  const f = await m2('claude', {
    platform: 'win32',
    projectDir: WIN,
    files: claudeJson({ 'C:/Users/jan/repo': { hasTrustDialogAccepted: true } }),
  });
  assert.equal(f.status, 'pass');
  assert.equal(f.layer, 'machine');
});

test('M2 Claude passes for a trusted project (POSIX)', async () => {
  const f = await m2('claude', {
    platform: 'linux',
    projectDir: POSIX,
    files: claudeJson({ [POSIX]: { hasTrustDialogAccepted: true } }),
  });
  assert.equal(f.status, 'pass');
});

test('M2 Claude fails when the trust dialog was not accepted', async () => {
  const f = await m2('claude', {
    platform: 'win32',
    projectDir: WIN,
    files: claudeJson({ 'C:/Users/jan/repo': { hasTrustDialogAccepted: false } }),
  });
  assert.equal(f.status, 'fail');
  assert.match(f.fix, /claude/);
});

test('M2 Claude fails when the project has no entry (a trusted parent does not count)', async () => {
  const f = await m2('claude', {
    platform: 'linux',
    projectDir: POSIX,
    files: claudeJson({ '/home/jan': { hasTrustDialogAccepted: true } }),
  });
  assert.equal(f.status, 'fail');
});

test('M2 Claude fails when ~/.claude.json is missing or malformed', async () => {
  for (const files of [{}, { '.claude.json': '{not json' }]) {
    const f = await m2('claude', { platform: 'linux', projectDir: POSIX, files });
    assert.equal(f.status, 'fail');
  }
});

// Codex

test('M2 Codex passes for a lowercased single-quoted Windows path', async () => {
  const f = await m2('codex', {
    platform: 'win32',
    projectDir: WIN,
    files: codexToml("[projects.'c:\\users\\jan\\repo']\ntrust_level = \"trusted\"\n"),
  });
  assert.equal(f.status, 'pass');
});

test('M2 Codex passes for a double-quoted escaped Windows path', async () => {
  const f = await m2('codex', {
    platform: 'win32',
    projectDir: WIN,
    files: codexToml('[projects."c:\\\\users\\\\jan\\\\repo"]\ntrust_level = "trusted"\n'),
  });
  assert.equal(f.status, 'pass');
});

test('M2 Codex passes for a POSIX path, which is case-sensitive', async () => {
  const ok = await m2('codex', {
    platform: 'linux',
    projectDir: POSIX,
    files: codexToml(`[projects.'${POSIX}']\ntrust_level = "trusted"\n`),
  });
  assert.equal(ok.status, 'pass');
  const wrongCase = await m2('codex', {
    platform: 'linux',
    projectDir: '/home/Jan/repo',
    files: codexToml(`[projects.'/home/jan/repo']\ntrust_level = "trusted"\n`),
  });
  assert.equal(wrongCase.status, 'fail');
});

test('M2 Codex ignores trust_level in other tables and other projects', async () => {
  const toml = [
    "[projects.'c:\\users\\jan\\other']",
    'trust_level = "trusted"',
    "[projects.'c:\\users\\jan\\repo']",
    'note = "x"',
    '[plugins."a@b"]',
    'trust_level = "trusted"',
  ].join('\n');
  const f = await m2('codex', { platform: 'win32', projectDir: WIN, files: codexToml(toml) });
  assert.equal(f.status, 'fail');
});

test('M2 Codex fails for an untrusted level, with the fix naming the table', async () => {
  const f = await m2('codex', {
    platform: 'win32',
    projectDir: WIN,
    files: codexToml("[projects.'c:\\users\\jan\\repo']\ntrust_level = \"untrusted\"\n"),
  });
  assert.equal(f.status, 'fail');
  assert.match(f.fix, /trust_level = "trusted"/);
  assert.match(f.fix, /c:\\users\\jan\\repo/);
});

test('M2 Codex fails when config.toml is absent', async () => {
  const f = await m2('codex', { platform: 'linux', projectDir: POSIX, files: {} });
  assert.equal(f.status, 'fail');
});

test('M2 Codex tolerates comments and trailing comments', async () => {
  const toml = `# c\n[projects.'${POSIX}'] # t\ntrust_level = "trusted" # ok\n`;
  const f = await m2('codex', { platform: 'linux', projectDir: POSIX, files: codexToml(toml) });
  assert.equal(f.status, 'pass');
});

test('M2 Codex warns, with the reason, when config.toml cannot be parsed', async () => {
  const f = await m2('codex', { platform: 'linux', projectDir: POSIX, files: codexToml('[projects.\nbroken') });
  assert.equal(f.status, 'warn');
  assert.match(f.message, /could not be parsed/);
  assert.match(f.message, /line 1/);
});
