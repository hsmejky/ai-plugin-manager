// The two Hosts and everything that differs between them, in one descriptor per Host.
// Check code looks a Host up here instead of branching on its name.
//
//   HOST[host] = {
//     label, testedVersion, configFile,   display name, version the setup was verified with, project config
//     installVerb, uninstallVerb,         `<host> plugin <verb> <id>`
//     marketplaceAddArg(name, raw),       argument of `<host> plugin marketplace add`
//     parsePlugin(entry),                 `plugin list --json` entry -> { id, enabled, ...hostFields }
//     pluginDir(plugin, env),             where the installed plugin's files live
//     promptArgs(prompt),                 non-interactive model call arguments
//     checkTrust(env),                    M2 finding
//   }
//   detectHosts(env) -> { claude: { installed, version }, codex: { installed, version } }
// version is a "x.y.z" string, or null when the CLI is missing or prints no parseable version.
import { join } from 'node:path';
import { skip } from './findings.mjs';
import { CLAUDE_SETTINGS, CODEX_CONFIG } from './declarations.mjs';
import { claudeTrust, codexTrust } from './trust.mjs';

export const HOST = {
  claude: {
    label: 'Claude Code',
    testedVersion: '2.1.296',
    configFile: CLAUDE_SETTINGS,
    installVerb: 'install',
    uninstallVerb: 'uninstall',
    marketplaceAddArg(name, raw = {}) {
      if (raw.source === 'github' && raw.repo) return raw.repo;
      return raw.url ?? raw.path ?? `<source of ${name}>`;
    },
    parsePlugin: (e) => ({
      id: e?.id,
      enabled: e?.enabled === true,
      installPath: e?.installPath,
      scope: e?.scope,
      projectPath: e?.projectPath,
    }),
    pluginDir: (plugin) => plugin.installPath,
    // Never pass --bare to claude: it skips plugin sync, so plugin skills would not be visible.
    promptArgs: (prompt) => ['-p', prompt],
    checkTrust: claudeTrust,
  },
  codex: {
    label: 'Codex',
    testedVersion: '0.160.1',
    configFile: CODEX_CONFIG,
    installVerb: 'add',
    uninstallVerb: 'remove',
    marketplaceAddArg: (name, raw = {}) => raw.url ?? `<git url of ${name}>`,
    parsePlugin: (e) => ({ id: e?.pluginId, enabled: e?.enabled === true && e?.installed !== false, source: e?.source }),
    pluginDir: (plugin, env) =>
      join(env.homeDir, '.codex', 'plugins', 'cache', plugin.marketplace, plugin.name, plugin.version ?? ''),
    promptArgs: (prompt) => ['exec', '--skip-git-repo-check', prompt],
    checkTrust: codexTrust,
  },
};

export const HOSTS = Object.keys(HOST);

export function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? '');
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** Numeric semver compare: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export async function detectHosts(env) {
  const out = {};
  for (const host of HOSTS) {
    const r = await env.runCommand(host, ['--version']);
    out[host] = r.ok
      ? { installed: true, version: parseVersion(r.stdout) }
      : { installed: false, version: null };
  }
  return out;
}

/**
 * Skip finding when a Host check cannot run, or null when it can: the Host CLI must be installed
 * and the project's config for that Host readable (decl.state === 'ok').
 */
export function skipUnlessRunnable(host, decl, hostInfo, base) {
  const { label, configFile } = HOST[host];
  if (!hostInfo.installed) return skip(base, `${label} CLI is not installed (see M1)`);
  if (decl.state !== 'ok') return skip(base, `${configFile} is missing or unreadable (see P3, P4)`);
  return null;
}
