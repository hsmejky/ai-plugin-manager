// Live, opt-in checks of docs/agents/verification.md "Verify by hand" (#39): the instructions check (both
// Hosts answer `English`) and the negative check (`codex exec` outside the repository lists `NONE`).
// Set CHECK_SETUP_LIVE_INSTRUCTIONS=1 to run them; they make model calls and need network and logged-in Hosts.
// Each Host runs in temporary homes only (CLAUDE_CONFIG_DIR, HOME, USERPROFILE; CODEX_HOME). Only the Host's
// credentials file is copied from the real home into the temporary one (a read-only copy; the real files are
// never written). Credentials live in ~/.claude/.credentials.json and ~/.codex/auth.json; a Host whose file is
// missing (for example Claude Code on macOS, which uses the keychain) is skipped.
// Neither Host needs the plugin for these checks, so the temporary homes carry no plugin or marketplace; the
// negative check therefore also holds "provided the plugin is not enabled in the user-level Codex config".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './helpers.mjs';

const OPT_IN = 'CHECK_SETUP_LIVE_INSTRUCTIONS';
const optedIn = process.env[OPT_IN] === '1';
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const CREDENTIALS = {
  claude: { from: join(homedir(), '.claude', '.credentials.json'), to: '.credentials.json' },
  codex: { from: join(homedir(), '.codex', 'auth.json'), to: 'auth.json' },
};
const INSTRUCTIONS = 'In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools.';
const SKILLS = 'List the names of all skills available to you that come from the mattpocock-skills plugin. Output only the names, one per line, or NONE. Do not run any tools.';

function isolatedEnv(host) {
  const home = fixture();
  const claudeDir = fixture();
  const codexDir = fixture();
  copyFileSync(CREDENTIALS[host].from, join(host === 'claude' ? claudeDir : codexDir, CREDENTIALS[host].to));
  return { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: claudeDir, CODEX_HOME: codexDir, DISABLE_AUTOUPDATER: '1' };
}

const run = (cmd, args, { env, cwd }) =>
  new Promise((done) => {
    const child = execFile(cmd, args, { env, cwd, timeout: 240000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
      done(err ? { ok: false, error: `${cmd} ${args.join(' ')}: ${err.message} ${stderr}`.trim() } : { ok: true, stdout }));
    child.stdin?.end();
  });

const skipUnless = (host) => {
  if (!optedIn) return `opt-in: set ${OPT_IN}=1 to ask the real Hosts (model calls, network, login)`;
  return existsSync(CREDENTIALS[host].from) ? false : `no ${CREDENTIALS[host].from} to copy into the temporary home`;
};

const ask = async (host, args, cwd) => {
  const r = await run(host, args, { env: isolatedEnv(host), cwd });
  assert.ok(r.ok, r.error);
  return r.stdout.trim();
};

test('instructions check: Claude Code answers English from the project instructions', { skip: skipUnless('claude') }, async () => {
  assert.match(await ask('claude', ['-p', INSTRUCTIONS], REPO_ROOT), /^\W*English\W*$/i);
});

test('instructions check: Codex answers English from the project instructions', { skip: skipUnless('codex') }, async () => {
  assert.match(await ask('codex', ['exec', '--skip-git-repo-check', INSTRUCTIONS], REPO_ROOT), /(^|\n)\W*English\W*$/i);
});

test('negative check: codex exec outside the repository lists NONE', { skip: skipUnless('codex') }, async () => {
  assert.match(await ask('codex', ['exec', '--skip-git-repo-check', SKILLS], fixture()), /(^|\n)\W*NONE\W*$/);
});
