import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { expectedSkills } from '../checks/live-skills.mjs';

const skillMd = (name, extra = '') => `---\nname: ${name}\ndescription: d\n${extra}---\nbody\n`;

test('expectedSkills reads the manifest skills array, using each skill name', () => {
  const dir = fixture({
    '.claude-plugin/plugin.json': JSON.stringify({ skills: ['./skills/eng/tdd', './skills/misc/grill-me'] }),
    'skills/eng/tdd/SKILL.md': skillMd('tdd'),
    'skills/misc/grill-me/SKILL.md': skillMd('grill-me'),
    'skills/eng/unlisted/SKILL.md': skillMd('unlisted'),
  });
  assert.deepEqual(expectedSkills(dir), ['grill-me', 'tdd']);
});

test('expectedSkills falls back to skills/*/SKILL.md without a manifest list', () => {
  const dir = fixture({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'p' }),
    'skills/a/SKILL.md': skillMd('a'),
    'skills/b/SKILL.md': skillMd('b'),
    'skills/notaskill/readme.md': 'x',
  });
  assert.deepEqual(expectedSkills(dir), ['a', 'b']);
});

test('expectedSkills drops user-only skills (disable-model-invocation: true)', () => {
  const dir = fixture({
    '.claude-plugin/plugin.json': JSON.stringify({ skills: ['./skills/a', './skills/b'] }),
    'skills/a/SKILL.md': skillMd('a'),
    'skills/b/SKILL.md': skillMd('b', 'disable-model-invocation: true\n'),
  });
  assert.deepEqual(expectedSkills(dir), ['a']);
});

test('expectedSkills uses the frontmatter name when it differs from the directory', () => {
  const dir = fixture({ 'skills/dir/SKILL.md': skillMd('real-name') });
  assert.deepEqual(expectedSkills(dir), ['real-name']);
});

test('expectedSkills returns null when the directory does not exist', () => {
  assert.equal(expectedSkills(join(fixture(), 'nope')), null);
});
