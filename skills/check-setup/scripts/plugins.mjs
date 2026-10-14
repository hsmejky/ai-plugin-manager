// Plugins and marketplaces known to a Host CLI, plus plugin-id helpers ("name@marketplace").
//
//   listInstalledPlugins(host, env) -> { ok, plugins: [{ id, name, marketplace, version, enabled, installPath?, source? }], error? }
//   listMarketplaces(host, env)     -> { ok, marketplaces: [{ name, ... }], error? }
// "installed" comes from the CLI list; "enabled" for Claude comes from the project's declarations,
// because `claude plugin list --json` reports enabled:false for plugins enabled only in project settings.
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
  return { ok: true, plugins: raw.map((entry) => normalizePlugin(host, entry)).filter(Boolean) };
}

export async function listMarketplaces(host, env) {
  const r = await runJson(env, host, ['plugin', 'marketplace', 'list', '--json']);
  if (!r.ok) return r;
  const raw = Array.isArray(r.value) ? r.value : r.value?.marketplaces;
  if (!Array.isArray(raw)) return { ok: false, error: 'unexpected JSON shape' };
  return { ok: true, marketplaces: raw.filter((m) => typeof m?.name === 'string') };
}
