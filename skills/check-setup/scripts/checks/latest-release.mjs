// L2 (opt-in, env.live): compare each installed Host with its Latest release. Needs network (asks the npm registry directly),
// makes no model call. A failed lookup is a skip, never a pass.
//
// Source: npm registry dist-tags. Codex: `@openai/codex` tag `latest`. Claude Code: `@anthropic-ai/claude-code`
// tags `latest` and `stable`. That these tags equal Claude Code's `autoUpdatesChannel` channels is
// unverified: the setup page (https://code.claude.com/docs/en/setup#configure-release-channel) does
// not mention npm dist-tags; the values matched the channels on 2026-10-14.
import { join } from 'node:path';
import { readJson } from '../files.mjs';
import { pass, warn, skip } from '../findings.mjs';
import { HOST, HOSTS, compareVersions, isRelease } from '../hosts.mjs';

const PACKAGE = { claude: '@anthropic-ai/claude-code', codex: '@openai/codex' };
const UPDATE = { claude: 'claude update', codex: 'codex update' };
const REGISTRY = 'https://registry.npmjs.org';
const CHANNELS = ['latest', 'stable'];

/** autoUpdatesChannel from local, project, then user settings (first one set wins), or null. */
function configuredChannel(env) {
  const files = [
    join(env.projectDir, '.claude', 'settings.local.json'),
    join(env.projectDir, '.claude', 'settings.json'),
    join(env.homeDir, '.claude', 'settings.json'),
  ];
  for (const file of files) {
    const value = readJson(file)?.autoUpdatesChannel;
    if (typeof value === 'string') return value;
  }
  return null;
}

/**
 * { ok: true, tags } with the dist-tags object, or { ok: false, error }.
 * Asks the registry over HTTPS (env.fetchJson), not `npm view`: npm can answer from its local cache
 * with exit 0 when the network is down (stale pass), and on Windows it needs a shell, which leaves an
 * orphaned npm process on timeout and prints DEP0190 on Node 24.
 */
async function distTags(host, env) {
  const r = await env.fetchJson(`${REGISTRY}/-/package/${PACKAGE[host]}/dist-tags`);
  if (!r.ok) return { ok: false, error: r.error };
  const tags = r.json;
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) return { ok: true, tags };
  return { ok: false, error: `unexpected registry answer for ${PACKAGE[host]}` };
}

async function checkHost(host, hostInfo, env) {
  const base = { id: 'L2', host, layer: 'machine' };
  const { label } = HOST[host];
  if (!hostInfo.installed) return skip(base, `${label} CLI is not installed (see M1)`);
  if (!hostInfo.version) return skip(base, `${label} printed no parseable version`);

  let channel = 'latest';
  let channelNote = 'the release channel';
  if (host === 'claude') {
    const configured = configuredChannel(env);
    if (configured === null) {
      channelNote = 'the latest channel (autoUpdatesChannel is not set, so latest is assumed)';
    } else if (CHANNELS.includes(configured)) {
      channel = configured;
      channelNote = `the ${configured} channel (autoUpdatesChannel)`;
    } else {
      return skip(base, `${label} autoUpdatesChannel is "${configured}", which has no known npm dist-tag`);
    }
  }
  const looked = await distTags(host, env);
  if (!looked.ok) return skip(base, `Could not look up the latest ${label} release (${looked.error})`);
  const latest = looked.tags[channel];
  if (!isRelease(latest)) return skip(base, `the registry has no "${channel}" version for ${PACKAGE[host]}`);

  if (compareVersions(hostInfo.version, latest) >= 0) {
    return pass(base, `${label} ${hostInfo.version} is at the Latest release (${latest}) on ${channelNote}`);
  }
  return warn(
    base,
    `${label} ${hostInfo.version} is behind the Latest release ${latest} on ${channelNote}`,
    `Run \`${UPDATE[host]}\`. If this install follows another channel (Homebrew cask, apt, dnf or apk choose it by package), this comparison assumed the wrong one.`,
  );
}

export async function checkLatestRelease(env, { hosts }) {
  if (!env.live) return [];
  const findings = [];
  for (const host of HOSTS) findings.push(await checkHost(host, hosts[host], env));
  return findings;
}
