import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

// Real CLI JSON shapes (see research host-cli-shapes.md).
const claudeInstalled = (...entries) =>
  entries.map(([id, version = '1.0.0', enabled = false]) => ({
    id, version, scope: 'project', enabled, installPath: `C:\\cache\\${id}`, projectEnabled: false,
  }));
const codexInstalled = (...entries) => ({
  installed: entries.map(([pluginId, version = '1.0.0', enabled = true]) => ({
    pluginId, name: pluginId.split('@')[0], marketplaceName: pluginId.split('@')[1], version,
    installed: true, enabled, source: { source: 'local', path: 'C:\\x' },
  })),
  available: [],
});
const claudeMarkets = (...names) =>
  names.map((name) => ({ name, source: 'github', repo: `o/${name}`, installLocation: `C:\\m\\${name}` }));
const codexMarkets = (...names) => ({
  marketplaces: names.map((name) => ({
    name, root: `C:\\m\\${name}`,
    marketplaceSource: { sourceType: 'git', source: `https://github.com/o/${name}.git` },
  })),
});

const MISSING = { ok: false, error: 'command not found' };
const json = (v) => ({ ok: true, stdout: JSON.stringify(v) });

/** Stub runCommand: per Host { plugins, markets }; an absent Host is not installed. */
function stub({ claude, codex }) {
  return async (cmd, args) => {
    const h = cmd === 'claude' ? claude : codex;
    if (!h) return MISSING;
    if (args[0] === '--version') return { ok: true, stdout: cmd === 'claude' ? '2.1.296 (Claude Code)' : 'codex-cli 0.160.1' };
    if (args[1] === 'list') return h.plugins === undefined ? MISSING : json(h.plugins);
    if (args[1] === 'marketplace' && args[2] === 'list') return h.markets === undefined ? MISSING : json(h.markets);
    return MISSING;
  };
}

const claudeFiles = (plugins, markets = {}) => ({
  '.claude/settings.json': JSON.stringify({
    enabledPlugins: Object.fromEntries(plugins.map((p) => [p, true])),
    extraKnownMarketplaces: Object.fromEntries(
      Object.entries(markets).map(([n, repo]) => [n, { source: { source: 'github', repo } }]),
    ),
  }),
});
const codexFiles = (plugins, markets = {}) => ({
  '.codex/config.toml':
    Object.entries(markets).map(([n, url]) => `[marketplaces.${n}]\nsource_type = "git"\nsource = "${url}"\n`).join('\n') +
    plugins.map((p) => `\n[plugins."${p}"]\nenabled = true\n`).join(''),
});
const files = (plugins, m = 'm') => ({
  ...claudeFiles(plugins, { [m]: `o/${m}` }),
  ...codexFiles(plugins, { [m]: `https://github.com/o/${m}.git` }),
});

const run = async (f, hosts) => runChecks(envFor(fixture(f), { runCommand: stub(hosts) }));
const forHost = (findings, id, host) => find(findings, id).filter((x) => x.host === host);

const ALL_OK = {
  claude: { plugins: claudeInstalled(['a@m']), markets: claudeMarkets('m') },
  codex: { plugins: codexInstalled(['a@m']), markets: codexMarkets('m') },
};

// M3

test('M3 passes per Host when the declared marketplace is registered', async () => {
  const r = await run(files(['a@m']), ALL_OK);
  for (const host of ['claude', 'codex']) {
    const [f] = forHost(r, 'M3', host);
    assert.equal(f.status, 'pass');
    assert.equal(f.layer, 'machine');
  }
});

test('M3 fails with the exact add command when a marketplace is not registered', async () => {
  const r = await run(files(['a@m']), {
    claude: { plugins: claudeInstalled(), markets: claudeMarkets('other') },
    codex: { plugins: codexInstalled(), markets: codexMarkets() },
  });
  const [c] = forHost(r, 'M3', 'claude');
  assert.equal(c.status, 'fail');
  assert.match(c.message, /"m"/);
  assert.equal(c.fix, 'claude plugin marketplace add o/m');
  const [x] = forHost(r, 'M3', 'codex');
  assert.equal(x.status, 'fail');
  assert.equal(x.fix, 'codex plugin marketplace add https://github.com/o/m.git');
});

test('M3 is skipped for a Host whose CLI is missing', async () => {
  const r = await run(files(['a@m']), { claude: ALL_OK.claude });
  assert.equal(forHost(r, 'M3', 'codex')[0].status, 'skip');
  assert.equal(forHost(r, 'M3', 'claude')[0].status, 'pass');
});

test('M3 and M4 name the missing project config file in their skip reason', async () => {
  const r = await run(codexFiles(['a@m'], { m: 'https://github.com/o/m.git' }), ALL_OK);
  for (const id of ['M3', 'M4']) {
    const [f] = forHost(r, id, 'claude');
    assert.equal(f.status, 'skip');
    assert.match(f.message, /\.claude\/settings\.json is missing/);
  }
});

test('M3 and M4 name an unreadable project config file and its error in their skip reason', async () => {
  const r = await run({ '.claude/settings.json': '{ nope' }, ALL_OK);
  for (const id of ['M3', 'M4']) {
    const [f] = forHost(r, id, 'claude');
    assert.equal(f.status, 'skip');
    assert.match(f.message, /\.claude\/settings\.json is not readable \(/);
  }
});

test('M3 and M4 Codex warns give a specific fix when a marketplace root has no supported manifest', async () => {
  const error = 'Command failed: codex plugin list --json | Error: marketplace root does not contain a supported manifest';
  const base = stub(ALL_OK);
  const runCommand = async (cmd, args) =>
    cmd === 'codex' && args[1] !== undefined && args[0] === 'plugin' && args[1] !== '--version' && args[2] !== 'add'
      ? { ok: false, error }
      : base(cmd, args);
  const r = await runChecks(envFor(fixture(files(['a@m'])), { runCommand }));
  for (const id of ['M3', 'M4']) {
    const [f] = forHost(r, id, 'codex');
    assert.equal(f.status, 'warn');
    assert.match(f.message, /supported manifest/);
    assert.match(f.fix, /\.claude-plugin\/marketplace\.json/);
    assert.match(f.fix, /https:\/\/github\.com\/o\/m\.git/);
    assert.match(f.fix, /codex plugin marketplace remove m/);
    assert.match(f.fix, /codex plugin marketplace add https:\/\/github\.com\/o\/m\.git/);
  }
});

test('M3 and M4 warns keep the generic fix for other list errors', async () => {
  const r = await run(files(['a@m']), { claude: ALL_OK.claude, codex: { plugins: undefined, markets: undefined } });
  assert.match(forHost(r, 'M3', 'codex')[0].fix, /codex plugin marketplace list --json/);
  assert.match(forHost(r, 'M4', 'codex')[0].fix, /codex plugin list --json/);
});

test('M3 is skipped when the Host declares no marketplace', async () => {
  const r = await run({}, ALL_OK);
  assert.equal(forHost(r, 'M3', 'claude')[0].status, 'skip');
});

test('M3 warns when the marketplace list command fails', async () => {
  const r = await run(files(['a@m']), { ...ALL_OK, claude: { plugins: claudeInstalled(['a@m']) } });
  const [f] = forHost(r, 'M3', 'claude');
  assert.equal(f.status, 'warn');
  assert.match(f.fix, /claude plugin marketplace list --json/);
});

// M4

test('M4 passes when Claude has the declared plugin installed, whatever the CLI says about enabled', async () => {
  // Claude reports enabled:false for plugins enabled only via project settings.
  const [f] = forHost(await run(files(['a@m']), ALL_OK), 'M4', 'claude');
  assert.equal(f.status, 'pass');
});

test('M4 passes for Codex when the plugin is installed and enabled', async () => {
  assert.equal(forHost(await run(files(['a@m']), ALL_OK), 'M4', 'codex')[0].status, 'pass');
});

test('M4 fails with an install command when the plugin is not installed', async () => {
  const r = await run(files(['a@m']), {
    claude: { plugins: claudeInstalled(), markets: claudeMarkets('m') },
    codex: { plugins: codexInstalled(), markets: codexMarkets('m') },
  });
  assert.equal(forHost(r, 'M4', 'claude')[0].fix, 'claude plugin install a@m');
  assert.equal(forHost(r, 'M4', 'codex')[0].fix, 'codex plugin add a@m');
  assert.equal(forHost(r, 'M4', 'codex')[0].status, 'fail');
});

test('M4 fails when a same-named plugin is installed from a foreign marketplace', async () => {
  const r = await run(files(['a@m']), {
    claude: { plugins: claudeInstalled(['a@evil']), markets: claudeMarkets('m', 'evil') },
    codex: { plugins: codexInstalled(['a@evil']), markets: codexMarkets('m', 'evil') },
  });
  for (const host of ['claude', 'codex']) {
    const [f] = forHost(r, 'M4', host);
    assert.equal(f.status, 'fail');
    assert.match(f.message, /a@evil/);
    assert.match(f.message, /a@m/);
    assert.match(f.fix, new RegExp(`${host} plugin (remove|uninstall) a@evil`));
    assert.match(f.fix, /a@m/);
  }
});

test('M4 fails for Codex when the plugin is installed but disabled', async () => {
  const r = await run(files(['a@m']), {
    ...ALL_OK,
    codex: { plugins: codexInstalled(['a@m', '1.0.0', false]), markets: codexMarkets('m') },
  });
  const [f] = forHost(r, 'M4', 'codex');
  assert.equal(f.status, 'fail');
  assert.match(f.message, /disabled/);
});

test('M4 covers each Host own declared plugins, not only the intersection', async () => {
  const f = {
    ...claudeFiles(['a@m', 'onlyc@m'], { m: 'o/m' }),
    ...codexFiles(['a@m'], { m: 'https://github.com/o/m.git' }),
  };
  const r = await run(f, ALL_OK);
  const [c] = forHost(r, 'M4', 'claude');
  assert.equal(c.status, 'fail');
  assert.match(c.message, /onlyc@m/);
  assert.equal(forHost(r, 'M4', 'codex')[0].status, 'pass');
});

test('M4 is skipped for a missing Host and when nothing is declared', async () => {
  const r = await run(files(['a@m']), { claude: ALL_OK.claude });
  assert.equal(forHost(r, 'M4', 'codex')[0].status, 'skip');
  assert.equal(forHost(await run({}, ALL_OK), 'M4', 'claude')[0].status, 'skip');
});

test('M4 warns when the plugin list command fails', async () => {
  const r = await run(files(['a@m']), { ...ALL_OK, codex: { markets: codexMarkets('m') } });
  assert.equal(forHost(r, 'M4', 'codex')[0].status, 'warn');
});

// M5

test('M5 passes when a Shared plugin has the same version in both Hosts', async () => {
  const [f] = find(await run(files(['a@m']), ALL_OK), 'M5');
  assert.equal(f.status, 'pass');
  assert.equal(f.host, 'both');
});

test('M5 warns on version drift between Hosts, naming both versions', async () => {
  const r = await run(files(['a@m']), {
    claude: { plugins: claudeInstalled(['a@m', '1.3.1']), markets: claudeMarkets('m') },
    codex: { plugins: codexInstalled(['a@m', '1.4.0']), markets: codexMarkets('m') },
  });
  const [f] = find(r, 'M5');
  assert.equal(f.status, 'warn');
  assert.match(f.message, /a@m.*1\.3\.1.*1\.4\.0/);
  assert.match(f.fix, /update/);
});

test('M5 only compares Shared plugins (intersection)', async () => {
  const f = {
    ...claudeFiles(['a@m', 'c@m'], { m: 'o/m' }),
    ...codexFiles(['a@m'], { m: 'https://github.com/o/m.git' }),
  };
  const r = await run(f, {
    claude: { plugins: claudeInstalled(['a@m', '1.0.0'], ['c@m', '9.0.0']), markets: claudeMarkets('m') },
    codex: { plugins: codexInstalled(['a@m', '1.0.0']), markets: codexMarkets('m') },
  });
  assert.equal(find(r, 'M5')[0].status, 'pass');
});

test('M5 is skipped when a Host is missing or there are no Shared plugins', async () => {
  assert.equal(find(await run(files(['a@m']), { claude: ALL_OK.claude }), 'M5')[0].status, 'skip');
  assert.equal(find(await run({}, ALL_OK), 'M5')[0].status, 'skip');
});

test('M5 is skipped for a Shared plugin not installed in a Host (M4 reports that)', async () => {
  const r = await run(files(['a@m']), { ...ALL_OK, codex: { plugins: codexInstalled(), markets: codexMarkets('m') } });
  assert.equal(find(r, 'M5')[0].status, 'skip');
});

// Real `claude plugin list --json` returns one entry per project for project-scoped installs.
const claudeEntry = (version, scope, projectPath) => ({
  id: 'p@m', version, scope, enabled: true, projectEnabled: true, ...(projectPath ? { projectPath } : {}), installPath: 'C:\\c\\p',
});
const runWith = (dir, claudePlugins, codexPlugins = codexInstalled(['p@m'])) =>
  runChecks(envFor(dir, {
    runCommand: stub({
      claude: { plugins: claudePlugins, markets: claudeMarkets('m') },
      codex: { plugins: codexPlugins, markets: codexMarkets('m') },
    }),
  }));

test('M4 ignores a Claude Code install that belongs to another project', async () => {
  const r = await runWith(fixture(files(['p@m'])), [claudeEntry('1.0.0', 'project', 'C:\\Users\\x\\other-project')]);
  const m4 = forHost(r, 'M4', 'claude')[0];
  assert.equal(m4.status, 'fail');
  assert.match(m4.message, /p@m is not installed/);
});

test('M4 uses this project entry when another project comes first, in Windows path forms', async () => {
  const dir = fixture(files(['p@m']));
  const mine = dir.replace(/\//g, '\\').toUpperCase() + '\\';
  const r = await runWith(dir, [claudeEntry('1.0.0', 'project', 'C:\\Users\\x\\other'), claudeEntry('1.0.0', 'project', mine)]);
  assert.equal(forHost(r, 'M4', 'claude')[0].status, 'pass');
});

test('M5 compares the version of this project entry, not another project', async () => {
  const dir = fixture(files(['p@m']));
  const r = await runWith(dir, [claudeEntry('0.9.0', 'project', 'C:\\Users\\x\\other'), claudeEntry('1.0.0', 'project', dir)]);
  assert.equal(find(r, 'M5')[0].status, 'pass');
});

test('M4 accepts a user-scope Claude Code entry', async () => {
  const r = await runWith(fixture(files(['p@m'])), [claudeEntry('1.0.0', 'user')]);
  assert.equal(forHost(r, 'M4', 'claude')[0].status, 'pass');
});
