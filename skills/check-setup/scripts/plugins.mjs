// Plugins and marketplaces known to a Host CLI, plus plugin-id helpers ("name@marketplace").
//
//   listInstalledPlugins(host, env) -> { ok, plugins: [{ id, name, marketplace, version, enabled, installPath?, source? }], error? }
//   listMarketplaces(host, env)     -> { ok, marketplaces: [{ name, ... }], error? }
// "installed" comes from the CLI list; "enabled" for Claude comes from the project's declarations,
// because `claude plugin list --json` reports enabled:false on entries of other projects (2.1.299), so the flag depends on the CWD.
import { HOST } from './hosts.mjs';

export function nameOf(pluginId) {
  const at = pluginId.lastIndexOf('@');
  return at < 0 ? pluginId : pluginId.slice(0, at);
}

export function marketplaceOf(pluginId) {
  const at = pluginId.lastIndexOf('@');
  return at < 0 ? '' : pluginId.slice(at + 1);
}

async function runJson(env, host, args) {
  const r = await env.runCommand(host, args);
  if (!r.ok) return { ok: false, error: r.error ?? 'command failed' };
  try {
    return { ok: true, value: JSON.parse(r.stdout) };
  } catch (e) {
    return { ok: false, error: `invalid JSON (${e.message})` };
  }
}

function normalizePlugin(host, entry) {
  const { id, ...hostFields } = HOST[host].parsePlugin(entry);
  if (typeof id !== 'string') return null;
  return { id, name: nameOf(id), marketplace: marketplaceOf(id), version: entry.version ?? null, ...hostFields };
}

export async function listInstalledPlugins(host, env) {
  const r = await runJson(env, host, ['plugin', 'list', '--json']);
  if (!r.ok) return r;
  const raw = Array.isArray(r.value) ? r.value : r.value?.installed;
  if (!Array.isArray(raw)) return { ok: false, error: 'unexpected JSON shape' };
  const plugins = raw.map((entry) => normalizePlugin(host, entry)).filter(Boolean);
  return { ok: true, plugins: plugins.filter((p) => appliesToProject(p, env.projectDir)) };
}

/** Comparable form of a path: forward slashes, no trailing slash, Git Bash `/c/x` as `c:/x`, case-folded. */
function normalizePath(p) {
  return String(p)
    .replace(/\\/g, '/')
    .replace(/^\/([a-zA-Z])\//, '$1:/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * `claude plugin list --json` has one entry per project for project-scoped installs.
 * Keep entries that apply to the checked project: user scope, or a project/local entry whose
 * projectPath is this project. Entries without scope or projectPath (other Hosts) are kept.
 */
function appliesToProject(plugin, projectDir) {
  if (!plugin.projectPath) return true;
  if (plugin.scope !== 'project' && plugin.scope !== 'local') return true;
  return normalizePath(plugin.projectPath) === normalizePath(projectDir);
}

export async function listMarketplaces(host, env) {
  const r = await runJson(env, host, ['plugin', 'marketplace', 'list', '--json']);
  if (!r.ok) return r;
  const raw = Array.isArray(r.value) ? r.value : r.value?.marketplaces;
  if (!Array.isArray(raw)) return { ok: false, error: 'unexpected JSON shape' };
  return { ok: true, marketplaces: raw.filter((m) => typeof m?.name === 'string') };
}
