// P3-P6: plugin declarations in the project's Claude settings and Codex config.
import { pass, fail, skip } from '../findings.mjs';
import { loadDeclarations, marketplaceOf, CLAUDE_SETTINGS } from '../declarations.mjs';

// Marketplaces a Host knows without a project declaration.
const CLAUDE_BUILTIN = new Set(['claude-plugins-official']);

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

export async function checkPluginDeclarations(env) {
  const { claude } = loadDeclarations(env.projectDir);
  return [checkP3(claude)];
}
