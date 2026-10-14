// Repo-level check: relative Markdown links and anchors in tracked .md files must resolve.
// Run from the repo root: node --test test/markdown-links.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function stripFences(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
}

function stripCode(text) {
  return stripFences(text).replace(/`[^`\n]*`/g, '');
}

function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function headingSlugs(text) {
  const seen = new Map();
  const slugs = new Set();
  for (const m of stripFences(text).matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/gm)) {
    const plain = m[1].replace(/`/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]+(?=\S)|(?<=\S)[*_]+/g, '');
    const base = slugify(plain);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  }
  return slugs;
}

function extractLinks(text) {
  const links = [];
  for (const m of stripCode(text).matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) links.push(m[1]);
  return links;
}

function findBrokenLinks(files, rootDir) {
  const problems = [];
  const slugCache = new Map();
  const slugsOf = (p) => {
    if (!slugCache.has(p)) slugCache.set(p, headingSlugs(readFileSync(p, 'utf8')));
    return slugCache.get(p);
  };
  for (const file of files) {
    const abs = resolve(rootDir, file);
    for (const link of extractLinks(readFileSync(abs, 'utf8'))) {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link) || link.startsWith('//')) continue;
      const [pathPart, fragment] = link.split('#');
      const target = pathPart ? resolve(dirname(abs), decodeURIComponent(pathPart)) : abs;
      if (!existsSync(target)) {
        problems.push(`${file}: broken link "${link}" (no such file: ${relative(rootDir, target)})`);
        continue;
      }
      if (fragment && target.endsWith('.md') && statSync(target).isFile()) {
        if (!slugsOf(target).has(decodeURIComponent(fragment).toLowerCase())) {
          problems.push(`${file}: broken link "${link}" (no heading "#${fragment}" in ${relative(rootDir, target)})`);
        }
      }
    }
  }
  return problems;
}

test('all relative Markdown links and anchors in tracked files resolve', () => {
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(files.length > 0, 'no tracked Markdown files found');
  const problems = findBrokenLinks(files, root);
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});

test('reports a missing file and missing anchors, naming source and link', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mdlinks-'));
  writeFileSync(join(dir, 'b.md'), '# Real Heading\n');
  writeFileSync(join(dir, 'a.md'),
    '[ok](b.md#real-heading) [self](#top) [ext](https://x.invalid/y#z)\n[bad](nope.md) [bad2](b.md#missing)\n[bad3](#nothing)\n\n# Top\n\n`[code](ignored.md)`\n');
  const problems = findBrokenLinks(['a.md'], dir);
  assert.equal(problems.length, 3, problems.join('\n'));
  assert.match(problems[0], /^a\.md: broken link "nope\.md"/);
  assert.match(problems[1], /^a\.md: broken link "b\.md#missing"/);
  assert.match(problems[2], /^a\.md: broken link "#nothing"/);
});

test('heading slugs follow GitHub rules', () => {
  const s = headingSlugs('# Per-machine steps\n## What? A `code` thing!\n## Dup\n## Dup\n');
  assert.deepEqual([...s], ['per-machine-steps', 'what-a-code-thing', 'dup', 'dup-1']);
});
