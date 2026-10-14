// M3-M5: marketplaces and plugins installed on this machine, per Host.
// Listing the CLI's plugins and marketplaces lives in ../plugins.mjs.
import { warn, fail, pass, skip } from '../findings.mjs';
import { HOST, HOSTS, compareVersions, skipUnlessRunnable } from '../hosts.mjs';
import { listInstalledPlugins, listMarketplaces, nameOf, marketplaceOf } from '../plugins.mjs';

const RELEASE = /^\d+\.\d+\.\d+$/;
// Versions a Host prints when the plugin has none: Claude Code `unknown`, Codex `local`.
const PLACEHOLDER_VERSIONS = new Set(['unknown', 'local']);
const NO_MANIFEST = /marketplace root does not contain a supported manifest/i;

/** Fix for a failed list command: specific when Codex reports a marketplace without a manifest. */
function listFailureFix(host, decl, error, genericFix) {
  if (!NO_MANIFEST.test(error ?? '')) return genericFix;
  const { configFile, marketplaceAddArg } = HOST[host];
  const declared = [...decl.marketplaces].map(([name, entry]) => ({ name, source: marketplaceAddArg(name, entry.raw) }));
  const sources = declared.map((d) => `"${d.name}" (${d.source})`).join(', ');
  return [
    `A marketplace has no supported manifest at its root. The declared source${declared.length === 1 ? '' : 's'} ${sources} must contain \`.claude-plugin/marketplace.json\` at the declared ref.`,
    `Publish the manifest there, or point the marketplace declaration in ${configFile} at a ref that has it.`,
    'If the registration on this machine is stale, re-register it:',
    ...declared.map((d) => `${host} plugin marketplace remove ${d.name}\n${host} plugin marketplace add ${d.source}`),
  ].join('\n');
}

async function checkM3(host, decl, hostInfo, env) {
  const base = { id: 'M3', host, layer: 'machine' };
  const { label, configFile, marketplaceAddArg } = HOST[host];
  const skipped = skipUnlessRunnable(host, decl, hostInfo, base);
  if (skipped) return skipped;
  if (decl.marketplaces.size === 0) return skip(base, `${configFile} declares no marketplace`);
  const list = await listMarketplaces(host, env);
  if (!list.ok) {
    const generic = `Run \`${host} plugin marketplace list --json\` and fix the error.`;
    return warn(base, `Could not list ${label} marketplaces (${list.error})`, listFailureFix(host, decl, list.error, generic));
  }
  const registered = new Set(list.marketplaces.map((m) => m.name));
  const missing = [...decl.marketplaces.keys()].filter((n) => !registered.has(n));
  if (missing.length === 0) return pass(base, `Every declared ${label} marketplace is registered`);
  return fail(
    base,
    `${label} marketplace ${missing.map((n) => `"${n}"`).join(', ')} is declared by the project but not registered on this machine`,
    missing.map((n) => `${host} plugin marketplace add ${marketplaceAddArg(n, decl.marketplaces.get(n)?.raw)}`).join('\n'),
  );
}

async function checkM4(host, decl, hostInfo, env) {
  const base = { id: 'M4', host, layer: 'machine' };
  const { label, configFile, installVerb, uninstallVerb } = HOST[host];
  const skipped = skipUnlessRunnable(host, decl, hostInfo, base);
  if (skipped) return skipped;
  if (decl.plugins.size === 0) return skip(base, `${configFile} enables no plugin`);
  const list = await listInstalledPlugins(host, env);
  if (!list.ok) {
    const generic = `Run \`${host} plugin list --json\` and fix the error.`;
    return warn(base, `Could not list ${label} plugins (${list.error})`, listFailureFix(host, decl, list.error, generic));
  }
  const problems = [];
  const fixes = [];
  for (const id of decl.plugins) {
    const installed = list.plugins.find((p) => p.id === id);
    const sameNameElsewhere = list.plugins.filter((p) => p.name === nameOf(id) && p.id !== id);
    if (installed && (host === 'claude' || installed.enabled)) continue;
    if (installed) {
      problems.push(`${id} is installed but disabled`);
      fixes.push(`Enable it: set enabled = true under [plugins."${id}"] in ~/.codex/config.toml, or reinstall with \`${host} plugin ${installVerb} ${id}\`.`);
    } else if (sameNameElsewhere.length > 0) {
      const ids = sameNameElsewhere.map((p) => p.id).join(', ');
      problems.push(`${id} is not installed, but a same-named plugin from another marketplace is (${ids})`);
      for (const p of sameNameElsewhere) fixes.push(`${host} plugin ${uninstallVerb} ${p.id}`);
      fixes.push(`${host} plugin ${installVerb} ${id}`);
    } else {
      problems.push(`${id} is not installed`);
      fixes.push(`${host} plugin ${installVerb} ${id}`);
    }
  }
  if (problems.length === 0) return pass(base, `Every plugin the project enables is installed in ${label} from its declared marketplace`);
  return fail(base, `${label}: ${problems.join('; ')}`, [...new Set(fixes)].join('\n'));
}

async function checkM5(decls, hostInfos, env) {
  const base = { id: 'M5', host: 'both', layer: 'machine' };
  const missing = HOSTS.filter((h) => !hostInfos[h].installed);
  if (missing.length > 0) return skip(base, `${missing.map((h) => HOST[h].label).join(', ')} CLI is not installed (see M1)`);
  if (decls.claude.state !== 'ok' || decls.codex.state !== 'ok') {
    return skip(base, 'Cannot determine Shared plugins: a Host config is missing or unreadable (see P3, P4)');
  }
  const shared = [...decls.claude.plugins].filter((id) => decls.codex.plugins.has(id));
  if (shared.length === 0) return skip(base, 'The project has no Shared plugins');
  const lists = {};
  for (const h of HOSTS) {
    lists[h] = await listInstalledPlugins(h, env);
    if (!lists[h].ok) return skip(base, `Could not list ${HOST[h].label} plugins (see M4)`);
  }
  const drift = [];
  const unknown = [];
  let compared = 0;
  for (const id of shared) {
    const inClaude = lists.claude.plugins.find((p) => p.id === id);
    const inCodex = lists.codex.plugins.find((p) => p.id === id);
    if (!inClaude || !inCodex) continue; // M4 reports a missing install
    compared++;
    const c = inClaude.version;
    const x = inCodex.version;
    if (c != null && c === x && !PLACEHOLDER_VERSIONS.has(c)) continue; // identical real strings: nothing to compare
    if (RELEASE.test(c ?? '') && RELEASE.test(x ?? '')) drift.push({ id, claude: c, codex: x });
    else unknown.push({ id, claude: c, codex: x });
  }
  if (compared === 0) return skip(base, 'No Shared plugin is installed in both Hosts (see M4)');
  if (drift.length === 0 && unknown.length === 0) return pass(base, 'Shared plugins have the same version in both Hosts');
  const show = (v) => (v == null ? 'no version' : `"${v}"`);
  const messages = [];
  const fixes = [];
  if (drift.length > 0) {
    messages.push(
      `Version drift: ${drift.map((d) => `${d.id} is ${d.claude} in Claude Code and ${d.codex} in Codex`).join('; ')}`,
    );
    for (const d of drift) {
      const m = marketplaceOf(d.id);
      const claudeFix = `Claude Code has the older ${d.id}: run \`claude plugin marketplace update ${m}\` then \`claude plugin update ${d.id}\`, and restart Claude Code.`;
      const codexFix = `Codex has the older ${d.id}: start a Codex session in the project (it upgrades the marketplace at start), or run \`codex plugin marketplace upgrade ${m}\` from the project.`;
      const cmp = compareVersions(d.claude, d.codex);
      fixes.push(cmp < 0 ? claudeFix : cmp > 0 ? codexFix : `${claudeFix}\n${codexFix}`);
    }
  }
  if (unknown.length > 0) {
    const items = unknown.map((u) => {
      const why =
        u.claude == null && u.codex == null
          ? 'neither Host reports a version'
          : `Claude Code reports ${show(u.claude)}, Codex reports ${show(u.codex)}`;
      return `${u.id} (${why})`;
    });
    messages.push(
      `Cannot compare versions (a Host reports no version, or one that is not a release number like 1.2.3): ${items.join('; ')}`,
    );
    fixes.push(
      `Upgrading cannot clear this. Set a release \`version\` (for example "1.2.3") in the manifest of ${unknown.map((u) => u.id).join(', ')} (\`.claude-plugin/plugin.json\` and the Codex manifest) and publish it, so both Hosts report the same release number; or ignore this warning if you accept unversioned plugins.`,
    );
  }
  return warn(base, messages.join('. '), fixes.join('\n'));
}

export async function checkMarketplacePlugins(env, { hosts, decls }) {
  const findings = [];
  for (const host of HOSTS) findings.push(await checkM3(host, decls[host], hosts[host], env));
  for (const host of HOSTS) findings.push(await checkM4(host, decls[host], hosts[host], env));
  findings.push(await checkM5(decls, hosts, env));
  return findings;
}
