import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root. */
export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

/** Create a fixture directory from { 'relative/path': 'content' }. */
export function fixture(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-setup-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

/** Build a runChecks env around a fixture project. */
export function envFor(projectDir, overrides = {}) {
  return {
    projectDir,
    homeDir: fixture(),
    platform: 'linux',
    runCommand: async () => ({ ok: false, error: 'command not found' }),
    fetchJson: async () => ({ ok: false, error: 'offline' }),
    live: false,
    ...overrides,
  };
}

/**
 * Opt-in gate for live tests: { optedIn, skip }, where `skip` is the `{ skip }` option value for a
 * test that needs the opt-in (false when `process.env[name] === '1'`, else the reason).
 */
export function optIn(name, why) {
  const optedIn = process.env[name] === '1';
  return { optedIn, skip: optedIn ? false : `opt-in: set ${name}=1 ${why}` };
}

/**
 * Run a Host CLI (stdin closed, no window). Resolves, never rejects:
 * { ok, stdout, stderr, error } where `error` names the command and holds stderr.
 */
export const runCli = (cmd, args, { env, cwd, timeout = 60000 } = {}) =>
  new Promise((done) => {
    const options = { env, cwd, timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 };
    const child = execFile(cmd, args, options, (err, stdout, stderr) =>
      done({ ok: !err, stdout, stderr, error: err && `${cmd} ${args.join(' ')}: ${err.message} ${stderr}`.trim() }));
    child.stdin?.end();
  });

/**
 * Environment that points both Hosts at fresh temporary homes (HOME, USERPROFILE, CODEX_HOME,
 * CLAUDE_CONFIG_DIR) with auto-update and nonessential traffic off. The two config directories are
 * readable from the returned env, to seed them.
 */
export function isolatedEnv() {
  const home = fixture();
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: fixture(),
    CLAUDE_CONFIG_DIR: fixture(),
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
}

export const find =(findings, id) => findings.filter((f) => f.id === id);
