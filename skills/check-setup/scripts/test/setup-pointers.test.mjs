// check-setup fixes that the setup skill can apply point to it (spec #71); the others do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';
import { claudeInstalled, codexInstalled, claudeMarkets, codexMarkets } from './host-stubs.mjs';

const CLAUDE_CALL = '/ai-plugin-manager:setup';
const CODEX_CALL = '$ai-plugin-manager:setup';
const points = (fix, flags = '') => {
  const tail = flags ? ` ${flags}` : '';
  assert.ok(fix.includes(`\`${CLAUDE_CALL}${tail}\` (Claude Code)`), fix);
  assert.ok(fix.includes(`\`${CODEX_CALL}${tail}\` (Codex)`), fix);
};

const MISSING = { ok: false, error: 'command not found' };
const json = (v) => ({ ok: true, stdout: JSON.stringify(v) });
function stub({ claude, codex }) {
  return async (cmd, args) => {
    const h = cmd === 'claude' ? claude : codex;
    if (!h) return MISSING;
    if (args[0] === '--version') return { ok: true, stdout: cmd === 'claude' ? '2.1.299 (Claude Code)' : 'codex-cli 0.162.1' };
    if (args[1] === 'list') return json(h.plugins);
    if (args[1] === 'marketplace' && args[2] === 'list') return json(h.markets);
    return MISSING;
  };
}
const run = async (files, hosts = {}) => runChecks(envFor(fixture(files), { runCommand: stub(hosts) }));
const claude = (plugins, markets = {}, extra = {}) => ({
  '.claude/settings.json': JSON.stringify({
    enabledPlugins: Object.fromEntries(plugins.map((p) => [p, true])),
    extraKnownMarketplaces: Object.fromEntries(
      Object.entries(markets).map(([n, repo]) => [n, { source: { source: 'github', repo, ...extra }, autoUpdate: true }]),
    ),
  }),
});
const codex = (plugins, markets = {}, extra = '') => ({
  '.codex/config.toml':
    Object.entries(markets).map(([n, url]) => `[marketplaces.${n}]\nsource_type = "git"\nsource = "${url}"\n${extra}`).join('\n') +
    plugins.map((p) => `\n[plugins."${p}"]\nenabled = true\n`).join(''),
});
const U = 'https://github.com/o/m.git';
const only = (findings, id, host) => find(findings, id).filter((f) => !host || f.host === host)[0];

test('M3 keeps its add command and points to setup without a flag', async () => {
  const r = await run({ ...claude(['a@m'], { m: 'o/m' }), ...codex(['a@m'], { m: U }) }, {
    claude: { plugins: claudeInstalled(), markets: claudeMarkets() },
    codex: { plugins: codexInstalled(), markets: codexMarkets() },
  });
  for (const [host, cmd] of [['claude', 'claude plugin marketplace add o/m'], ['codex', `codex plugin marketplace add ${U}`]]) {
    const f = only(r, 'M3', host);
    assert.equal(f.status, 'fail');
    assert.ok(f.fix.startsWith(cmd + '\n'), f.fix);
    points(f.fix);
  }
});

test('M4 keeps its install command and points to setup without a flag', async () => {
  const r = await run({ ...claude(['a@m'], { m: 'o/m' }), ...codex(['a@m'], { m: U }) }, {
    claude: { plugins: claudeInstalled(), markets: claudeMarkets('m') },
    codex: { plugins: codexInstalled(), markets: codexMarkets('m') },
  });
  const c = only(r, 'M4', 'claude');
  assert.ok(c.fix.startsWith('claude plugin install a@m\n'), c.fix);
  points(c.fix);
  const x = only(r, 'M4', 'codex');
  assert.ok(x.fix.startsWith('codex plugin add a@m\n'), x.fix);
  points(x.fix);
});

test('M5 keeps its update commands and points to setup for version drift only', async () => {
  const hosts = (cv, xv) => ({
    claude: { plugins: claudeInstalled(['a@m', cv]), markets: claudeMarkets('m') },
    codex: { plugins: codexInstalled(['a@m', xv]), markets: codexMarkets('m') },
  });
  const files = { ...claude(['a@m'], { m: 'o/m' }), ...codex(['a@m'], { m: U }) };
  const drift = only(await run(files, hosts('1.3.1', '1.4.0')), 'M5');
  assert.equal(drift.status, 'warn');
  assert.match(drift.fix, /claude plugin update a@m/);
  points(drift.fix);
  const unknown = only(await run(files, hosts('unknown', 'local')), 'M5');
  assert.equal(unknown.status, 'warn');
  assert.doesNotMatch(unknown.fix, /ai-plugin-manager:setup/);
});

test('P3 points to setup --add when Codex declares the marketplace', async () => {
  const f = only(await run({ ...claude(['a@m', 'b@m']), ...codex(['a@m'], { m: U }) }), 'P3');
  assert.equal(f.status, 'fail');
  assert.match(f.fix, /extraKnownMarketplaces/);
  points(f.fix, '--add a@m');
  points(f.fix, '--add b@m');
});

test('P3 does not point to setup when Codex does not declare the marketplace', async () => {
  const f = only(await run(claude(['a@m'])), 'P3');
  assert.equal(f.status, 'fail');
  assert.doesNotMatch(f.fix, /ai-plugin-manager:setup/);
});

test('P4 points to setup --add for undeclared Codex plugins and a missing config', async () => {
  const f = only(await run(codex(['a@m'])), 'P4');
  assert.equal(f.status, 'fail');
  assert.match(f.fix, /\[marketplaces\.m\]/);
  points(f.fix, '--add a@m');
  const g = only(await run(claude(['a@m'], { m: 'o/m' })), 'P4');
  assert.equal(g.status, 'fail');
  assert.match(g.fix, /\.codex\/config\.toml/);
  points(g.fix, '--add a@m');
});

test('P4 does not point to setup for malformed TOML', async () => {
  const f = only(await run({ '.codex/config.toml': '[oops' }), 'P4');
  assert.equal(f.status, 'fail');
  assert.doesNotMatch(f.fix, /ai-plugin-manager:setup/);
});

test('P5 points to setup --add for the plugin missing on the other Host', async () => {
  const f = only(await run({ ...claude(['a@m', 'b@m'], { m: 'o/m' }), ...codex(['a@m', 'c@m'], { m: U }) }), 'P5');
  assert.equal(f.status, 'warn');
  assert.match(f.fix, /Host-specific/);
  points(f.fix, '--add b@m');
  points(f.fix, '--add c@m');
});

test('P8 points to setup --pin and --unpin for a bad Codex ref', async () => {
  const f = only(await run(codex([], { m: U }, 'ref = "a157af3"\n')), 'P8');
  assert.equal(f.status, 'warn');
  assert.match(f.fix, /full 40-character SHA/);
  points(f.fix, '--pin m --ref <tag>');
  points(f.fix, '--unpin m');
});

test('P9 points to setup --pin and --unpin for drifting pins', async () => {
  const f = only(await run({ ...claude(['a@m'], { m: 'o/m' }, { ref: 'v0.5.0' }), ...codex(['a@m'], { m: U }) }), 'P9');
  assert.equal(f.status, 'warn');
  assert.match(f.fix, /ref = "v0\.5\.0"/);
  points(f.fix, '--pin m --ref v0.5.0');
  points(f.fix, '--unpin m');
  const sha = 'a157af3' + '0'.repeat(33);
  const g = only(await run({ ...claude(['a@m'], { m: 'o/m' }), ...codex(['a@m'], { m: U }, `ref = "${sha}"\n`) }), 'P9');
  assert.match(g.fix, /tag on both Hosts/);
  points(g.fix, '--pin m --ref <tag>');
  points(g.fix, '--unpin m');
});

test('the fixes of P1, P2, P6, P7, M1, M2 and M6 do not point to setup', async () => {
  const files = {
    '.claude/settings.json': JSON.stringify({
      enabledPlugins: { 'a@m': true },
      extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' } } },
    }),
    ...codex(['a@m'], { m: 'https://github.com/o/other.git' }),
  };
  files['.codex/config.toml'] += '\n[features]\nplugins = false\n';
  const absent = await run(files, {});
  const present = await run(files, {
    claude: { plugins: claudeInstalled(), markets: claudeMarkets() },
    codex: { plugins: codexInstalled(), markets: codexMarkets() },
  });
  const seen = new Set();
  for (const f of [...absent, ...present]) {
    if (!['P1', 'P2', 'P6', 'P7', 'M1', 'M2', 'M6'].includes(f.id) || !f.fix) continue;
    seen.add(f.id);
    assert.doesNotMatch(f.fix, /ai-plugin-manager:setup/, `${f.id}: ${f.fix}`);
  }
  for (const id of ['P1', 'P2', 'P6', 'P7', 'M1']) assert.ok(seen.has(id), `${id} fixture produced no fix`);
});
