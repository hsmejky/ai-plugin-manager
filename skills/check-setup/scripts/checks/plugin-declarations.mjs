// P3-P6: plugin declarations in the project's Claude settings and Codex config.
import { pass, warn, fail, skip } from '../findings.mjs';
import { marketplaceOf } from '../plugins.mjs';
import { codexUrlFor, CLAUDE_SETTINGS, CODEX_CONFIG } from '../declarations.mjs';

// Marketplaces a Host knows without a project declaration.
const CLAUDE_BUILTIN = new Set(['claude-plugins-official']);
const CODEX_BUILTIN = new Set(['openai-bundled', 'openai-curated', 'openai-primary-runtime']);

function checkP3(claude) {
  const base = { id: 'P3', host: 'claude', layer: 'project' };
  if (claude.state === 'missing') return skip(base, `${CLAUDE_SETTINGS} not found; no Claude plugins declared`);
  if (claude.state === 'invalid') {
    return fail(base, `${CLAUDE_SETTINGS} is not valid JSON (${claude.error})`, `Fix the JSON syntax in ${CLAUDE_SETTINGS}.`);
  }
  const undeclared = [...claude.plugins].filter(
    (id) => !claude.marketplaces.has(marketplaceOf(id)) && !CLAUDE_BUILTIN.has(marketplaceOf(id)),
  );
  if (undeclared.length === 0) return pass(base, 'Claude settings are valid and every enabled plugin marketplace is declared');
  const names = [...new Set(undeclared.map(marketplaceOf))];
  return fail(
    base,
    `Enabled plugin(s) without a declared marketplace: ${undeclared.join(', ')}`,
    `Add to ${CLAUDE_SETTINGS} under "extraKnownMarketplaces" an entry for ${names.map((n) => `"${n}"`).join(', ')}, e.g. "${names[0]}": { "source": { "source": "github", "repo": "<owner>/<repo>" } }`,
  );
}

/** TOML lines that declare plugin ids (and their marketplaces) for the Codex project config. */
function codexSnippet(ids, claude, codex) {
  const lines = [];
  for (const name of new Set(ids.map(marketplaceOf))) {
    if (codex.marketplaces.has(name)) continue;
    const url = codexUrlFor(claude.marketplaces.get(name)?.key) || '<git url of the marketplace>';
    lines.push(`[marketplaces.${name}]`, 'source_type = "git"', `source = "${url}"`, '');
  }
  for (const id of ids) lines.push(`[plugins."${id}"]`, 'enabled = true', '');
  return lines.join('\n').trim();
}

function checkP4({ claude, codex }) {
  const base = { id: 'P4', host: 'codex', layer: 'project' };
  if (codex.state === 'invalid') {
    return fail(base, `${CODEX_CONFIG} is not valid TOML (${codex.error})`, `Fix the TOML syntax in ${CODEX_CONFIG}.`);
  }
  if (codex.state === 'missing') {
    if (claude.plugins.size === 0) return skip(base, `${CODEX_CONFIG} not found; no Codex plugins declared`);
    return fail(
      base,
      `${CODEX_CONFIG} is missing but Claude settings enable plugins`,
      `Create ${CODEX_CONFIG} with:\n${codexSnippet([...claude.plugins], claude, codex)}`,
    );
  }
  const undeclared = [...codex.plugins].filter(
    (id) => !codex.marketplaces.has(marketplaceOf(id)) && !CODEX_BUILTIN.has(marketplaceOf(id)),
  );
  if (undeclared.length === 0) return pass(base, 'Codex config declares the marketplace of every enabled plugin');
  return fail(
    base,
    `Codex plugin(s) without a declared marketplace: ${undeclared.join(', ')}`,
    `Add to ${CODEX_CONFIG}:\n${codexSnippet(undeclared, claude, codex)}`,
  );
}

function checkP5({ claude, codex }) {
  const base = { id: 'P5', host: 'both', layer: 'project' };
  if (claude.state !== 'ok' || codex.state !== 'ok') {
    return skip(base, 'Cannot compare plugin sets: a Host config is missing or unreadable (see P3, P4)');
  }
  const onlyClaude = [...claude.plugins].filter((id) => !codex.plugins.has(id));
  const onlyCodex = [...codex.plugins].filter((id) => !claude.plugins.has(id));
  if (onlyClaude.length === 0 && onlyCodex.length === 0) {
    return pass(base, 'Shared plugin sets match across Hosts');
  }
  const message = [
    onlyClaude.length ? `${onlyClaude.join(', ')} enabled only in Claude` : '',
    onlyCodex.length ? `${onlyCodex.join(', ')} enabled only in Codex` : '',
  ]
    .filter(Boolean)
    .join('; ');
  const fix = [
    onlyClaude.length ? `Enable in ${CODEX_CONFIG}:\n${codexSnippet(onlyClaude, claude, codex)}` : '',
    onlyCodex.length
      ? `Add to "enabledPlugins" in ${CLAUDE_SETTINGS}: ${onlyCodex.map((id) => `"${id}": true`).join(', ')}`
      : '',
    'Ignore this warning if the plugin is intentionally Host-specific.',
  ]
    .filter(Boolean)
    .join('\n');
  return warn(base, message, fix);
}

function checkP6({ claude, codex }) {
  const base = { id: 'P6', host: 'both', layer: 'project' };
  const shared = [...claude.marketplaces.keys()].filter((n) => codex.marketplaces.has(n));
  if (shared.length === 0) return skip(base, 'No marketplace is declared in both Hosts');
  const differing = shared.filter((n) => claude.marketplaces.get(n).key !== codex.marketplaces.get(n).key);
  if (differing.length === 0) return pass(base, 'Shared marketplaces have the same source in both Hosts');
  const name = differing[0];
  const want = codexUrlFor(claude.marketplaces.get(name).key) || '<the same source as in Claude settings>';
  return fail(
    base,
    `Marketplace "${name}" has different sources in Claude (${claude.marketplaces.get(name).key || 'unknown'}) and Codex (${codex.marketplaces.get(name).key || 'unknown'})`,
    `Make both Hosts use one source: set source = "${want}" under [marketplaces.${name}] in ${CODEX_CONFIG}, or update "extraKnownMarketplaces.${name}" in ${CLAUDE_SETTINGS}.`,
  );
}

export async function checkPluginDeclarations(env, { decls: decl }) {
  return [checkP3(decl.claude), checkP4(decl), checkP5(decl), checkP6(decl)];
}
