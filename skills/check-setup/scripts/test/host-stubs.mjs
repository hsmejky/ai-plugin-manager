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
