// Live verification of the setup skill (opt-in): SETUP_LIVE=1 node --test skills/setup/scripts/test/live-setup.test.mjs
// Needs network, no login. Everything the Hosts write goes to temporary CLAUDE_CONFIG_DIR, HOME, USERPROFILE and
// CODEX_HOME and to a temporary git copy of this repository's Project setup; the test (not the skill) seeds trust
// there. The real ~/.claude.json, ~/.claude/settings.json and ~/.codex/config.toml must keep their SHA-256.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fixture, isolatedEnv, optIn, removeIsolated, runCli, REPO_ROOT } from '../../../check-setup/scripts/test/helpers.mjs';

const live = optIn('SETUP_LIVE', 'to run the setup skill against the installed Hosts (network, temporary homes only)');
const SETUP = join(REPO_ROOT, 'skills', 'setup', 'scripts', 'setup.mjs');
const CHECK = join(REPO_ROOT, 'skills', 'check-setup', 'scripts', 'check-setup.mjs');
const sha = (file) => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null);
const REAL = [join(homedir(), '.claude.json'), join(homedir(), '.claude', 'settings.json'), join(homedir(), '.codex', 'config.toml')];

test('setup plan, apply and a second plan against the installed Hosts', { skip: live.skip, timeout: 600000 }, async (t) => {
  const realBefore = REAL.map(sha);
  const env = isolatedEnv();
  const project = fixture();
  t.after(() => {
    removeIsolated(env);
    rmSync(project, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  for (const rel of ['.claude/settings.json', '.codex/config.toml', 'AGENTS.md', 'CLAUDE.md', '.gitattributes']) {
    if (!existsSync(join(REPO_ROOT, rel))) continue;
    mkdirSync(join(project, rel, '..'), { recursive: true });
    cpSync(join(REPO_ROOT, rel), join(project, rel));
  }
  const key = project.replace(/\\/g, '/');
  writeFileSync(join(env.HOME, '.claude.json'), JSON.stringify({ projects: { [key]: { hasTrustDialogAccepted: true } } }));
  const codexKey = process.platform === 'win32' ? project.replace(/\//g, '\\').toLowerCase() : project;
  writeFileSync(join(env.CODEX_HOME, 'config.toml'), `[projects.'${codexKey}']\ntrust_level = "trusted"\n`);
  const committed = ['.claude/settings.json', '.codex/config.toml'].map((r) => [r, sha(join(project, r))]);

  const node = (args) => runCli(process.execPath, args, { env, cwd: project, timeout: 600000 });
  const plan = await node([SETUP, 'plan', '--project', project]);
  assert.ok(plan.ok, plan.error);
  const planned = JSON.parse(plan.stdout);
  assert.equal(planned.hosts.claude.status, 'ready');
  assert.equal(planned.hosts.codex.status, 'ready');

  const applied = await node([SETUP, 'apply', '--expect', planned.digest, '--project', project]);
  const report = JSON.parse(applied.stdout);
  assert.equal(report.exit, 0, applied.stdout);

  const check = JSON.parse((await node([CHECK, '--project', project])).stdout);
  const bad = check.findings.filter((f) => f.status === 'fail' && /^(M[234]|P\d)$/.test(f.id));
  assert.deepEqual(bad, []);
  for (const [rel, hash] of committed) assert.equal(sha(join(project, rel)), hash, `${rel} changed`);

  const again = JSON.parse((await node([SETUP, 'plan', '--project', project])).stdout);
  const lines = Object.values(again.hosts).flatMap((h) => h.steps.map((s) => s.args.join(' ')));
  assert.deepEqual(lines.filter((l) => /marketplace add|plugin install/.test(l)), []);

  // Each Host's install of this plugin contains check-setup's script.
  const claudeList = JSON.parse((await runCli('claude', ['plugin', 'list', '--json'], { env, cwd: project })).stdout);
  const claudeDir = claudeList.find((p) => p.id === 'ai-plugin-manager@ai-plugin-manager')?.installPath;
  assert.ok(claudeDir && existsSync(join(claudeDir, 'skills', 'check-setup', 'scripts', 'check-setup.mjs')), 'Claude Code install');
  const cache = join(env.CODEX_HOME, 'plugins', 'cache', 'ai-plugin-manager', 'ai-plugin-manager');
  const version = readdirSync(cache)[0];
  assert.ok(existsSync(join(cache, version, 'skills', 'check-setup', 'scripts', 'check-setup.mjs')), 'Codex install');
  // Settles whether the named `codex plugin marketplace upgrade` installs: the Codex plugins were not installed before apply.
  assert.ok(report.hosts.codex.changes.some((c) => c.id === 'ai-plugin-manager@ai-plugin-manager' && c.before === null));

  // A running Claude Code session rewrites ~/.claude.json on its own, so its hash is not stable; it must only not know the test project.
  REAL.slice(1).forEach((file, i) => assert.equal(sha(file), realBefore[i + 1], `${file} changed`));
  assert.ok(!(readFileSync(REAL[0], 'utf8') + '').toLowerCase().includes(key.toLowerCase()), '~/.claude.json mentions the test project');
});
