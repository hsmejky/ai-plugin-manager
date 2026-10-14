// Which skills L1 expects from an installed plugin, and how it reads the model's reply.
// Everything goes through runChecks: the plugin directory is a fixture, the Host's reply is injected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const PLUGIN = 'tools@m';
const skillMd = (name, extra = '') => `---\nname: ${name}\ndescription: d\n${extra}---\nbody\n`;

/**
 * Claude Code with one enabled plugin whose files are `pluginFiles` (or a missing directory when
 * `pluginFiles` is null) and a model that answers `reply`. Returns the Claude L1 finding.
 */
async function l1Claude(pluginFiles, reply) {
  const pluginDir = pluginFiles === null ? join(fixture(), 'missing') : fixture(pluginFiles);
  const projectDir = fixture({
    '.claude/settings.json': JSON.stringify({
      enabledPlugins: { [PLUGIN]: true },
      extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' } } },
    }),
  });
  const runCommand = async (cmd, args) => {
    if (cmd !== 'claude') return { ok: false, error: 'command not found' };
    if (args[0] === '--version') return { ok: true, stdout: '2.1.296' };
    if (args[0] === 'plugin' && args[1] === 'list') {
      return { ok: true, stdout: JSON.stringify([{ id: PLUGIN, version: '1.0.0', installPath: pluginDir }]) };
    }
    if (args[0] === 'plugin') return { ok: true, stdout: '[]' };
    return { ok: true, stdout: reply };
  };
  const findings = await runChecks(envFor(projectDir, { runCommand, live: true }));
  return find(findings, 'L1').find((f) => f.host === 'claude');
}

test('expected skills come from the manifest skills array, each under its own name', async () => {
  const files = {
    '.claude-plugin/plugin.json': JSON.stringify({ skills: ['./skills/eng/tdd', './skills/misc/grill-me'] }),
    'skills/eng/tdd/SKILL.md': skillMd('tdd'),
    'skills/misc/grill-me/SKILL.md': skillMd('grill-me'),
    'skills/eng/unlisted/SKILL.md': skillMd('unlisted'),
  };
  assert.equal((await l1Claude(files, 'tdd\ngrill-me\n')).status, 'pass');
  const f = await l1Claude(files, 'tdd\n');
  assert.equal(f.status, 'fail');
  assert.match(f.message, /grill-me/);
  assert.doesNotMatch(f.message, /unlisted/);
});

test('without a manifest skills list, every skills/<name>/SKILL.md is expected', async () => {
  const files = {
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'p' }),
    'skills/a/SKILL.md': skillMd('a'),
    'skills/b/SKILL.md': skillMd('b'),
    'skills/notaskill/readme.md': 'x',
  };
  assert.equal((await l1Claude(files, 'a\nb\n')).status, 'pass');
  assert.match((await l1Claude(files, 'a\n')).message, /\bb\b/);
});

test('user-only skills (disable-model-invocation: true) are not expected', async () => {
  const files = {
    '.claude-plugin/plugin.json': JSON.stringify({ skills: ['./skills/a', './skills/b'] }),
    'skills/a/SKILL.md': skillMd('a'),
    'skills/b/SKILL.md': skillMd('b', 'disable-model-invocation: true\n'),
  };
  assert.equal((await l1Claude(files, 'a\n')).status, 'pass');
});

test('the frontmatter name is expected, not the directory name', async () => {
  const files = { 'skills/dir/SKILL.md': skillMd('real-name') };
  assert.equal((await l1Claude(files, 'real-name\n')).status, 'pass');
  assert.match((await l1Claude(files, 'dir\n')).message, /real-name/);
});

test('a plugin whose directory does not exist is a skip, not a fail', async () => {
  const f = await l1Claude(null, 'anything\n');
  assert.equal(f.status, 'skip');
  assert.match(f.message, /directory not found/);
});

test('a plugin that provides no model-invocable skill is a skip', async () => {
  const files = { 'skills/a/SKILL.md': skillMd('a', 'disable-model-invocation: true\n') };
  const f = await l1Claude(files, 'NONE\n');
  assert.equal(f.status, 'skip');
  assert.match(f.message, /no model-invocable skill/);
});

test('the reply is read tolerantly: bullets, numbering, backticks and plugin prefixes; prose is ignored', async () => {
  const files = {
    'skills/alpha/SKILL.md': skillMd('alpha'),
    'skills/beta/SKILL.md': skillMd('beta'),
    'skills/gamma/SKILL.md': skillMd('gamma'),
  };
  const f = await l1Claude(files, 'Here you go:\n- `tools:alpha`\n* beta\n1. gamma\n\nNONE\n');
  assert.equal(f.status, 'pass');
});
