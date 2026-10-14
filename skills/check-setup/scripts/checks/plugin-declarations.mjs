// P3-P7, P9: plugin declarations in the project's Claude settings and Codex config.
import { pass, warn, fail, skip } from '../findings.mjs';
import { marketplaceOf } from '../plugins.mjs';
import { codexUrlFor, CLAUDE_SETTINGS, CODEX_CONFIG } from '../declarations.mjs';

// Marketplaces a Host knows without a project declaration.
const CLAUDE_BUILTIN = new Set(['claude-plugins-official']);
// Official names for which Claude Code turns auto-update on by default, only when sourced
// from github.com/anthropics/. Source: https://code.claude.com/docs/en/plugins/security
// (official names) and https://code.claude.com/docs/en/discover-plugins (defaults), read
// 2026-10-14, Claude Code 2.1.299. 'knowledge-work-plugins' and 'first-party-plugins' are
// official names but default to off, so they are not listed here.
const CLAUDE_AUTOUPDATE_DEFAULT_ON = new Set([
  'claude-plugins-official',
  'claude-code-marketplace',
  'claude-code-plugins',
  'anthropic-marketplace',
  'anthropic-plugins',
  'agent-skills',
  'anthropic-agent-skills',
  'life-sciences',
  'claude-for-legal',
  'claude-for-financial-services',
  'financial-services-plugins',
  'claude-tag-plugins',
]);
// Names Claude Code accepts only for github.com/anthropics/ sources: the 14 official names and the
// 3 community names. Source: https://code.claude.com/docs/en/plugins/security ("Identify
// Anthropic's marketplaces by name"), read 2026-10-14, Claude Code 2.1.299; not run live.
const CLAUDE_RESERVED = new Set([
  ...CLAUDE_AUTOUPDATE_DEFAULT_ON,
  'knowledge-work-plugins',
  'first-party-plugins',
  'claude-community',
  'claude-plugins-community',
  'healthcare',
]);
const fromAnthropics = (m) => m.key.startsWith('github.com/anthropics/');
const untrustedReserved = (name, m) => CLAUDE_RESERVED.has(name) && !fromAnthropics(m);
const autoUpdatesByDefault = (name, m) =>
  CLAUDE_AUTOUPDATE_DEFAULT_ON.has(name) && fromAnthropics(m);

// Codex names: `codex plugin marketplace list --json` plus the marketplaces in
// `codex plugin list --json`, codex-cli 0.162.1 (2026-10-14).
const CODEX_BUILTIN = new Set([
  'openai-bundled',
  'openai-curated',
  'openai-curated-remote',
  'openai-primary-runtime',
]);

function checkP3(claude) {
  const base = { id: 'P3', host: 'claude', layer: 'project' };
  if (claude.state === 'missing') return skip(base, `${CLAUDE_SETTINGS} not found; no Claude plugins declared`);
  if (claude.state === 'invalid') {
    return fail(base, `${CLAUDE_SETTINGS} is not valid JSON (${claude.error})`, `Fix the JSON syntax in ${CLAUDE_SETTINGS}.`);
  }
  const reserved = [...claude.marketplaces].filter(([n, m]) => untrustedReserved(n, m)).map(([n]) => n);
  if (reserved.length > 0) {
    const q = reserved.map((n) => `"${n}"`).join(', ');
    return fail(
      base,
      `Marketplace ${q} uses a name reserved for Anthropic but its source is outside github.com/anthropics/, so Claude Code stops loading it and its plugins ("Marketplace is registered from an untrusted source")`,
      `Rename the marketplace ${q} in "extraKnownMarketplaces" of ${CLAUDE_SETTINGS} (and in the plugin ids "<plugin>@<marketplace>" under "enabledPlugins"), or use a source under github.com/anthropics/.`,
    );
  }
  const undeclared = [...claude.plugins].filter(
    (id) => !claude.marketplaces.has(marketplaceOf(id)) && !CLAUDE_BUILTIN.has(marketplaceOf(id)),
  );
  if (undeclared.length === 0) return pass(base, 'Claude settings are valid and every enabled plugin marketplace is declared');
  const names = [...new Set(undeclared.map(marketplaceOf))];
  return fail(
    base,
    `Enabled plugin(s) without a declared marketplace: ${undeclared.join(', ')}`,
    `Add to ${CLAUDE_SETTINGS} under "extraKnownMarketplaces" an entry for ${names.map((n) => `"${n}"`).join(', ')}, e.g. "${names[0]}": { "source": { "source": "github", "repo": "<owner>/<repo>" }, "autoUpdate": true }`,
  );
}

function checkP7(claude) {
  const base = { id: 'P7', host: 'claude', layer: 'project' };
  if (claude.state !== 'ok') return skip(base, `${CLAUDE_SETTINGS} is missing or unreadable (see P3)`);
  const declared = [...claude.marketplaces].filter(([name, m]) => !autoUpdatesByDefault(name, m) && !untrustedReserved(name, m));
  if (declared.length === 0) return skip(base, 'No marketplace that needs "autoUpdate" is declared');
  const names = declared.filter(([, m]) => m.autoUpdate !== true).map(([name]) => name);
  if (names.length === 0) return pass(base, 'Every declared marketplace has "autoUpdate": true');
  return warn(
    base,
    `Marketplace ${names.map((n) => `"${n}"`).join(', ')} has no "autoUpdate": true, so Claude Code does not update its plugins automatically`,
    `In ${CLAUDE_SETTINGS}, add "autoUpdate": true next to "source" in the "extraKnownMarketplaces" entry ${names.map((n) => `"${n}"`).join(', ')}.`,
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
  // A source shape that normalises to '' is unrecognised: two of them must not count as equal.
  const keys = (n) => [claude.marketplaces.get(n).key, codex.marketplaces.get(n).key];
  const uncomparable = shared.filter((n) => keys(n).includes(''));
  const differing = shared.filter((n) => !uncomparable.includes(n) && keys(n)[0] !== keys(n)[1]);
  if (differing.length === 0 && uncomparable.length > 0) {
    return warn(
      base,
      `The source of marketplace ${uncomparable.map((n) => `"${n}"`).join(', ')} could not be compared between the Hosts: the source shape is not recognised in ${CLAUDE_SETTINGS} or ${CODEX_CONFIG}`,
      `Check by hand that both Hosts point at the same repository, or use a "github" or "git" source in ${CLAUDE_SETTINGS} and source_type = "git" with a URL in ${CODEX_CONFIG}.`,
    );
  }
  if (differing.length === 0) return pass(base, 'Shared marketplaces have the same source in both Hosts');
  const name = differing[0];
  const want = codexUrlFor(claude.marketplaces.get(name).key) || '<the same source as in Claude settings>';
  return fail(
    base,
    `Marketplace "${name}" has different sources in Claude (${claude.marketplaces.get(name).key || 'unknown'}) and Codex (${codex.marketplaces.get(name).key || 'unknown'})`,
    `Make both Hosts use one source: set source = "${want}" under [marketplaces.${name}] in ${CODEX_CONFIG}, or update "extraKnownMarketplaces.${name}" in ${CLAUDE_SETTINGS}.`,
  );
}

const PIN_DOCS =
  'https://github.com/hsmejky/ai-plugin-manager/blob/main/docs/agents/plugin-authoring.md#pin-a-marketplace-to-a-release';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const refOf = (m) => (typeof m.raw?.ref === 'string' && m.raw.ref !== '' ? m.raw.ref : null);
const show = (ref) => (ref === null ? 'not pinned' : `pinned to "${ref}"`);

/** Where each Host declares the ref of marketplace `name`, with `ref` filled in. */
const setRef = {
  claude: (name, ref) => `"ref": "${ref}" in "extraKnownMarketplaces.${name}.source" of ${CLAUDE_SETTINGS}`,
  codex: (name, ref) => `ref = "${ref}" under [marketplaces.${name}] in ${CODEX_CONFIG}`,
};

function pinIssue(name, claudeRef, codexRef) {
  if (codexRef !== null && FULL_SHA.test(codexRef)) {
    return {
      message: `Marketplace "${name}": the Codex ref is a full commit SHA ("${codexRef}"), which Claude Code's marketplace source cannot pin (Claude Code is ${show(claudeRef)})`,
      fix: `Pin a release tag on both Hosts instead of a SHA: set ref = "<tag>" under [marketplaces.${name}] in ${CODEX_CONFIG} and "ref": "<tag>" in "extraKnownMarketplaces.${name}.source" of ${CLAUDE_SETTINGS}.`,
    };
  }
  if (claudeRef === codexRef) return null;
  const message = `Marketplace "${name}" is pinned differently: Codex is ${show(codexRef)}, Claude Code is ${show(claudeRef)}, so the Hosts can run different plugin content`;
  const unpin = { claude: `remove "ref" from "extraKnownMarketplaces.${name}.source" in ${CLAUDE_SETTINGS}`, codex: `remove ref under [marketplaces.${name}] in ${CODEX_CONFIG}` };
  if (claudeRef === null) return { message, fix: `Add ${setRef.claude(name, codexRef)}, or ${unpin.codex} to leave both unpinned.` };
  if (codexRef === null) return { message, fix: `Add ${setRef.codex(name, claudeRef)}, or ${unpin.claude} to leave both unpinned.` };
  return { message, fix: `Use one tag on both Hosts: set ${setRef.claude(name, claudeRef)}, or set ${setRef.codex(name, codexRef)}.` };
}

function checkP9({ claude, codex }) {
  const base = { id: 'P9', host: 'both', layer: 'project' };
  const shared = [...claude.marketplaces.keys()].filter((n) => codex.marketplaces.has(n));
  if (shared.length === 0) return skip(base, 'No marketplace is declared in both Hosts');
  // Refs only mean something for one repository: a marketplace whose sources differ is P6's finding.
  const sameSource = shared.filter((n) => claude.marketplaces.get(n).key === codex.marketplaces.get(n).key);
  if (sameSource.length === 0) return skip(base, 'The shared marketplaces have different sources in the two Hosts (see P6), so their refs are not compared');
  const issues = sameSource
    .map((n) => pinIssue(n, refOf(claude.marketplaces.get(n)), refOf(codex.marketplaces.get(n))))
    .filter(Boolean);
  if (issues.length === 0) return pass(base, 'Shared marketplaces are pinned the same way in both Hosts');
  return warn(
    base,
    issues.map((i) => i.message).join('; '),
    `${issues.map((i) => i.fix).join('\n')}\nPinning docs: ${PIN_DOCS}`,
  );
}

export async function checkPluginDeclarations(env, { decls: decl }) {
  return [checkP3(decl.claude), checkP4(decl), checkP5(decl), checkP6(decl), checkP7(decl.claude), checkP9(decl)];
}
