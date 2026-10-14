// Ties the offline test stubs and the command names in fixes and docs to the installed Host CLIs (#38).
// The helper tests run offline. The CLI tests are opt-in (CHECK_SETUP_HOST_CLI=1) and skip a Host whose CLI
// is not installed; they run each CLI only against temporary Host homes (CODEX_HOME, CLAUDE_CONFIG_DIR), never the user's real config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOST, HOSTS } from '../hosts.mjs';
import { fixture, optIn, runCli, isolatedEnv, REPO_ROOT } from './helpers.mjs';
import { shapeMismatches, helpEntries, commandUsages } from './host-cli.mjs';
import { claudeInstalled, claudeEntry, codexInstalled, claudeMarkets, codexMarkets, claudeMarketplaceResult, claudePluginResult, codexUpgradeResult } from './host-stubs.mjs';

test('shapeMismatches: none when the real output has every stub key with the same type, plus extra keys', () => {
  const stub = { installed: [{ id: 'a@m', version: '1.0.0', source: { source: 'local' } }], available: [] };
  const real = { installed: [{ id: 'x@y', version: '2.0.0', extra: 1, source: { source: 'git', path: 'p' } }], available: [] };
  assert.deepEqual(shapeMismatches(stub, real), []);
});

test('shapeMismatches: names missing keys, type changes and nesting changes by path', () => {
  const stub = { installed: [{ id: 'a@m', enabled: true, source: { source: 'local' } }], n: 1 };
  const real = { installed: [{ pluginId: 'a@m', enabled: 'yes', source: 'local' }], n: null };
  assert.deepEqual(shapeMismatches(stub, real), [
    'installed[0].id: missing in the real output',
    'installed[0].enabled: stub has boolean, real output has string',
    'installed[0].source: stub has object, real output has string',
    'n: stub has number, real output has null',
  ]);
});

test('shapeMismatches: a top-level array versus object, and an empty real array, are mismatches', () => {
  assert.deepEqual(shapeMismatches([{ id: 'a' }], { installed: [] }), ['(root): stub has array, real output has object']);
  assert.deepEqual(shapeMismatches([{ id: 'a' }], []), ['[0]: real output has no entry to compare']);
});

// Help text excerpts as printed by Claude Code 2.1.299 (commander) and codex-cli 0.162.1 (clap).
const CLAUDE_HELP = `Usage: claude plugin|plugins [options] [command]

Options:
  -h, --help                           Display help for command

Commands:
  install|i [options] <plugin>         Install a plugin from available
                                       marketplaces (use plugin@marketplace for
                                       specific marketplace)
  list [options]                       List installed plugins
  marketplace                          Manage Claude Code marketplaces
  uninstall|remove [options] <plugin>  Uninstall an installed plugin
`;
const CODEX_HELP = `Manage Codex plugins

Usage: codex plugin [OPTIONS] <COMMAND>

Commands:
  add          Install a plugin from a configured or remote marketplace
  marketplace  Add, list, upgrade, or remove configured plugin marketplaces
  help         Print this message or the help of the given subcommand(s)

Options:
  -c, --config <key=value>
          Override a configuration value. Examples: - \`-c model="o3"\`

      --ref <REF>
          Git ref to fetch for Git marketplace sources

Examples:
  codex plugin marketplace add owner/repo --ref main
`;

test('helpEntries: reads command names with aliases and flags from commander and clap help', () => {
  const claude = helpEntries(CLAUDE_HELP);
  assert.deepEqual([...claude.commands].sort(), ['i', 'install', 'list', 'marketplace', 'remove', 'uninstall']);
  assert.ok(claude.flags.has('--help'));
  const codex = helpEntries(CODEX_HELP);
  assert.deepEqual([...codex.commands].sort(), ['add', 'help', 'marketplace']);
  assert.ok(codex.flags.has('--config'));
  assert.ok(codex.flags.has('--ref'));
});

test('commandUsages: finds plugin commands and their flags in Markdown', () => {
  const md = 'Run `claude plugin install <plugin>@<marketplace> --scope project`, then\n' +
    '`codex plugin marketplace upgrade <marketplace>` and `codex plugin list --json`.';
  assert.deepEqual(commandUsages(md), [
    { host: 'claude', args: ['plugin', 'install'], flags: ['--scope'] },
    { host: 'codex', args: ['plugin', 'marketplace', 'upgrade'], flags: [] },
    { host: 'codex', args: ['plugin', 'list'], flags: ['--json'] },
  ]);
});

test('commandUsages: finds top-level flags and ignores prose and other commands', () => {
  const md = 'Start `claude --plugin-dir <path>`. Both claude and codex work; `claude -p "x --y"`, `codex exec --skip-git-repo-check`.';
  assert.deepEqual(commandUsages(md), [{ host: 'claude', args: [], flags: ['--plugin-dir'] }]);
});

test('commandUsages: expands ${host} in fix templates to both Hosts and stops at an escaped newline', () => {
  const js = 'const fix = `${host} plugin marketplace remove ${d.name}\\n${host} plugin ${installVerb} ${id}`;';
  assert.deepEqual(commandUsages(js), [
    { host: 'claude', args: ['plugin', 'marketplace', 'remove'], flags: [] },
    { host: 'codex', args: ['plugin', 'marketplace', 'remove'], flags: [] },
    { host: 'claude', args: ['plugin'], flags: [] },
    { host: 'codex', args: ['plugin'], flags: [] },
  ]);
});

// Installed CLIs. Each Host runs in temporary homes only: CODEX_HOME for Codex; CLAUDE_CONFIG_DIR,
// HOME and USERPROFILE for Claude Code, with auto-update and nonessential traffic off.

async function cli(host, args, opts) {
  const r = await runCli(host, args, opts);
  assert.ok(r.ok, r.error);
  return r.stdout;
}

const OPT_IN = 'CHECK_SETUP_HOST_CLI';
const gate = optIn(OPT_IN, 'to run the real Claude Code and Codex CLIs');
const installed = {};
if (gate.optedIn) for (const host of HOSTS) installed[host] = (await runCli(host, ['--version'], { env: isolatedEnv(), cwd: fixture() })).ok;
const skipUnless = (host) => gate.skip || (installed[host] ? false : `${HOST[host].label} CLI is not installed`);

// A local marketplace "m" with plugin "a" 1.0.0, as files relative to the marketplace root.
const MARKETPLACE = {
  '.claude-plugin/marketplace.json': JSON.stringify({ name: 'm', owner: { name: 't' }, plugins: [{ name: 'a', source: './plugins/a', description: 'd' }] }),
  'plugins/a/.claude-plugin/plugin.json': JSON.stringify({ name: 'a', version: '1.0.0', description: 'd' }),
  'plugins/a/skills/s1/SKILL.md': '---\nname: s1\ndescription: d\n---\n',
};
const under = (prefix, files) => Object.fromEntries(Object.entries(files).map(([k, v]) => [`${prefix}/${k}`, v]));
const listJson = async (host, args, opts) => JSON.parse(await cli(host, [...args, '--json'], opts));

test('Claude Code stubs match the keys and nesting of the real plugin and marketplace lists', { skip: skipUnless('claude') }, async () => {
  const env = isolatedEnv();
  const marketplace = fixture(MARKETPLACE);
  const opts = { env, cwd: fixture() };
  await cli('claude', ['plugin', 'marketplace', 'add', marketplace], opts);
  await cli('claude', ['plugin', 'install', 'a@m', '--scope', 'project'], opts);
  // A GitHub marketplace cannot be added offline, so register "g" in the Host's own state file.
  const known = join(env.CLAUDE_CONFIG_DIR, 'plugins', 'known_marketplaces.json');
  const state = JSON.parse(readFileSync(known, 'utf8'));
  state.g = { source: { source: 'github', repo: 'o/g' }, installLocation: marketplace, lastUpdated: new Date().toISOString() };
  writeFileSync(known, JSON.stringify(state));

  const plugins = (await listJson('claude', ['plugin', 'list'], opts)).filter((p) => p?.id === 'a@m');
  assert.deepEqual(shapeMismatches(claudeInstalled(['a@m']), plugins), []);
  assert.deepEqual(shapeMismatches([claudeEntry('1.0.0', 'project', 'C:\\p')], plugins), []);
  const markets = (await listJson('claude', ['plugin', 'marketplace', 'list'], opts)).filter((m) => m?.name === 'g');
  assert.deepEqual(shapeMismatches(claudeMarkets('g'), markets), []);
});

test('Codex stubs match the keys and nesting of the real plugin and marketplace lists', { skip: skipUnless('codex') }, async () => {
  const env = isolatedEnv();
  // A Git marketplace cannot be added offline, so seed its config entry and installed snapshot.
  env.CODEX_HOME = fixture({
    'config.toml': '[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/o/m.git"\n',
    ...under('.tmp/marketplaces/m', MARKETPLACE),
  });
  const opts = { env, cwd: fixture() };
  await cli('codex', ['plugin', 'add', 'a@m'], opts);

  assert.deepEqual(shapeMismatches(codexInstalled(['a@m']), await listJson('codex', ['plugin', 'list'], opts)), []);
  assert.deepEqual(shapeMismatches(codexMarkets('m'), await listJson('codex', ['plugin', 'marketplace', 'list'], opts)), []);
});

// Write commands of the setup skill (#65): the stubs of host-stubs.mjs against real output.
const projectOpts = (env) => ({ env, cwd: fixture({ 'README.md': 'x' }) });
// Claude Code prints one line (the last on stdout); Codex pretty-prints the whole stdout.
const lastJson = (text) => {
  try { return JSON.parse(text); } catch { return JSON.parse(text.trim().split(/\r?\n/).filter(Boolean).at(-1)); }
};

test('Claude Code stubs match the keys and nesting of the real marketplace add|update and plugin install|update results', { skip: skipUnless('claude') }, async () => {
  const env = isolatedEnv();
  const marketplace = fixture(MARKETPLACE);
  const opts = projectOpts(env);
  const run = async (args) => lastJson(await cli('claude', [...args, '--json'], opts));
  const real = {
    add: await run(['plugin', 'marketplace', 'add', marketplace, '--scope', 'project']),
    update: await run(['plugin', 'marketplace', 'update', 'm']),
    install: await run(['plugin', 'install', 'a@m', '--scope', 'project']),
    pluginUpdate: await run(['plugin', 'update', 'a@m', '--scope', 'project']),
  };
  assert.deepEqual(shapeMismatches(claudeMarketplaceResult('marketplace-add', 'm'), real.add), []);
  assert.deepEqual(shapeMismatches(claudeMarketplaceResult('marketplace-update', 'm'), real.update), []);
  assert.deepEqual(shapeMismatches(claudePluginResult('install', 'a@m'), real.install), []);
  assert.deepEqual(shapeMismatches(claudePluginResult('update', 'a@m'), real.pluginUpdate), []);

  // Failures exit non-zero and print the same object with outcome "failed" and a failureCode.
  const badMarketplace = await runCli('claude', ['plugin', 'marketplace', 'update', 'nosuch', '--json'], opts);
  const badPlugin = await runCli('claude', ['plugin', 'install', 'nosuch@m', '--scope', 'project', '--json'], opts);
  assert.equal(badMarketplace.ok, false);
  assert.equal(badPlugin.ok, false);
  assert.deepEqual(shapeMismatches(claudeMarketplaceResult('marketplace-update', 'nosuch', 'failed'), lastJson(badMarketplace.stdout)), []);
  assert.deepEqual(shapeMismatches(claudePluginResult('install', 'nosuch@m', 'failed'), lastJson(badPlugin.stdout)), []);
});

test('Codex stub matches the keys and nesting of the real marketplace upgrade result', { skip: skipUnless('codex') }, async () => {
  const env = isolatedEnv();
  const source = fixture(MARKETPLACE);
  for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'm']]) {
    const r = await runCli('git', args, { env, cwd: source });
    assert.ok(r.ok, r.error);
  }
  env.CODEX_HOME = fixture({
    'config.toml': `[marketplaces.m]\nsource_type = "git"\nsource = ${JSON.stringify(source)}\n`,
    ...under('.tmp/marketplaces/m', MARKETPLACE),
  });
  const opts = projectOpts(env);
  const upgraded = lastJson(await cli('codex', ['plugin', 'marketplace', 'upgrade', 'm', '--json'], opts));
  assert.deepEqual(shapeMismatches(codexUpgradeResult(['m']), upgraded), []);

  // A marketplace that is not configured exits non-zero; setup counts that as a failed step.
  assert.equal((await runCli('codex', ['plugin', 'marketplace', 'upgrade', 'nosuch', '--json'], opts)).ok, false);
});

// Docs and code whose commands users run: checklist fixes, check-setup sources, agent docs.
const SCRIPTS = 'skills/check-setup/scripts';
const SETUP_SCRIPTS = 'skills/setup/scripts';
function documentedUsages() {
  const files = [
    'README.md',
    'skills/check-setup/SKILL.md',
    'skills/check-setup/checklist.md',
    'skills/setup/SKILL.md',
    ...readdirSync(join(REPO_ROOT, SETUP_SCRIPTS)).filter((f) => f.endsWith('.mjs')).map((f) => `${SETUP_SCRIPTS}/${f}`),
    ...readdirSync(join(REPO_ROOT, 'docs/agents')).map((f) => `docs/agents/${f}`),
    ...readdirSync(join(REPO_ROOT, SCRIPTS)).filter((f) => f.endsWith('.mjs')).map((f) => `${SCRIPTS}/${f}`),
    ...readdirSync(join(REPO_ROOT, SCRIPTS, 'checks')).map((f) => `${SCRIPTS}/checks/${f}`),
  ];
  return [
    ...files.flatMap((file) => commandUsages(readFileSync(join(REPO_ROOT, file), 'utf8')).map((u) => ({ ...u, file }))),
    ...setupStepUsages(),
  ];
}

// The setup skill builds its write commands as argument arrays: step('claude', ['plugin', 'marketplace', 'add', arg, '--scope', ...]).
// Literal words are commands up to the first non-literal; literals starting with "--" are flags. `verb` is install or update.
export function stepUsages(source, file) {
  const out = [];
  for (const [, host, list] of source.matchAll(/step\('(claude|codex)',\s*\[([^\]]*)\]/g)) {
    const items = list.split(',').map((s) => s.trim());
    for (const verb of items.includes('verb') ? ['install', 'update'] : [null]) {
      const words = items.map((s) => (s === 'verb' ? verb : (s.match(/^'([^']*)'$/)?.[1] ?? null)));
      const end = words.indexOf(null);
      out.push({ host, args: words.slice(0, end < 0 ? words.length : end), flags: words.filter((w) => w?.startsWith('--')), file });
    }
  }
  return out;
}
function setupStepUsages() {
  const file = `${SETUP_SCRIPTS}/setup.mjs`;
  return stepUsages(readFileSync(join(REPO_ROOT, file), 'utf8'), file);
}

test('stepUsages: reads commands and flags of step() argument arrays, expanding verb', () => {
  const src = "step('claude', ['plugin', 'marketplace', 'add', arg, '--scope', 'project', '--json'], c)\nstep('claude', ['plugin', verb, id, '--json'], c)\nstep('codex', ['plugin', 'marketplace', 'upgrade', name, '--json'], c)";
  assert.deepEqual(stepUsages(src, 'f').map(({ host, args, flags }) => [host, args.join(' '), flags.join(' ')]), [
    ['claude', 'plugin marketplace add', '--scope --json'],
    ['claude', 'plugin install', '--json'],
    ['claude', 'plugin update', '--json'],
    ['codex', 'plugin marketplace upgrade', '--json'],
  ]);
});

for (const host of HOSTS) {
  test(`${HOST[host].label}: every command and flag named in fixes and docs exists in the CLI help`, { skip: skipUnless(host) }, async () => {
    const { installVerb, uninstallVerb } = HOST[host];
    const usages = [
      ...documentedUsages().filter((u) => u.host === host),
      ...[installVerb, uninstallVerb].map((verb) => ({ args: ['plugin', verb], flags: [], file: `${SCRIPTS}/hosts.mjs` })),
    ];
    assert.ok(usages.some((u) => u.args.length === 3), 'no documented plugin command found; is the scan broken?');
    const opts = { env: isolatedEnv(), cwd: fixture() };
    const help = new Map();
    const helpOf = async (args) => {
      const key = args.join(' ');
      if (!help.has(key)) help.set(key, helpEntries(await cli(host, [...args, '--help'], opts)));
      return help.get(key);
    };
    const problems = [];
    for (const { args, flags, file } of usages) {
      const named = [host, ...args].join(' ');
      for (let i = 0; i < args.length; i++) {
        if (!(await helpOf(args.slice(0, i))).commands.has(args[i])) problems.push(`${file}: \`${named}\`: no command "${args[i]}"`);
      }
      for (const flag of flags) {
        if (!(await helpOf(args)).flags.has(flag)) problems.push(`${file}: \`${named}\`: no flag ${flag}`);
      }
    }
    assert.deepEqual([...new Set(problems)], []);
  });
}
