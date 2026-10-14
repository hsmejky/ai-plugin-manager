// M1, M2: Host presence and project trust (machine layer, both Hosts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseToml } from '../toml.mjs';
import { pass, warn, fail, skip } from '../findings.mjs';
import { HOSTS, HOST_LABELS, TESTED_VERSIONS, detectHosts, compareVersions } from '../hosts.mjs';

function presence(host, info) {
  const base = { id: 'M1', host, layer: 'machine' };
  const label = HOST_LABELS[host];
  const tested = TESTED_VERSIONS[host];
  if (!info.installed) {
    return warn(
      base,
      `${label} CLI (\`${host}\`) is not installed or not on PATH`,
      `Install ${label} (tested with ${tested}) and make \`${host}\` available on PATH.`,
    );
  }
  if (!info.version) {
    return warn(base, `${label} version could not be determined`, `Run \`${host} --version\` and make sure it is at least ${tested}.`);
  }
  if (compareVersions(info.version, tested) < 0) {
    return warn(
      base,
      `${label} ${info.version} is older than the tested version ${tested}`,
      `Update ${label} to ${tested} or newer.`,
    );
  }
  return pass(base, `${label} ${info.version} is installed (tested version ${tested})`);
}

const readText = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

// Claude keys projects in ~/.claude.json by absolute path with forward slashes.
function claudeTrust(env) {
  const base = { id: 'M2', host: 'claude', layer: 'machine' };
  const win = env.platform === 'win32';
  const key = env.projectDir.replace(/\\/g, '/');
  const fix = `Run \`claude\` interactively in ${env.projectDir} and accept the workspace trust dialog.`;
  let projects = {};
  try {
    projects = JSON.parse(readText(join(env.homeDir, '.claude.json')) ?? '{}').projects ?? {};
  } catch {
    return fail(base, '~/.claude.json could not be parsed', fix);
  }
  const found = Object.keys(projects).find((k) => (win ? k.toLowerCase() === key.toLowerCase() : k === key));
  if (found === undefined) return fail(base, `No Claude Code trust entry for ${key} in ~/.claude.json`, fix);
  return projects[found]?.hasTrustDialogAccepted === true
    ? pass(base, `Claude Code trusts ${key}`)
    : fail(base, `Claude Code trust dialog not accepted for ${key}`, fix);
}

// Codex keys trusted projects in ~/.codex/config.toml; on Windows the path is lowercased.
function codexTrust(env) {
  const base = { id: 'M2', host: 'codex', layer: 'machine' };
  const win = env.platform === 'win32';
  const normalise = (p) => (win ? p.replace(/\//g, '\\').toLowerCase() : p);
  const path = normalise(env.projectDir);
  const fix = `Run \`codex\` in ${env.projectDir} and accept the trust prompt, or add to ~/.codex/config.toml:\n[projects.'${path}']\ntrust_level = "trusted"`;
  const text = readText(join(env.homeDir, '.codex', 'config.toml'));
  let projects = {};
  try {
    projects = (text === null ? {} : parseToml(text)).projects ?? {};
  } catch (e) {
    return warn(base, `~/.codex/config.toml could not be parsed (${e.message}), so trust cannot be checked`, fix);
  }
  const found = Object.keys(projects).find((k) => normalise(k) === path);
  const level = found === undefined ? null : (projects[found]?.trust_level ?? null);
  if (level === 'trusted') return pass(base, `Codex trusts ${path}`);
  return fail(base, level === null ? `No Codex trust entry for ${path} in ~/.codex/config.toml` : `Codex trust_level for ${path} is "${level}", not "trusted"`, fix);
}

const TRUST = { claude: claudeTrust, codex: codexTrust };

export async function checkHostTrust(env) {
  const hosts = await detectHosts(env);
  const out = [];
  for (const host of HOSTS) out.push(presence(host, hosts[host]));
  for (const host of HOSTS) {
    out.push(
      hosts[host].installed
        ? TRUST[host](env)
        : skip({ id: 'M2', host, layer: 'machine' }, `${HOST_LABELS[host]} is not installed; trust check skipped`),
    );
  }
  return out;
}
