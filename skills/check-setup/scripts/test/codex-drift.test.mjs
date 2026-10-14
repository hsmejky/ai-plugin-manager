// Live, opt-in test of the Codex drift claim (#40): a Codex session started with a marketplace installed at an
// old revision moves it to the configured ref (here `main`) on its own. Method rules: docs/research/
// codex-marketplace-auto-upgrade-2026-10-14.md and ...-project-config-2026-10-14.md.
//  - Isolated CODEX_HOME only; the user's ~/.codex is never read or written. No login is needed: the model call
//    fails with 401 after the upgrade, which is expected and ignored.
//  - The old state is made by `marketplace add --ref <old full SHA>` and then changing `ref` in config to the
//    branch; never by checking out an old commit in the marketplace root.
//  - stdin is closed (otherwise codex waits on it) and the process must outlive the upgrade. The upgrade itself
//    takes about 2 s (docs/agents/plugin-authoring.md); the whole no-login `codex exec` run lasts about 16 s here,
//    because the model call retries the 401 before exiting, which leaves the upgrade ample time.
//  - The result is judged from the installed revision and the plugin cache `version`, never from the output of
//    `codex plugin marketplace upgrade`.
//  - Two cases: the declaration (marketplace plus enabled plugin) lives in the user config, or only in the
//    project's `.codex/config.toml`; the project is trusted in the user config in both.
// Needs network (github.com) and the codex CLI; skips without CHECK_SETUP_CODEX_DRIFT=1 or without codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, optIn, runCli } from './helpers.mjs';

const gate = optIn('CHECK_SETUP_CODEX_DRIFT', 'to run it (network, no login)');
const REPO = 'hsmejky/ai-plugin-manager';
const MARKETPLACE = 'ai-plugin-manager';
// Plugin 0.2.0 in this public repo; must stay reachable from the default branch history.
const OLD_SHA = 'a157af3ed15c14d20d8a181cba76fcd7f19dff82';
const OLD_VERSION = '0.2.0';

const codexVersion = gate.optedIn ? await runCli('codex', ['--version'], { timeout: 30000 }) : null;
const skip = gate.skip || (codexVersion.ok ? false : 'Codex CLI is not installed');

const revision = (root) => execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const pluginVersion = (root) => JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const cacheVersions = (home) => {
  const dir = join(home, 'plugins', 'cache', MARKETPLACE, MARKETPLACE);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
};

/** Declaration tables with the marketplace on `ref`, and the plugin enabled. */
const declaration = (source, ref) =>
  `[marketplaces.${MARKETPLACE}]\nsource_type = "git"\nsource = "${source}"\nref = "${ref}"\n\n[plugins."${MARKETPLACE}@${MARKETPLACE}"]\nenabled = true\n`;

for (const where of ['user-level', 'project-only']) {
  test(`codex exec in a project moves a marketplace installed at an old revision to the configured ref (${where} declaration)`, { skip, timeout: 240000 }, async () => {
    const codexHome = fixture();
    const cwd = realpathSync(fixture());
    const env = { ...process.env, CODEX_HOME: codexHome };
    const root = join(codexHome, '.tmp', 'marketplaces', MARKETPLACE);
    const config = join(codexHome, 'config.toml');

    const add = await runCli('codex', ['plugin', 'marketplace', 'add', REPO, '--ref', OLD_SHA], { env, cwd, timeout: 120000 });
    assert.ok(add.ok, add.error);
    assert.equal(revision(root), OLD_SHA, 'precondition: installed at the old SHA');
    assert.equal(pluginVersion(root), OLD_VERSION, 'precondition: old plugin version');

    const old = readFileSync(config, 'utf8');
    assert.match(old, /^ref = "[0-9a-f]{40}"$/m, 'precondition: config pins the old SHA');
    const source = /^source = "(.*)"$/m.exec(old)?.[1];
    assert.ok(source, 'precondition: config records the marketplace source');
    if (where === 'user-level') {
      writeFileSync(config, old.replace(/^ref = ".*"$/m, 'ref = "main"') + `\n[plugins."${MARKETPLACE}@${MARKETPLACE}"]\nenabled = true\n`);
    } else {
      // The install metadata stays; only the declaration moves to the trusted project's config.
      const trusted = process.platform === 'win32' ? cwd.toLowerCase() : cwd;
      writeFileSync(config, `[projects.'${trusted}']\ntrust_level = "trusted"\n`);
      mkdirSync(join(cwd, '.codex'));
      writeFileSync(join(cwd, '.codex', 'config.toml'), declaration(source, 'main'));
    }
    assert.deepEqual(cacheVersions(codexHome), [], 'precondition: no plugin cache yet');

    // The model call fails (no login); that is expected, so the exit status is not asserted.
    await runCli('codex', ['exec', '--skip-git-repo-check', 'hi'], { env, cwd, timeout: 180000 });

    const after = revision(root);
    assert.notEqual(after, OLD_SHA, 'the marketplace stayed at the old revision');
    assert.notEqual(pluginVersion(root), OLD_VERSION);
    const cached = cacheVersions(codexHome);
    assert.ok(cached.length > 0 && !cached.includes(OLD_VERSION), `plugin cache versions: ${cached.join(', ') || 'none'}`);
    assert.ok(cached.includes(pluginVersion(root)), 'plugin cache holds the marketplace version');
    console.log(`# ${where}, ${codexVersion.stdout.trim()}: ${OLD_SHA.slice(0, 7)} (${OLD_VERSION}) -> ${after.slice(0, 7)} (${pluginVersion(root)})`);
  });
}
