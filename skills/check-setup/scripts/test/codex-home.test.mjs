// #49: every check that reads Codex user state follows $CODEX_HOME (env.codexHome), not ~/.codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runChecks } from '../check-setup.mjs';
import { HOST } from '../hosts.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const POSIX = '/home/jan/repo';
const PLUGIN = 'tools@m';
const installed = async (cmd) =>
  cmd === 'claude' ? { ok: true, stdout: `${HOST.claude.testedVersion} (Claude Code)` } : { ok: true, stdout: `codex-cli ${HOST.codex.testedVersion}` };

// A trap in ~/.codex (homeDir) and the real state in $CODEX_HOME (codexHome).
const homes = (trap, real) => {
  const homeDir = fixture(Object.fromEntries(Object.entries(trap).map(([k, v]) => [`.codex/${k}`, v])));
  return { homeDir, codexHome: fixture(real) };
};

test('M2 reads the trust entry from $CODEX_HOME/config.toml, not ~/.codex', async () => {
  const trusted = `[projects.'${POSIX}']\ntrust_level = "trusted"\n`;
  const run = async (trap, real) =>
    find(await runChecks(envFor(POSIX, { platform: 'linux', runCommand: installed, ...homes(trap, real) })), 'M2').find((f) => f.host === 'codex');
  assert.equal((await run({ 'config.toml': '' }, { 'config.toml': trusted })).status, 'pass');
  const f = await run({ 'config.toml': trusted }, {});
  assert.equal(f.status, 'fail');
  assert.match(f.message, /config\.toml/);
  assert.doesNotMatch(f.message, /~\/\.codex/);
  assert.doesNotMatch(f.fix, /~\/\.codex/);
});

test('M6 reads [features] plugins from $CODEX_HOME/config.toml and names that file', async () => {
  const h = homes({ 'config.toml': '[features]\nplugins = true\n' }, { 'config.toml': '[features]\nplugins = false\n' });
  const [f] = find(await runChecks(envFor(fixture(), { platform: 'linux', runCommand: installed, ...h })), 'M6');
  assert.equal(f.status, 'fail');
  assert.ok(f.message.includes(join(h.codexHome, 'config.toml')), f.message);
  assert.doesNotMatch(f.message, /~\/\.codex/);
  const h2 = homes({ 'config.toml': '[features]\nplugins = false\n' }, {});
  const [g] = find(await runChecks(envFor(fixture(), { platform: 'linux', runCommand: installed, ...h2 })), 'M6');
  assert.equal(g.status, 'pass');
});

test('L1 finds the Codex plugin cache under $CODEX_HOME/plugins/cache', async () => {
  const skill = '---\nname: alpha\ndescription: d\n---\n';
  const projectDir = fixture({
    '.claude/settings.json': JSON.stringify({ enabledPlugins: { [PLUGIN]: true } }),
    '.codex/config.toml': `[plugins."${PLUGIN}"]\nenabled = true\n`,
  });
  const h = homes({}, { 'plugins/cache/m/tools/1.0.0/skills/alpha/SKILL.md': skill });
  const runCommand = async (cmd, args) => {
    if (args[0] === '--version') return { ok: true, stdout: '0.162.1' };
    if (args[1] === 'list') return { ok: true, stdout: JSON.stringify({ installed: [{ pluginId: PLUGIN, version: '1.0.0', installed: true, enabled: true }] }) };
    return { ok: true, stdout: 'alpha' };
  };
  const findings = await runChecks(envFor(projectDir, { runCommand, live: true, ...h }));
  const f = find(findings, 'L1').find((x) => x.host === 'codex');
  assert.equal(f.status, 'pass', JSON.stringify(f));
});

test('M4 disabled-plugin fix names the config file under $CODEX_HOME', async () => {
  const projectDir = fixture({
    '.claude/settings.json': JSON.stringify({
      enabledPlugins: { [PLUGIN]: true },
      extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' } } },
    }),
    '.codex/config.toml': `[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/o/m.git"\n\n[plugins."${PLUGIN}"]\nenabled = true\n`,
  });
  const h = homes({}, {});
  const runCommand = async (cmd, args) => {
    if (args[0] === '--version') return { ok: true, stdout: '0.162.1' };
    if (args[1] === 'marketplace') return { ok: true, stdout: JSON.stringify({ marketplaces: [{ name: 'm' }] }) };
    if (args[1] === 'list') return { ok: true, stdout: JSON.stringify({ installed: [{ pluginId: PLUGIN, version: '1.0.0', installed: true, enabled: false }], available: [] }) };
    return { ok: true, stdout: '[]' };
  };
  const f = find(await runChecks(envFor(projectDir, { runCommand, ...h })), 'M4').find((x) => x.host === 'codex');
  assert.equal(f.status, 'fail', JSON.stringify(f));
  assert.ok(f.fix.includes(join(h.codexHome, 'config.toml')), f.fix);
});
