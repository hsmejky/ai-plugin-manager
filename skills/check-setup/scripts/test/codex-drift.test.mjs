// Live, opt-in test of the Codex drift claim (#40): a Codex session started with a marketplace installed at an
// old revision moves it to the configured ref (here `main`) on its own. Method rules: docs/research/
// codex-marketplace-auto-upgrade-2026-10-14.md and ...-project-config-2026-10-14.md.
//  - Isolated CODEX_HOME only; the user's ~/.codex is never read or written. No login is needed: the model call
//    fails with 401 after the upgrade, which is expected and ignored.
//  - The old state is made by `marketplace add --ref <old full SHA>` and then changing `ref` in config to the
//    branch; never by checking out an old commit in the marketplace root.
//  - stdin is closed (otherwise codex waits on it) and the process must outlive the upgrade (about 16 s here).
//  - The result is judged from the installed revision and the plugin cache `version`, never from the output of
//    `codex plugin marketplace upgrade`.
// Needs network (github.com) and the codex CLI; skips without CHECK_SETUP_CODEX_DRIFT=1 or without codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';

const OPT_IN = 'CHECK_SETUP_CODEX_DRIFT';
const REPO = 'hsmejky/ai-plugin-manager';
const MARKETPLACE = 'ai-plugin-manager';
// Plugin 0.2.0 in this public repo; must stay reachable from the default branch history.
const OLD_SHA = 'a157af3ed15c14d20d8a181cba76fcd7f19dff82';
const OLD_VERSION = '0.2.0';

const run = (cmd, args, options) =>
  new Promise((done) => {
    const child = execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options }, (err, stdout, stderr) =>
      done({ ok: !err, stdout, stderr, error: err?.message }));
    child.stdin?.end();
  });

const codexVersion = process.env[OPT_IN] === '1' ? await run('codex', ['--version'], { timeout: 30000 }) : null;
const skip = process.env[OPT_IN] !== '1'
  ? `opt-in: set ${OPT_IN}=1 (network, no login)`
  : codexVersion.ok ? false : 'Codex CLI is not installed';

const revision = (root) => execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const pluginVersion = (root) => JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const cacheVersions = (home) => {
  const dir = join(home, 'plugins', 'cache', MARKETPLACE, MARKETPLACE);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
};

test('codex exec in a project moves a marketplace installed at an old revision to the configured ref', { skip, timeout: 240000 }, async () => {
  const codexHome = fixture();
  const cwd = fixture();
  const env = { ...process.env, CODEX_HOME: codexHome };
  const root = join(codexHome, '.tmp', 'marketplaces', MARKETPLACE);

  const add = await run('codex', ['plugin', 'marketplace', 'add', REPO, '--ref', OLD_SHA], { env, cwd, timeout: 120000 });
  assert.ok(add.ok, `${add.error} ${add.stderr}`);
  assert.equal(revision(root), OLD_SHA, 'precondition: installed at the old SHA');
  assert.equal(pluginVersion(root), OLD_VERSION, 'precondition: old plugin version');

  const config = join(codexHome, 'config.toml');
  const old = readFileSync(config, 'utf8');
  assert.match(old, /^ref = "[0-9a-f]{40}"$/m, 'precondition: config pins the old SHA');
  writeFileSync(config, old.replace(/^ref = ".*"$/m, 'ref = "main"'));
  appendFileSync(config, `\n[plugins."${MARKETPLACE}@${MARKETPLACE}"]\nenabled = true\n`);
  assert.deepEqual(cacheVersions(codexHome), [], 'precondition: no plugin cache yet');

  // The model call fails (no login); that is expected, so the exit status is not asserted.
  await run('codex', ['exec', '--skip-git-repo-check', 'hi'], { env, cwd, timeout: 180000 });

  const after = revision(root);
  assert.notEqual(after, OLD_SHA, 'the marketplace stayed at the old revision');
  assert.notEqual(pluginVersion(root), OLD_VERSION);
  const cached = cacheVersions(codexHome);
  assert.ok(cached.length > 0 && !cached.includes(OLD_VERSION), `plugin cache versions: ${cached.join(', ') || 'none'}`);
  assert.ok(cached.includes(pluginVersion(root)), 'plugin cache holds the marketplace version');
  console.log(`# ${codexVersion.stdout.trim()}: ${OLD_SHA.slice(0, 7)} (${OLD_VERSION}) -> ${after.slice(0, 7)} (${pluginVersion(root)})`);
});
