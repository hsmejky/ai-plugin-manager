// The shipped setup skill is user-only in both Hosts, so L1 expects only check-setup of this plugin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { implicitInvocationDisabled } from '../../../check-setup/scripts/openai-yaml.mjs';
import { runChecks } from '../../../check-setup/scripts/check-setup.mjs';
import { fixture, envFor, find, REPO_ROOT } from '../../../check-setup/scripts/test/helpers.mjs';

const skill = (rel) => readFileSync(join(REPO_ROOT, 'skills', 'setup', rel), 'utf8');

test('setup hides itself from the model in both Hosts', () => {
  assert.match(skill('SKILL.md'), /^disable-model-invocation:\s*true\s*$/m);
  assert.equal(implicitInvocationDisabled(skill('agents/openai.yaml')), true);
});

test('the manifest lists both skills and the version is at least 0.6.0', () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.deepEqual(manifest.skills, ['./skills/check-setup', './skills/setup']);
  const [maj, min] = manifest.version.split('.').map(Number);
  assert.ok(maj > 0 || min >= 6, manifest.version);
  assert.match(manifest.description, /sets up/);
});

test('L1 in Claude Code expects only check-setup from this plugin', async () => {
  const id = 'ai-plugin-manager@ai-plugin-manager';
  const projectDir = fixture({
    '.claude/settings.json': JSON.stringify({
      enabledPlugins: { [id]: true },
      extraKnownMarketplaces: { 'ai-plugin-manager': { source: { source: 'github', repo: 'hsmejky/ai-plugin-manager' } } },
    }),
  });
  const reply = (text) => async (cmd, args) => {
    if (cmd !== 'claude') return { ok: false, error: 'command not found' };
    if (args[0] === '--version') return { ok: true, stdout: '2.1.299' };
    if (args[1] === 'list') return { ok: true, stdout: JSON.stringify([{ id, version: '1.0.0', installPath: REPO_ROOT }]) };
    if (args[0] === 'plugin') return { ok: true, stdout: '[]' };
    return { ok: true, stdout: text };
  };
  const ask = async (text) => find(await runChecks(envFor(projectDir, { runCommand: reply(text), live: true })), 'L1').find((f) => f.host === 'claude');
  assert.equal((await ask('check-setup\n')).status, 'pass');
  assert.equal((await ask('check-setup\nsetup\n')).status, 'pass', 'a visible setup is not a failure either');
  assert.equal((await ask('setup\n')).status, 'fail');
});
