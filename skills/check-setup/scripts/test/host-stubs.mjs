// Hand-written stubs of the Host CLI JSON outputs used by the offline tests.
// host-cli.test.mjs compares their keys and nesting with the installed CLIs' real output (#38),
// so change a stub and the real shape together.

/** `claude plugin list --json`: entries [id, version = '1.0.0', enabled = false]. */
export const claudeInstalled = (...entries) =>
  entries.map(([id, version = '1.0.0', enabled = false]) => ({
    id, version, scope: 'project', enabled, installPath: `C:\\cache\\${id}`, projectEnabled: false,
  }));

/** One `claude plugin list --json` entry; project-scoped installs carry the projectPath of their project. */
export const claudeEntry = (version, scope, projectPath) => ({
  id: 'p@m', version, scope, enabled: true, projectEnabled: true, ...(projectPath ? { projectPath } : {}), installPath: 'C:\\c\\p',
});

/** `codex plugin list --json`: entries [pluginId, version = '1.0.0', enabled = true]. */
export const codexInstalled = (...entries) => ({
  installed: entries.map(([pluginId, version = '1.0.0', enabled = true]) => ({
    pluginId, name: pluginId.split('@')[0], marketplaceName: pluginId.split('@')[1], version,
    installed: true, enabled, source: { source: 'local', path: 'C:\\x' },
  })),
  available: [],
});

/** `claude plugin marketplace list --json` for GitHub marketplaces. */
export const claudeMarkets = (...names) =>
  names.map((name) => ({ name, source: 'github', repo: `o/${name}`, installLocation: `C:\\m\\${name}` }));

/** `codex plugin marketplace list --json` for Git marketplaces. */
export const codexMarkets = (...names) => ({
  marketplaces: names.map((name) => ({
    name, root: `C:\\m\\${name}`,
    marketplaceSource: { sourceType: 'git', source: `https://github.com/o/${name}.git` },
  })),
});

// Write-command outputs used by the setup skill's tests (skills/setup/scripts/test/fake-host.mjs).
// Shapes follow docs/research/plugin-install-update-cli-2026-10-14.md (Claude Code 2.1.299, codex-cli 0.162.1).

/** `claude plugin marketplace add|update --json` result. */
export const claudeMarketplaceResult = (command, marketplace, outcome = 'ok', message = '') => ({
  command, marketplace, outcome, message,
  ...(outcome === 'failed' ? { failureCode: 'invalid_source' } : {}),
});

/** `claude plugin install|update --json` result. */
export const claudePluginResult = (command, pluginId, outcome = 'ok', extra = {}) => ({
  command, plugin: pluginId, ...(outcome === 'failed' ? {} : { pluginId }), outcome, scope: 'project', message: `${command} ${pluginId}`,
  ...(outcome === 'failed' ? { failureCode: 'not_found' } : {}),
  ...extra,
});

/** `codex plugin marketplace upgrade --json` result. */
export const codexUpgradeResult = (names, errors = []) => ({
  selectedMarketplaces: names, upgradedRoots: names.map((n) => `C:\\m\\${n}`), errors,
});
