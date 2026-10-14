// Live, opt-in checks of docs/agents/verification.md "Verify by hand" (#39): the instructions check (both
// Hosts answer `English`) and the negative check (`codex exec` outside the repository lists `NONE`).
// Set CHECK_SETUP_LIVE_INSTRUCTIONS=1 to run them; they make model calls and need network and logged-in Hosts.
// Each Host runs in fresh temporary homes only (CLAUDE_CONFIG_DIR, HOME, USERPROFILE; CODEX_HOME), which are
// deleted after each Host run, pass or fail (removeIsolated in a finally).
//
// Credentials (#53). The test reads the real ~/.claude/.credentials.json and ~/.codex/auth.json and never writes
// them. A Host never receives a refresh token, so it cannot refresh, and cannot spend or rotate the refresh token
// of the real login, whatever it does:
//  - Claude Code gets only the claude.ai access token, in CLAUDE_CODE_OAUTH_TOKEN; no credentials file is
//    written. Docs (https://code.claude.com/docs/en/authentication "Authentication precedence", and env-vars,
//    read 2026-10-14, Claude Code 2.1.299): the variable ranks above the /login credentials, and "Claude Code
//    uses the token you set for the whole session. To replace an expired token, generate a new one and restart".
//  - Codex gets a copy of auth.json whose tokens.refresh_token is blanked; the other fields are as in the real
//    file. Source, codex-cli rust-v0.162.1: Codex refreshes with the refresh token of the auth.json in its own
//    CODEX_HOME (codex-rs/login/src/auth/manager.rs, refresh_token_from_authority_impl, refresh_and_persist_
//    chatgpt_token), proactively when the access token expires within 5 minutes or, without a JWT expiry, after
//    8 days since last_refresh (should_refresh_proactively), and on a 401. The default credentials store is
//    the file in CODEX_HOME (codex-rs/config/src/types.rs, AuthCredentialsStoreMode). A refresh in the copy
//    therefore fails without touching the real token; an API-key login has no refresh token and is copied as is.
// Because no Host can refresh, a Host is skipped when its access token expires within 15 minutes (the three
// runs take at most 12): run that Host once normally to refresh the real login, then rerun. A Host whose file
// is missing (for example Claude Code on macOS, which uses the keychain) is skipped too.
// Neither Host needs the plugin for these checks, so the temporary homes carry no plugin or marketplace; the
// negative check therefore also holds "provided the plugin is not enabled in the user-level Codex config".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fixture, optIn, runCli, isolatedEnv, removeIsolated, REPO_ROOT } from './helpers.mjs';
import { codexAuthCopy, claudeOauthToken } from './live-auth.mjs';

const gate = optIn('CHECK_SETUP_LIVE_INSTRUCTIONS', 'to ask the real Hosts (model calls, network, login)');
const REAL_CREDENTIALS = {
  claude: join(homedir(), '.claude', '.credentials.json'),
  codex: join(homedir(), '.codex', 'auth.json'),
};
const INSTRUCTIONS = 'In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools.';
const SKILLS = 'List the names of all skills available to you that come from the mattpocock-skills plugin. Output only the names, one per line, or NONE. Do not run any tools.';

/** How to give a Host its login in a temporary env: { seed(env) }, or { skip } with the reason. */
function loginFor(host) {
  if (gate.skip) return { skip: gate.skip };
  const file = REAL_CREDENTIALS[host];
  if (!existsSync(file)) return { skip: `no ${file} to take the login from` };
  const real = JSON.parse(readFileSync(file, 'utf8'));
  if (host === 'claude') {
    const { token, skip } = claudeOauthToken(real);
    return skip ? { skip } : { seed: (env) => { env.CLAUDE_CODE_OAUTH_TOKEN = token; } };
  }
  const { auth, skip } = codexAuthCopy(real);
  return skip ? { skip } : { seed: (env) => writeFileSync(join(env.CODEX_HOME, 'auth.json'), JSON.stringify(auth)) };
}

const LOGIN = { claude: loginFor('claude'), codex: loginFor('codex') };
const skipUnless = (host) => LOGIN[host].skip ?? false;

/** Run a Host in fresh temporary homes holding only its login; the homes are deleted afterwards, pass or fail. */
const ask = async (host, args, cwd) => {
  const env = isolatedEnv();
  try {
    LOGIN[host].seed(env);
    const r = await runCli(host, args, { env, cwd, timeout: 240000 });
    assert.ok(r.ok, r.error);
    return r.stdout.trim();
  } finally {
    removeIsolated(env);
  }
};

test('instructions check: Claude Code answers English from the project instructions', { skip: skipUnless('claude') }, async () => {
  assert.match(await ask('claude', ['-p', INSTRUCTIONS], REPO_ROOT), /^\W*English\W*$/i);
});

test('instructions check: Codex answers English from the project instructions', { skip: skipUnless('codex') }, async () => {
  assert.match(await ask('codex', ['exec', '--skip-git-repo-check', INSTRUCTIONS], REPO_ROOT), /(^|\n)\W*English\W*$/i);
});

test('negative check: codex exec outside the repository lists NONE', { skip: skipUnless('codex') }, async () => {
  const outside = fixture();
  try {
    assert.match(await ask('codex', ['exec', '--skip-git-repo-check', SKILLS], outside), /(^|\n)\W*NONE\W*$/);
  } finally {
    rmSync(outside, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});

// Offline tests of the credential handling (run without the opt-in).
const NOW = Date.parse('2026-10-14T12:00:00Z');
const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const codexLogin = (exp) => ({
  auth_mode: 'chatgpt',
  OPENAI_API_KEY: null,
  last_refresh: '2026-10-07T09:00:00Z',
  tokens: { id_token: 'id', access_token: jwt({ exp }), refresh_token: 'real-refresh', account_id: 'acc' },
});

test('codex auth copy: blanks the refresh token and keeps everything else', () => {
  const real = codexLogin(NOW / 1000 + 86400);
  const { auth, skip } = codexAuthCopy(real, NOW);
  assert.equal(skip, undefined);
  assert.deepEqual(auth, { ...real, tokens: { ...real.tokens, refresh_token: '' } });
  assert.equal(real.tokens.refresh_token, 'real-refresh');
});

test('codex auth copy: skips when the access token expires within 15 minutes or has no expiry', () => {
  assert.match(codexAuthCopy(codexLogin(NOW / 1000 + 14 * 60), NOW).skip, /expires.*run codex once/);
  assert.equal(codexAuthCopy(codexLogin(NOW / 1000 + 16 * 60), NOW).skip, undefined);
  const noExp = codexLogin(0);
  noExp.tokens.access_token = jwt({});
  assert.match(codexAuthCopy(noExp, NOW).skip, /no expiry/);
  assert.equal(codexAuthCopy(noExp, NOW).auth, undefined);
});

test('codex auth copy: an API-key login has nothing to refresh and is copied as is; no login skips', () => {
  const apiKey = { auth_mode: 'apikey', OPENAI_API_KEY: 'sk-test', tokens: null, last_refresh: null };
  assert.deepEqual(codexAuthCopy(apiKey, NOW), { auth: apiKey });
  assert.match(codexAuthCopy({ auth_mode: 'chatgpt' }, NOW).skip, /no ChatGPT tokens or API key/);
});

test('claude oauth token: only the access token, and only while it stays valid for 15 minutes', () => {
  const credentials = (expiresAt) => ({
    claudeAiOauth: { accessToken: 'sk-ant-oat01-access', refreshToken: 'sk-ant-ort01-refresh', expiresAt, scopes: [] },
  });
  assert.deepEqual(claudeOauthToken(credentials(NOW + 16 * 60 * 1000), NOW), { token: 'sk-ant-oat01-access' });
  assert.match(claudeOauthToken(credentials(NOW + 14 * 60 * 1000), NOW).skip, /expires.*run claude once/);
  assert.match(claudeOauthToken({}, NOW).skip, /no claude\.ai login/);
});

test('removeIsolated deletes every temporary home of an isolated env, with the files in it', () => {
  const env = isolatedEnv();
  writeFileSync(join(env.CODEX_HOME, 'auth.json'), '{}');
  removeIsolated(env);
  for (const key of ['HOME', 'USERPROFILE', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR']) assert.equal(existsSync(env[key]), false, key);
});
