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
import { copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fixture, optIn, runCli, isolatedEnv, REPO_ROOT } from './helpers.mjs';

const gate = optIn('CHECK_SETUP_LIVE_INSTRUCTIONS', 'to ask the real Hosts (model calls, network, login)');
const CREDENTIALS = {
  claude: { from: join(homedir(), '.claude', '.credentials.json'), dir: 'CLAUDE_CONFIG_DIR', to: '.credentials.json' },
  codex: { from: join(homedir(), '.codex', 'auth.json'), dir: 'CODEX_HOME', to: 'auth.json' },
};
const INSTRUCTIONS = 'In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools.';
const SKILLS = 'List the names of all skills available to you that come from the mattpocock-skills plugin. Output only the names, one per line, or NONE. Do not run any tools.';

function hostEnv(host) {
  const env = isolatedEnv();
  copyFileSync(CREDENTIALS[host].from, join(env[CREDENTIALS[host].dir], CREDENTIALS[host].to));
  return env;
}

const skipUnless = (host) =>
  gate.skip || (existsSync(CREDENTIALS[host].from) ? false : `no ${CREDENTIALS[host].from} to copy into the temporary home`);

const ask = async (host, args, cwd) => {
  const r = await runCli(host, args, { env: hostEnv(host), cwd, timeout: 240000 });
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
