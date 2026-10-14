// M2 probes: is the project trusted by a Host? One function per Host, wired up in hosts.mjs.
import { join } from 'node:path';
import { parseToml } from './toml.mjs';
import { readText, codexHome, codexConfigLabel } from './files.mjs';
import { pass, warn, fail } from './findings.mjs';

// Claude keys projects in ~/.claude.json by absolute path with forward slashes.
export function claudeTrust(env) {
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

// Codex keys trusted projects in $CODEX_HOME/config.toml (default ~/.codex); on Windows the path is lowercased.
export function codexTrust(env) {
  const base = { id: 'M2', host: 'codex', layer: 'machine' };
  const win = env.platform === 'win32';
  const normalise = (p) => (win ? p.replace(/\//g, '\\').toLowerCase() : p);
  const path = normalise(env.projectDir);
  const fix = `Run \`codex\` in ${env.projectDir} and accept the trust prompt, or add to ${codexConfigLabel(env)}:\n[projects.'${path}']\ntrust_level = "trusted"`;
  const text = readText(join(codexHome(env), 'config.toml'));
  let projects = {};
  try {
    projects = (text === null ? {} : parseToml(text)).projects ?? {};
  } catch (e) {
    return warn(base, `${codexConfigLabel(env)} could not be parsed (${e.message}), so trust cannot be checked`, fix);
  }
  const found = Object.keys(projects).find((k) => normalise(k) === path);
  const level = found === undefined ? null : (projects[found]?.trust_level ?? null);
  if (level === 'trusted') return pass(base, `Codex trusts ${path}`);
  return fail(base, level === null ? `No Codex trust entry for ${path} in ${codexConfigLabel(env)}` : `Codex trust_level for ${path} is "${level}", not "trusted"`, fix);
}
