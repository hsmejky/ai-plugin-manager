// M3-M5: marketplaces and plugins installed on this machine, per Host.
// Listing the CLI's plugins and marketplaces lives in ../plugins.mjs.
import { warn, fail, pass, skip } from '../findings.mjs';
import { HOST, HOSTS, skipUnlessRunnable } from '../hosts.mjs';
import { listInstalledPlugins, listMarketplaces, nameOf, marketplaceOf } from '../plugins.mjs';

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
  let compared = 0;
  for (const id of shared) {
    const inClaude = lists.claude.plugins.find((p) => p.id === id);
    const inCodex = lists.codex.plugins.find((p) => p.id === id);
    if (!inClaude || !inCodex) continue; // M4 reports a missing install
    compared++;
    if (inClaude.version !== inCodex.version) drift.push({ id, claude: inClaude.version, codex: inCodex.version });
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

export async function checkMarketplacePlugins(env, { hosts, decls }) {
  const findings = [];
  for (const host of HOSTS) findings.push(await checkM3(host, decls[host], hosts[host], env));
  for (const host of HOSTS) findings.push(await checkM4(host, decls[host], hosts[host], env));
  findings.push(await checkM5(decls, hosts, env));
  return findings;
}
