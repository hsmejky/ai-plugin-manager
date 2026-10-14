// Test support: a stateful fake of the two Host CLIs and of a project, home and Codex home on disk.
// The fake answers `--version`, the list commands and the write commands the setup skill runs, with
// JSON shaped like skills/check-setup/scripts/test/host-stubs.mjs, and changes its state like the
// Hosts do (research note plugin-install-update-cli-2026-10-14.md): Claude `marketplace add --scope
// project` rewrites the project's settings file without `autoUpdate` (and with LF endings); Codex
// `marketplace upgrade` installs the enabled plugins of a declared marketplace and bumps versions.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  claudeInstalled, claudeMarkets, codexInstalled, codexMarkets,
  claudeMarketplaceResult, claudePluginResult, codexUpgradeResult,
} from '../../../check-setup/scripts/test/host-stubs.mjs';

const CLAUDE_SETTINGS = {
  enabledPlugins: { 'mattpocock-skills@mattpocock': true, 'ai-plugin-manager@ai-plugin-manager': true },
  extraKnownMarketplaces: {
    mattpocock: { source: { source: 'github', repo: 'mattpocock/skills' }, autoUpdate: true },
    'ai-plugin-manager': { source: { source: 'github', repo: 'hsmejky/ai-plugin-manager' }, autoUpdate: true },
  },
};

export const CODEX_CONFIG = `[marketplaces.mattpocock]
source_type = "git"
source = "https://github.com/mattpocock/skills.git"

[plugins."mattpocock-skills@mattpocock"]
enabled = true

[marketplaces.ai-plugin-manager]
source_type = "git"
source = "https://github.com/hsmejky/ai-plugin-manager.git"

[plugins."ai-plugin-manager@ai-plugin-manager"]
enabled = true
`;

/** What each declared marketplace offers: `claudeArg` is what `marketplace add` receives. */
export const CATALOG = {
  mattpocock: { claudeArg: 'mattpocock/skills', plugins: { 'mattpocock-skills': '1.3.1' } },
  'ai-plugin-manager': { claudeArg: 'hsmejky/ai-plugin-manager', plugins: { 'ai-plugin-manager': '0.6.0' } },
};

const tmp = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'setup-test-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
};

/** Normalised form of a project path as Codex keys it in `[projects]`. */
export const codexKey = (dir, platform) => (platform === 'win32' ? dir.replace(/\//g, '\\').toLowerCase() : dir);

/**
 * A machine: project, home, Codex home and Host CLIs. Options:
 *   claudeSettings / codexConfig: committed file text (default: the repository's own setup);
 *   claude / codex: Host installed (default true); trusted: { claude, codex } (default true);
 *   platform; codexEnv: set env.codexHome; failClaude(args) -> JSON failure; failCodex: Codex upgrade fails;
 *   installed: { claude: { id: version }, codex: { id: version } } already installed;
 *   registered: { claude: [names], codex: [names] } already registered; registeredRefs: { claude: { name: ref } }
 *   the ref a registered Claude marketplace was added with (shown by `marketplace list --json`); codexFeaturesOff.
 * Returns { env, projectDir, calls, writes, settingsPath, claudeSettingsText }.
 */
export function machine(opts = {}) {
  const platform = opts.platform ?? 'linux';
  const claudeText = opts.claudeSettings ?? JSON.stringify(CLAUDE_SETTINGS, null, 2) + '\n';
  const projectDir = tmp({ '.claude/settings.json': claudeText, '.codex/config.toml': opts.codexConfig ?? CODEX_CONFIG });
  const homeDir = tmp();
  const codexHomeDir = tmp();
  const trusted = { claude: true, codex: true, ...opts.trusted };
  if (trusted.claude) {
    const slashed = projectDir.replace(/\\/g, '/');
    const key = platform === 'win32' ? slashed.toUpperCase() : slashed;
    writeFileSync(join(homeDir, '.claude.json'), JSON.stringify({ projects: { [key]: { hasTrustDialogAccepted: true } } }));
  }
  const codexCfg = [
    trusted.codex ? `[projects.'${codexKey(projectDir, platform)}']\ntrust_level = "trusted"\n` : '',
    opts.codexFeaturesOff ? '[features]\nplugins = false\n' : '',
  ].join('');
  writeFileSync(join(codexHomeDir, 'config.toml'), codexCfg);

  const state = {
    claude: { marketplaces: new Set(opts.registered?.claude ?? []), plugins: { ...(opts.installed?.claude ?? {}) } },
    codex: { marketplaces: new Set(opts.registered?.codex ?? []), plugins: { ...(opts.installed?.codex ?? {}) } },
  };
  state.claude.refs = { ...(opts.registeredRefs?.claude ?? {}) };
  const calls = [];
  const writes = [];
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  const json = (v) => ({ ok: true, stdout: JSON.stringify(v) });
  const claudeFail = (command, id, msg) => ({
    ok: false, error: msg, stdout: JSON.stringify({ command, plugin: id, outcome: 'failed', message: msg, failureCode: 'not_found' }),
  });

  function claude(args) {
    const sub = args.slice(1, 3).join(' ');
    if (sub === 'marketplace list') {
      // Real claude 2.1.299 lists `ref` for a marketplace added with one.
      return json(claudeMarkets(...state.claude.marketplaces).map((m) => ({ ...m, ...(state.claude.refs[m.name] ? { ref: state.claude.refs[m.name] } : {}) })));
    }
    if (sub === 'list --json' || args[1] === 'list') {
      return json(claudeInstalled(...Object.entries(state.claude.plugins).map(([id, v]) => [id, v, true])));
    }
    if (opts.failClaude?.(args)) return claudeFail(args[2], args[3], 'forced failure');
    if (sub === 'marketplace add') {
      const name = Object.keys(CATALOG).find((n) => CATALOG[n].claudeArg === args[3].replace(/#.*$/, ''));
      if (!name) return claudeFail('marketplace-add', args[3], 'unknown source');
      state.claude.marketplaces.add(name);
      // Real claude 2.1.299: adding a registered marketplace again moves it to the new ref (or to none).
      const ref = args[3].includes('#') ? args[3].replace(/^[^#]*#/, '') : undefined;
      if (ref) state.claude.refs[name] = ref;
      else delete state.claude.refs[name];
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      delete settings.extraKnownMarketplaces[name].autoUpdate;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n'); // LF, autoUpdate dropped
      return json(claudeMarketplaceResult('marketplace-add', name));
    }
    if (sub === 'marketplace update') {
      return state.claude.marketplaces.has(args[3])
        ? json(claudeMarketplaceResult('marketplace-update', args[3]))
        : claudeFail('marketplace-update', args[3], `Marketplace '${args[3]}' not found`);
    }
    if (args[1] === 'install' || args[1] === 'update') {
      const [plugin, market] = args[2].split('@');
      if (!state.claude.marketplaces.has(market) || !CATALOG[market]?.plugins[plugin]) {
        return claudeFail(args[1], args[2], `Plugin "${plugin}" not found in marketplace "${market}"`);
      }
      state.claude.plugins[args[2]] = CATALOG[market].plugins[plugin];
      return json(claudePluginResult(args[1], args[2]));
    }
    return { ok: false, error: `unexpected claude ${args.join(' ')}` };
  }

  function codex(args, cwd) {
    if (args[0] !== 'plugin') return { ok: false, error: 'unexpected' };
    if (args[1] === 'marketplace' && args[2] === 'list') return json(codexMarkets(...state.codex.marketplaces));
    if (args[1] === 'list') {
      // Real codex-cli 0.162.1: declared Git marketplaces that are not cloned yet make the list fail.
      if (state.codex.marketplaces.size === 0) return { ok: false, error: 'Error: marketplace root does not contain a supported manifest' };
      return json(codexInstalled(...Object.entries(state.codex.plugins).map(([id, v]) => [id, v, true])));
    }
    if (args[1] === 'marketplace' && args[2] === 'upgrade') {
      const name = args[3];
      const config = readFileSync(join(cwd ?? projectDir, '.codex', 'config.toml'), 'utf8');
      if (opts.failCodex) {
        return { ok: false, error: 'Error: boom', stdout: JSON.stringify({ ...codexUpgradeResult([name]), upgradedRoots: [], errors: ['boom'] }) };
      }
      if (!config.includes(`[marketplaces.${name}]`) || !CATALOG[name]) {
        return { ok: false, error: `Error: marketplace \`${name}\` is not configured as a Git marketplace` };
      }
      state.codex.marketplaces.add(name);
      for (const [plugin, version] of Object.entries(CATALOG[name].plugins)) {
        if (config.includes(`[plugins."${plugin}@${name}"]`)) state.codex.plugins[`${plugin}@${name}`] = version;
      }
      return json(codexUpgradeResult([name]));
    }
    return { ok: false, error: `unexpected codex ${args.join(' ')}` };
  }

  const present = { claude: opts.claude ?? true, codex: opts.codex ?? true };
  const runCommand = async (cmd, args, o = {}) => {
    calls.push({ cmd, args, cwd: o.cwd });
    if (!present[cmd]) return { ok: false, error: 'command not found' };
    if (args[0] === '--version') return { ok: true, stdout: cmd === 'claude' ? '2.1.299 (Claude Code)' : 'codex-cli 0.162.1' };
    return cmd === 'claude' ? claude(args) : codex(args, o.cwd);
  };

  const env = {
    projectDir, homeDir, platform, runCommand,
    codexHome: opts.codexEnv ? codexHomeDir : undefined,
    fetchJson: async () => ({ ok: false, error: 'offline' }),
    live: false,
    writeFile: (file, data) => { writes.push(file); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data); },
  };
  if (!opts.codexEnv) {
    // Codex reads ~/.codex/config.toml: put the trust entry there instead of in a custom CODEX_HOME.
    mkdirSync(join(homeDir, '.codex'), { recursive: true });
    writeFileSync(join(homeDir, '.codex', 'config.toml'), codexCfg);
  }
  return { env, projectDir, homeDir, calls, writes, settingsPath, state };
}

export const writeCalls = (calls) =>
  calls.filter((c) => !c.args.includes('--version') && !(c.args.includes('list') && c.args.at(-1) === '--json'));
