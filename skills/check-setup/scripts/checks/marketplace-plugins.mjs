// M3-M5: marketplaces and plugins installed on this machine, per Host.
//
// Exported for later checks (e.g. L1 skill discovery):
//   listInstalledPlugins(host, env) -> { ok, plugins: [{ id, name, marketplace, version, enabled, installPath? , source? }], error? }
//   listMarketplaces(host, env)     -> { ok, marketplaces: [{ name, ... }], error? }
// "installed" comes from the CLI list; "enabled" for Claude comes from the project's declarations,
// because `claude plugin list --json` reports enabled:false for plugins enabled only in project settings.
import { pass, warn, fail, skip } from '../findings.mjs';
import { HOSTS, HOST_LABELS, detectHosts } from '../hosts.mjs';
import { loadDeclarations, marketplaceOf, CLAUDE_SETTINGS, CODEX_CONFIG } from '../declarations.mjs';

const nameOf = (id) => (id.lastIndexOf('@') < 0 ? id : id.slice(0, id.lastIndexOf('@')));

async function runJson(env, host, args) {
  const r = await env.runCommand(host, args);
  if (!r.ok) return { ok: false, error: r.error ?? 'command failed' };
  try {
    return { ok: true, value: JSON.parse(r.stdout) };
  } catch (e) {
    return { ok: false, error: `invalid JSON (${e.message})` };
  }
}

function normalizePlugin(host, e) {
  const id = host === 'claude' ? e?.id : e?.pluginId;
  if (typeof id !== 'string') return null;
  const base = { id, name: nameOf(id), marketplace: marketplaceOf(id), version: e.version ?? null };
  return host === 'claude'
    ? { ...base, enabled: e.enabled === true, installPath: e.installPath, scope: e.scope, projectPath: e.projectPath }
    : { ...base, enabled: e.enabled === true && e.installed !== false, source: e.source };
}

export async function listInstalledPlugins(host, env) {
  const r = await runJson(env, host, ['plugin', 'list', '--json']);
  if (!r.ok) return r;
  const raw = Array.isArray(r.value) ? r.value : r.value?.installed;
  if (!Array.isArray(raw)) return { ok: false, error: 'unexpected JSON shape' };
  return { ok: true, plugins: raw.map((e) => normalizePlugin(host, e)).filter(Boolean) };
}

export async function listMarketplaces(host, env) {
  const r = await runJson(env, host, ['plugin', 'marketplace', 'list', '--json']);
  if (!r.ok) return r;
  const raw = Array.isArray(r.value) ? r.value : r.value?.marketplaces;
  if (!Array.isArray(raw)) return { ok: false, error: 'unexpected JSON shape' };
  return { ok: true, marketplaces: raw.filter((m) => typeof m?.name === 'string') };
}

/** CLI argument that registers a marketplace declared in the project. */
function addArg(host, name, entry) {
  const raw = entry?.raw ?? {};
  if (host === 'claude') {
    if (raw.source === 'github' && raw.repo) return raw.repo;
    return raw.url ?? raw.path ?? `<source of ${name}>`;
  }
  return raw.url ?? `<git url of ${name}>`;
}

const CONFIG_FILE = { claude: CLAUDE_SETTINGS, codex: CODEX_CONFIG };

function scope(host, decl, hostInfo, base) {
  if (!hostInfo.installed) return skip(base, `${HOST_LABELS[host]} CLI is not installed (see M1)`);
  if (decl.state !== 'ok') return skip(base, `${CONFIG_FILE[host]} is missing or unreadable (see P3, P4)`);
  return null;
}

async function checkM3(host, decl, hostInfo, env) {
  const base = { id: 'M3', host, layer: 'machine' };
  const label = HOST_LABELS[host];
  const skipped = scope(host, decl, hostInfo, base);
  if (skipped) return skipped;
  if (decl.marketplaces.size === 0) return skip(base, `${CONFIG_FILE[host]} declares no marketplace`);
  const list = await listMarketplaces(host, env);
  if (!list.ok) {
    return warn(base, `Could not list ${label} marketplaces (${list.error})`, `Run \`${host} plugin marketplace list --json\` and fix the error.`);
  }
  const registered = new Set(list.marketplaces.map((m) => m.name));
  const missing = [...decl.marketplaces.keys()].filter((n) => !registered.has(n));
  if (missing.length === 0) return pass(base, `Every declared ${label} marketplace is registered`);
  return fail(
    base,
    `${label} marketplace ${missing.map((n) => `"${n}"`).join(', ')} is declared by the project but not registered on this machine`,
    missing.map((n) => `${host} plugin marketplace add ${addArg(host, n, decl.marketplaces.get(n))}`).join('\n'),
  );
}

async function checkM4(host, decl, hostInfo, env) {
  const base = { id: 'M4', host, layer: 'machine' };
  const label = HOST_LABELS[host];
  const skipped = scope(host, decl, hostInfo, base);
  if (skipped) return skipped;
  if (decl.plugins.size === 0) return skip(base, `${CONFIG_FILE[host]} enables no plugin`);
  const list = await listInstalledPlugins(host, env);
  if (!list.ok) {
    return warn(base, `Could not list ${label} plugins (${list.error})`, `Run \`${host} plugin list --json\` and fix the error.`);
  }
  const problems = [];
  const fixes = [];
  for (const id of decl.plugins) {
    const mine = list.plugins.find((p) => p.id === id);
    const foreign = list.plugins.filter((p) => p.name === nameOf(id) && p.id !== id);
    if (mine && (host === 'claude' || mine.enabled)) continue;
    if (mine) {
      problems.push(`${id} is installed but disabled`);
      fixes.push(`Enable it: set enabled = true under [plugins."${id}"] in ~/.codex/config.toml, or reinstall with \`codex plugin add ${id}\`.`);
    } else if (foreign.length > 0) {
      const ids = foreign.map((p) => p.id).join(', ');
      problems.push(`${id} is not installed, but a same-named plugin from another marketplace is (${ids})`);
      const rm = host === 'claude' ? 'uninstall' : 'remove';
      const add = host === 'claude' ? 'install' : 'add';
      for (const p of foreign) fixes.push(`${host} plugin ${rm} ${p.id}`);
      fixes.push(`${host} plugin ${add} ${id}`);
    } else {
      problems.push(`${id} is not installed`);
      fixes.push(`${host} plugin ${host === 'claude' ? 'install' : 'add'} ${id}`);
    }
  }
  if (problems.length === 0) return pass(base, `Every plugin the project enables is installed in ${label} from its declared marketplace`);
  return fail(base, `${label}: ${problems.join('; ')}`, [...new Set(fixes)].join('\n'));
}

async function checkM5(decls, hostInfos, env) {
  const base = { id: 'M5', host: 'both', layer: 'machine' };
  const missing = HOSTS.filter((h) => !hostInfos[h].installed);
  if (missing.length > 0) return skip(base, `${missing.map((h) => HOST_LABELS[h]).join(', ')} CLI is not installed (see M1)`);
  if (decls.claude.state !== 'ok' || decls.codex.state !== 'ok') {
    return skip(base, 'Cannot determine Shared plugins: a Host config is missing or unreadable (see P3, P4)');
  }
  const shared = [...decls.claude.plugins].filter((id) => decls.codex.plugins.has(id));
  if (shared.length === 0) return skip(base, 'The project has no Shared plugins');
  const lists = {};
  for (const h of HOSTS) {
    lists[h] = await listInstalledPlugins(h, env);
    if (!lists[h].ok) return skip(base, `Could not list ${HOST_LABELS[h]} plugins (see M4)`);
  }
  const drift = [];
  let compared = 0;
  for (const id of shared) {
    const c = lists.claude.plugins.find((p) => p.id === id);
    const x = lists.codex.plugins.find((p) => p.id === id);
    if (!c || !x) continue; // M4 reports a missing install
    compared++;
    if (c.version !== x.version) drift.push({ id, claude: c.version, codex: x.version });
  }
  if (compared === 0) return skip(base, 'No Shared plugin is installed in both Hosts (see M4)');
  if (drift.length === 0) return pass(base, 'Shared plugins have the same version in both Hosts');
  return warn(
    base,
    `Version drift: ${drift.map((d) => `${d.id} is ${d.claude} in Claude Code and ${d.codex} in Codex`).join('; ')}`,
    drift
      .map(
        (d) =>
          `Update the Host with the older ${d.id}: \`claude plugin update ${d.id}\` (Claude Code) or \`codex plugin remove ${d.id}\` then \`codex plugin add ${d.id}\` (Codex); refresh the marketplace first if needed (\`<host> plugin marketplace update ${marketplaceOf(d.id)}\`).`,
      )
      .join('\n'),
  );
}

export async function checkMarketplacePlugins(env) {
  const decls = loadDeclarations(env.projectDir);
  const hostInfos = await detectHosts(env);
  const findings = [];
  for (const host of HOSTS) findings.push(await checkM3(host, decls[host], hostInfos[host], env));
  for (const host of HOSTS) findings.push(await checkM4(host, decls[host], hostInfos[host], env));
  findings.push(await checkM5(decls, hostInfos, env));
  return findings;
}

