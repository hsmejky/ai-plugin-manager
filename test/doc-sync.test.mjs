// Repo-level check: facts that several files repeat must stay in step, and references must resolve.
// Run from the repo root: node --test test/doc-sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const scripts = 'skills/check-setup/scripts';

const hostsSource = read(`${scripts}/hosts.mjs`);
const testedClaude = /label: 'Claude Code',\s*testedVersion: '([\d.]+)'/.exec(hostsSource)?.[1];
const testedCodex = /label: 'Codex',\s*testedVersion: '([\d.]+)'/.exec(hostsSource)?.[1];

test('tested Host versions are read from hosts.mjs', () => {
  assert.match(testedClaude ?? '', /^\d+\.\d+\.\d+$/);
  assert.match(testedCodex ?? '', /^\d+\.\d+\.\d+$/);
});

test('checklist M1 names the tested versions of hosts.mjs', () => {
  const m1 = /### M1[\s\S]*?(?=\n### )/.exec(read('skills/check-setup/checklist.md'))?.[0] ?? '';
  assert.ok(m1.includes(`Claude Code ${testedClaude}`), `M1 lacks Claude Code ${testedClaude}`);
  assert.ok(m1.includes(`codex-cli ${testedCodex}`), `M1 lacks codex-cli ${testedCodex}`);
});

test('the sharing doc prerequisites name the tested versions of hosts.mjs', () => {
  const line = read('docs/agents/claude-codex-sharing.md').split('\n').find((l) => l.includes('**Prerequisites:**')) ?? '';
  assert.ok(line.includes(`Claude Code ${testedClaude}`), `Prerequisites lack Claude Code ${testedClaude}`);
  assert.ok(line.includes(`codex-cli ${testedCodex}`), `Prerequisites lack codex-cli ${testedCodex}`);
});

test('the Node.js minimum in SKILL.md and verification.md matches package.json engines', () => {
  const min = /"node":\s*">=(\d+)"/.exec(read(`${scripts}/package.json`))?.[1];
  assert.ok(min, 'engines.node not found');
  assert.match(read('skills/check-setup/SKILL.md'), new RegExp(`Node\\.js >= ${min}\\b`));
  assert.match(read('docs/agents/verification.md'), new RegExp(`Node\\.js ${min} or later`));
});

// References to docs/research notes: "research <file>.md" prose and `docs/research/<file>.md` paths (backticked or linked).
const RESEARCH_REFS = [/\bresearch\s+(?:note\s+)?`?([\w.-]+\.md)\b/g, /docs\/research\/([\w.-]+\.md)\b/g];

/** { dangling: ["<file>: <note>"], seen: number of references } over all tracked .md/.mjs files. */
function researchReferences(readText, exists) {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((f) => /\.(md|mjs)$/.test(f) && f !== 'test/doc-sync.test.mjs');
  const dangling = [];
  let seen = 0;
  for (const f of files) {
    for (const re of RESEARCH_REFS) {
      for (const m of readText(f).matchAll(re)) {
        seen++;
        if (!exists(m[1])) dangling.push(`${f}: ${m[1]}`);
      }
    }
  }
  return { dangling, seen };
}

test('research references point at an existing docs/research file, and the test sees references', () => {
  const { dangling, seen } = researchReferences((f) => readFileSync(join(root, f), 'utf8'), (n) => existsSync(join(root, 'docs/research', n)));
  assert.ok(seen > 0, 'no research reference found: the pattern matches nothing, so this test is vacuous');
  assert.deepEqual(dangling, []);
});

test('research reference test: a backticked path to a missing note is reported', () => {
  const { dangling } = researchReferences((f) => (f === 'skills/check-setup/checklist.md' ? 'Source: `docs/research/no-such-note.md`' : ''), () => false);
  assert.deepEqual(dangling, ['skills/check-setup/checklist.md: no-such-note.md']);
});

test('every check id the scripts emit has a "### <id>" checklist heading, and every heading has an id', () => {
  const dir = join(root, scripts);
  const sources = [join(dir, 'trust.mjs'), ...readdirSync(join(dir, 'checks')).map((n) => join(dir, 'checks', n))].filter((p) => p.endsWith('.mjs'));
  const emitted = new Set();
  for (const p of sources) for (const m of readFileSync(p, 'utf8').matchAll(/\bid: '([A-Z]\d+)'/g)) emitted.add(m[1]);
  const checklist = read('skills/check-setup/checklist.md');
  const headings = [...checklist.matchAll(/^### (.*)$/gm)].map((m) => m[1]);
  const ids = new Set(headings.map((h) => /^([A-Z]\d+):/.exec(h)?.[1]).filter(Boolean));
  assert.ok(emitted.size >= 15, `only ${emitted.size} script ids found`);
  assert.deepEqual([...emitted].filter((i) => !ids.has(i)).sort(), [], 'script ids without a checklist heading');
  assert.deepEqual([...ids].filter((i) => !emitted.has(i)).sort(), [], 'checklist headings without a script id');
  assert.deepEqual(headings.filter((h) => !/^[A-Z]\d+:/.test(h)), [], 'checklist ### headings that are not "<id>: ..."');
});

test('verification.md lists manual checks with the Host versions they were last confirmed on', () => {
  const text = read('docs/agents/verification.md');
  const section = /## Manual checks of Host behaviour[\s\S]*?(?=\n## |$)/.exec(text)?.[0] ?? '';
  assert.ok(section, 'section "Manual checks of Host behaviour" missing');
  assert.match(section, /Claude Code \d+\.\d+\.\d+/);
  assert.match(section, /codex-cli \d+\.\d+\.\d+/);
});
