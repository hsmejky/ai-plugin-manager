// Test support for live-instructions.test.mjs: the credentials a Host gets in its temporary home.

/** An access token must stay valid this long, so no Host tries to refresh it during the run. */
const MIN_VALIDITY_MS = 15 * 60 * 1000;

/** `exp` of a JWT in milliseconds, or null when it has none. */
function jwtExpiry(token) {
  try {
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Codex auth.json for the temporary CODEX_HOME: the real one with the refresh token blanked, or { skip }. */
export function codexAuthCopy(auth, now = Date.now()) {
  if (typeof auth.tokens?.access_token !== 'string') {
    return typeof auth.OPENAI_API_KEY === 'string' ? { auth } : { skip: 'Codex auth.json holds no ChatGPT tokens or API key' };
  }
  const expiry = jwtExpiry(auth.tokens.access_token);
  if (expiry === null) return { skip: 'the Codex access token has no expiry to check' };
  if (expiry - now < MIN_VALIDITY_MS) {
    return { skip: 'the Codex access token expires within 15 minutes; run codex once to refresh the real login' };
  }
  return { auth: { ...auth, tokens: { ...auth.tokens, refresh_token: '' } } };
}

/** The claude.ai access token from .credentials.json, for CLAUDE_CODE_OAUTH_TOKEN, or { skip }. */
export function claudeOauthToken(credentials, now = Date.now()) {
  const oauth = credentials.claudeAiOauth;
  if (typeof oauth?.accessToken !== 'string') return { skip: 'Claude Code .credentials.json holds no claude.ai login' };
  if (!(oauth.expiresAt - now >= MIN_VALIDITY_MS)) {
    return { skip: 'the Claude Code access token expires within 15 minutes; run claude once to refresh the real login' };
  }
  return { token: oauth.accessToken };
}
